// Actual pinned SDK and endpoint handlers. All HTTP is intercepted before
// constructor execution; credentials and captured logs exist only in memory.
const endpoint = "https://initial-sdk-fixture.invalid";
const uid = "10000000-0000-4000-8000-000000000001";
const sid = "30000000-0000-4000-8000-000000000001";
const failedChecks: string[] = [];
const check = (value: unknown, message: string) => {
  if (!value) {
    failedChecks.push(message);
    throw new Error(message);
  }
};
async function readyWithin(ready: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<void>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("fixture initial body not reached")),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
type Handler = (request: Request) => Promise<Response>;
type Fixture = {
  handler: Handler;
  token: string;
  key: string;
  logs: unknown[][];
  calls: Request[];
  unexpected: () => number;
};
let generation = 0;
async function fixture(
  name: "transactions-api" | "account-resolve",
  transport: (request: Request, f: Fixture) => Response | Promise<Response>,
  run: (f: Fixture) => Promise<void>,
) {
  failedChecks.length = 0;
  const oldFetch = globalThis.fetch, oldServe = Deno.serve;
  const env = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const oldEnv = env.map((name) => Deno.env.get(name));
  const methods = ["log", "info", "debug", "warn", "error"] as const;
  const oldLogs = methods.map((name) => console[name]);
  const logs: unknown[][] = [], calls: Request[] = [];
  const token = [
    crypto.randomUUID(),
    btoa(JSON.stringify({
      sub: uid,
      iss: endpoint + "/auth/v1",
      role: "authenticated",
      session_id: sid,
    })),
    crypto.randomUUID(),
  ].join(".");
  let unexpected = 0, handler!: Handler;
  const f: Fixture = {
    handler: (req) => handler(req),
    token,
    key: crypto.randomUUID(),
    logs,
    calls,
    unexpected: () => unexpected,
  };
  Deno.env.set(env[0], endpoint);
  Deno.env.set(env[1], f.key);
  for (const name of methods) {
    console[name] = (...args) => {
      logs.push(args);
    };
  }
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== endpoint) {
      unexpected++;
      throw new Error("fixture denied unexpected origin");
    }
    calls.push(request);
    return await transport(request, f);
  };
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    value: (fn: Handler) => {
      handler = fn;
      return {};
    },
  });
  try {
    await import(
      `../supabase/functions/${name}/index.ts?initial-sdk=${++generation}`
    );
    check(typeof handler === "function", "actual endpoint handler captured");
    await run(f);
    check(unexpected === 0, "no provider request escapes the local fixture");
    // SDKs may convert a fixture assertion into a normal auth/data error.
    // Reassert outside the SDK so negative responses cannot hide a bad oracle.
    if (failedChecks.length) throw new Error(failedChecks[0]);
  } finally {
    globalThis.fetch = oldFetch;
    Object.defineProperty(Deno, "serve", {
      configurable: true,
      value: oldServe,
    });
    for (let i = 0; i < methods.length; i++) console[methods[i]] = oldLogs[i];
    for (let i = 0; i < env.length; i++) {
      if (oldEnv[i] === undefined) Deno.env.delete(env[i]);
      else Deno.env.set(env[i], oldEnv[i]!);
    }
  }
}
function request(f: Fixture, name = "transactions-api", body?: unknown) {
  return new Request("https://handler-fixture.invalid", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ceo-msajed.pages.dev",
    },
    body: JSON.stringify(
      body ??
        (name === "transactions-api"
          ? { app: "new", token: f.token, action: "notifications" }
          : { login: "fixture" }),
    ),
  });
}
function assertPrivacy(f: Fixture, response: string) {
  const text = f.logs.flat().map((arg) =>
    arg instanceof Error ? arg.message + arg.stack : String(arg)
  ).join(" ");
  check(
    ![f.token, f.key].some((secret) => text.includes(secret)),
    "raw credential reached captured SDK logs",
  );
  check(
    ![f.token, f.key].some((secret) => response.includes(secret)),
    "raw credential reached endpoint response",
  );
}
Deno.test("initial transactions actual getUser fetch error protects credentials before SDK logging", async () => {
  await fixture("transactions-api", (req, f) => {
    check(
      new URL(req.url).pathname === "/auth/v1/user",
      "only initial getUser transport reached",
    );
    check(
      req.headers.get("authorization") === "Bearer " + f.token &&
        req.headers.get("apikey") === f.key,
      "exact initial Auth headers retained",
    );
    throw new Error(f.token + " " + f.key);
  }, async (f) => {
    const response = await f.handler(request(f));
    const body = await response.text();
    check(
      response.status === 401 && body === '{"error":"unauthorized"}',
      "getUser network failure retains initial unauthorized response",
    );
    check(
      f.calls.length === 1,
      "initial auth transport failure is not retried",
    );
    check(f.logs.length > 0, "pinned SDK error logging actually exercised");
    assertPrivacy(f, body);
  });
});

