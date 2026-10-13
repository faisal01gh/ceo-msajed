import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Preparation only at the CLI. Future native execution is an explicit API call
// after fresh Faisal authorization and independent owned-source/session/profile
// verification. The verifier is a trusted integration boundary, not JWT decoding
// or caller-supplied role claims. This file never logs credentials or responses.
// No login, refresh, provisioning, writes, retries, polling or alternate targets.
const TARGET = 'https://movzojtnkkmdsjhmlgtq.supabase.co';
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Capture at initialization, before any caller/verifier can swap the binding.
// Provenance and trusted human-approval custody still need a future integration gate.
const nativeFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
const usedApprovals = new Set();
const ownedErrors = new WeakMap();
// A wrapper deadline cannot make physical IO disappear. Retain original promises
// until their settlement, and prevent a subsequent run from overlapping unknown IO.
const pendingTransports = new Set();
const pendingVerifications = new Set();
const hash = text => createHash('sha256').update(text).digest('hex');
function fail(code) {
  const error = Object.assign(new Error(code), { code });
  ownedErrors.set(error, code);
  throw error;
}
function safeFailure(error, fallback) { fail(ownedErrors.get(error) ?? fallback); }
function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function fresh(at, now, age) { return Number.isFinite(at) && at <= now && now - at <= age; }

// Descriptor reads reject accessors without invoking them. Never clone arbitrary
// provider/caller objects or coerce objects into strings/numbers for validation.
function record(value, fields, code, required = true) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || !Object.hasOwn(fields, key))) fail(code);
    const copy = Object.create(null);
    for (const [key, type] of Object.entries(fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) { if (required) fail(code); else continue; }
      if (!Object.hasOwn(descriptor, 'value') || (type !== 'any' && typeof descriptor.value !== type)) fail(code);
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch { fail(code); }
}
function arraySnapshot(value, maximum, code) {
  try {
    if (!Array.isArray(value)) fail(code);
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!integer(length, 0, maximum)) fail(code);
    if (Reflect.ownKeys(value).length !== length + 1) fail(code);
    return Array.from({ length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(code);
      return descriptor.value;
    });
  } catch { fail(code); }
}
const planFields = { target: 'string', users: 'number', requestsPerUser: 'number', concurrency: 'number',
  pageSize: 'number', requestTimeoutMs: 'number', maxBodyBytes: 'number' };
const approvalFields = { action: 'string', approvedBy: 'string', target: 'string', planSha256: 'string',
  sourceSha256: 'string', nonce: 'string', issuedAt: 'number', expiresAt: 'number' };
const proofFields = { kind: 'string', target: 'string', uid: 'string', sid: 'string', tokenSha256: 'string',
  sessionUid: 'string', sessionId: 'string', profileUid: 'string', sessionActive: 'boolean',
  profileActive: 'boolean', mustChangePassword: 'boolean', authVerified: 'boolean', authIssuer: 'string',
  authRole: 'string', authExpiresAt: 'number', verifiedAt: 'number', sourceTarget: 'string',
  sourceSha256: 'string', sourceVerifiedAt: 'number', readOnlyListRpcVerified: 'boolean',
  contextAndAuthorizationUnchanged: 'boolean' };

export function prepareLoad(options = {}) {
  const config = { target: TARGET, users: 50, requestsPerUser: 50, concurrency: 50,
    pageSize: 50, requestTimeoutMs: 10000, maxBodyBytes: 1048576,
    ...record(options, planFields, 'INVALID_PLAN_OPTION', false) };
  if (config.target !== TARGET) fail('TARGET_NOT_ALLOWED');
  for (const [key, maximum] of Object.entries({ users: 50, requestsPerUser: 50,
    concurrency: config.users, pageSize: 100, requestTimeoutMs: 30000, maxBodyBytes: 1048576 })) {
    if (!integer(config[key], 1, maximum)) fail('PLAN_BUDGET_EXCEEDED');
  }
  const plan = { mode: 'PREPARE_ONLY', networkAllowed: false, ...config,
    totalRequests: config.users * config.requestsPerUser,
    request: Object.freeze({ url: TARGET + '/rest/v1/rpc/list_my_transactions', method: 'POST',
      body: JSON.stringify({ p_tab: 'all', p_page: 1, p_page_size: config.pageSize }) }) };
  return Object.freeze({ ...plan, planSha256: hash(JSON.stringify(plan)) });
}

