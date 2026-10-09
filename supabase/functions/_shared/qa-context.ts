import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// SDK clients own this boundary; caller deadlines never detach physical body I/O.
// In particular Auth admin.signOut(noResolveJson) otherwise settles on headers.
export function credentialFetch(): typeof fetch {
  const transport = globalThis.fetch.bind(globalThis);
  return async (input, init) => {
    try {
      const response = await transport(input, init);
      const body = await response.arrayBuffer();
      const settled = new Response(response.body === null ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      Object.defineProperties(settled, {
        url: { value: response.url },
        redirected: { value: response.redirected },
        type: { value: response.type },
      });
      return settled;
    } catch {
      // Never inspect an external exception, including body-read rejections. The
      // pinned Auth SDK logs fetch exceptions before application sanitization.
      throw new Error("Credential transport failed");
    }
  };
}

export type IOStage = "sql" | "auth" | "provider" | "cleanup" | "body";
export interface DeadlineOptions {
  stageMs?: number;
  sqlMs?: number;
  authMs?: number;
  providerMs?: number;
  cleanupMs?: number;
  bodyMs?: number;
}
export interface IOReceipt {
  stage: IOStage;
  state: "started" | "completed" | "failed" | "timed_out";
  actual: "pending" | "fulfilled" | "rejected";
}
export class TransportDeadline extends Error {
  constructor() {
    super("credential_transport_unresolved");
  }
}
// A caller deadline is NOT cancellation. Keep the actual promise and its receipt
// until the transport settles; no external error, input or credential is retained
// in diagnostics. Custody jobs keep private continuations alive after a response.
const custodyJobs = new Set<Promise<unknown>>();
export function retainCustody(job: Promise<unknown>) {
  custodyJobs.add(job);
  const settlement = job.then(() => {
    custodyJobs.delete(job);
  }, () => {
    custodyJobs.delete(job);
  });
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  // Keep the PHYSICAL continuation alive after responding in Supabase Edge. The
  // runtime's hard lifetime is not cancellation or proof of a provider outcome.
  runtime?.waitUntil(settlement);
}
export class BoundedIO {
  private receipts: IOReceipt[] = [];
  private pending = new Set<Promise<unknown>>();
  private limits: Record<IOStage, number>;
  quarantined = false;
  constructor(options: DeadlineOptions = {}) {
    const finite = (value: number | undefined, fallback: number) => {
      const n = value ?? options.stageMs ?? fallback;
      if (!Number.isFinite(n) || n < 1 || n > 60000) {
        throw new Error("Invalid transport deadline");
      }
      return n;
    };
    this.limits = {
      sql: finite(options.sqlMs, 5000),
      auth: finite(options.authMs, 5000),
      provider: finite(options.providerMs, 8000),
      cleanup: finite(options.cleanupMs, 5000),
      body: finite(options.bodyMs, 5000),
    };
  }
  assertOpen() {
    if (this.quarantined) throw new TransportDeadline();
  }
  snapshot() {
    return {
      unsettled: this.pending.size,
      quarantined: this.quarantined ? 1 : 0,
      stages: this.receipts.map((r) => ({ ...r })),
    };
  }
  drain() {
    return Promise.allSettled([...this.pending]).then(() => {});
  }
  start<T>(
    stage: IOStage,
    work: () => PromiseLike<T> | T,
  ): { bounded: Promise<T>; actual: Promise<T> } {
    const receipt: IOReceipt = { stage, state: "started", actual: "pending" };
    this.receipts.push(receipt);
    const actual = Promise.resolve().then(work);
    this.pending.add(actual);
    const bounded = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        receipt.state = "timed_out";
        this.quarantined = true;
        reject(new TransportDeadline());
      }, this.limits[stage]);
      void actual.then((value) => {
        clearTimeout(timer);
        receipt.actual = "fulfilled";
        this.pending.delete(actual);
        if (receipt.state === "started") {
          const error = value && typeof value === "object"
            ? Object.getOwnPropertyDescriptor(value, "error")
            : undefined;
          receipt.state = error && "value" in error && error.value
            ? "failed"
            : "completed";
          resolve(value);
        }
      }, () => {
        clearTimeout(timer);
        receipt.actual = "rejected";
        this.pending.delete(actual);
        if (receipt.state === "started") {
          receipt.state = "failed";
          reject(new Error("Credential transport failed"));
        }
      });
    });
    // Late settlement is consumed even when only the physical path is awaited.
    void bounded.catch(() => {});
    return { bounded, actual };
  }
  run<T>(stage: IOStage, work: () => PromiseLike<T> | T) {
    return this.start(stage, work).bounded;
  }
}

