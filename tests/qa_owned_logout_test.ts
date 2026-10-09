const uid = "10000000-0000-4000-8000-000000000001",
  sid = "30000000-0000-4000-8000-000000000001";
const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co";
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
Deno.test("actual logout verifies native ownership before checked global logout; provider failure is not success", async () => {
  const oldFetch = globalThis.fetch, oldServe = Deno.serve;
  let handler!: (r: Request) => Promise<Response>;
  const events: string[] = [];
  let currentToken = token, valid = true, logoutStatus = 500;
  Deno.env.set("SUPABASE_URL", endpoint);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
  Deno.env.set("SUPABASE_ANON_KEY", "offline-public-fixture");
  globalThis.fetch = async (input, init) => {
    const r = new Request(input, init), u = new URL(r.url);
    events.push(u.pathname);
    if (u.pathname === "/auth/v1/user") {
      return valid
        ? Response.json({ id: uid, email: "fixture@example.invalid" })
        : Response.json({ message: "private provider error" }, { status: 401 });
    }
    if (u.pathname.endsWith("qa_owned_session_check_internal")) {
      return Response.json([{ allowed: true, reason: "owned_session" }]);
    }
    if (u.pathname === "/auth/v1/logout") {
      return new Response(null, { status: logoutStatus });
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
  const request = () =>
    new Request("https://fixture.invalid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: currentToken }),
    });
  try {
    await import("../supabase/functions/session-logout/index.ts?qa-logout-red");
    const failure = await handler(request());
    if (failure.status === 200) {
      throw Error("provider failure must not return ok");
    }
    if (events[0] !== "/auth/v1/user") {
      throw Error("native ownership must precede any logout");
    }
    events.length = 0;
    valid = false;
    const denied = await handler(request());
    if (denied.status !== 401 || events.some((e) => e === "/auth/v1/logout")) {
      throw Error("unverified token must never authorize logout");
    }
    events.length = 0;
    valid = true;
    logoutStatus = 204;
    const repeat = await handler(request());
    if (repeat.status !== 503 || events.includes("/auth/v1/logout")) {
      throw Error("uncertain own-session logout repeated");
    }
    currentToken = [
      "fixture",
      btoa(
        JSON.stringify({
          sub: uid,
          iss: endpoint + "/auth/v1",
          role: "authenticated",
          session_id: "30000000-0000-4000-8000-000000000002",
        }),
      ),
      "fixture",
    ].join(".");
    events.length = 0;
    const allowed = await handler(request());
    if (allowed.status !== 200 || events.at(-1) !== "/auth/v1/logout") {
      throw Error("verified checked logout must succeed");
    }
  } finally {
    globalThis.fetch = oldFetch;
    Object.defineProperty(Deno, "serve", {
      value: oldServe,
      configurable: true,
    });
  }
});
Deno.test("actual logout uses native owned-token disposal after forced cutoff and QA halt without readiness escape", async () => {
  const module = "./qa_isolation_fixture.mjs";
  const { createTransactionFeedbackFixture } = await import(module);
  const { db, id, actors } = await createTransactionFeedbackFixture({
    modulePath: Deno.env.get("QA_TRANSPORT_ADAPTER") ?? undefined,
  });
  const actor = actors.employee;
  let session = id(1001), logouts = 0;
  const run = id(9701);
  const oldFetch = globalThis.fetch, oldServe = Deno.serve;
  let handler!: (r: Request) => Promise<Response>;
  Deno.env.set("SUPABASE_URL", endpoint);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
  Deno.env.set("SUPABASE_ANON_KEY", "offline-public-fixture");
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
    await db.query(
      "insert into app_private.qa_runs values($1,'halted',false,clock_timestamp()+interval '1 hour',clock_timestamp())",
      [run],
    );
    await db.query(
      "insert into app_private.qa_account_manifest values($1,'fixture_employee','fixture_employee','current_owned_QA',$2,$3,$4,null)",
      [actor, run, id(9702), id(9703)],
    );
    await db.query(
      "insert into app_private.qa_run_members values($1,$2,'employee',false)",
      [run, actor],
    );
    await db.query(
      "update public.profiles set must_change_password=true where id=$1",
      [actor],
    );
    await db.query(
      "update app_private.account_credential_state set session_valid_after=clock_timestamp() where user_id=$1",
      [actor],
    );
    globalThis.fetch = async (input, init) => {
      const r = new Request(input, init), u = new URL(r.url);
      if (u.origin !== endpoint) throw Error("offline network forbidden");
      await db.exec("reset role");
      if (u.pathname === "/auth/v1/user") {
        return Response.json({ id: actor, email: "employee@fixture.invalid" });
      }
      if (u.pathname.endsWith("account_session_check_internal")) {
        return Response.json(false);
      }
      if (u.pathname.endsWith("qa_owned_session_check_internal")) {
        const b = await r.json();
        const h = Object.fromEntries(r.headers.entries());
        await db.query(
          "select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
          [JSON.stringify({ role: "service_role" }), JSON.stringify(h)],
        );
        await db.exec("set role service_role");
        return Response.json(
          (await db.query(
            "select * from public.qa_owned_session_check_internal($1,$2)",
            [b.p_user, b.p_session],
          )).rows,
        );
      }
      if (u.pathname === "/auth/v1/logout") {
        if (u.searchParams.get("scope") !== "global") {
          throw Error("public logout scope changed");
        }
        logouts++;
        await db.query("delete from auth.sessions where user_id=$1", [actor]);
        return new Response(null, { status: 204 });
      }
      throw Error("unexpected offline transport");
    };
    Object.defineProperty(Deno, "serve", {
      value: (fn: typeof handler) => {
        handler = fn;
        return {};
      },
      configurable: true,
    });
    await import(
      "../supabase/functions/session-logout/index.ts?qa-owned-halt-transport"
    );
    const request = () =>
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qa-actor-user": actors.manager,
          "x-qa-actor-sid": id(1002),
        },
        body: JSON.stringify({
          token: [
            "fixture",
            btoa(
              JSON.stringify({
                sub: actor,
                iss: endpoint + "/auth/v1",
                role: "authenticated",
                session_id: session,
              }),
            ),
            "fixture",
          ].join("."),
        }),
      });
    if ((await handler(request())).status !== 200 || logouts !== 1) {
      throw Error("owned halted/forced token stranded");
    }
    await db.exec("reset role");
    if (
      (await db.query("select count(*)::int n from auth.sessions where id=$1", [
        session,
      ])).rows[0].n !== 0
    ) throw Error("native SID retained after logout");
    await db.query("select set_config('request.headers',$1,false)", [
      JSON.stringify({ "x-qa-actor-user": actor, "x-qa-actor-sid": session }),
    ]);
    await db.exec("set role service_role");
    if (
      (await db.query(
        "select * from public.qa_owned_session_check_internal($1,$2)",
        [actor, session],
      )).rows[0].allowed
    ) throw Error("deleted SID must be helper-denied");
    session = id(9799);
    if ((await handler(request())).status !== 401 || logouts !== 1) {
      throw Error("unknown native SID revoked");
    }
  } finally {
    globalThis.fetch = oldFetch;
    Object.defineProperty(Deno, "serve", {
      value: oldServe,
      configurable: true,
    });
    await db.close();
  }
});