function checkedPlan(plan) {
  try {
    const copy = record(plan, { mode: 'string', networkAllowed: 'boolean', ...planFields,
      totalRequests: 'number', request: 'any', planSha256: 'string' }, 'PLAN_TAMPERED');
    const request = record(copy.request, { url: 'string', method: 'string', body: 'string' }, 'PLAN_TAMPERED');
    const options = Object.fromEntries(Object.keys(planFields).map(key => [key, copy[key]]));
    const expected = prepareLoad(options);
    if (Object.keys(copy).some(key => key !== 'request' && copy[key] !== expected[key])
      || Object.keys(request).some(key => request[key] !== expected.request[key])) fail('PLAN_TAMPERED');
    return expected;
  } catch { fail('PLAN_TAMPERED'); }
}

export function summarizeSamples(samples) {
  samples = arraySnapshot(samples, 100000, 'INVALID_SAMPLE');
  if (samples.some(value => !Number.isFinite(value) || value < 0)) fail('INVALID_SAMPLE');
  const sorted = [...samples].sort((a, b) => a - b), count = sorted.length;
  const rank = p => count ? sorted[Math.ceil(count * p) - 1] : null;
  return { count, min: count ? sorted[0] : null,
    avg: count ? sorted.reduce((a, b) => a + b, 0) / count : null,
    p50: rank(0.5), p95: rank(0.95), p99: rank(0.99), max: count ? sorted.at(-1) : null };
}

function approvalValid(approval, plan, now) {
  return approval?.action === 'AUTHORIZE_NEW_SYSTEM_NATIVE_50X50_READ_ONLY'
    && approval.approvedBy === 'Faisal' && approval.target === TARGET
    && approval.planSha256 === plan.planSha256 && SHA256.test(approval.sourceSha256)
    && UUID.test(approval.nonce) && fresh(approval.issuedAt, now, 300000)
    && Number.isFinite(approval.expiresAt) && approval.expiresAt > now
    && approval.expiresAt <= approval.issuedAt + 300000;
}

function validProof(proof, identity, native, approval, now) {
  return proof?.kind === (native ? 'NATIVE_OWNERSHIP_VERIFIED' : 'LOCAL_OWNERSHIP_FIXTURE')
    && proof.target === TARGET && proof.uid === identity.uid && proof.sid === identity.sid
    && proof.tokenSha256 === hash(identity.token)
    && proof.sessionUid === identity.uid && proof.sessionId === identity.sid
    && proof.profileUid === identity.uid && proof.sessionActive === true
    && proof.profileActive === true && proof.mustChangePassword === false
    && proof.authVerified === true && proof.authIssuer === TARGET + '/auth/v1'
    && proof.authRole === 'authenticated' && Number.isFinite(proof.authExpiresAt) && proof.authExpiresAt > now
    && fresh(proof.verifiedAt, now, 60000) && proof.sourceTarget === TARGET
    && SHA256.test(proof.sourceSha256) && fresh(proof.sourceVerifiedAt, now, 300000)
    && proof.readOnlyListRpcVerified === true && proof.contextAndAuthorizationUnchanged === true
    && (!native || (proof.verifiedAt >= approval.issuedAt
      && proof.sourceSha256 === approval.sourceSha256));
}

