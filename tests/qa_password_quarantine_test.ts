// Real SQL journal + actual pinned SDK; only the provider HTTP boundary is synthetic.
import { createTransactionFeedbackFixture } from "./qa_isolation_fixture.mjs";
import {
  passwordPort,
  passwordTransportState,
} from "../supabase/functions/_shared/password-port.ts";
import { passwordRequest } from "../supabase/functions/_shared/password-command.ts";
const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (
  const mode of [
    "provider_pending",
    "dispatch_pending",
    "finish_pending",
    "verification_pending",
    "unknown_pending",
  ] as const
) {
  Deno.test(
    "actual command quarantines " + mode +
      " without retry or early custody release",
    async () => {
      const { db, id, actors, scalar } = await createTransactionFeedbackFixture(
        { modulePath: Deno.env.get("QA_TRANSPORT_ADAPTER") ?? undefined },
      );
      const target = actors.employee,
        original = id(1001),
        verification = id(9881),
        operation = id(9882),
        email = "employee@fixture.invalid";
      const token = (sid: string) =>
        [
          "fixture",
          btoa(
            JSON.stringify({
              sub: target,
              iss: endpoint + "/auth/v1",
              role: "authenticated",
              session_id: sid,
            }),
          ),
          "fixture",
        ].join(".");
      let lastSQL = "none";
      let candidate: string | undefined,
        writes = 0,
        dispatches = 0,
        finishes = 0,
        logouts = 0,
        unknowns = 0;
      let release!: () => void, started!: () => void;
      const held = new Promise<void>((r) => release = r),
        start = new Promise<void>((r) => started = r);
      const hold = async () => {
        started();
        await held;
      };
      const old = globalThis.fetch;
      Deno.env.set("SUPABASE_URL", endpoint);
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
      let port: ReturnType<typeof passwordPort> | undefined;
      try {
        for (
          const file of [
            "20261008010000_qa_isolation_prerequisites.sql",
            "20261008015000_qa_password_transport.sql",
            "20261008018000_qa_rest_provenance.sql",
            "20261008018500_qa_core_rest_admission.sql",
            "20261008020500_qa_password_frame_composition.sql",
          ]
        ) {
          await db.exec(
            await Deno.readTextFile(
              new URL("../supabase/migrations/" + file, import.meta.url),
            ),
          );
        }
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
          if (u.origin !== endpoint) {
            throw Error("external transport forbidden");
          }
          await db.exec("reset role");
          if (name === "user") return Response.json({ id: target, email });
          if (name === "account_migration_users") {
            return Response.json(
              (await db.query(
                "select canonical_key,login_username,preferred_login,display_name,role_code,internal_email,migrated_user_id from public.account_migration_users where migrated_user_id=$1",
                [target],
              )).rows[0],
            );
          }
          if (u.pathname === "/auth/v1/admin/users/" + target) {
            if (r.method === "PUT") {
              writes++;
              const b = await r.json();
              candidate = b.password;
              await db.query(
                "update auth.users set raw_app_meta_data=$2 where id=$1",
                [target, JSON.stringify(b.app_metadata)],
              );
              if (mode === "provider_pending") await hold();
              if (mode === "unknown_pending") {
                return Response.json(
                  { message: "unresolved fixture response" },
                  { status: 500 },
                );
              }
            }
            return Response.json({
              user: {
                id: target,
                email,
                app_metadata: await scalar(
                  "select raw_app_meta_data from auth.users where id=$1",
                  [target],
                ),
              },
            });
          }
          if (name === "token") {
            const b = await r.json();
            if (!candidate || b.password !== candidate) {
              return Response.json({
                code: "invalid_credentials",
                message: "fixture rejected",
              }, {
                status: 400,
                headers: { "x-supabase-api-version": "2024-01-01" },
              });
            }
            await db.query(
              "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
              [verification, target],
            );
            if (mode === "verification_pending") await hold();
            return Response.json({
              access_token: token(verification),
              refresh_token: ["offline", "refresh"].join("-"),
              token_type: "bearer",
              expires_in: 3600,
              user: { id: target, email },
            });
          }
          if (name === "logout") {
            if (
              u.searchParams.get("scope") !== "local" ||
              r.headers.get("authorization") !== "Bearer " + token(verification)
            ) throw Error("foreign or nonlocal cleanup");
            logouts++;
            await db.query("delete from auth.sessions where id=$1", [
              verification,
            ]);
            return new Response(null, { status: 204 });
          }
          if (u.pathname.startsWith("/rest/v1/rpc/")) {
            const b = await r.json();
            await db.query(
              "select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
              [
                JSON.stringify({ role: "service_role" }),
                JSON.stringify(Object.fromEntries(r.headers.entries())),
              ],
            );
            await db.exec("set role service_role");
            try {
              const keys = Object.keys(b),
                table = [
                  "qa_password_dispatch_internal",
                  "qa_scope_probe_internal",
                  "qa_owned_session_check_internal",
                ].includes(name);
              const rows = (await db.query(
                "select " + (table ? "* from " : "") + "public." + name +
                  "(" + keys.map((k, i) => k + " => $" + (i + 1)).join(",") +
                  ")",
                Object.values(b),
              )).rows;
              if (name === "qa_password_dispatch_internal") {
                dispatches++;
                if (mode === "dispatch_pending") await hold();
              }
              if (name === "account_password_finish_internal") {
                finishes++;
                if (mode === "finish_pending") await hold();
              }
              if (name === "account_password_unknown_internal") {
                unknowns++;
                if (mode === "unknown_pending") await hold();
              }
              return Response.json(table ? rows : Object.values(rows[0])[0]);
            } catch (e) {
              lastSQL =
                String((e as { code?: string }).code || "offline_unknown") +
                ":" +
                (e as Error).message.replace(
                  /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
                  "[identifier]",
                ).replace(/'[^']*'/g, "[literal]");
              return Response.json({
                code: (e as { code?: string }).code || "offline_unknown",
                message: "fixture rejected",
              }, { status: 403 });
            }
          }
          throw Error("unexpected fixture transport");
        };
        port = passwordPort("change", {
          sqlMs: 150,
          authMs: 150,
          providerMs: 150,
          cleanupMs: 150,
        });
        const req = () =>
          new Request("https://fixture.invalid", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: token(original),
              new_password: ["Offline", "9#", "Fixture"].join(""),
              operation_id: operation,
            }),
          });
        let settled = false, status = 0;
        const call = passwordRequest(req(), port, "change").then((r) => {
          settled = true;
          status = r.status;
        });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() =>
            reject(
              Error(
                "hold not reached status=" + status + " SQL=" + lastSQL +
                  " stages=" + passwordTransportState(port!).stages.map((x) =>
                    x.stage + ":" + x.state
                  ).join(","),
              ),
            ), 2000);
          void start.then(() => {
            clearTimeout(timer);
            resolve();
          });
        });
        await wait(550);
        if (!settled) {
          release();
          await call;
          throw Error("pending command not bounded");
        }
        const state = passwordTransportState(port);
        if (
          status !== 503 || state.unsettled < 1 || state.quarantined !== 1 ||
          !state.sensitive_custody
        ) throw Error("pending I/O was not quarantined with sensitive custody");
        if (mode === "provider_pending" && unknowns !== 0) {
          throw Error("journal ran before actual provider settlement");
        }
        if (mode === "dispatch_pending" && writes !== 0) {
          throw Error("write admitted from an unreceived dispatch token");
        }
        release();
        await call;
        for (
          let n = 0;
          n < 60 && passwordTransportState(port).unsettled;
          n++
        ) await wait(10);
        const after = passwordTransportState(port);
        if (after.unsettled !== 0 || after.sensitive_custody) {
          throw Error("physical drain did not release custody");
        }
        await db.exec("reset role");
        const stateInSQL = await scalar(
          "select status from app_private.account_password_operations where operation_id=$1",
          [operation],
        );
        if (
          stateInSQL !== (mode === "finish_pending" ? "completed" : "uncertain")
        ) throw Error("durable journal outcome missing");
        if (
          dispatches !== 1 ||
          writes !== (mode === "dispatch_pending" ? 0 : 1) ||
          finishes !== (mode === "finish_pending" ? 1 : 0) || unknowns !== 1
        ) throw Error("dispatch/write/finalization/journal repeated");
        if (["finish_pending", "verification_pending"].includes(mode)) {
          if (
            logouts !== 1 ||
            await scalar(
                "select count(*)::int from auth.sessions where id=$1",
                [verification],
              ) !== 0
          ) throw Error("late verification SID stranded");
          await db.query("select set_config('request.headers',$1,false)", [
            JSON.stringify({
              "x-qa-actor-user": target,
              "x-qa-actor-sid": verification,
            }),
          ]);
          await db.exec("set role service_role");
          if (
            (await db.query(
              "select * from public.qa_owned_session_check_internal($1,$2)",
              [target, verification],
            )).rows[0].allowed
          ) throw Error("deleted SID still owned");
        } else if (logouts !== 0) {
          throw Error("unissued session cleanup mutation");
        }
        const replay = await passwordRequest(req(), passwordPort(), "change");
        if (replay.status === 200 || writes > 1 || dispatches > 1) {
          throw Error("uncertain replay repeated provider mutation");
        }
      } finally {
        release();
        if (port) {
          for (
            let n = 0;
            n < 60 && passwordTransportState(port).unsettled;
            n++
          ) await wait(10);
        }
        candidate = undefined;
        globalThis.fetch = old;
        await db.close();
      }
    },
  );
}
