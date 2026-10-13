import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Only the transport/proof boundary is substituted. No application benchmark
// is inferred from these small generated fixtures, and no native load runs.
const moduleUrl = new URL('../scripts/performance_load_harness.mjs', import.meta.url);
const loaded = await import(moduleUrl).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return null;
});
function api() {
  assert.ok(loaded, 'Preparation harness implementation is missing');
  return loaded;
}
const target = 'https://movzojtnkkmdsjhmlgtq.supabase.co';
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHash = sha('generated-local-source-proof');
const uuid = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function identities(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    uid: uuid(i + 1), sid: uuid(i + 101),
    token: `generated-local-fixture-${i}`, kind: 'GENERATED_LOCAL_FIXTURE',
  }));
}
function proof(identity) {
  return {
    kind: 'LOCAL_OWNERSHIP_FIXTURE', target, uid: identity.uid, sid: identity.sid,
    tokenSha256: sha(identity.token), verifiedAt: Date.now(),
    sessionUid: identity.uid, sessionId: identity.sid, sessionActive: true,
    profileUid: identity.uid, profileActive: true, mustChangePassword: false,
    authVerified: true, authIssuer: target + '/auth/v1', authRole: 'authenticated',
    authExpiresAt: Date.now() + 300000,
    sourceSha256: sourceHash, sourceTarget: target, sourceVerifiedAt: Date.now(),
    readOnlyListRpcVerified: true, contextAndAuthorizationUnchanged: true,
  };
}
function options(overrides = {}) {
  return {
    plan: api().prepareLoad({ users: 2, requestsPerUser: 2, concurrency: 2 }),
    identities: identities(), verifyOwnership: async identity => proof(identity),
    transport: async () => new Response('{"rows":[]}', { status: 200 }),
    ...overrides,
  };
}
const code = expected => error => error.code === expected && error.message === expected;

test('default preparation describes 2500 bounded reads and performs zero dispatches', () => {
  const p = api().prepareLoad();
  assert.equal(p.mode, 'PREPARE_ONLY');
  assert.equal(p.users, 50);
  assert.equal(p.requestsPerUser, 50);
  assert.equal(p.totalRequests, 2500);
  assert.equal(p.networkAllowed, false);
  assert.equal(p.request.url, target + '/rest/v1/rpc/list_my_transactions');
  assert.equal(p.request.method, 'POST');
  assert.deepEqual(JSON.parse(p.request.body), { p_tab: 'all', p_page: 1, p_page_size: 50 });
  assert.ok(Object.isFrozen(p.request));
  assert.equal(p.planSha256.length, 64);
});

test('target, unbounded page, request, overlap and response budgets fail closed', () => {
  for (const bad of [
    { target: 'https://unowned.invalid' }, { target: target + '/' },
    { target: target + '@unowned.invalid' }, { target: target + '/rest/v1' },
    { users: 51 }, { users: 0 }, { users: 1.5 }, { requestsPerUser: 51 },
    { pageSize: 101 }, { pageSize: 0 }, { pageSize: NaN },
    { concurrency: 51 }, { users: 1, concurrency: 2 },
    { requestTimeoutMs: 0 }, { requestTimeoutMs: 30001 },
    { maxBodyBytes: 0 }, { maxBodyBytes: 1048577 },
    { rpc: 'write_action' }, { p_page: 999999 }, { unknown: true }, { toString: 'override' },
  ]) assert.throws(() => api().prepareLoad(bad), error => /^[A-Z_]+$/.test(error.code));
});

test('nearest-rank statistics are derived from actual samples; empty sets are unmeasured', () => {
  assert.deepEqual(api().summarizeSamples([10, 20, 30, 40]), {
    count: 4, min: 10, avg: 25, p50: 20, p95: 40, p99: 40, max: 40,
  });
  assert.deepEqual(api().summarizeSamples([]), {
    count: 0, min: null, avg: null, p50: null, p95: null, p99: null, max: null,
  });
  assert.throws(() => api().summarizeSamples([NaN]), code('INVALID_SAMPLE'));
});