Deno.test("initial account resolve replaces external fetch exceptions before SDK field inspection", async () => {
  let inspected = 0;
  await fixture("account-resolve", (req, f) => {
    const path = new URL(req.url).pathname;
    check(
      req.headers.get("authorization") === "Bearer " + f.key &&
        req.headers.get("apikey") === f.key,
      "resolve initial service credential retained",
    );
    if (path === "/rest/v1/account_migration_aliases") {
      return Response.json(null);
    }
    check(
      path === "/rest/v1/account_migration_users",
      "resolve uses existing lookup path",
    );
    throw Object.defineProperty({}, "message", {
      get() {
        inspected++;
        return f.key;
      },
    });
  }, async (f) => {
    const response = await f.handler(request(f, "account-resolve"));
    const body = await response.text();
    check(
      response.status === 200 && body === '{"eligible":false}',
      "resolve transport failure preserves ineligible response",
    );
    check(
      f.calls.length === 2,
      "resolve existing alias fallback preserved without retries",
    );
    check(inspected === 0, "initial SDK inspected a raw external exception");
    assertPrivacy(f, body);
  });
});

for (const name of ["transactions-api", "account-resolve"] as const) {
  for (const mode of ["body_error", "late_body_error"] as const) {
    Deno.test(`initial ${name} ${mode} keeps external credentials out of SDK logs`, async () => {
      let release: (() => void) | undefined, started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      await fixture(name, (req, f) => {
        const path = new URL(req.url).pathname;
        if (
          name === "account-resolve" &&
          path.endsWith("/account_migration_aliases")
        ) {
          return Response.json(null);
        }
        check(
          path ===
            (name === "transactions-api"
              ? "/auth/v1/user"
              : "/rest/v1/account_migration_users"),
          "only initial transport is faulted",
        );
        const error = new Error(f.token + " " + f.key);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            release = () => {
              controller.error(error);
            };
            if (mode === "body_error") release();
          },
        });
        started();
        return new Response(stream, {
          headers: { "content-type": "application/json" },
        });
      }, async (f) => {
        let settled = false;
        const call = f.handler(request(f, name)).finally(() => {
          settled = true;
        });
        try {
          await readyWithin(ready);
          if (mode === "late_body_error") {
            await new Promise((resolve) => setTimeout(resolve, 20));
            check(
              !settled && f.calls.length === 1,
              "held body is not falsely settled or retried",
            );
            release!();
          }
          const response = await call, body = await response.text();
          check(
            response.status === (name === "transactions-api" ? 401 : 200) &&
              body ===
                (name === "transactions-api"
                  ? '{"error":"unauthorized"}'
                  : '{"eligible":false}'),
            "initial body failure retains endpoint denial semantics",
          );
          check(
            f.calls.length === (name === "transactions-api" ? 1 : 2),
            "body rejection never repeats the failed request",
          );
          assertPrivacy(f, body);
        } finally {
          release?.();
          await call;
        }
      });
    });
  }
}

