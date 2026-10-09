const endpoint = "https://movzojtnkkmdsjhmlgtq.supabase.co",
  uid = "10000000-0000-4000-8000-000000000071",
  sid = "30000000-0000-4000-8000-000000000071";
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
for (const stage of ["auth", "sql", "cleanup"] as const) {
  Deno.test(
    "public logout " + stage +
      " finite caller with exact late settlement and no duplicate",
    async () => {
      const old = globalThis.fetch, serve = Deno.serve;
      let handler!: any, release!: () => void, started!: () => void;
      let count = 0, settled = false, holding = true;
      const start = new Promise<void>((r) => started = r),
        held = new Promise<void>((r) => release = r);
      Deno.env.set("SUPABASE_URL", endpoint);
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-not-a-key");
      Deno.env.set("SUPABASE_ANON_KEY", "offline-public-fixture");
      globalThis.fetch = async (input, init) => {
        const r = new Request(input, init),
          u = new URL(r.url),
          name = u.pathname.split("/").at(-1)!;
        if (u.origin !== endpoint) throw Error("network forbidden");
        if (
          holding &&
          ((stage === "auth" && name === "user") ||
            (stage === "sql" && name === "qa_owned_session_check_internal") ||
            (stage === "cleanup" && name === "logout"))
        ) {
          started();
          await held;
        }
        if (name === "user") {
          return Response.json({ id: uid, email: "fixture@example.invalid" });
        }
        if (name === "qa_owned_session_check_internal") {
          return Response.json([{ allowed: true, reason: "owned_session" }]);
        }
        if (name === "logout") {
          count++;
          return new Response(null, { status: 204 });
        }
        throw Error("unexpected boundary");
      };
      Object.defineProperty(Deno, "serve", {
        value: (fn: any) => {
          handler = fn;
          return {};
        },
        configurable: true,
      });
      const req = () =>
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
      try {
        const module = await import(
          "../supabase/functions/session-logout/index.ts?deadline=" + stage
        ) as any;
        const invoke = module.logoutRequest ?? handler, r = req();
        let status = 0;
        const call = invoke(r, { stageMs: 20 }).then((x: Response) => {
          settled = true;
          status = x.status;
        });
        await start;
        await new Promise((r) => setTimeout(r, 100));
        if (!settled) {
          release();
          await call;
          throw Error("public " + stage + " caller remained pending");
        }
        if (status !== 503) throw Error("deadline cannot claim logout success");
        const state = module.logoutTransportState(r);
        if (state.unsettled < 1 || state.quarantined !== 1) {
          throw Error("physical I/O not tracked separately");
        }
        if ((await invoke(req(), { stageMs: 20 })).status !== 503) {
          throw Error("uncertain duplicate accepted");
        }
        holding = false;
        release();
        await call;
        await new Promise((r) => setTimeout(r, 60));
        if (
          count !== 1 || module.logoutTransportState(r).unsettled !== 0
        ) throw Error("late logout must settle exactly once");
      } finally {
        release();
        globalThis.fetch = old;
        Object.defineProperty(Deno, "serve", {
          value: serve,
          configurable: true,
        });
      }
    },
  );
}
