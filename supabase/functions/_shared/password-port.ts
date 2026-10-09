import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  actorClient,
  BoundedIO,
  type CandidateProof,
  type DeadlineOptions,
  credentialFetch,
  nativeClaims,
  retainCustody,
  TransportDeadline,
  type VerifiedActor,
} from "./qa-context.ts";
import {
  type Account,
  type Caller,
  type Operation,
  type PasswordPort,
  UUID,
} from "./password-command.ts";
const diagnostics = new WeakMap<
  PasswordPort,
  () => ReturnType<BoundedIO["snapshot"]> & { sensitive_custody: boolean }
>();
// Test inspection only: no client/HTTP/PasswordPort ABI change, no credential data.
export function passwordTransportState(port: PasswordPort) {
  const inspect = diagnostics.get(port);
  if (!inspect) throw new Error("Unknown credential port");
  return inspect();
}
interface OwnedSession {
  expected: string;
  email: string;
  token?: string;
  actor?: VerifiedActor;
  operation?: Operation;
  offered?: boolean;
  cleanup?: { bounded: Promise<void>; actual: Promise<void> };
}
export function passwordPort(
  kind: "change" | "reset" = "change",
  options: DeadlineOptions = {},
): PasswordPort {
  const url = Deno.env.get("SUPABASE_URL"),
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (url !== "https://movzojtnkkmdsjhmlgtq.supabase.co" || !service) {
    throw new Error("Invalid credential service configuration");
  }
  const io = new BoundedIO(options);
  let admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: credentialFetch() },
  });
  let candidateHandle: string | undefined = crypto.randomUUID(),
    actor: VerifiedActor | undefined,
    proof: CandidateProof | undefined;
  let verification: OwnedSession | undefined,
    heldOperation: Operation | undefined,
    candidateCustody: string | undefined;
  let finishAcknowledged = false,
    dispatchAttempted = false,
    writeAttempted = false,
    legacyOrdinaryAdmission = false,
    closed = false;
  let disposal: { bounded: Promise<void>; actual: Promise<void> } | undefined,
    unknownJob: { bounded: Promise<void>; actual: Promise<void> } | undefined;
  const sessions: OwnedSession[] = [],
    authorizedTargets = new Map<string, string>();
  const open = () => {
    io.assertOpen();
    if (closed) throw new TransportDeadline();
  };
  const boundClient = () => {
    if (!actor || !candidateHandle) {
      throw new Error("Credential authorization failed");
    }
    return actorClient(url, service, actor, {
      handle: candidateHandle,
      ...(proof ? { proof } : {}),
    });
  };
  const accept = (op: Operation): Operation => {
    if (
      op.qa_control_version !== undefined &&
      (op.qa_control_version !== 1 || op.candidate_handle !== candidateHandle)
    ) throw new Error("Credential ownership unresolved");
    return op;
  };
  const login = () =>
    createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || service, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: credentialFetch() },
    });
  async function rpc(name: string, args: Record<string, unknown>) {
    const r = await io.run("sql", () => admin.rpc(name, args));
    if (r.error) throw new Error("Credential authorization failed");
    return r.data;
  }
  async function account(
    column: string,
    value: string,
  ): Promise<Account | null> {
    open();
    const r = await io.run(
      "sql",
      () =>
        admin.from("account_migration_users").select(
          "canonical_key,login_username,preferred_login,display_name,role_code,internal_email,migrated_user_id",
        ).eq(column, value).eq("eligible", true).maybeSingle(),
    );
    if (r.error) throw new Error("Account lookup failed");
    if (
      r.data && UUID.test(r.data.migrated_user_id) &&
      typeof r.data.internal_email === "string"
    ) authorizedTargets.set(r.data.internal_email, r.data.migrated_user_id);
    return r.data as Account | null;
  }
  async function target(op: Operation) {
    open();
    const r = await io.run(
      "auth",
      () => admin.auth.admin.getUserById(op.target_user_id),
    );
    if (
      r.error || r.data.user?.id !== op.target_user_id || !r.data.user.email ||
      authorizedTargets.get(r.data.user.email) !== op.target_user_id
    ) throw new Error("Credential target unavailable");
    return r.data.user;
  }
  async function identity(s: OwnedSession, physical = false) {
    if (!s.token) throw new Error("Credential verification unavailable");
    const step = io.start("auth", () => admin.auth.getUser(s.token!)),
      r = await (physical ? step.actual : step.bounded);
    const owned = !r.error && r.data.user?.id === s.expected &&
        r.data.user?.email === s.email
      ? nativeClaims(s.token, r.data.user, url!)
      : null;
    if (!owned || (s.actor && s.actor.session_id !== owned.session_id)) {
      throw new Error("Credential ownership unresolved");
    }
    s.actor = owned;
    return owned;
  }
  async function sessionLogin(s: OwnedSession, password: string) {
    candidateCustody = password;
    // Capture on ACTUAL SDK settlement, including late and malformed envelopes.
    // The envelope never authorizes cleanup; fixed-target getUser must prove it.
    const r = await io.run("auth", async () => {
      const r = await login().auth.signInWithPassword({
        email: s.email,
        password,
      });
      s.token = r.data.session?.access_token;
      return r;
    });
    if (s.token) await identity(s);
    if (r.error) {
      if (r.error.code === "invalid_credentials" && !s.token) return null;
      throw new Error("Credential verification unavailable");
    }
    if (
      !s.token || !s.actor || r.data.user?.id !== s.expected ||
      r.data.user?.email !== s.email
    ) throw new Error("Credential verification unavailable");
    return r.data.session!;
  }
  function disposeSession(s: OwnedSession, alreadyDrained = false) {
    if (s.cleanup) return s.cleanup.bounded;
    const drained = alreadyDrained ? Promise.resolve() : io.drain();
    s.cleanup = io.start("cleanup", async () => {
      await drained;
      try {
        if (!s.token) return;
        const owned = await identity(s, true);
        // Acknowledged finish uses the journal-bound tuple; otherwise only exact
        // Auth-proven self disposal, never a business readiness or target override.
        const completed = finishAcknowledged && s === verification &&
          s.operation;
        const client = completed ? admin : actorClient(url!, service!, owned);
        const scope = await io.start(
          "sql",
          () =>
            client.rpc("qa_owned_session_check_internal", {
              p_user: owned.id,
              p_session: owned.session_id,
              ...(completed
                ? {
                  p_operation_id: s.operation!.operation_id,
                  p_generation: s.operation!.generation,
                  p_candidate_handle: candidateHandle,
                }
                : {}),
            }),
        ).actual;
        if (scope.error && ["42883", "PGRST202"].includes(scope.error.code)) {
          // Missing helper is not ordinary proof. Only positive classification plus
          // old native readiness admits compatibility; QA/unresolved deny here.
          const classified = await io.start(
            "sql",
            () =>
              client.rpc("qa_scope_probe_internal", {
                p_target_user: owned.id,
              }),
          ).actual;
          if (
            classified.error || !Array.isArray(classified.data) ||
            classified.data.length !== 1 ||
            classified.data[0].allowed !== true ||
            classified.data[0].actor_class !== "ORDINARY" ||
            classified.data[0].target_class !== "ORDINARY"
          ) throw new Error("Credential cleanup unresolved");
          const legacy = await io.start(
            "sql",
            () =>
              client.rpc("account_session_check_internal", {
                p_user: owned.id,
                p_session: owned.session_id,
                p_allow_forced: true,
              }),
          ).actual;
          if (legacy.error || legacy.data !== true) {
            throw new Error("Credential cleanup unresolved");
          }
        } else if (
          scope.error || !Array.isArray(scope.data) ||
          scope.data.length !== 1 || scope.data[0].allowed !== true
        ) throw new Error("Credential cleanup unresolved");
        // Exactly once; retain token until PHYSICAL signOut settlement.
        const result = await io.start(
          "cleanup",
          () => admin.auth.admin.signOut(s.token!, "local"),
        ).actual;
        if (result.error) throw new Error("Credential cleanup unresolved");
      } finally {
        s.token = undefined;
        s.actor = undefined;
        s.operation = undefined;
      }
    });
    retainCustody(s.cleanup.actual);
    return s.cleanup.bounded;
  }
  function unknown(op: Operation, alreadyDrained = false) {
    if (unknownJob) return unknownJob.bounded;
    const drained = alreadyDrained ? Promise.resolve() : io.drain();
    unknownJob = io.start("sql", async () => {
      await drained;
      const r = await admin.rpc("account_password_unknown_internal", {
        p_operation_id: op.operation_id,
      });
      if (r.error) throw new Error("Credential authorization failed");
    });
    retainCustody(unknownJob.actual);
    return unknownJob.bounded;
  }
  const port: PasswordPort = {
    async caller(token, request): Promise<Caller | null> {
      open();
      const r = await io.run("auth", () => admin.auth.getUser(token));
      if (r.error || !r.data.user) return null;
      actor = nativeClaims(token, r.data.user, url) || undefined;
      if (!actor) return null;
      admin = boundClient();
      const access = await io.run(
        "sql",
        () =>
          admin.rpc("account_session_check_internal", {
            p_user: actor!.id,
            p_session: actor!.session_id,
            p_allow_forced: kind === "change",
          }),
      );
      if (access.error) return null;
      let observation: Operation | undefined;
      if (access.data !== true) {
        if (!request || !UUID.test(request.operation_id)) return null;
        const checked = await io.run(
          "sql",
          () =>
            admin.rpc("account_password_begin_internal", {
              p_actor: actor!.id,
              p_session: actor!.session_id,
              p_target_key: request.target_key ?? null,
              p_kind: request.kind,
              p_operation_id: request.operation_id,
            }),
        );
        const o = checked.data;
        if (
          checked.error || !o || o.operation_id !== request.operation_id ||
          o.write_allowed !== false || !UUID.test(o.target_user_id) ||
          typeof o.canonical_key !== "string" || !o.canonical_key ||
          !Number.isSafeInteger(o.generation) || o.generation < 1 ||
          !["pending", "uncertain", "completed", "failed"].includes(o.status) ||
          (request.kind === "change" && o.target_user_id !== actor.id) ||
          (request.kind === "reset" && o.canonical_key !== request.target_key)
        ) return null;
        try {
          observation = accept(o as Operation);
        } catch {
          return null;
        }
      }
      admin = boundClient();
      return {
        ...actor,
        ...(observation ? { observed_operation: observation } : {}),
      };
    },
    accountByUser: (id) => account("migrated_user_id", id),
    accountByKey: (key) => account("canonical_key", key),
    async begin(caller, target, kind, id) {
      open();
      if (caller.observed_operation) {
        const o = caller.observed_operation;
        if (
          o.operation_id !== id ||
          o.target_user_id !== target.migrated_user_id ||
          o.canonical_key !== target.canonical_key || o.write_allowed !== false
        ) throw new Error("Credential authorization failed");
        return heldOperation = accept(o);
      }
      // Positively classify before an old Core leaf can journal anything. An
      // absent transport helper never turns classified QA into ordinary authority.
      const classified = await io.run(
        "sql",
        () =>
          admin.rpc("qa_scope_probe_internal", {
            p_target_user: target.migrated_user_id,
          }),
      );
      if (
        classified.error || !Array.isArray(classified.data) ||
        classified.data.length !== 1 || classified.data[0].allowed !== true
      ) {
        throw new Error("Credential ownership unresolved");
      }
      legacyOrdinaryAdmission = classified.data[0].actor_class === "ORDINARY" &&
        classified.data[0].target_class === "ORDINARY";
      if (!legacyOrdinaryAdmission) {
        const transport = await io.run(
          "sql",
          () =>
            admin.rpc("qa_owned_session_check_internal", {
              p_user: caller.id,
              p_session: caller.session_id,
            }),
        );
        if (
          transport.error || !Array.isArray(transport.data) ||
          transport.data.length !== 1 || transport.data[0].allowed !== true
        ) {
          throw new Error("Credential ownership unresolved");
        }
      }
      return await io.run("sql", async () => {
        const r = await admin.rpc("account_password_begin_internal", {
          p_actor: caller.id,
          p_session: caller.session_id,
          p_target_key: target.canonical_key,
          p_kind: kind,
          p_operation_id: id,
        });
        if (r.error) throw new Error("Credential authorization failed");
        const o = accept(r.data as Operation);
        if (o.qa_control_version === undefined && !legacyOrdinaryAdmission) {
          throw new Error("Credential ownership unresolved");
        }
        if (
          o.operation_id !== id ||
          o.target_user_id !== target.migrated_user_id ||
          o.canonical_key !== target.canonical_key
        ) throw new Error("Credential ownership unresolved");
        return heldOperation = o;
      });
    },
    async markerMatches(op) {
      const u = await target(op);
      return u.app_metadata?.msajed_password_operation === op.operation_id &&
        String(u.app_metadata?.msajed_password_generation) ===
          String(op.generation);
    },
    async currentOperation(account, id) {
      open();
      const r = await io.run(
        "auth",
        () => admin.auth.admin.getUserById(account.migrated_user_id),
      );
      if (
        r.error || r.data.user?.id !== account.migrated_user_id ||
        r.data.user.email !== account.internal_email
      ) throw new Error("Credential target unavailable");
      return r.data.user.app_metadata?.msajed_password_operation === id;
    },
    async samePassword(email, password) {
      open();
      const expected = authorizedTargets.get(email);
      if (!expected) throw new Error("Credential verification unavailable");
      const s: OwnedSession = { expected, email };
      sessions.push(s);
      try {
        return !!await sessionLogin(s, password);
      } finally {
        await disposeSession(s);
        if (!io.snapshot().unsettled) candidateCustody = undefined;
      }
    },
    async verifyCandidate(op, email, password) {
      open();
      if (
        op.qa_control_version !== 1 ||
        op.candidate_handle !== candidateHandle ||
        authorizedTargets.get(email) !== op.target_user_id || verification
      ) throw new Error("Credential verification unavailable");
      verification = { expected: op.target_user_id, email, operation: op };
      sessions.push(verification);
      if (!await sessionLogin(verification, password)) return false;
      const owned = verification.actor!;
      proof = {
        operation_id: op.operation_id,
        generation: op.generation,
        candidate_handle: candidateHandle!,
        target_user_id: owned.id,
        target_email: owned.email,
        project_ref: "movzojtnkkmdsjhmlgtq",
        session_id: owned.session_id,
        issuer: url + "/auth/v1",
        claim_role: "authenticated",
        observed_at: new Date().toISOString(),
      };
      admin = boundClient();
      return true;
    },
    async dispose() {
      if (disposal) return disposal.bounded;
      closed = true;
      const drained = io.drain();
      disposal = io.start("cleanup", async () => {
        await drained;
        let failure: unknown;
        try {
          if (
            io.quarantined && heldOperation && !finishAcknowledged &&
            !unknownJob
          ) {
            try {
              unknown(heldOperation, true);
              await unknownJob!.actual;
            } catch {
              failure = new Error("Credential journal unresolved");
            }
          }
          for (const s of sessions.filter((s) => !s.offered)) {
            try {
              disposeSession(s, true);
              await s.cleanup!.actual;
            } catch {
              failure = new Error("Credential cleanup unresolved");
            }
          }
          // A final login must not be stranded if failed cleanup blocks its response.
          if (failure) {
            for (const s of sessions.filter((s) => s.offered)) {
              try {
                disposeSession(s, true);
                await s.cleanup!.actual;
              } catch {}
            }
          }
          if (failure) throw failure;
        } finally {
          candidateCustody = undefined;
          verification = undefined;
          proof = undefined;
          heldOperation = undefined;
          candidateHandle = undefined;
          authorizedTargets.clear();
        }
      });
      retainCustody(disposal.actual);
      return disposal.bounded;
    },
    async replace(op, password) {
      open();
      if (op.qa_control_version === undefined && !legacyOrdinaryAdmission) {
        throw new Error("Credential ownership unresolved");
      }
      if (writeAttempted) throw new Error("Credential dispatch unresolved");
      writeAttempted = true;
      candidateCustody = password;
      heldOperation = op;
      if (op.qa_control_version === 1) {
        if (
          dispatchAttempted || !candidateHandle ||
          op.candidate_handle !== candidateHandle
        ) throw new Error("Credential dispatch unresolved");
        dispatchAttempted = true;
        const data = await rpc("qa_password_dispatch_internal", {
          p_operation_id: op.operation_id,
          p_generation: op.generation,
          p_candidate_handle: candidateHandle,
        });
        if (
          !Array.isArray(data) || data.length !== 1 ||
          data[0].operation_id !== op.operation_id ||
          data[0].generation !== op.generation ||
          data[0].dispatch_state !== "admitted_new" ||
          typeof data[0].dispatch_token !== "string" ||
          !UUID.test(data[0].dispatch_token)
        ) throw new Error("Credential dispatch unresolved");
      }
      const u = await target(op);
      const r = await io.run(
        "provider",
        () =>
          admin.auth.admin.updateUserById(op.target_user_id, {
            password,
            app_metadata: {
              ...u.app_metadata,
              msajed_password_operation: op.operation_id,
              msajed_password_generation: op.generation,
            },
          }),
      );
      if (r.error) {
        throw new Error(
          [400, 422].includes(r.error.status || 0)
            ? "provider_" + r.error.status
            : "Credential write unresolved",
        );
      }
    },
    async finish(op) {
      open();
      if (op.qa_control_version === undefined && !legacyOrdinaryAdmission) {
        throw new Error("Credential ownership unresolved");
      }
      await io.run("sql", async () => {
        const r = await admin.rpc("account_password_finish_internal", {
          p_operation_id: op.operation_id,
          p_generation: op.generation,
        });
        if (r.error) throw new Error("Credential authorization failed");
        finishAcknowledged = true;
      });
    },
    uncertain: (op) => unknown(op),
    async failed(op, code) {
      open();
      await rpc("account_password_fail_internal", {
        p_operation_id: op.operation_id,
        p_error_code: code,
      });
    },
    async signIn(email, password) {
      open();
      if (verification) await disposeSession(verification);
      open();
      const expected = authorizedTargets.get(email);
      if (!expected) throw new Error("Credential verification unavailable");
      const s: OwnedSession = { expected, email };
      sessions.push(s);
      const result = await sessionLogin(s, password);
      if (!result) return null;
      s.offered = true;
      return {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      };
    },
  };
  diagnostics.set(
    port,
    () => ({
      ...io.snapshot(),
      sensitive_custody: !!candidateCustody ||
        sessions.some((s) => !!s.token && !s.offered),
    }),
  );
  return port;
}
