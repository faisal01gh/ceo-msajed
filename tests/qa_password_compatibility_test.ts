// Positive ordinary compatibility and fail-closed QA classification through SQL.
import { createTransactionFeedbackFixture } from "./qa_isolation_fixture.mjs";
import { passwordPort } from "../supabase/functions/_shared/password-port.ts";
const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co";
for (const mode of ["ordinary", "halted_QA", "unresolved_QA"] as const) {
  Deno.test(
    "missing owned helper compatibility requires actual " + mode +
      " classification",
    async () => {
      const { db, id, actors, scalar } = await createTransactionFeedbackFixture(
        { modulePath: Deno.env.get("QA_TRANSPORT_ADAPTER") ?? undefined },
      );
      const user = actors.employee,
        sid = id(1001),
        verify = id(9891),
        run = id(9892),
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
      let logouts = 0, fallbacks = 0;
      let classified: string[] = [];
      const old = globalThis.fetch;
      Deno.env.set("SUPABASE_URL", endpoint);
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
      try {
        await db.exec(
          await Deno.readTextFile(
            new URL(
              "../supabase/migrations/20261008010000_qa_isolation_prerequisites.sql",
              import.meta.url,
            ),
          ),
        );
        if (mode !== "ordinary") {
          await db.query(
            "insert into app_private.qa_runs values($1,'active',true,clock_timestamp()+interval '1 hour',clock_timestamp())",
            [run],
          );
          await db.query(
            "insert into app_private.qa_account_manifest values($1,'fixture_employee','fixture_employee','current_owned_QA',$2,$3,$4,null)",
            [user, run, id(9893), id(9894)],
          );
          await db.query(
            "insert into app_private.qa_run_members values($1,$2,'employee',true)",
            [run, user],
          );
        }
        globalThis.fetch = async (input, init) => {
          const r = new Request(input, init),
            u = new URL(r.url),
            name = u.pathname.split("/").at(-1)!;
          if (u.origin !== endpoint) throw Error("network forbidden");
          await db.exec("reset role");
          if (name === "user") {
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
          if (name === "token") {
            await db.query(
              "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
              [verify, user],
            );
            if (mode === "halted_QA") {
              await db.query(
                "update app_private.qa_runs set active=false,phase='halted' where run_id=$1",
                [run],
              );
            }
            if (mode === "unresolved_QA") {
              await db.query(
                "update app_private.qa_account_manifest set login_alias='unresolved_fixture_alias' where user_id=$1",
                [user],
              );
            }
            return Response.json({
              access_token: token(verify),
              refresh_token: ["offline", "refresh"].join("-"),
              token_type: "bearer",
              expires_in: 3600,
              user: { id: user, email },
            });
          }
          if (name === "logout") {
            if (u.searchParams.get("scope") !== "local") {
              throw Error("exact cleanup scope");
            }
            if (
              await scalar(
                "select count(*)::int from auth.sessions where id=$1 and user_id=$2",
                [verify, user],
              ) !== 1
            ) throw Error("native pre-deletion ownership absent");
            logouts++;
            await db.query("delete from auth.sessions where id=$1", [verify]);
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
            if (
              name === "account_session_check_internal" &&
              b.p_session === verify
            ) fallbacks++;
            try {
              const keys = Object.keys(b),
                table = name === "qa_scope_probe_internal";
              const rows = (await db.query(
                "select " + (table ? "* from " : "") + "public." + name +
                  "(" + keys.map((k, i) => k + " => $" + (i + 1)).join(",") +
                  ")",
                Object.values(b),
              )).rows;
              if (table) {
                classified = [rows[0].actor_class, rows[0].target_class];
              }
              return Response.json(table ? rows : Object.values(rows[0])[0]);
            } catch (e) {
              return Response.json({
                code: (e as { code?: string }).code || "offline",
                message: "fixture rejected",
              }, { status: 404 });
            }
          }
          throw Error("unexpected boundary");
        };
        const port = passwordPort();
        if (!await port.caller(token(sid))) {
          throw Error("fixture caller unavailable");
        }
        await port.accountByUser(user);
        let rejected = false;
        try {
          await port.samePassword(email, ["Offline", "9#", "Fixture"].join(""));
        } catch {
          rejected = true;
        }
        await port.dispose!().catch(() => {});
        await db.exec("reset role");
        const retained = await scalar(
          "select count(*)::int from auth.sessions where id=$1",
          [verify],
        );
        if (mode === "ordinary") {
          if (
            rejected || logouts !== 1 || retained !== 0 || fallbacks !== 1 ||
            classified.join(",") !== "ORDINARY,ORDINARY"
          ) {
            throw Error("positive ordinary native compatibility lost");
          }
        } else if (
          !rejected || logouts !== 0 || fallbacks !== 0 || retained !== 1 ||
          classified.includes("ORDINARY")
        ) {
          throw Error(
            "classified QA/unresolved reached legacy readiness fallback",
          );
        }
      } finally {
        globalThis.fetch = old;
        await db.close();
      }
    },
  );
}

for (const phase of ["active", "halted"] as const) {
  Deno.test(
    "legacy password begin denies classified QA before every journal/provider write " +
      phase,
    async () => {
      const { db, id, actors, scalar } = await createTransactionFeedbackFixture(
        { modulePath: Deno.env.get("QA_TRANSPORT_ADAPTER") ?? undefined },
      );
      const user = actors.employee,
        sid = id(1001),
        run = id(9861),
        email = "employee@fixture.invalid";
      const old = globalThis.fetch;
      let begins = 0;
      const access = [
        "fixture",
        btoa(
          JSON.stringify({
            sub: user,
            iss: endpoint + "/auth/v1",
            role: "authenticated",
            session_id: sid,
          }),
        ),
        "fixture",
      ].join(".");
      Deno.env.set("SUPABASE_URL", endpoint);
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
      try {
        await db.exec(
          await Deno.readTextFile(
            new URL(
              "../supabase/migrations/20261008010000_qa_isolation_prerequisites.sql",
              import.meta.url,
            ),
          ),
        );
        await db.query(
          "insert into app_private.qa_runs values($1,$2,$3,clock_timestamp()+interval '1 hour',clock_timestamp())",
          [run, phase, phase === "active"],
        );
        await db.query(
          "insert into app_private.qa_account_manifest values($1,'fixture_employee','fixture_employee','current_owned_QA',$2,$3,$4,null)",
          [user, run, id(9862), id(9863)],
        );
        await db.query(
          "insert into app_private.qa_run_members values($1,$2,'employee',true)",
          [run, user],
        );
        const snapshot =
          "select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(t) order by id) from public.profiles t),'registry',(select jsonb_agg(to_jsonb(t) order by canonical_key) from public.account_migration_users t),'state',(select jsonb_agg(to_jsonb(t) order by user_id) from app_private.account_credential_state t),'journal',(select jsonb_agg(to_jsonb(t) order by operation_id) from app_private.account_password_operations t))";
        const before = JSON.stringify(await scalar(snapshot));
        globalThis.fetch = async (input, init) => {
          const r = new Request(input, init),
            u = new URL(r.url),
            name = u.pathname.split("/").at(-1)!;
          if (u.origin !== endpoint) throw Error("network forbidden");
          await db.exec("reset role");
          if (name === "user") return Response.json({ id: user, email });
          if (name === "account_migration_users") {
            return Response.json(
              (await db.query(
                "select canonical_key,login_username,preferred_login,display_name,role_code,internal_email,migrated_user_id from public.account_migration_users where migrated_user_id=$1",
                [user],
              )).rows[0],
            );
          }
          if (u.pathname.startsWith("/rest/v1/rpc/")) {
            const b = await r.json(),
              keys = Object.keys(b),
              table = [
                "qa_scope_probe_internal",
                "qa_owned_session_check_internal",
              ].includes(name);
            await db.query(
              "select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
              [
                JSON.stringify({ role: "service_role" }),
                JSON.stringify(Object.fromEntries(r.headers.entries())),
              ],
            );
            await db.exec("set role service_role");
            if (name === "account_password_begin_internal") begins++;
            try {
              const rows = (await db.query(
                "select " + (table ? "* from " : "") + "public." + name +
                  "(" + keys.map((k, i) => k + " => $" + (i + 1)).join(",") +
                  ")",
                Object.values(b),
              )).rows;
              return Response.json(table ? rows : Object.values(rows[0])[0]);
            } catch (e) {
              return Response.json({
                code: (e as { code?: string }).code || "offline",
                message: "fixture rejected",
              }, { status: 404 });
            }
          }
          throw Error("unexpected provider I/O");
        };
        const port = passwordPort(), caller = await port.caller(access);
        if (!caller) throw Error("legacy session fixture invalid");
        const account = await port.accountByUser(user);
        if (!account) throw Error("legacy account fixture invalid");
        let denied = false;
        try {
          await port.begin(caller, account, "change", id(9864));
        } catch {
          denied = true;
        }
        await port.dispose!().catch(() => {});
        await db.exec("reset role");
        if (
          !denied || begins !== 0 ||
          before !== JSON.stringify(await scalar(snapshot))
        ) {
          throw Error(
            "classified QA gained a legacy journal/admission fallback",
          );
        }
      } finally {
        globalThis.fetch = old;
        await db.close();
      }
    },
  );
}