async function verifyIdentities(input, count, verify, native, approval, timeoutMs) {
  const candidates = arraySnapshot(input, count, 'IDENTITY_COUNT_OR_VERIFIER');
  if (candidates.length !== count || typeof verify !== 'function') fail('IDENTITY_COUNT_OR_VERIFIER');
  const seen = [new Set(), new Set(), new Set()];
  const identities = candidates.map(candidate => {
    const value = record(candidate, { uid: 'string', sid: 'string', token: 'string', kind: 'string' }, 'INVALID_IDENTITY');
    if (!UUID.test(value.uid) || !UUID.test(value.sid)
      || !value.token || /[\r\n]/.test(value.token)) fail('INVALID_IDENTITY');
    if (value.kind !== (native ? 'NATIVE_AUTH_SESSION' : 'GENERATED_LOCAL_FIXTURE')) fail('IDENTITY_KIND_REJECTED');
    const identity = Object.freeze({ uid: value.uid.toLowerCase(), sid: value.sid.toLowerCase(),
      token: value.token, kind: value.kind });
    for (const [index, key] of [identity.uid, identity.sid, hash(identity.token)].entries()) {
      if (seen[index].has(key)) fail('DUPLICATE_IDENTITY');
      seen[index].add(key);
    }
    return identity;
  });
  const proofs = [];
  const controller = new AbortController();
  let timer;
  const expired = Symbol('verification deadline');
  const deadline = new Promise(resolveDeadline => {
    timer = setTimeout(() => { controller.abort(); resolveDeadline(expired); },
      Math.max(1, native ? Math.min(timeoutMs, approval.expiresAt - Date.now()) : timeoutMs));
  });
  try {
    for (const identity of identities) {
      let proof;
      try {
        const original = verify(Object.freeze({ ...identity, target: TARGET }), Object.freeze({ signal: controller.signal }));
        const tracked = { original };
        pendingVerifications.add(tracked);
        const settled = Promise.resolve(original).then(value => {
          pendingVerifications.delete(tracked);
          return record(value, proofFields, 'OWNERSHIP_PROOF_REJECTED');
        }, () => { pendingVerifications.delete(tracked); fail('OWNERSHIP_PROOF_REJECTED'); });
        proof = await Promise.race([settled, deadline]);
      } catch { fail('OWNERSHIP_PROOF_REJECTED'); }
      if (proof === expired) fail('OWNERSHIP_VERIFICATION_TIMEOUT');
      if (!validProof(proof, identity, native, approval, Date.now())) fail('OWNERSHIP_PROOF_REJECTED');
      proofs.push(proof);
    }
  } finally {
    clearTimeout(timer);
  }
  if (proofs.some((proof, i) => !validProof(proof, identities[i], native, approval, Date.now()))
    || proofs.some(proof => proof.sourceSha256 !== proofs[0].sourceSha256)) fail('OWNERSHIP_PROOF_REJECTED');
  return { identities, proofs };
}

function boundedRows(body, pageSize) {
  const value = JSON.parse(body);
  return value && Array.isArray(value.rows) && value.rows.length <= pageSize
    && value.rows.every(row => row && typeof row === 'object' && !Array.isArray(row)
      && !['history', 'actions', 'routes', 'requests'].some(key => Object.hasOwn(row, key)));
}