for (const name of ["transactions-api", "account-resolve"] as const) {
  Deno.test(`initial ${name} waits for complete body and preserves SDK request signature`, async () => {
    let release: (() => void) | undefined, started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    await fixture(name, (req, f) => {
      const url = new URL(req.url);
      check(
        req.method ===
          (url.pathname.endsWith("/account_session_check_internal")
            ? "POST"
            : "GET"),
        "existing SDK HTTP method retained",
      );
      check(
        req.headers.get("apikey") === f.key &&
          req.headers.get("authorization") ===
            "Bearer " + (name === "transactions-api" &&
                  url.pathname === "/auth/v1/user"
                ? f.token
                : f.key),
        "exact initial SDK credential signature retained",
      );
      check(
        !req.headers.has("x-qa-actor-user") &&
          !req.headers.has("x-qa-actor-sid"),
        "no actor authority before native verification",
      );
      if (url.pathname.endsWith("/account_session_check_internal")) {
        return Response.json(false);
      }
      check(
        url.pathname ===
          (name === "transactions-api"
            ? "/auth/v1/user"
            : "/rest/v1/account_migration_users"),
        "only original initial SDK route reached",
      );
      const body = name === "transactions-api"
        ? { id: uid, email: "fixture@example.invalid" }
        : {
          migrated_user_id: uid,
          internal_email: "fixture@example.invalid",
          login_username: "fixture",
          preferred_login: "Fixture",
          display_name: "اختبار",
          role_code: "employee",
          must_change_password: true,
        };
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 5));
          let released = false;
          release = () => {
            if (released) return;
            released = true;
            controller.enqueue(bytes.subarray(5));
            controller.close();
          };
        },
      });
      started();
      return new Response(stream, {
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
          "x-supabase-api-version": "2024-01-01",
        },
      });
    }, async (f) => {
      let settled = false;
      const call = f.handler(request(f, name)).finally(() => {
        settled = true;
      });
      try {
        await readyWithin(ready);
        await new Promise((resolve) => setTimeout(resolve, 20));
        check(
          !settled && f.calls.length === 1,
          "body admission remains physically pending until release",
        );
        release!();
        const response = await call, body = await response.text();
        check(
          response.status === (name === "transactions-api" ? 401 : 200),
          "post-body original status retained",
        );
        if (name === "transactions-api") {
          check(
            body === '{"error":"unauthorized"}' && f.calls.length === 2,
            "replayed Auth body reaches native session denial, not new authority",
          );
          check(
            await f.calls[1].text() ===
              JSON.stringify({
                p_user: uid,
                p_session: sid,
                p_allow_forced: false,
              }),
            "native session RPC ABI retained",
          );
        } else {
          check(
            body ===
              JSON.stringify({
                eligible: true,
                migrated: true,
                internal_email: "fixture@example.invalid",
                login_username: "fixture",
                preferred_login: "Fixture",
                display_name: "اختبار",
                role: "employee",
                must_change_password: true,
              }),
            "replayed UTF-8 lookup body preserves resolve public contract",
          );
        }
        check(
          response.headers.get("access-control-allow-origin") ===
              "https://ceo-msajed.pages.dev" &&
            response.headers.get("cache-control") === "no-store",
          "endpoint HTTP headers retained",
        );
        assertPrivacy(f, body);
      } finally {
        release?.();
        await call;
      }
    });
  });
}

for (const status of [400, 401, 403, 422, 500]) {
  Deno.test(`initial transactions HTTP ${status} retains auth denial without transport retry`, async () => {
    await fixture("transactions-api", (req, f) => {
      check(
        new URL(req.url).pathname === "/auth/v1/user",
        "HTTP error cannot reach SQL",
      );
      return Response.json({
        code: "invalid_credentials",
        message: f.token + " " + f.key,
      }, {
        status,
        headers: { "x-supabase-api-version": "2024-01-01" },
      });
    }, async (f) => {
      const response = await f.handler(request(f)),
        body = await response.text();
      check(
        response.status === 401 && body === '{"error":"unauthorized"}',
        "ordinary HTTP Auth denial retained",
      );
      check(f.calls.length === 1, "ordinary HTTP failure not retried");
      assertPrivacy(f, body);
    });
  });
}