test('owned local reads measure dispatches, body bytes, status and completed latency separately', async () => {
  let observed = 0;
  const result = await api().runLocalFixture(options({ transport: async (url, init) => {
    observed++;
    assert.equal(url, target + '/rest/v1/rpc/list_my_transactions');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.deepEqual(JSON.parse(init.body), { p_tab: 'all', p_page: 1, p_page_size: 50 });
    assert.equal(init.headers['Accept-Profile'], 'public');
    return new Response('{"rows":[]}', { status: 200 });
  } }));
  assert.equal(observed, 4);
  assert.equal(result.measurement, 'SYNTHETIC_LOCAL_TRANSPORT_ONLY');
  assert.equal(result.dispatched, 4);
  assert.equal(result.completed, 4);
  assert.equal(result.bodyCompleted, 4);
  assert.equal(result.success, 4);
  assert.equal(result.errors, 0);
  assert.equal(result.responseBodyBytes, 44);
  assert.equal(result.requestBodyBytes, 172);
  assert.equal(result.latencyMs.count, 4);
  assert.equal(result.successLatencyMs.count, 4);
  assert.ok(result.elapsedMs > 0 && result.throughputCompletedPerSecond > 0);
  assert.equal(result.networkServerDatabaseSplit, 'UNMEASURED');
  const saved = JSON.stringify(result);
  for (const identity of identities()) {
    assert.equal(saved.includes(identity.token), false);
    assert.equal(saved.includes(identity.uid), false);
    assert.equal(saved.includes(identity.sid), false);
  }
});

test('headers do not count as body completion and HTTP overlap tracks transport bodies', async () => {
  let openBodies = 0, peak = 0, dispatches = 0;
  const releases = [];
  const result = await api().runLocalFixture(options({ transport: async () => {
    dispatches++;
    openBodies++;
    peak = Math.max(peak, openBodies);
    const body = new ReadableStream({ start(controller) {
      releases.push(() => {
        controller.enqueue(new TextEncoder().encode('{"rows":[]}'));
        openBodies--;
        controller.close();
      });
      if (releases.length === 2) for (const release of releases.splice(0)) release();
    } });
    return new Response(body);
  } }));
  assert.equal(dispatches, 4);
  assert.equal(peak, 2);
  assert.equal(result.peakHttpOverlap, peak);
  assert.equal(result.bodyCompleted, 4);
  assert.equal(result.httpInFlightAtEnd, 0);
});

test('429, 5xx, provider JSON, malformed bodies and thrown errors stay sanitized and independent', async () => {
  let n = 0;
  const result = await api().runLocalFixture(options({
    plan: api().prepareLoad({ users: 2, requestsPerUser: 3, concurrency: 2 }),
    transport: async () => {
      const index = n++;
      if (index === 5) throw Error('provider-body-private-marker');
      return new Response([
        '{"rows":[]}', '{"message":"provider-body-private-marker"}', '{}',
        'provider-body-private-marker', '{"rows":[]}',
      ][index], { status: [200, 429, 503, 200, 500][index] });
    },
  }));
  assert.equal(result.dispatched, 6);
  assert.equal(result.completed, 6);
  assert.equal(result.success, 1);
  assert.equal(result.errors, 5);
  assert.equal(result.status429, 1);
  assert.equal(result.status5xx, 2);
  assert.equal(result.invalidBodies, 1);
  assert.equal(result.transportErrors, 1);
  assert.equal(result.bodyCompleted, 5);
  assert.equal(result.latencyMs.count, 6);
  assert.equal(JSON.stringify(result).includes('provider-body-private-marker'), false);
});

test('body timeout remains a timeout after 200 headers and has no completed body', async () => {
  const result = await api().runLocalFixture(options({
    plan: api().prepareLoad({ users: 1, requestsPerUser: 1, concurrency: 1, requestTimeoutMs: 20 }),
    identities: identities(1),
    transport: async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"rows":'));
    } })),
  }));
  assert.equal(result.dispatched, 1);
  assert.equal(result.headersReceived, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.bodyCompleted, 0);
  assert.equal(result.timeouts, 1);
  assert.equal(result.bodyTimeouts, 1);
  assert.equal(result.success, 0);
  assert.equal(result.responseBodyBytes, 8);
  assert.equal(result.httpInFlightAtEnd, 0);
});

