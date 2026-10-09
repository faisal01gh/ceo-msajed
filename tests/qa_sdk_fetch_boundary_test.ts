// Actual pinned SDK; provider requests intercepted before client construction.
// Credential sentinels and captured logging live only in memory.
import {
  passwordPort,
  passwordTransportState,
} from "../supabase/functions/_shared/password-port.ts";
const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co";
const uid = "10000000-0000-4000-8000-000000000001",
  sid = "30000000-0000-4000-8000-000000000001";
const email = "fixture@example.invalid";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
function jwt() {
  return [
    crypto.randomUUID(),
    btoa(
      JSON.stringify({
        sub: uid,
        iss: endpoint + "/auth/v1",
        role: "authenticated",
        session_id: sid,
      }),
    ),
    crypto.randomUUID(),
  ].join(".");
}
async function fixture(
  run: (f: {
    port: ReturnType<typeof passwordPort>;
    setLogout: (fn: () => Response | Promise<Response>) => void;
    count: () => number;
    waits: Promise<unknown>[];
    setFault: (fn: (req: Request) => Response | undefined) => void;
  }) => Promise<void>,
) {
  const oldFetch = globalThis.fetch, runtime = (globalThis as any).EdgeRuntime;
  const token = jwt(), key = crypto.randomUUID();
  let fault = (_req: Request): Response | undefined => undefined;
  let logout = () =>
      new Response(null, { status: 204 }) as Response | Promise<Response>,
    logouts = 0;
  const waits: Promise<unknown>[] = [];
  (globalThis as any).EdgeRuntime = {
    waitUntil(p: Promise<unknown>) {
      waits.push(p);
    },
  };
  Deno.env.set("SUPABASE_URL", endpoint);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init),
      url = new URL(req.url),
      name = url.pathname.split("/").at(-1);
    check(url.origin === endpoint, "remote network forbidden");
    const failed = fault(req);
    if (failed) return failed;
    if (name === "user") return Response.json({ id: uid, email });
    if (name === "account_session_check_internal") return Response.json(true);
    if (name === "account_migration_users") {
      return Response.json({ migrated_user_id: uid, internal_email: email });
    }
    if (name === "qa_scope_probe_internal") {
      return Response.json([{
        allowed: true,
        actor_class: "ORDINARY",
        target_class: "ORDINARY",
      }]);
    }
    if (name === "account_password_begin_internal") {
      return Response.json({
        operation_id: "40000000-0000-4000-8000-000000000001",
        target_user_id: uid,
        canonical_key: "fixture",
        generation: 1,
        status: "pending",
        write_allowed: true,
      });
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      return Response.json({ user: { id: uid, email, app_metadata: {} } });
    }
    if (name === "qa_owned_session_check_internal") {
      return Response.json([{ allowed: true }]);
    }
    if (name === "token") {
      return Response.json({
        access_token: token,
        refresh_token: crypto.randomUUID(),
        token_type: "bearer",
        expires_in: 3600,
        user: { id: uid, email },
      });
    }
    if (name === "logout") {
      check(
        url.searchParams.get("scope") === "local",
        "local logout scope preserved",
      );
      check(
        req.headers.get("authorization") === "Bearer " + token,
        "exact Auth bearer preserved",
      );
      logouts++;
      return await logout();
    }
    throw new Error("unexpected local request");
  };
  const port = passwordPort("change", { stageMs: 80 });
  try {
    check(!!await port.caller(token), "actual SDK caller admitted");
    await port.accountByUser(uid);
    await run({
      port,
      setLogout: (fn) => {
        logout = fn;
      },
      setFault: (fn) => {
        fault = fn;
      },
      count: () => logouts,
      waits,
    });
  } finally {
    await port.dispose!().catch(() => {});
    await Promise.all(waits);
    globalThis.fetch = oldFetch;
    (globalThis as any).EdgeRuntime = runtime;
  }
}
Deno.test("SDK local logout held body remains cleanup actual-pending with custody and no repeat", async () => {
  await fixture(async ({ port, setLogout, count, waits }) => {
    let control!: ReadableStreamDefaultController<Uint8Array>,
      started!: () => void,
      closed = false;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    const release = () => {
      if (!closed) {
        closed = true;
        control.close();
      }
    };
    setLogout(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          control = c;
        },
      });
      started();
      return new Response(stream, { status: 200 });
    });
    let outcome = "pending";
    const call = port.samePassword(email, crypto.randomUUID()).then(() => {
      outcome = "success";
    }, () => {
      outcome = "rejected";
    });
    try {
      await ready;
      await wait(160);
      const state = passwordTransportState(port);
      check(
        outcome === "rejected",
        "held logout body must return unresolved, not success",
      );
      check(
        state.unsettled > 0 && state.quarantined === 1,
        "body stays physically pending after caller deadline",
      );
      check(
        state.sensitive_custody,
        "credential custody retained during body hold",
      );
      check(
        state.stages.some((x) =>
          x.stage === "cleanup" && x.state === "timed_out" &&
          x.actual === "pending"
        ),
        "cleanup receipt not falsely settled",
      );
      check(waits.length > 0, "body continuation registered with waitUntil");
      await port.samePassword(email, crypto.randomUUID()).catch(() => {});
      await port.dispose!().catch(() => {});
      check(count() === 1, "uncertain signOut never repeated");
    } finally {
      release();
      await call;
    }
    await port.dispose!().catch(() => {});
    await Promise.all(waits);
    const state = passwordTransportState(port);
    check(
      state.unsettled === 0 && !state.sensitive_custody,
      "physical body settlement drains custody",
    );
    check(count() === 1, "physical drain never repeats signOut");
  });
});