async function dispatch(plan, owned, transport, native, approval, apiKey) {
  const metrics = { measurement: native ? 'NATIVE_READ_ONLY_HTTP' : 'SYNTHETIC_LOCAL_TRANSPORT_ONLY',
    planned: plan.totalRequests, dispatched: 0, completed: 0, terminal: 0, deadlineUnknown: 0,
    cleanupUnknown: 0, cleanupErrors: 0, headersReceived: 0, bodyCompleted: 0,
    success: 0, errors: 0, timeouts: 0, bodyTimeouts: 0, status429: 0, status5xx: 0,
    invalidBodies: 0, bodyBudgetExceeded: 0, transportErrors: 0,
    requestBodyBytes: 0, responseBodyBytes: 0, requestBodiesSubmitted: 0,
    peakClientTransportOverlap: 0, peakHttpOverlap: 0, statusCounts: {},
    authorizationRejected: false, gateExpired: false, dispatchStopped: false,
    networkServerDatabaseSplit: 'UNMEASURED',
    byteDefinition: 'UTF8 request body and decoded response body bytes; headers and wire bytes unmeasured',
    requestBodySettlement: 'UNMEASURED_BY_FETCH_API; immutable string submitted, upload completion not exposed',
    overlapDefinition: 'Actual client transport invocation through body and original cancellation settlement; unknown IO retained; not server concurrency',
    percentileDefinition: 'nearest-rank; latencyMs includes settled completions only; terminalLatencyMs includes deadline/cleanup unknowns',
    cleanupGraceMs: Math.min(1000, Math.max(100, plan.requestTimeoutMs)), samples: [] };
  const active = new Set();
  let nextIdentity = 0;
  const started = performance.now();
  const stop = () => metrics.authorizationRejected || metrics.gateExpired || metrics.dispatchStopped;
  async function one(identity, proof) {
    if (stop()) return;
    if (!validProof(proof, identity, native, approval, Date.now())
      || (native && !approvalValid(approval, plan, Date.now()))) { metrics.gateExpired = true; return; }
    const controller = new AbortController();
    // These references outlive the wrapper if a boundary ignores abort/cancel.
    const io = { fetch: null, read: null, cancel: null, physical: null };
    let reader, timedOut = false, status = null, bytes = 0, outcome = 'transport_error';
    let bodyComplete = false, cancelled = false, cleanupFailed = false, transportFailed = false;
    let headers = false, oversize = false, invalidBody = false, drainTimer, returned = false;
    const began = performance.now();
    let resolveDeadline;
    const deadline = new Promise(resolve => { resolveDeadline = resolve; });
    function cancelOnce() {
      if (!reader || cancelled || bodyComplete) return;
      cancelled = true;
      try {
        // Never replace this with a second cancel(): that promise can resolve
        // immediately while the first cancellation is still physically pending.
        io.cancel = reader.cancel();
        io.cancelSettled = Promise.resolve(io.cancel).then(() => {}, () => { cleanupFailed = true; });
      } catch { cleanupFailed = true; io.cancelSettled = Promise.resolve(); }
    }
    // A timeout stops further dispatch. Existing IO gets one finite drain window.
    // Cleanup already pending (e.g. oversize) is bounded by the request deadline.
    const timer = setTimeout(() => {
      timedOut = true;
      metrics.dispatchStopped = true;
      const cleanupAlreadyPending = cancelled;
      controller.abort();
      cancelOnce();
      if (cleanupAlreadyPending) resolveDeadline('deadline_unknown');
      else drainTimer = setTimeout(() => resolveDeadline('deadline_unknown'), metrics.cleanupGraceMs);
    }, plan.requestTimeoutMs);
    const ordinal = ++metrics.dispatched;
    metrics.requestBodyBytes += Buffer.byteLength(plan.request.body);
    metrics.requestBodiesSubmitted++;
    active.add(io);
    pendingTransports.add(io);
    metrics.peakClientTransportOverlap = Math.max(metrics.peakClientTransportOverlap, active.size);
    metrics.peakHttpOverlap = metrics.peakClientTransportOverlap;
    io.physical = (async () => {
      let receivedResponse = false;
      try {
        io.fetch = transport(plan.request.url, {
          method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public',
            Authorization: `Bearer ${identity.token}`, ...(native ? { apikey: apiKey } : {}) },
          body: plan.request.body,
        });
        const response = await io.fetch;
        receivedResponse = true;
        // Provider getters/errors are contained here; only checked primitives
        // are allowed into metrics, even at the substituted local boundary.
        const receivedStatus = response.status;
        if (!integer(receivedStatus, 100, 599)) fail('INVALID_RESPONSE');
        status = receivedStatus;
        headers = true;
        if (!returned && (status === 401 || status === 403)) metrics.authorizationRejected = true;
        const body = response.body;
        reader = body == null ? null : body.getReader();
        if (timedOut) { cancelOnce(); fail('REQUEST_TIMEOUT'); }
        const chunks = [];
        if (reader) {
          while (true) {
            io.read = reader.read();
            const part = await io.read;
            io.read = null;
            if (timedOut) fail('REQUEST_TIMEOUT');
            if (part.done === true) break;
            if (part.done !== false || !(part.value instanceof Uint8Array)) fail('INVALID_RESPONSE');
            const chunk = Buffer.from(part.value);
            bytes += chunk.byteLength;
            if (bytes > plan.maxBodyBytes) { oversize = true; outcome = 'body_budget'; break; }
            chunks.push(chunk);
          }
        }
        if (!oversize) {
          bodyComplete = true;
          if (status < 200 || status >= 300) outcome = 'http_error';
          else {
            try { outcome = boundedRows(Buffer.concat(chunks).toString('utf8'), plan.pageSize) ? 'success' : 'invalid_body'; }
            catch { outcome = 'invalid_body'; }
            invalidBody = outcome === 'invalid_body';
          }
        }
      } catch {
        if (timedOut) outcome = 'timeout';
        else { outcome = 'transport_error'; transportFailed = true; }
        // Headers alone cannot prove the response was closed when access failed.
        if (receivedResponse && !reader && !bodyComplete) cleanupFailed = true;
      } finally {
        cancelOnce();
        if (io.cancelSettled) await io.cancelSettled;
        if (reader) { try { reader.releaseLock(); } catch { cleanupFailed = true; } }
        if (!cleanupFailed) { active.delete(io); pendingTransports.delete(io); }
      }
      return cleanupFailed ? 'cleanup_unknown' : 'settled';
    })();
    let terminal;
    try { terminal = await Promise.race([io.physical, deadline]); }
    finally {
      clearTimeout(timer);
      clearTimeout(drainTimer);
      returned = true;
    }
    const settled = terminal === 'settled';
    if (!settled) metrics.dispatchStopped = true;
    metrics.terminal++;
    if (settled) metrics.completed++;
    if (terminal === 'deadline_unknown') metrics.deadlineUnknown++;
    if (terminal === 'cleanup_unknown') metrics.cleanupUnknown++;
    if (cleanupFailed) metrics.cleanupErrors++;
    if (headers) {
      metrics.headersReceived++;
      metrics.statusCounts[status] = (metrics.statusCounts[status] ?? 0) + 1;
      if (status === 429) metrics.status429++;
      if (status >= 500) metrics.status5xx++;
    }
    if (bodyComplete) metrics.bodyCompleted++;
    if (oversize) metrics.bodyBudgetExceeded++;
    if (invalidBody) metrics.invalidBodies++;
    if (transportFailed) metrics.transportErrors++;
    if (timedOut) { metrics.timeouts++; if (headers && !bodyComplete) metrics.bodyTimeouts++; }
    metrics.responseBodyBytes += bytes;
    if (settled && outcome === 'success') metrics.success++;
    else metrics.errors++;
    metrics.samples.push({ ordinal, status, outcome: settled ? outcome : terminal,
      terminal, completed: settled, bodyCompleted: bodyComplete, elapsedMs: performance.now() - began,
      responseBodyBytes: bytes });
  }
  async function worker() {
    while (!stop()) {
      const index = nextIdentity++;
      if (index >= owned.identities.length) return;
      for (let request = 0; request < plan.requestsPerUser && !stop(); request++) {
        await one(owned.identities[index], owned.proofs[index]);
      }
    }
  }
  await Promise.all(Array.from({ length: plan.concurrency }, () => worker()));
  const elapsedMs = performance.now() - started;
  return { ...metrics, notDispatched: plan.totalRequests - metrics.dispatched, httpInFlightAtEnd: active.size,
    clientTransportsUnsettledAtEnd: active.size,
    elapsedMs, throughputCompletedPerSecond: elapsedMs > 0 ? metrics.completed * 1000 / elapsedMs : null,
    latencyMs: summarizeSamples(metrics.samples.filter(sample => sample.completed).map(sample => sample.elapsedMs)),
    terminalLatencyMs: summarizeSamples(metrics.samples.map(sample => sample.elapsedMs)),
    successLatencyMs: summarizeSamples(metrics.samples.filter(sample => sample.outcome === 'success').map(sample => sample.elapsedMs)) };
}