test('oversize bytes, oversized pages and per-row detail payloads are rejected', async () => {
  for (const [body, maximum, category] of [
    ['{"rows":[]}', 8, 'bodyBudgetExceeded'],
    [JSON.stringify({ rows: Array.from({ length: 51 }, () => ({ id: 'generated' })) }), 4096, 'invalidBodies'],
    ['{"rows":[{"id":"generated","history":[]}]}', 4096, 'invalidBodies'],
    ['{"rows":[{"actions":[]}]}', 4096, 'invalidBodies'],
    ['{"rows":[{"requests":[]}]}', 4096, 'invalidBodies'],
    ['{"rows":[{"routes":[]}]}', 4096, 'invalidBodies'],
  ]) {
    const result = await api().runLocalFixture(options({
      plan: api().prepareLoad({ users: 1, requestsPerUser: 1, concurrency: 1, maxBodyBytes: maximum }),
      identities: identities(1), transport: async () => new Response(body),
    }));
    assert.equal(result.success, 0);
    assert.equal(result[category], 1);
  }
});

test('duplicate UID, SID or token cannot masquerade as independent identities', async () => {
  for (const field of ['uid', 'sid', 'token']) {
    const ids = identities(); ids[1][field] = ids[0][field];
    let dispatched = 0;
    await assert.rejects(api().runLocalFixture(options({ identities: ids, transport: () => { dispatched++; } })), code('DUPLICATE_IDENTITY'));
    assert.equal(dispatched, 0);
  }
});

test('unowned, mismatched, disabled, stale or wrong-target proofs dispatch nothing', async () => {
  for (const wrong of [
    { uid: uuid(9) }, { sid: uuid(9) }, { sessionUid: uuid(9) }, { sessionId: uuid(9) },
    { profileUid: uuid(9) }, { tokenSha256: sha('wrong') }, { target: 'https://unowned.invalid' },
    { sessionActive: false }, { profileActive: false }, { mustChangePassword: true },
    { authVerified: false }, { authIssuer: 'https://unowned.invalid/auth/v1' },
    { authRole: 'service_role' }, { authExpiresAt: Date.now() - 1 },
    { verifiedAt: Date.now() - 61000 }, { verifiedAt: Date.now() + 60000 },
    { sourceVerifiedAt: Date.now() - 300001 }, { sourceTarget: 'https://unowned.invalid' },
    { readOnlyListRpcVerified: false }, { contextAndAuthorizationUnchanged: false },
    { kind: 'NATIVE_OWNERSHIP_VERIFIED' },
  ]) {
    let dispatched = 0;
    await assert.rejects(api().runLocalFixture(options({
      verifyOwnership: async identity => ({ ...proof(identity), ...wrong }),
      transport: () => { dispatched++; },
    })), code('OWNERSHIP_PROOF_REJECTED'));
    assert.equal(dispatched, 0);
  }
});

test('all ownership checks finish before any dispatch and verifier failures are sanitized', async () => {
  let checks = 0, calls = 0;
  await assert.rejects(api().runLocalFixture(options({
    verifyOwnership: async identity => {
      checks++; if (checks === 2) throw Error('private-proof-details'); return proof(identity);
    },
    transport: () => { calls++; },
  })), code('OWNERSHIP_PROOF_REJECTED'));
  assert.equal(checks, 2);
  assert.equal(calls, 0);
});

test('source snapshots must agree across all owners before dispatch', async () => {
  let checks = 0, calls = 0;
  await assert.rejects(api().runLocalFixture(options({
    verifyOwnership: async identity => ({ ...proof(identity), sourceSha256: sha(`source-${++checks}`) }),
    transport: () => { calls++; },
  })), code('OWNERSHIP_PROOF_REJECTED'));
  assert.equal(checks, 2);
  assert.equal(calls, 0);
});

test('a header timeout waits for transport abort settlement, with no phantom completion', async () => {
  let transportSettled = false;
  const result = await api().runLocalFixture(options({
    plan: api().prepareLoad({ users: 1, requestsPerUser: 1, concurrency: 1, requestTimeoutMs: 20 }),
    identities: identities(1),
    transport: (_url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        transportSettled = true;
        reject(new Error('private-transport-detail'));
      }, { once: true });
    }),
  }));
  assert.equal(transportSettled, true);
  assert.equal(result.completed, 1);
  assert.equal(result.headersReceived, 0);
  assert.equal(result.bodyCompleted, 0);
  assert.equal(result.timeouts, 1);
  assert.equal(result.bodyTimeouts, 0);
  assert.equal(result.httpInFlightAtEnd, 0);
});

