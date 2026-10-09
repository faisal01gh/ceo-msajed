// Actual pinned SDK, deterministic local fetch boundary; no network or secrets.
import * as module from "../supabase/functions/_shared/password-port.ts";
const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co";
const uid = "10000000-0000-4000-8000-000000000001",
  sid = "30000000-0000-4000-8000-000000000001",
  opid = "40000000-0000-4000-8000-000000000001";
const email = "fixture@example.invalid";
const token = [
  "fixture",
  btoa(
    JSON.stringify({
      sub: uid,
      iss: endpoint + "/auth/v1",
      role: "authenticated",
      session_id: sid,
    }),
  ),
  "fixture",
].join(".");
const candidate = () => ["Offline", "9#", "Fixture"].join("");
const account = {
  canonical_key: "fixture",
  login_username: "fixture",
  preferred_login: "fixture",
  display_name: "fixture",
  role_code: "employee",
  internal_email: email,
  migrated_user_id: uid,
};
const op = {
  operation_id: opid,
  target_user_id: uid,
  canonical_key: "fixture",
  login_username: "fixture",
  generation: 1,
  status: "pending",
  write_allowed: true,
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (
  const stage of [
    "auth",
    "sql",
    "provider",
    "begin",
    "finish",
    "late_login",
  ] as const
) {
  Deno.test(
    "bounded actual SDK " + stage + " preserves physical custody and no retry",
    async () => {
      const old = globalThis.fetch;
      let release!: () => void,
        started!: () => void,
        writes = 0,
        logouts = 0,
        unknowns = 0;
      const start = new Promise<void>((r) => started = r),
        held = new Promise<void>((r) => release = r);
      let holding = false;
      Deno.env.set("SUPABASE_URL", endpoint);
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
      globalThis.fetch = async (input, init) => {
        const r = new Request(input, init),
          u = new URL(r.url),
          name = u.pathname.split("/").at(-1)!;
        if (u.origin !== endpoint) throw Error("no network");
        const mustHold = holding &&
          ((stage === "auth" && u.pathname === "/auth/v1/user") ||
            (stage === "sql" && name === "account_migration_users") ||
            (stage === "provider" && r.method === "PUT") ||
            (stage === "begin" && name === "account_password_begin_internal") ||
            (stage === "finish" &&
              name === "account_password_finish_internal") ||
            (stage === "late_login" && name === "token"));
        if (r.method === "PUT") writes++;
        if (mustHold) {
          started();
          await held;
        }
        if (name === "user") return Response.json({ id: uid, email });
        if (name === "account_session_check_internal") {
          return Response.json(true);
        }
        if (name === "account_migration_users") return Response.json(account);
        if (name === "qa_scope_probe_internal") {
          return Response.json([{
            allowed: true,
            actor_class: "ORDINARY",
            target_class: "ORDINARY",
          }]);
        }
        if (name === "account_password_begin_internal") {
          return Response.json(op);
        }
        if (name === "account_password_finish_internal") {
          return Response.json(op);
        }
        if (name === "account_password_unknown_internal") {
          unknowns++;
          return Response.json(op);
        }
        if (u.pathname.startsWith("/auth/v1/admin/users/")) {
          return Response.json({ user: { id: uid, email, app_metadata: {} } });
        }
        if (name === "token") {
          return Response.json({
            access_token: token,
            refresh_token: ["offline", "refresh"].join("-"),
            token_type: "bearer",
            expires_in: 3600,
            user: { id: uid, email },
          });
        }
        if (name === "qa_owned_session_check_internal") {
          return Response.json([{ allowed: true, reason: "owned_session" }]);
        }
        if (name === "logout") {
          if (u.searchParams.get("scope") !== "local") {
            throw Error("wrong cleanup scope");
          }
          logouts++;
          return new Response(null, { status: 204 });
        }
        throw Error("unexpected local boundary");
      };
      try {
        const port = (module.passwordPort as any)("change", { stageMs: 20 });
        if (stage !== "auth") {
          await port.caller(token);
          await port.accountByUser(uid);
        }
        if (stage === "provider" || stage === "finish") {
          await port.begin(
            { id: uid, email, session_id: sid },
            account,
            "change",
            opid,
          );
        }
        holding = true;
        let done = false;
        const call = (stage === "auth"
          ? port.caller(token)
          : stage === "sql"
          ? port.accountByUser(uid)
          : stage === "provider"
          ? port.replace(op, candidate())
          : stage === "begin"
          ? port.begin(
            { id: uid, email, session_id: sid },
            account,
            "change",
            opid,
          )
          : stage === "finish"
          ? port.finish(op)
          : port.samePassword(email, candidate())).catch(() => {}).then(() => {
            done = true;
          });
        await start;
        await wait(90);
        if (!done) {
          release();
          await call;
          throw Error("unbounded " + stage + " caller");
        }
        const state = (module as any).passwordTransportState(port);
        if (state.unsettled < 1 || state.quarantined !== 1) {
          throw Error("deadline must not settle underlying I/O");
        }
        if (
          ["provider", "late_login"].includes(stage) && !state.sensitive_custody
        ) {
          throw Error("sensitive custody released before I/O settlement");
        }
        if (stage === "provider") {
          await port.replace(op, candidate()).catch(() => {});
          if (writes !== 1) {
            throw Error("uncertain write retried");
          }
        }
        const disposal = port.dispose().catch(() => {});
        release();
        await call;
        await disposal;
        await wait(60);
        const after = (module as any).passwordTransportState(port);
        if (after.unsettled !== 0 || after.sensitive_custody) {
          throw Error("actual settlement did not drain custody");
        }
        if (stage === "late_login" && logouts !== 1) {
          throw Error("late issued owned session stranded or repeated");
        }
        if (writes > 1 || unknowns > 1) {
          throw Error("mutation repeated");
        }
      } finally {
        release();
        globalThis.fetch = old;
      }
    },
  );
}
