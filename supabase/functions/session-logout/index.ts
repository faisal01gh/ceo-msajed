import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  actorClient,
  BoundedIO,
  type DeadlineOptions,
  credentialFetch,
  nativeClaims,
  retainCustody,
} from "../_shared/qa-context.ts";

const AUTH = Deno.env.get("SUPABASE_URL")! + "/auth/v1";
const PUBLIC = Deno.env.get("SUPABASE_ANON_KEY")!;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const ok = origin === "https://faisal01gh.github.io" ||
    origin === "https://ceo-msajed.pages.dev";
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,apikey",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (ok) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(req) });
}

const diagnostics = new WeakMap<Request, BoundedIO>();
const pendingTokens = new Set<string>();
// No second dispatch after an uncertain provider response for this exact native SID.
// This ledger contains only verified UID/SID, never bearer tokens or candidates.
const attemptedSessions = new Set<string>();
export function logoutTransportState(req: Request) {
  return diagnostics.get(req)?.snapshot() ??
    { unsettled: 0, quarantined: 0, stages: [] };
}
export async function logoutRequest(
  req: Request,
  options: DeadlineOptions = {},
) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }
  const io = new BoundedIO(options);
  diagnostics.set(req, io);
  let b: any;
  try {
    b = await io.run("body", () => req.json());
  } catch {
    retainCustody(io.drain());
    return json(req, { error: "logout_unresolved" }, 503);
  }
  let token = typeof b?.token === "string" ? b.token : "";
  if (!token) return json(req, { error: "unauthorized" }, 401);
  if (Object.keys(b).some((k) => k !== "token")) {
    return json(req, { error: "bad_request" }, 400);
  }
  if (AUTH !== "https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1") {
    return json(req, { error: "logout_unavailable" }, 503);
  }
  if (pendingTokens.has(token)) {
    return json(req, { error: "logout_unresolved" }, 503);
  }
  pendingTokens.add(token);
  const job = io.start("cleanup", async () => {
    try {
      const url = Deno.env.get("SUPABASE_URL")!,
        key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: credentialFetch() },
      });
      const auth = await io.start("auth", () => admin.auth.getUser(token))
        .actual;
      if (auth.error || !auth.data.user) {
        return { error: "unauthorized", status: 401 };
      }
      const actor = nativeClaims(token, auth.data.user, url);
      if (!actor) return { error: "unauthorized", status: 401 };
      const access = await io.start(
        "sql",
        () =>
          actorClient(url, key, actor).rpc("qa_owned_session_check_internal", {
            p_user: actor.id,
            p_session: actor.session_id,
          }),
      ).actual;
      if (
        access.error || !Array.isArray(access.data) ||
        access.data.length !== 1 || access.data[0].allowed !== true
      ) return { error: "unauthorized", status: 401 };
      const session = actor.id + ":" + actor.session_id;
      if (attemptedSessions.has(session)) {
        return { error: "logout_unresolved", status: 503 };
      }
      attemptedSessions.add(session);
      // Existing public global-logout contract retained. Verification sessions in
      // password-port use exact local cleanup. Consume the body before settlement.
      await io.start("cleanup", async () => {
        const result = await fetch(AUTH + "/logout?scope=global", {
          method: "POST",
          headers: { apikey: PUBLIC, Authorization: "Bearer " + token },
        });
        await result.arrayBuffer();
        if (!result.ok) throw new Error("Credential cleanup unresolved");
      }).actual;
      return { status: 200 };
    } finally {
      pendingTokens.delete(token);
      token = "";
      b.token = undefined;
    }
  });
  retainCustody(job.actual);
  try {
    const result = await job.bounded;
    return result.status === 200
      ? json(req, { ok: true })
      : json(req, { error: result.error }, result.status);
  } catch {
    return json(req, { error: "logout_unresolved" }, 503);
  }
}
Deno.serve((req: Request) => logoutRequest(req));