test('authorization rejection stops queued requests without retries or logging bodies', async () => {
  let calls = 0;
  const result = await api().runLocalFixture(options({
    plan: api().prepareLoad({ users: 1, requestsPerUser: 3, concurrency: 1 }),
    identities: identities(1),
    transport: async () => { calls++; return new Response('{"message":"private"}', { status: 403 }); },
  }));
  assert.equal(calls, 1);
  assert.equal(result.authorizationRejected, true);
  assert.equal(result.notDispatched, 2);
  assert.equal(result.statusCounts['403'], 1);
});

test('fixtures cannot run 50x50 or claim native provenance and tampered plans fail closed', async () => {
  await assert.rejects(api().runLocalFixture(options({ plan: api().prepareLoad() })), code('LOCAL_FIXTURE_BUDGET'));
  const ids = identities(); ids[0].kind = 'NATIVE_AUTH_SESSION';
  await assert.rejects(api().runLocalFixture(options({ identities: ids })), code('IDENTITY_KIND_REJECTED'));
  const plan = JSON.parse(JSON.stringify(options().plan));
  plan.request.url = target + '/rest/v1/rpc/mutation';
  await assert.rejects(api().runLocalFixture(options({ plan })), code('PLAN_TAMPERED'));
});

test('native execution is unavailable without fresh explicit plan-bound approval and proof', async () => {
  const plan = api().prepareLoad();
  await assert.rejects(api().runAuthorizedNative({ plan }), code('FUTURE_AUTHORIZATION_REQUIRED'));
  const approval = {
    action: 'AUTHORIZE_NEW_SYSTEM_NATIVE_50X50_READ_ONLY', approvedBy: 'Faisal',
    target, planSha256: plan.planSha256, sourceSha256: sourceHash,
    issuedAt: Date.now(), expiresAt: Date.now() + 60000, nonce: uuid(900),
  };
  for (const bad of [
    { target: 'https://unowned.invalid' }, { planSha256: sha('wrong') },
    { issuedAt: Date.now() - 300001 }, { expiresAt: Date.now() - 1 },
    { action: 'prepare' }, { approvedBy: 'fixture' }, { sourceSha256: '' },
  ]) await assert.rejects(api().runAuthorizedNative({ plan, authorization: { ...approval, ...bad } }), code('FUTURE_AUTHORIZATION_REQUIRED'));
  await assert.rejects(api().runAuthorizedNative({ plan, authorization: approval, identities: identities() }), code('NATIVE_PROOF_REQUIRED'));
});

test('CLI stays prepare-only and refuses execution flags without opening sockets', () => {
  api();
  const run = args => spawnSync(process.execPath, [moduleUrl.pathname.replace(/^\/(\w:)/, '$1'), ...args], {
    encoding: 'utf8', env: { SystemRoot: 'C:\\Windows' },
  });
  const prepared = run([]);
  assert.equal(prepared.status, 0);
  assert.equal(JSON.parse(prepared.stdout).networkAllowed, false);
  const blocked = run(['--execute']);
  assert.equal(blocked.status, 2);
  assert.equal(blocked.stderr.trim(), 'PREPARE_ONLY_CLI');
});

// PREP_ERR_01: caller objects must never run getters/coercions or export their errors.
test('identity and native approval getters reject with owned fixed codes before dispatch', async () => {
  let calls = 0, getterCalls = 0;
  const bad = { ...identities(1)[0], get uid() { getterCalls++; throw Error('generated-private-getter'); } };
  await assert.rejects(api().runLocalFixture(options({ identities: [bad],
    plan: api().prepareLoad({ users: 1, requestsPerUser: 1, concurrency: 1 }),
    transport: () => { calls++; },
  })), code('INVALID_IDENTITY'));
  await assert.rejects(api().runAuthorizedNative({ plan: api().prepareLoad(),
    authorization: { get action() { getterCalls++; throw Error('generated-private-approval'); } },
  }), code('FUTURE_AUTHORIZATION_REQUIRED'));
  assert.equal(getterCalls, 0);
  assert.equal(calls, 0);
});