Deno.test("SDK provider fetch exception is replaced before dependency logging", async () => {
  const secret = crypto.randomUUID() + "9#";
  const oldError = console.error, oldWarn = console.warn;
  const logs: unknown[][] = [];
  console.error = (...args) => {
    logs.push(args);
  };
  console.warn = (...args) => {
    logs.push(args);
  };
  try {
    await fixture(async ({ port, setFault }) => {
      const op = await port.begin(
        { id: uid, session_id: sid, email },
        {
          migrated_user_id: uid,
          internal_email: email,
          canonical_key: "fixture",
          login_username: "fixture",
          preferred_login: "fixture",
          display_name: "fixture",
          role_code: "employee",
        },
        "change",
        "40000000-0000-4000-8000-000000000001",
      );
      setFault((req) => {
        if (req.method === "PUT") throw new Error(secret);
        return undefined;
      });
      let failed = false;
      await port.replace(op, secret).catch(() => {
        failed = true;
      });
      check(failed, "provider exception must fail safely");
      const text = logs.map((args) =>
        args.map((arg) =>
          arg instanceof Error ? arg.message + arg.stack : String(arg)
        ).join(" ")
      ).join(" ");
      check(
        !text.includes(secret),
        "provider exception cannot leak credential into SDK logs",
      );
    });
  } finally {
    console.error = oldError;
    console.warn = oldWarn;
  }
});

const logText = (logs: unknown[][]) =>
  logs.map((args) =>
    args.map((arg) =>
      arg instanceof Error ? arg.message + arg.stack : String(arg)
    ).join(" ")
  ).join(" ");
for (
  const mode of [
    "login_fetch",
    "login_body",
    "provider_body",
    "actor_sql_fetch",
    "actor_sql_body",
    "actor_auth_fetch",
    "actor_auth_body",
    "logout_body",
  ] as const
) {
  Deno.test(
    "SDK per-client privacy boundary " + mode + " preserves safe failure",
    async () => {
      const secret = crypto.randomUUID() + "9#";
      const logs: unknown[][] = [];
      const oldError = console.error, oldWarn = console.warn;
      console.error = (...args) => {
        logs.push(args);
      };
      console.warn = (...args) => {
        logs.push(args);
      };
      let hits = 0;
      const sentinels: string[] = [secret];
      try {
        await fixture(async ({ port, setFault }) => {
          const op = await port.begin(
            { id: uid, session_id: sid, email },
            {
              migrated_user_id: uid,
              internal_email: email,
              canonical_key: "fixture",
              login_username: "fixture",
              preferred_login: "fixture",
              display_name: "fixture",
              role_code: "employee",
            },
            "change",
            "40000000-0000-4000-8000-000000000001",
          );
          setFault((req) => {
            const path = new URL(req.url).pathname;
            const hit = mode.startsWith("login")
              ? path.endsWith("/token")
              : mode.startsWith("provider")
              ? req.method === "PUT"
              : mode.startsWith("actor_sql")
              ? path.endsWith("/account_migration_users")
              : mode.startsWith("actor_auth")
              ? path.endsWith("/user")
              : path.endsWith("/logout");
            if (!hit) return undefined;
            hits++;
            sentinels.push(
              req.headers.get("authorization")!,
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            );
            const error = new Error(sentinels.join(" "));
            if (mode.endsWith("fetch")) throw error;
            return new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  c.error(error);
                },
              }),
              { status: 200 },
            );
          });
          let rejected = false;
          const result = mode.startsWith("provider")
            ? port.replace(op, secret)
            : mode.startsWith("actor_sql")
            ? port.accountByUser(uid)
            : mode.startsWith("actor_auth")
            ? port.caller(jwt())
            : port.samePassword(email, secret);
          const value = await result.catch(() => {
            rejected = true;
          });
          check(
            rejected || value === null,
            "external fetch/body error cannot yield success",
          );
          check(hits === 1, "external failure not retried");
          if (mode === "logout_body") {
            const state = passwordTransportState(port);
            check(
              state.stages.some((x) =>
                x.stage === "cleanup" && x.state === "failed"
              ),
              "rejected logout body marks cleanup failure",
            );
            check(state.unsettled === 0, "rejected body physically settled");
          }
          check(
            sentinels.every((s) => !logText(logs).includes(s)),
            "SDK logs contain no runtime candidate, bearer or key",
          );
        });
      } finally {
        console.error = oldError;
        console.warn = oldWarn;
      }
    },
  );
}