export interface WriteOutcome {
  table: string;
  method: string;
  outcome: "acknowledged" | "rejected" | "unknown";
}
export class StatementFailure extends Error {
  constructor() {
    super("statement_failed");
  }
}
export function checkedStatements<T extends { from: (table: string) => any }>(
  client: T,
  outcomes: WriteOutcome[],
): T {
  const wrap = (builder: any, table: string, method: string | null): any =>
    new Proxy(builder, {
      get(target, key) {
        if (key === "then") {
          return (resolve: any, reject: any) =>
            Promise.resolve(target).then((result: any) => {
              if (method) {
                outcomes.push({
                  table,
                  method,
                  outcome: result.error
                    ? (result.status >= 400 && result.status < 500
                      ? "rejected"
                      : "unknown")
                    : "acknowledged",
                });
                if (result.error) throw new StatementFailure();
              }
              if (result.error) throw new StatementFailure();
              return result;
            }, () => {
              if (method) outcomes.push({ table, method, outcome: "unknown" });
              throw new StatementFailure();
            }).then(resolve, reject);
        }
        const value = Reflect.get(target, key, target);
        if (typeof value !== "function") return value;
        return (...args: any[]) => {
          const next = value.apply(target, args);
          return next && typeof next.then === "function"
            ? wrap(
              next,
              table,
              ["insert", "update", "upsert", "delete"].includes(String(key))
                ? String(key)
                : method,
            )
            : next;
        };
      },
    });
  return new Proxy(client, {
    get(target, key) {
      if (key === "from") {
        return (table: string) => wrap(target.from(table), table, null);
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface VerifiedActor {
  id: string;
  session_id: string;
  email: string;
}
export function nativeClaims(
  token: string,
  user: { id: string; email?: string },
  url: string,
): VerifiedActor | null {
  try {
    const c = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          (x) => x.charCodeAt(0),
        ),
      ),
    );
    if (
      !UUID.test(user.id) || c.sub !== user.id || c.iss !== url + "/auth/v1" ||
      c.role !== "authenticated" || typeof c.session_id !== "string" ||
      !UUID.test(c.session_id) || !user.email
    ) return null;
    return { id: user.id, session_id: c.session_id, email: user.email };
  } catch {
    return null;
  }
}
// Call only after native getUser and the native session check. Never copy request headers.
export interface CandidateProof {
  operation_id: string;
  generation: number;
  candidate_handle: string;
  target_user_id: string;
  target_email: string;
  project_ref: string;
  session_id: string;
  issuer: string;
  claim_role: "authenticated";
  observed_at: string;
}
export function actorClient(
  url: string,
  key: string,
  actor: VerifiedActor,
  transport?: { handle: string; proof?: CandidateProof },
) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: credentialFetch(),
      headers: {
        "x-qa-actor-user": actor.id,
        "x-qa-actor-sid": actor.session_id,
        ...(transport
          ? {
            "x-qa-candidate-handle": transport.handle,
            ...(transport.proof
              ? { "x-qa-candidate-proof": JSON.stringify(transport.proof) }
              : {}),
          }
          : {}),
      },
    },
  });
}