for (const ready of [true, false]) {
  Deno.test(`initial transactions success preserves verified actor binding and native ready=${ready}`, async () => {
    let verified = false;
    await fixture("transactions-api", async (req, f) => {
      const url = new URL(req.url), name = url.pathname.split("/").at(-1);
      if (url.pathname === "/auth/v1/user") {
        check(
          req.headers.get("authorization") === "Bearer " + f.token &&
            req.headers.get("apikey") === f.key,
          "getUser bearer and key unchanged",
        );
        return Response.json({ id: uid, email: "fixture@example.invalid" });
      }
      if (name === "account_session_check_internal") {
        check(
          await req.text() ===
            JSON.stringify({
              p_user: uid,
              p_session: sid,
              p_allow_forced: false,
            }),
          "native session check arguments retained",
        );
        verified = ready;
        return Response.json(ready);
      }
      check(
        verified && req.headers.get("x-qa-actor-user") === uid &&
          req.headers.get("x-qa-actor-sid") === sid,
        "subsequent REST authority derives only from verified native UID/SID",
      );
      check(
        req.headers.get("authorization") === "Bearer " + f.key &&
          req.headers.get("apikey") === f.key,
        "actor REST Auth signature retained",
      );
      if (name === "user_context_internal") {
        return Response.json({
          active: true,
          must_change_password: false,
          role: "employee",
          login_name: "fixture",
          full_name: "fixture",
          dept_names: [],
        });
      }
      if (
        [
          "user_roles",
          "role_permissions",
          "account_migration_users",
          "user_permissions",
          "notifications",
        ].includes(name!)
      ) {
        return Response.json([]);
      }
      throw new Error("fixture denied unexpected REST path");
    }, async (f) => {
      const response = await f.handler(request(f)),
        body = await response.text();
      check(
        response.status === (ready ? 200 : 401),
        "native admission outcome retained",
      );
      if (!ready) {
        check(
          f.calls.length === 2 && body === '{"error":"unauthorized"}',
          "denied session cannot reach actor REST",
        );
      } else {check(
          body.includes('"ok":true'),
          "ordinary verified notifications action remains available",
        );}
      assertPrivacy(f, body);
    });
  });
}

for (const migrated of [true, false]) {
  Deno.test(`initial account resolve keeps alias lookup and migrated=${migrated} public contract`, async () => {
    let lookups = 0;
    await fixture("account-resolve", (req, f) => {
      const url = new URL(req.url), name = url.pathname.split("/").at(-1);
      check(
        req.method === "GET" &&
          req.headers.get("authorization") === "Bearer " + f.key &&
          req.headers.get("apikey") === f.key,
        "resolve request signature retained",
      );
      if (name === "account_migration_aliases") {
        check(
          url.searchParams.get("alias") === "eq.Alias",
          "existing alias normalization retained",
        );
        return Response.json({ canonical_key: "fixture", active: true });
      }
      check(
        name === "account_migration_users",
        "resolve never reaches an additional route",
      );
      if (++lookups === 1) {
        check(
          url.searchParams.get("login_username") === "eq.alias",
          "initial username normalization retained",
        );
        return Response.json(null);
      }
      check(
        url.searchParams.get("canonical_key") === "eq.fixture",
        "existing alias canonical lookup retained",
      );
      return Response.json({
        migrated_user_id: migrated ? uid : null,
        internal_email: "fixture@example.invalid",
        login_username: "fixture",
        preferred_login: "Fixture",
        display_name: "اختبار",
        role_code: "employee",
        must_change_password: false,
      });
    }, async (f) => {
      const response = await f.handler(
          request(f, "account-resolve", { login: " Alias " }),
        ),
        body = await response.text();
      check(
        response.status === 200 && f.calls.length === 3,
        "resolve retains exact alias flow without retry",
      );
      check(
        body ===
          JSON.stringify({
            eligible: true,
            migrated,
            internal_email: migrated ? "fixture@example.invalid" : null,
            login_username: "fixture",
            preferred_login: "Fixture",
            display_name: "اختبار",
            role: "employee",
            must_change_password: false,
          }),
        "resolve public protocol retained",
      );
      assertPrivacy(f, body);
    });
  });
}