test('public parameter, plan, proxy and sample boundaries never expose untrusted exceptions', async () => {
  const hostile = new Proxy({}, { ownKeys() { throw Error('generated-private-proxy'); } });
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  const getter = { get plan() { throw Error('generated-private-parameter'); } };
  assert.throws(() => api().prepareLoad(hostile), code('INVALID_PLAN_OPTION'));
  assert.throws(() => api().prepareLoad({ get users() { throw Error('generated-private-plan'); } }), code('INVALID_PLAN_OPTION'));
  assert.throws(() => api().summarizeSamples(revoked.proxy), code('INVALID_SAMPLE'));
  await assert.rejects(api().runLocalFixture(getter), code('INVALID_ARGUMENTS'));
  await assert.rejects(api().runAuthorizedNative(getter), code('INVALID_ARGUMENTS'));
  await assert.rejects(api().runLocalFixture(options({ identities: revoked.proxy })), code('IDENTITY_COUNT_OR_VERIFIER'));
  await assert.rejects(api().runLocalFixture(options({ plan: hostile })), code('PLAN_TAMPERED'));
});

test('proof snapshots reject extra sensitive fields, accessors and object coercion without dispatch', async () => {
  let calls = 0, coercions = 0;
  const badProofs = [
    value => ({ ...proof(value), providerPayload: 'generated-private-provider' }),
    value => ({ ...proof(value), get authRole() { coercions++; throw Error('generated-private-proof'); } }),
    value => ({ ...proof(value), sourceSha256: { toString() { coercions++; return sourceHash; } } }),
    value => new Proxy(proof(value), { getOwnPropertyDescriptor() { throw Error('generated-private-descriptor'); } }),
  ];
  for (const make of badProofs) await assert.rejects(api().runLocalFixture(options({
    verifyOwnership: async value => make(value), transport: () => { calls++; return new Response('{"rows":[]}'); },
  })), code('OWNERSHIP_PROOF_REJECTED'));
  assert.equal(calls, 0);
  assert.equal(coercions, 0);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function watchdog(task, milliseconds = 1000) {
  let timer;
  try { return await Promise.race([task, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('TEST_DEADLINE_EXCEEDED')), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
const onePlan = extra => api().prepareLoad({ users: 1, requestsPerUser: 1, concurrency: 1, requestTimeoutMs: 10, ...extra });

test('pending ownership verification has a finite deadline and never dispatches after late proof', async () => {
  const pending = deferred(); let calls = 0;
  const task = api().runLocalFixture(options({ plan: onePlan(), identities: identities(1),
    verifyOwnership: () => pending.promise, transport: () => { calls++; },
  }));
  try { await watchdog(assert.rejects(task, code('OWNERSHIP_VERIFICATION_TIMEOUT'))); }
  finally { pending.resolve(proof(identities(1)[0])); await task.catch(() => {}); }
  assert.equal(calls, 0);
});

// PREP_METRIC_02: a repeated cancel() can resolve before the original cancellation.
test('body timeout retains the original cancel promise and blocks the next dispatch until settlement', async () => {
  const pending = deferred(), started = deferred(); let calls = 0, returned = false;
  const task = api().runLocalFixture(options({ plan: onePlan({ requestsPerUser: 2 }), identities: identities(1),
    transport: async () => {
      calls++;
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"rows":')); },
        cancel() { started.resolve(); return pending.promise; } }));
    },
  })).then(result => { returned = true; return result; });
  try {
    await watchdog(started.promise);
    // Event-loop watchdog only; it does not contribute a performance/concurrency sample.
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(returned, false);
    assert.equal(calls, 1);
  } finally { pending.resolve(); await watchdog(task); }
  const result = await task;
  assert.equal(result.completed, 1);
  assert.equal(result.terminal, 1);
  assert.equal(result.bodyCompleted, 0);
  assert.equal(result.notDispatched, 1);
  assert.equal(result.peakClientTransportOverlap, 1);
  assert.equal(result.clientTransportsUnsettledAtEnd, 0);
});

test('oversize pending cancellation returns deadline unknown without completion or follow-up dispatch', async () => {
  const pending = deferred(); let calls = 0;
  const task = api().runLocalFixture(options({ plan: onePlan({ requestsPerUser: 2, maxBodyBytes: 8 }), identities: identities(1),
    transport: async () => { calls++; return new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('{"rows":[]}')); }, cancel() { return pending.promise; },
    })); },
  }));
  let result;
  try {
    result = await watchdog(task);
    assert.equal(result.completed, 0);
    assert.equal(result.terminal, 1);
    assert.equal(result.deadlineUnknown, 1);
    assert.equal(result.bodyBudgetExceeded, 1);
    assert.equal(result.bodyCompleted, 0);
    assert.equal(result.clientTransportsUnsettledAtEnd, 1);
    assert.equal(result.httpInFlightAtEnd, 1);
    assert.equal(result.latencyMs.count, 0);
    assert.equal(result.terminalLatencyMs.count, 1);
    assert.equal(result.success, 0);
    assert.equal(calls, 1);
    await assert.rejects(api().runLocalFixture(options()), code('TRANSPORT_UNSETTLED'));
  } finally {
    pending.resolve(); await watchdog(task);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.equal(result.completed, 0, 'Returned metrics remain an immutable-in-time snapshot');
});