for (const body of [false, true]) {
  Deno.test(
    "SDK exception boundary never reads external thrown fields " +
      (body ? "body" : "fetch"),
    async () => {
      const oldError = console.error;
      const logs: unknown[][] = [];
      console.error = (...args) => {
        logs.push(args);
      };
      let fieldsRead = 0;
      const hostile = new Proxy({}, {
        get() {
          fieldsRead++;
          throw new Error("external field access forbidden");
        },
      });
      try {
        await fixture(async ({ port, setFault }) => {
          setFault((req) => {
            if (!new URL(req.url).pathname.endsWith("/token")) return undefined;
            if (!body) throw hostile;
            return new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  c.error(hostile);
                },
              }),
              { status: 200 },
            );
          });
          let rejected = false;
          await port.samePassword(email, crypto.randomUUID()).catch(() => {
            rejected = true;
          });
          check(
            rejected && fieldsRead === 0,
            "external exception properties never inspected",
          );
          check(
            logs.length > 0 &&
              logText(logs).includes("Credential transport failed"),
            "dependency logging receives only fixed safe error",
          );
        });
      } finally {
        console.error = oldError;
      }
    },
  );
}

for (const publicLogout of [false, true]) {
  Deno.test(
    "initial " + (publicLogout ? "public logout" : "password admin") +
      " SDK client sanitizes fetch/body exceptions",
    async () => {
      const oldFetch = globalThis.fetch,
        oldServe = Deno.serve,
        oldError = console.error;
      const logs: unknown[][] = [];
      const key = crypto.randomUUID(), bearer = jwt();
      Deno.env.set("SUPABASE_URL", endpoint);
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);
      Deno.env.set("SUPABASE_ANON_KEY", crypto.randomUUID());
      Object.defineProperty(Deno, "serve", {
        configurable: true,
        value: () => ({}),
      });
      console.error = (...args) => {
        logs.push(args);
      };
      let requests = 0;
      try {
        for (const body of [false, true]) {
          globalThis.fetch = async () => {
            requests++;
            const error = new Error(key + bearer);
            if (!body) throw error;
            return new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  c.error(error);
                },
              }),
              { status: 200 },
            );
          };
          if (publicLogout) {
            const mod = await import(
              "../supabase/functions/session-logout/index.ts?privacy-boundary"
            );
            const req = new Request("https://fixture.invalid", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token: bearer }),
            });
            const response = await mod.logoutRequest(req, { stageMs: 100 });
            check(
              response.status !== 200,
              "initial Auth exception cannot authorize logout",
            );
            const text = await response.text();
            check(
              !text.includes(key) && !text.includes(bearer),
              "HTTP result is sanitized",
            );
          } else {
            const port = passwordPort("change", { stageMs: 100 });
            check(
              await port.caller(bearer) === null,
              "initial admin exception denies caller",
            );
            await port.dispose!();
          }
        }
        check(requests === 2, "initial clients no retries or provider bypass");
        check(
          !logText(logs).includes(key) && !logText(logs).includes(bearer),
          "initial clients protect key and bearer before SDK logging",
        );
      } finally {
        globalThis.fetch = oldFetch;
        console.error = oldError;
        Object.defineProperty(Deno, "serve", {
          configurable: true,
          value: oldServe,
        });
      }
    },
  );
}

Deno.test("credential fetch preserves normal HTTP statuses, response bytes, headers and request Auth", async () => {
  const { credentialFetch } = await import(
    "../supabase/functions/_shared/qa-context.ts"
  );
  const oldFetch = globalThis.fetch;
  const bearer = jwt(), key = crypto.randomUUID();
  try {
    for (const status of [200, 204, 400, 401, 422, 500]) {
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          code: "invalid_credentials",
          message: "fixture response",
        }),
      );
      globalThis.fetch = async (input, init) => {
        const req = new Request(input, init);
        check(
          req.headers.get("authorization") === "Bearer " + bearer &&
            req.headers.get("apikey") === key,
          "request credential headers unchanged",
        );
        const response = new Response(status === 204 ? null : bytes, {
          status,
          statusText: "fixture status",
          headers: {
            "x-supabase-api-version": "2024-01-01",
            "content-type": "application/json",
            "x-fixture": "retained",
          },
        });
        Object.defineProperties(response, {
          url: { value: endpoint + "/auth/v1/token" },
          redirected: { value: true },
        });
        return response;
      };
      const response = await credentialFetch()(endpoint + "/auth/v1/token", {
        headers: { Authorization: "Bearer " + bearer, apikey: key },
      });
      check(
        response instanceof Response && response.status === status &&
          response.statusText === "fixture status",
        "HTTP status and Response protocol preserved",
      );
      check(
        response.url === endpoint + "/auth/v1/token" && response.redirected,
        "response metadata preserved",
      );
      check(
        response.headers.get("x-supabase-api-version") === "2024-01-01" &&
          response.headers.get("x-fixture") === "retained",
        "Auth response headers preserved",
      );
      check(
        await response.text() ===
          (status === 204 ? "" : new TextDecoder().decode(bytes)),
        "body bytes preserved after physical consumption",
      );
    }
  } finally {
    globalThis.fetch = oldFetch;
  }
});
