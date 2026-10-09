// Independent offline actual SQL + SDK probes. No real credentials or network.
import { createTransactionFeedbackFixture } from "../tests/qa_isolation_fixture.mjs";
import {
  passwordPort,
  passwordTransportState,
} from "../supabase/functions/_shared/password-port.ts";
const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co";
Deno.env.set("SUPABASE_URL", endpoint);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
const results: unknown[] = [];
for (
  const mode of [
    "same_probe_halt",
    "candidate_incomplete_halt",
    "candidate_logout_unsettled",
  ]
) {
  Deno.test(mode, async () => {
    const f = await createTransactionFeedbackFixture({
        modulePath: Deno.env.get("QA_TRANSPORT_ADAPTER") ?? undefined,
      }),
      { db, id, actors, scalar } = f;
    const user = actors.employee,
      sid = id(1001),
      verify = id(9921),
      opid = id(9922),
      run = id(9923),
      email = "employee@fixture.invalid";
    const token = (s: string) =>
      [
        "fixture",
        btoa(
          JSON.stringify({
            sub: user,
            iss: endpoint + "/auth/v1",
            role: "authenticated",
            session_id: s,
          }),
        ),
        "fixture",
      ].join(".");
    let lastCode = "none",
      ownershipBefore = false,
      logouts = 0,
      release: (() => void) | undefined,
      logoutStarted: (() => void) | undefined;
    const started = new Promise<void>((r) => logoutStarted = r);
    const oldFetch = globalThis.fetch;
    try {
      for (
        const name of [
          "20261008010000_qa_isolation_prerequisites.sql",
          "20261008015000_qa_password_transport.sql",
          "20261008018000_qa_rest_provenance.sql",
          "20261008018500_qa_core_rest_admission.sql",
          "20261008020500_qa_password_frame_composition.sql",
        ]
      ) {
        await db.exec(
          await Deno.readTextFile(
            new URL("../supabase/migrations/" + name, import.meta.url),
          ),
        );
      }
      await db.query(
        "insert into app_private.qa_runs values($1,'active',true,clock_timestamp()+interval '1 hour',clock_timestamp())",
        [run],
      );
      await db.query(
        "insert into app_private.qa_account_manifest values($1,'fixture_employee','fixture_employee','current_owned_QA',$2,$3,$4,null)",
        [user, run, id(9924), id(9925)],
      );
      await db.query(
        "insert into app_private.qa_run_members values($1,$2,'employee',true)",
        [run, user],
      );
      for (
        const table of ["profiles", "account_migration_users", "audit_log"]
      ) {
        await db.exec(
          "create trigger edge_transport_guard before insert or update or delete on public." +
            table +
            " for each row execute function app_private.qa_reference_guard_before_row()",
        );
      }
      globalThis.fetch = async (input, init) => {
        const r = new Request(input, init),
          u = new URL(r.url),
          name = u.pathname.split("/").at(-1)!;
        if (u.origin !== endpoint) throw Error("offline boundary");
        await db.exec("reset role");
        if (u.pathname === "/auth/v1/user") {
          return Response.json({ id: user, email });
        }
        if (name === "account_migration_users") {
          return Response.json(
            (await db.query(
              "select canonical_key,login_username,preferred_login,display_name,role_code,internal_email,migrated_user_id from public.account_migration_users where migrated_user_id=$1",
              [user],
            )).rows[0],
          );
        }
        if (u.pathname === "/auth/v1/admin/users/" + user) {
          return Response.json({ user: { id: user, email, app_metadata: {} } });
        }
        if (u.pathname === "/auth/v1/token") {
          await db.query(
            "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
            [verify, user],
          );
          await db.query(
            "update app_private.qa_runs set active=false,phase='halted' where run_id=$1",
            [run],
          );
          await db.query(
            "update app_private.account_credential_state set session_valid_after=clock_timestamp() where user_id=$1",
            [user],
          );
          return Response.json({
            access_token: token(verify),
            refresh_token: "offline-fixture-refresh",
            token_type: "bearer",
            expires_in: 3600,
            user: {
              id: mode === "same_probe_halt" ? user : actors.manager,
              email,
            },
          });
        }
        if (u.pathname === "/auth/v1/logout") {
          if (
            u.searchParams.get("scope") !== "local" ||
            r.headers.get("authorization") !== "Bearer " + token(verify)
          ) throw Error("cleanup must be exact local session");
          await db.query("select set_config('request.headers',$1,false)", [
            JSON.stringify({
              "x-qa-actor-user": user,
              "x-qa-actor-sid": verify,
            }),
          ]);
          await db.exec("set role service_role");
          ownershipBefore = (await db.query(
            "select * from public.qa_owned_session_check_internal($1,$2)",
            [user, verify],
          )).rows[0].allowed;
          if (!ownershipBefore) {
            throw Error("ownership required before deletion");
          }
          await db.exec("reset role");
          logouts++;
          logoutStarted!();
          if (mode === "candidate_logout_unsettled") {
            await new Promise<void>((r) => release = r);
          }
          await db.query("delete from auth.sessions where id=$1", [verify]);
          return new Response(null, { status: 204 });
        }
        if (u.pathname.startsWith("/rest/v1/rpc/")) {
          const b = await r.json(), keys = Object.keys(b);
          await db.query(
            "select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
            [
              JSON.stringify({ role: "service_role" }),
              JSON.stringify(Object.fromEntries(r.headers.entries())),
            ],
          );
          await db.exec("set role service_role");
          try {
            const rows = (await db.query(
              "select " +
                (["qa_owned_session_check_internal", "qa_scope_probe_internal"]
                    .includes(name)
                  ? "* from "
                  : "") +
                "public." + name + "(" + keys.map((k, i) =>
                  k + " => $" + (i + 1)
                ).join(",") + ")",
              Object.values(b),
            )).rows;
            return Response.json(
              ["qa_owned_session_check_internal", "qa_scope_probe_internal"]
                  .includes(name)
                ? rows
                : Object.values(rows[0])[0],
            );
          } catch (e) {
            lastCode = String((e as { code?: string }).code || "uncoded") +
              ":" +
              (e as Error).message.replace(
                /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
                "[identifier]",
              ).replace(/'[^']*'/g, "[literal]").replace(
                /[a-z0-9_.+-]+@[a-z0-9.-]+/gi,
                "[identity]",
              );
            return Response.json(
              { code: "42501", message: "offline rejected" },
              { status: 403 },
            );
          }
        }
        throw Error("unexpected offline transport");
      };
      const port = (passwordPort as any)("change", {
          sqlMs: 250,
          authMs: 250,
          providerMs: 250,
          cleanupMs: 25,
        }),
        caller = await port.caller(token(sid));
      if (!caller) {
        throw Error("initial caller denied sanitized SQL code=" + lastCode);
      }
      const account = await port.accountByUser(user);
      if (!account) throw Error("account absent");
      let failed = false;
      if (mode === "same_probe_halt") {
        try {
          await port.samePassword(email, "Offline9#Fixture");
        } catch {
          failed = true;
        }
        await db.exec("reset role");
        const retained = await scalar(
          "select count(*)::int from auth.sessions where id=$1",
          [verify],
        );
        // After deletion the helper MUST deny the absent native SID. Pre-deletion
        // ownership is recorded at the transport boundary immediately before logout.
        await db.query("select set_config('request.headers',$1,false)", [
          JSON.stringify({ "x-qa-actor-user": user, "x-qa-actor-sid": verify }),
        ]);
        await db.exec("set role service_role");
        const narrow = (await db.query(
          "select * from public.qa_owned_session_check_internal($1,$2)",
          [user, verify],
        )).rows[0];
        if (
          await scalar(
            "select public.account_session_check_internal($1,$2,true)",
            [user, verify],
          ) !== false
        ) throw Error("deleted verification SID remains usable");
        results.push({
          mode,
          failed,
          provider_logouts: logouts,
          verification_session_retained: retained,
          actual_owned_helper_allowed: narrow.allowed,
        });
        if (
          failed || logouts !== 1 || retained !== 0 || narrow.allowed ||
          !ownershipBefore
        ) throw Error("owned samePassword session stranded after halt/cutoff");
      } else {
        const op = await port.begin(caller, account, "change", opid).catch(
          () => {
            throw Error("begin rejected sanitized SQL code=" + lastCode);
          },
        );
        try {
          await port.verifyCandidate!(op, email, "Offline9#Fixture");
        } catch {
          failed = true;
        }
        if (!failed) throw Error("malformed envelope unexpectedly accepted");
        if (mode === "candidate_logout_unsettled") {
          let settled = false;
          const disposal = port.dispose!().catch(() => {}).then(() => {
            settled = true;
          });
          await started;
          await new Promise((r) => setTimeout(r, 150));
          const pending = !settled;
          if (pending) {
            release!();
            await disposal;
            throw Error("caller remained pending past finite deadline");
          }
          const state = passwordTransportState(port);
          release!();
          await disposal;
          await new Promise((r) => setTimeout(r, 30));
          if (
            pending || state.unsettled < 1 || state.quarantined < 1 ||
            passwordTransportState(port).unsettled !== 0
          ) {
            throw Error(
              "caller deadline must preserve actual unsettled custody until release",
            );
          }
          results.push({
            mode,
            caller_pending_until_actual_io_release: pending,
            provider_logouts: logouts,
            settled_after_actual_release: settled,
          });
          if (!settled || logouts !== 1) throw Error("cleanup repeated");
        } else {
          await port.dispose!();
          await db.exec("reset role");
          results.push({
            mode,
            envelope_rejected: failed,
            provider_logouts: logouts,
            verification_session_retained: await scalar(
              "select count(*)::int from auth.sessions where id=$1",
              [verify],
            ),
          });
          if (logouts !== 1) {
            throw Error("exact owned incomplete disposal missed");
          }
        }
      }
    } finally {
      globalThis.fetch = oldFetch;
      await db.close();
    }
  });
}