test('a physical fetch ignoring abort stays tracked after the wrapper drain deadline', async () => {
  const pending = deferred(); let calls = 0, aborted = false, lateBodyCancelled = false;
  const task = api().runLocalFixture(options({ plan: onePlan({ requestsPerUser: 2 }), identities: identities(1),
    transport: (_url, init) => { calls++; init.signal.addEventListener('abort', () => { aborted = true; }); return pending.promise; },
  }));
  try {
    const result = await watchdog(task);
    assert.equal(aborted, true);
    assert.equal(calls, 1);
    assert.equal(result.completed, 0);
    assert.equal(result.headersReceived, 0);
    assert.equal(result.deadlineUnknown, 1);
    assert.equal(result.clientTransportsUnsettledAtEnd, 1);
    assert.equal(result.peakClientTransportOverlap, 1);
    await assert.rejects(api().runLocalFixture(options()), code('TRANSPORT_UNSETTLED'));
  } finally {
    pending.resolve(new Response(new ReadableStream({ cancel() { lateBodyCancelled = true; } })));
    await watchdog(task); await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.equal(lateBodyCancelled, true);
});

test('never-settled cancellation has a finite drain and cannot masquerade as completed', async () => {
  const pending = deferred();
  const task = api().runLocalFixture(options({ plan: onePlan(), identities: identities(1),
    transport: async () => new Response(new ReadableStream({ cancel() { return pending.promise; } })),
  }));
  try {
    const result = await watchdog(task);
    assert.equal(result.completed, 0);
    assert.equal(result.timeouts, 1);
    assert.equal(result.bodyCompleted, 0);
    assert.equal(result.deadlineUnknown, 1);
    assert.equal(result.clientTransportsUnsettledAtEnd, 1);
    assert.equal(result.latencyMs.count, 0);
  } finally { pending.resolve(); await watchdog(task); await new Promise(resolve => setTimeout(resolve, 0)); }
});

test('failed physical cleanup and provider getters yield only primitive unknown metrics', async () => {
  // Isolated module custody: an irrecoverable cleanup failure must keep that runner closed.
  const isolated = await import(new URL('../scripts/performance_load_harness.mjs?cleanup-failure', import.meta.url));
  const result = await isolated.runLocalFixture(options({ plan: onePlan({ maxBodyBytes: 8 }), identities: identities(1),
    transport: async () => new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('{"rows":[]}')); },
      cancel() { return Promise.reject(Error('generated-private-cancel')); },
    })),
  }));
  assert.equal(result.completed, 0);
  assert.equal(result.cleanupErrors, 1);
  assert.equal(result.clientTransportsUnsettledAtEnd, 1);
  assert.equal(result.success, 0);
  assert.equal(JSON.stringify(result).includes('generated-private-cancel'), false);
  await assert.rejects(isolated.runLocalFixture(options()), code('TRANSPORT_UNSETTLED'));
  const poisoned = await api().runLocalFixture(options({ plan: onePlan(), identities: identities(1),
    transport: async () => ({ status: { toString() { throw Error('generated-private-status'); } }, body: null }),
  }));
  assert.equal(poisoned.success, 0);
  assert.equal(JSON.stringify(poisoned).includes('generated-private'), false);
});