export async function runLocalFixture(input) {
  try {
    const { plan, identities, verifyOwnership, transport } = record(input,
      { plan: 'any', identities: 'any', verifyOwnership: 'any', transport: 'any' }, 'INVALID_ARGUMENTS', false);
    const checked = checkedPlan(plan);
    if (checked.users > 3 || checked.requestsPerUser > 3 || checked.totalRequests > 6) fail('LOCAL_FIXTURE_BUDGET');
    if (typeof transport !== 'function') fail('LOCAL_TRANSPORT_REQUIRED');
    if (pendingTransports.size) fail('TRANSPORT_UNSETTLED');
    const owned = await verifyIdentities(identities, checked.users, verifyOwnership, false, null, checked.requestTimeoutMs);
    if (pendingTransports.size) fail('TRANSPORT_UNSETTLED');
    return await dispatch(checked, owned, transport, false);
  } catch (error) { safeFailure(error, 'INVALID_ARGUMENTS'); }
}

// No fixture can acquire native status through runLocalFixture. Native dispatch
// uses fetch directly; overriding the transport is not a native execution API.
// Authorization is a fresh human approval receipt, not an environment flag.
// verifyOwnership MUST independently authenticate the token with the target's
// owned Auth authority (signature/issuer/expiry/role), then verify active SID +
// active profile + exact source digest/target/read-only RPC. A JWT's unverified
// claims or the existing cohort fixtures are explicitly insufficient evidence.
// Credentials remain caller-owned memory only, never files or CLI arguments.
export async function runAuthorizedNative(input = {}) {
  try {
    const { plan, authorization, identities, verifyOwnership, apiKey } = record(input,
      { plan: 'any', authorization: 'any', identities: 'any', verifyOwnership: 'any', apiKey: 'any' }, 'INVALID_ARGUMENTS', false);
    const checked = checkedPlan(plan);
    const approval = authorization == null ? null : record(authorization, approvalFields, 'FUTURE_AUTHORIZATION_REQUIRED');
    if (!approvalValid(approval, checked, Date.now()) || usedApprovals.has(approval.nonce)
      || checked.users !== 50 || checked.requestsPerUser !== 50) fail('FUTURE_AUTHORIZATION_REQUIRED');
    const candidates = arraySnapshot(identities, 50, 'NATIVE_PROOF_REQUIRED');
    if (candidates.length !== 50 || typeof verifyOwnership !== 'function' || !nativeFetch
      || typeof apiKey !== 'string' || !apiKey || /[\r\n]/.test(apiKey)) fail('NATIVE_PROOF_REQUIRED');
    if (pendingTransports.size) fail('TRANSPORT_UNSETTLED');
    const owned = await verifyIdentities(candidates, 50, verifyOwnership, true, approval, checked.requestTimeoutMs);
    if (!approvalValid(approval, checked, Date.now()) || usedApprovals.has(approval.nonce)) fail('FUTURE_AUTHORIZATION_REQUIRED');
    if (pendingTransports.size) fail('TRANSPORT_UNSETTLED');
    usedApprovals.add(approval.nonce);
    return await dispatch(checked, owned, nativeFetch, true, approval, apiKey);
  } catch (error) { safeFailure(error, 'INVALID_ARGUMENTS'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(argument => argument !== '--prepare-only')) {
    console.error('PREPARE_ONLY_CLI'); process.exitCode = 2;
  } else console.log(JSON.stringify(prepareLoad(), null, 2));
}
