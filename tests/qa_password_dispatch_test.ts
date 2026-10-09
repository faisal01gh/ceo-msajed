const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co",
  uid = "10000000-0000-4000-8000-000000000001",
  sid = "30000000-0000-4000-8000-000000000001";
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
Deno.test("actual password handler requires native session preflight before account/provider candidate access", async () => {
  const oldFetch = globalThis.fetch, oldServe = Deno.serve;
  let handler!: (r: Request) => Promise<Response>;
  const events: string[] = [];
  Deno.env.set("SUPABASE_URL", endpoint);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
  globalThis.fetch = async (input, init) => {
    const r = new Request(input, init),
      u = new URL(r.url),
      name = u.pathname.split("/").at(-1)!;
    events.push(name);
    if (u.pathname === "/auth/v1/user") {
      return Response.json({ id: uid, email: "fixture@example.invalid" });
    }
    if (name === "account_session_check_internal") return Response.json(false);
    if (name === "account_migration_users") {
      return Response.json({
        canonical_key: "fixture",
        login_username: "fixture",
        preferred_login: "fixture",
        display_name: "fixture",
        role_code: "employee",
        internal_email: "fixture@example.invalid",
        migrated_user_id: uid,
      });
    }
    if (u.pathname.startsWith("/auth/v1/admin/users")) {
      return Response.json({
        user: { id: uid, email: "fixture@example.invalid", app_metadata: {} },
      });
    }
    if (u.pathname === "/auth/v1/token") {
      return Response.json({
        code: "invalid_credentials",
        message: "PRIVATE_ERROR_SENTINEL",
      }, { status: 400 });
    }
    return Response.json({ code: "42501", message: "denied" }, { status: 403 });
  };
  Object.defineProperty(Deno, "serve", {
    value: (fn: typeof handler) => {
      handler = fn;
      return {};
    },
    configurable: true,
  });
  try {
    await import(
      "../supabase/functions/account-confirm-password/index.ts?qa-preflight-red"
    );
    const r = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          new_password: "Offline9#Fixture",
          operation_id: uid,
        }),
      }),
    );
    if (
      r.status !== 401 ||
      events.join(",") !==
        "user,account_session_check_internal,account_password_begin_internal"
    ) {
      throw Error(
        "invalid native session must deny before all candidate/provider reads",
      );
    }
  } finally {
    globalThis.fetch = oldFetch;
    Object.defineProperty(Deno, "serve", {
      value: oldServe,
      configurable: true,
    });
  }
});
Deno.test("actual password same-candidate probe never logs out an unowned provider token", async () => {
  const oldFetch = globalThis.fetch, oldServe = Deno.serve;
  let handler!: (r: Request) => Promise<Response>;
  let logouts = 0, begins = 0;
  const foreign = "10000000-0000-4000-8000-000000000099";
  Deno.env.set("SUPABASE_URL", endpoint);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
  globalThis.fetch = async (input, init) => {
    const r = new Request(input, init),
      u = new URL(r.url),
      name = u.pathname.split("/").at(-1)!;
    if (u.pathname === "/auth/v1/user") {
      return Response.json({
        id: r.headers.get("authorization") === "Bearer foreign-fixture-token"
          ? foreign
          : uid,
        email: "fixture@example.invalid",
      });
    }
    if (name === "account_session_check_internal") return Response.json(true);
    if (name === "account_migration_users") {
      return Response.json({
        canonical_key: "fixture",
        login_username: "fixture",
        preferred_login: "fixture",
        display_name: "fixture",
        role_code: "employee",
        internal_email: "fixture@example.invalid",
        migrated_user_id: uid,
      });
    }
    if (u.pathname.startsWith("/auth/v1/admin/users")) {
      return Response.json({
        user: { id: uid, email: "fixture@example.invalid", app_metadata: {} },
      });
    }
    if (u.pathname === "/auth/v1/token") {
      return Response.json({
        access_token: "foreign-fixture-token",
        refresh_token: "foreign-fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: foreign, email: "fixture@example.invalid" },
      });
    }
    if (u.pathname === "/auth/v1/logout") {
      logouts++;
      return new Response(null, { status: 204 });
    }
    if (name === "account_password_begin_internal") {
      begins++;
      return Response.json({ code: "42501", message: "denied" }, {
        status: 403,
      });
    }
    throw Error("unexpected offline boundary");
  };
  Object.defineProperty(Deno, "serve", {
    value: (fn: typeof handler) => {
      handler = fn;
      return {};
    },
    configurable: true,
  });
  try {
    await import(
      "../supabase/functions/account-confirm-password/index.ts?qa-owned-probe-red"
    );
    const r = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          new_password: "Offline9#Fixture",
          operation_id: uid,
        }),
      }),
    );
    if (logouts !== 0 || begins !== 0 || r.status === 200) {
      throw Error(
        "a provider token for another UID must not authorize cleanup or credential mutation",
      );
    }
  } finally {
    globalThis.fetch = oldFetch;
    Object.defineProperty(Deno, "serve", {
      value: oldServe,
      configurable: true,
    });
  }
});
Deno.test("actual password handler retains exact original-SID native journal observation after its own cutoff", async () => {
  const oldFetch = globalThis.fetch, oldServe = Deno.serve;
  let handler!: (r: Request) => Promise<Response>;
  let replacements = 0;
  Deno.env.set("SUPABASE_URL", endpoint);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
  globalThis.fetch = async (input, init) => {
    const r = new Request(input, init),
      u = new URL(r.url),
      name = u.pathname.split("/").at(-1)!;
    if (u.pathname === "/auth/v1/user") {
      return Response.json({ id: uid, email: "fixture@example.invalid" });
    }
    if (name === "account_session_check_internal") return Response.json(false);
    if (name === "account_password_begin_internal") {
      const b = await r.json();
      if (
        b.p_actor !== uid || b.p_session !== sid || b.p_operation_id !== uid ||
        b.p_kind !== "change"
      ) throw Error("bad observation tuple");
      return Response.json({
        operation_id: uid,
        target_user_id: uid,
        canonical_key: "fixture",
        login_username: "fixture",
        generation: 1,
        status: "pending",
        write_allowed: false,
      });
    }
    if (name === "account_migration_users") {
      return Response.json({
        canonical_key: "fixture",
        login_username: "fixture",
        preferred_login: "fixture",
        display_name: "fixture",
        role_code: "employee",
        internal_email: "fixture@example.invalid",
        migrated_user_id: uid,
      });
    }
    if (u.pathname.startsWith("/auth/v1/admin/users")) {
      if (r.method !== "GET") replacements++;
      return Response.json({
        user: { id: uid, email: "fixture@example.invalid", app_metadata: {} },
      });
    }
    throw Error("unexpected offline boundary");
  };
  Object.defineProperty(Deno, "serve", {
    value: (fn: typeof handler) => {
      handler = fn;
      return {};
    },
    configurable: true,
  });
  try {
    await import(
      "../supabase/functions/account-confirm-password/index.ts?qa-exact-cutoff-red"
    );
    const r = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          new_password: "Offline9#Fixture",
          operation_id: uid,
        }),
      }),
    );
    if (r.status !== 409 || replacements !== 0) {
      throw Error(
        "exact stored operation observation must remain pending, never redispatch or gain ordinary access",
      );
    }
  } finally {
    globalThis.fetch = oldFetch;
    Object.defineProperty(Deno, "serve", {
      value: oldServe,
      configurable: true,
    });
  }
});
Deno.test("actual SDK consumes actual SQL control/proof ABI with one shot and owned disposal offline", async () => {
  const module = "./qa_isolation_fixture.mjs";
  const { createTransactionFeedbackFixture } = await import(module);
  const { passwordRequest } = await import(
    "../supabase/functions/_shared/password-command.ts"
  );
  const { passwordPort } = await import(
    "../supabase/functions/_shared/password-port.ts"
  );
  for (
    const mode of [
      "normal",
      "observed",
      "lost",
      "proof_sid_missing",
      "cleanup_failure",
      "malformed_envelope",
      "spoofed_browser",
      "legacy",
      "reset",
      "reset_deny",
      "halt_after_finish",
    ] as const
  ) {
    const f = await createTransactionFeedbackFixture({
      modulePath: Deno.env.get("QA_TRANSPORT_ADAPTER") ?? undefined,
    });
    const { db, scalar, id, actors } = f;
    const reset = mode === "reset" || mode === "reset_deny",
      target = actors.employee,
      actor = reset ? actors.manager : target,
      actorSID = id(reset ? 1002 : 1001),
      operation = id(9500),
      verifySID = id(9501),
      email = "employee@fixture.invalid";
    const makeToken = (session: string, subject = target) =>
      [
        "fixture",
        btoa(
          JSON.stringify({
            sub: subject,
            iss: endpoint + "/auth/v1",
            role: "authenticated",
            session_id: session,
          }),
        ),
        "fixture",
      ].join(".");
    let lastSQL = "none";
    let assignedCandidate: string | undefined;
    let writes = 0,
      signins = 0,
      finished = false,
      disposals = 0,
      dispatches = 0;
    const events: string[] = [];
    const oldFetch = globalThis.fetch;
    const fail = (what: string) => {
      throw Error("offline " + mode + " " + what);
    };
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
      if (mode !== "legacy") {
        for (
          const file of [
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
      }
      if (reset) {
        await db.query(
          "insert into public.user_roles(user_id,role_code,is_primary) values($1,'ceo_office_manager',false)",
          [actor],
        );
        if (mode === "reset_deny") {
          await db.query(
            "insert into public.user_permissions(user_id,permission_code,effect) values($1,'profiles.admin_reset_password','deny')",
            [actor],
          );
        }
      }
      if (mode === "halt_after_finish") {
        await db.query(
          "insert into app_private.qa_runs values($1,'active',true,clock_timestamp()+interval '1 hour',clock_timestamp())",
          [id(9600)],
        );
        await db.query(
          "insert into app_private.qa_account_manifest values($1,'fixture_employee','fixture_employee','current_owned_QA',$2,$3,$4,null)",
          [target, id(9600), id(9601), id(9602)],
        );
        await db.query(
          "insert into app_private.qa_run_members values($1,$2,'employee',true)",
          [id(9600), target],
        );
      }
      if (mode !== "legacy") {
        for (
          const table of ["profiles", "account_migration_users", "audit_log"]
        ) {
          await db.exec(
            "create trigger edge_transport_guard before insert or update or delete on public." +
              table +
              " for each row execute function app_private.qa_reference_guard_before_row()",
          );
        }
      }
      globalThis.fetch = async (input, init) => {
        const r = new Request(input, init),
          u = new URL(r.url),
          name = u.pathname.split("/").at(-1)!;
        if (u.origin !== endpoint) fail("network forbidden");
        events.push(name);
        await db.exec("reset role");
        if (u.pathname === "/auth/v1/user") {
          const subject =
            JSON.parse(atob(r.headers.get("authorization")!.split(".")[1])).sub;
          return Response.json({
            id: subject,
            email: subject === target ? email : "manager@fixture.invalid",
          });
        }
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
            if (dispatches !== 1 && mode !== "legacy") {
              fail("write without first dispatch");
            }
            writes++;
            const body = await r.json();
            assignedCandidate = body.password;
            await db.query(
              "update auth.users set raw_app_meta_data=$2 where id=$1",
              [target, JSON.stringify(body.app_metadata)],
            );
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
        if (u.pathname === "/auth/v1/token") {
          if (!writes || (await r.json()).password !== assignedCandidate) {
            return Response.json({
              code: "invalid_credentials",
              message: "fixture denied",
            }, {
              status: 400,
              headers: { "x-supabase-api-version": "2024-01-01" },
            });
          }
          signins++;
          const session = signins === 1 ? verifySID : id(9502);
          await db.query(
            "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
            [session, target],
          );
          return Response.json({
            access_token: makeToken(
              mode === "proof_sid_missing" ? id(9999) : session,
            ),
            refresh_token: "offline-refresh-fixture",
            token_type: "bearer",
            expires_in: 3600,
            user: {
              id: mode === "malformed_envelope" ? actors.manager : target,
              email,
            },
          });
        }
        if (u.pathname === "/auth/v1/logout") {
          if (mode !== "malformed_envelope" && !finished) {
            fail("verification session disposed before finish");
          }
          if (
            u.searchParams.get("scope") !== "local" ||
            r.headers.get("authorization") !== "Bearer " + makeToken(verifySID)
          ) fail("verification cleanup scope or exact token");
          disposals++;
          if (mode === "cleanup_failure") {
            return Response.json({ message: "private fixture error" }, {
              status: 500,
            });
          }
          await db.query("delete from auth.sessions where id=$1", [verifySID]);
          return new Response(null, { status: 204 });
        }
        if (u.pathname.startsWith("/rest/v1/rpc/")) {
          const b = await r.json();
          const functions = [
            "account_session_check_internal",
            "qa_scope_probe_internal",
            "account_password_begin_internal",
            "qa_password_dispatch_internal",
            "account_password_finish_internal",
            "account_password_unknown_internal",
            "account_password_fail_internal",
            "qa_owned_session_check_internal",
          ];
          if (!functions.includes(name)) fail("unexpected RPC");
          const headers = Object.fromEntries(r.headers.entries());
          await db.query(
            "select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
            [JSON.stringify({ role: "service_role" }), JSON.stringify(headers)],
          );
          await db.exec("set role service_role");
          try {
            const keys = Object.keys(b);
            if (keys.some((k) => !/^p_[a-z_]+$/.test(k))) {
              fail("RPC argument shape");
            }
            const sql = "select " +
              ([
                  "qa_password_dispatch_internal",
                  "qa_scope_probe_internal",
                  "qa_owned_session_check_internal",
                ].includes(name)
                ? "* from "
                : "") +
              "public." + name + "(" + keys.map((k, i) =>
                k + " => $" + (i + 1)
              ).join(",") + ")";
            const result = await db.query(sql, Object.values(b));
            let data = [
                "qa_password_dispatch_internal",
                "qa_scope_probe_internal",
                "qa_owned_session_check_internal",
              ].includes(name)
              ? result.rows
              : Object.values(result.rows[0])[0];
            if (name === "qa_password_dispatch_internal") {
              dispatches++;
              if (mode === "lost") {
                throw Error("offline admission response lost");
              }
              if (mode === "observed") {
                data = [{ ...data[0], dispatch_state: "admitted_observed" }];
              }
            }
            if (name === "account_password_finish_internal") {
              finished = true;
              if (mode === "halt_after_finish") {
                await db.exec("reset role");
                await db.query(
                  "update app_private.qa_runs set phase='halted',active=false where run_id=$1",
                  [id(9600)],
                );
              }
            }
            return Response.json(data);
          } catch (e) {
            lastSQL =
              String((e as { code?: string }).code || "offline_unknown") + ":" +
              (e as Error).message.replace(
                /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
                "[identifier]",
              ).replace(/'[^']*'/g, "[literal]").replace(
                /[a-z0-9_.+-]+@[a-z0-9.-]+/gi,
                "[identity]",
              );
            return Response.json({
              code: (e as { code?: string }).code || "offline_unknown",
              message: "offline rejected",
            }, { status: 403 });
          }
        }
        fail("unexpected transport");
        return new Response(null, { status: 500 });
      };
      const response = await passwordRequest(
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-qa-candidate-handle": id(9999),
            "x-qa-candidate-proof": "{}",
            "x-qa-actor-user": actors.manager,
          },
          body: JSON.stringify({
            access_token: makeToken(actorSID, actor),
            new_password: "Offline9#Fixture",
            operation_id: operation,
            ...(reset ? { target_key: "fixture_employee" } : {}),
          }),
        }),
        passwordPort(reset ? "reset" : "change"),
        reset ? "reset" : "change",
      );
      if (
        ["normal", "spoofed_browser", "legacy", "reset", "halt_after_finish"]
          .includes(mode)
      ) {
        if (response.status !== 200 || writes !== 1 || !finished) {
          fail(
            "success boundary status=" + response.status + " writes=" + writes +
              " finished=" + finished + " sanitizedSQL=" + lastSQL,
          );
        }
        const body = await response.json();
        if ("candidate_handle" in body || "qa_control_version" in body) {
          fail("internal advertisement leaked");
        }
        if (mode !== "legacy" && (dispatches !== 1 || disposals !== 1)) {
          fail("dispatch/disposal counts");
        }
        if (mode === "normal") {
          const replay = await passwordRequest(
            new Request("https://fixture.invalid", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                access_token: makeToken(actorSID, actor),
                new_password: "Offline9#Fixture",
                operation_id: operation,
              }),
            }),
            passwordPort(),
            "change",
          );
          if (replay.status === 200 || writes !== 1) {
            fail("lost in-memory handle regained authority");
          }
        }
      } else if (response.status === 200) {
        fail("unknown outcome claimed success");
      }
      if (["observed", "lost"].includes(mode) && writes !== 0) {
        fail("observed/lost admission retransmitted");
      }
      if (mode === "reset_deny" && writes !== 0) {
        fail("deny override permitted provider write");
      }
      if (writes > 1) fail("provider write repeated");
      if (mode === "proof_sid_missing" && finished) {
        fail("claimed SID accepted without native row");
      }
      if (mode === "cleanup_failure" && disposals !== 1) {
        fail("cleanup retry or omission");
      }
    } finally {
      globalThis.fetch = oldFetch;
      await db.close();
    }
  }
});
