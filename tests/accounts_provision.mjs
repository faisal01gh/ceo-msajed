import test from 'node:test';
import assert from 'node:assert/strict';

const runtime = await import('../scripts/accounts-provision.mjs').catch(() => ({}));
import { createOriginalStaffExecutor } from '../scripts/accounts-create-originals.mjs';
const OFFICE = 'مكتب الرئيس التنفيذي';
const ADMIN = 'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية';
const TECH = 'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية';
const FINANCE = 'الإدارة المالية';
const PROTECTED = '0a1df502-9232-4ef5-af2d-df585ad7f187';
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = value => structuredClone(value);
// A network request by either runtime or fixture is a hard test failure.
globalThis.fetch = async () => { throw new Error('fixture_network_forbidden'); };

const SOURCE_MAIN = '717375eee1e99d558af80eca91a7ea7e829edd20';
// Trusted synthetic identity list is fixed independently of live registry rows.
const staffInventory = () => ({ source_main: SOURCE_MAIN, authority: 'parent-approved-original-staff-keys',
  canonical_keys: ['faisal', ...Array.from({ length: 56 }, (_, i) => `person_${i + 1}`)] });

// Synthetic, nonsecret fixture: no accounts, service keys or network calls.
// Mirrors the approved 57 eligible / 10 linked / 47 missing / 1 inactive extra.
function fixture() {
  const units = [
    { id: uuid(101), name: OFFICE, unit_type: 'office', parent_id: null, active: true },
    { id: uuid(102), name: ADMIN, unit_type: 'sector', parent_id: null, active: true },
    { id: uuid(103), name: TECH, unit_type: 'sector', parent_id: null, active: true },
    { id: uuid(104), name: FINANCE, unit_type: 'independent', parent_id: null, active: true },
    { id: uuid(105), name: 'الفروع', unit_type: 'branch_group', parent_id: uuid(102), active: true },
    { id: uuid(106), name: 'الإدارة المشتركة', unit_type: 'department', parent_id: uuid(102), active: true },
    { id: uuid(107), name: 'الإدارة المشتركة', unit_type: 'department', parent_id: uuid(103), active: true },
    { id: uuid(108), name: 'الرياض', unit_type: 'branch', parent_id: uuid(105), active: true },
  ];
  const names = ['faisal', 'ahmad', 'omar', 'haif', 'abdullah', 'fahad', 'majed', 'ali', 'tareq', 'badr'];
  const alphabetic = n => String.fromCharCode(97 + Math.floor(n / 26), 97 + n % 26);
  const registry = Array.from({ length: 57 }, (_, i) => ({
    canonical_key: i === 0 ? 'faisal' : `person_${i}`,
    login_username: names[i] || `ameen${alphabetic(i)}`,
    preferred_login: i === 0 ? 'فيصل' : `اسم مصدر ${i}`,
    display_name: i === 0 ? 'فيصل بن محمد الغامدي' : `موظف مصدر ${i}`,
    role_code: i === 0 ? 'ceo_office_manager' : 'employee',
    org_name: i === 11 ? ADMIN : i === 12 ? TECH : OFFICE,
    dept_names: i === 11 ? ['الرياض', 'الإدارة المشتركة'] : i === 12 ? ['الإدارة المشتركة'] : [OFFICE],
    internal_email: i === 0 ? 'faisal@msajed.local' : `person-${i}@msajed.local`,
    eligible: true,
    migrated_user_id: i === 0 ? PROTECTED : i < 10 ? uuid(i) : null,
    must_change_password: i !== 0,
    profile_active: i < 10 ? true : null,
    profile_must_change: i < 10 ? i !== 0 : null,
  }));
  registry.push({ canonical_key: 'finance_manager', login_username: 'finance', preferred_login: 'مالي',
    display_name: 'المدير المالي', role_code: 'manager', org_name: FINANCE, dept_names: [FINANCE],
    internal_email: 'm-mali@msajed.local', eligible: false, migrated_user_id: uuid(90),
    must_change_password: true, profile_active: false, profile_must_change: true });
  const users = registry.filter(r => r.migrated_user_id).map(r => ({
    id: r.migrated_user_id, email: r.internal_email, email_confirmed_at: '2026-10-03T00:00:00Z',
    banned_until: null, deleted_at: null,
    app_metadata: { provider: 'email', approved_marker: 'preserve' }, user_metadata: { existing: true },
  }));
  return { registry, users, units };
}

test('planner exports an executable fail-closed, nonsecret plan', () => {
  assert.equal(typeof runtime.planProvision, 'function', 'planner export required');
  const f = fixture();
  const before = clone(f);
  const plan = runtime.planProvision(f.registry, f.users, f.units, staffInventory());
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.counts, { eligible: 57, linked: 10, missing: 47, create: 47, reuse: 0, reset: 9, preserve: 1 });
  assert.equal(plan.accounts.length, 57);
  assert.equal(plan.accounts.find(r => r.canonical_key === 'faisal').action, 'preserve');
  assert.equal(plan.accounts.find(r => r.canonical_key === 'person_11').memberships[0].unit_id, uuid(108));
  assert.equal(plan.accounts.find(r => r.canonical_key === 'person_11').memberships[1].unit_id, uuid(106));
  assert.equal(plan.accounts.find(r => r.canonical_key === 'person_12').memberships[0].unit_id, uuid(107));
  assert.deepEqual(f, before);
  assert.doesNotMatch(JSON.stringify(plan), /password|app_metadata|user_metadata/i);
});

function adapter(f = fixture()) {
  const state = { ...clone(f), profiles: new Map(), roles: new Map(), memberships: new Map(),
    operations: new Map(), generations: new Map(), passwords: new Map(), calls: [], created: 0 };
  const byKey = key => state.registry.find(r => r.canonical_key === key);
  const initial = runtime.planProvision(f.registry, f.users, f.units, staffInventory());
  for (const row of state.registry.filter(r => r.migrated_user_id)) {
    const id = row.migrated_user_id;
    state.profiles.set(id, { id, login_name: row.preferred_login, full_name: row.display_name,
      active: row.profile_active, must_change_password: row.profile_must_change });
    state.roles.set(id, [{ role_code: row.role_code, is_primary: true }]);
    const memberships = initial.accounts.find(a => a.canonical_key === row.canonical_key)?.memberships ||
      [{ unit_id: uuid(104), membership_role: 'manager', is_primary: true }];
    state.memberships.set(id, memberships.map(m => ({ ...m, active: true })));
    state.generations.set(id, 0);
  }
  const record = (method, data = {}) => state.calls.push({ method, ...data });
  const port = {
    targetUrl: 'https://movzojtnkkmdsjhmlgtq.supabase.co', transportMode: 'synthetic',
    async registry() { record('registry'); return clone(state.registry); },
    async units() { record('units'); return clone(state.units); },
    async listAllUsers() {
      // Deliberately inventory multiple pages, including the inactive extra.
      const all = [];
      for (let offset = 0; offset < state.users.length; offset += 3) {
        record('listUsersPage', { page: offset / 3 + 1 });
        all.push(...clone(state.users.slice(offset, offset + 3)));
      }
      return { users: all, complete: true };
    },
    async readAccount(key, authUserId = null) {
      record('readAccount', { key });
      const registry = byKey(key);
      const id = authUserId ?? registry?.migrated_user_id;
      return clone({ registry, profile: state.profiles.get(id) ?? null,
        roles: state.roles.get(id) ?? [], memberships: state.memberships.get(id) ?? [],
        login_conflicts: [...state.profiles.values()].filter(p => p.login_name === registry?.preferred_login && p.id !== id).map(p => p.id),
        credential_generation: state.generations.get(id) ?? 0,
        permission_overrides: [], page_overrides: [],
        has_password_operations: [...state.operations.values()].some(o => o.target_user_id === id),
      });
    },
    auth: {
      async getUserById(id) { record('getUserById', { id }); return clone(state.users.find(u => u.id === id)); },
      async createUser(payload) {
        record('createUser', { email: payload.email });
        assert.deepEqual(Object.keys(payload).sort(), ['email', 'email_confirm', 'password', 'user_metadata']);
        assert.equal(payload.email_confirm, true);
        assert.deepEqual(payload.user_metadata, { original_registration: { operation_id: uuid(9001), source_main: SOURCE_MAIN } });
        assert.ok(!state.users.some(u => u.email.toLowerCase() === payload.email.toLowerCase()), 'duplicate creation forbidden');
        const id = uuid(1000 + state.created++);
        const user = { id, email: payload.email, email_confirmed_at: '2026-10-05T00:00:00Z',
          banned_until: null, deleted_at: null, app_metadata: { provider: 'email' }, user_metadata: clone(payload.user_metadata) };
        state.passwords.set(id, payload.password);
        state.users.push(user);
        return clone(user);
      },
      async updateUserById() { assert.fail('retired reset adapter must never execute'); },
    },
    async rpc(name, p) {
      record(name, { key: p.p_key ?? p.p_target_key, operation_id: p.p_operation_id });
      if (name === 'account_provision_link_internal') {
        assert.deepEqual(Object.keys(p).sort(), ['p_auth_user', 'p_key', 'p_memberships']);
        const row = byKey(p.p_key);
        assert.equal(row.migrated_user_id, null, 'existing links must never be synchronized');
        row.migrated_user_id = p.p_auth_user;
        row.must_change_password = row.profile_active = row.profile_must_change = true;
        state.profiles.set(p.p_auth_user, { id: p.p_auth_user, login_name: row.preferred_login,
          full_name: row.display_name, active: true, must_change_password: true });
        state.roles.set(p.p_auth_user, [{ role_code: row.role_code, is_primary: true }]);
        state.memberships.set(p.p_auth_user, p.p_memberships.map(m => ({ ...m, active: true })));
        state.generations.set(p.p_auth_user, 0);
        return { ok: true, status: 'linked', target_user_id: p.p_auth_user, canonical_key: p.p_key, login_username: row.login_username };
      }
      assert.ok(!['account_password_maintenance_begin_internal', 'account_password_finish_internal'].includes(name), 'retired reset RPC forbidden');
      throw new Error('fixture_unknown_rpc');
    },
  };
  return { port, state };
}


// Transport fixtures are synthetic; execute the real planner/creator exports only.
const review = port => runtime.provisionAccounts(port, undefined, { mode: 'plan-only', staffInventory: staffInventory() });
function denyAdapterGetters(object, names) {
  for (const name of names) Object.defineProperty(object, name, { configurable: true,
    get() { assert.fail(`retired forbidden adapter getter: ${name}`); } });
}
function assertRetired(result, state) {
  assert.equal(result.status, 'blocked'); assert.equal(result.blocked.code, 'native_reset_endpoint_required');
  assert.equal(result.required_endpoint, 'account-admin-reset-password');
  assert.equal(result.created, 0); assert.equal(result.reset, 0); assert.equal(result.credentials.length, 0);
  assert.deepEqual(result.receipts, []); assert.equal(state.calls.length, 0);
}
function stateSnapshot(state) {
  const linked = state.registry.filter(r => r.migrated_user_id && (r.canonical_key === 'faisal' || /^person_[1-9]$/.test(r.canonical_key) || !r.eligible));
  return clone(linked.map(r => ({ registry: r, user: state.users.find(u => u.id === r.migrated_user_id),
    profile: state.profiles.get(r.migrated_user_id), roles: state.roles.get(r.migrated_user_id),
    memberships: state.memberships.get(r.migrated_user_id), generation: state.generations.get(r.migrated_user_id),
    operations: [...state.operations.values()].filter(o => o.target_user_id === r.migrated_user_id) })));
}
async function creator(f = fixture(), keys = staffInventory().canonical_keys.slice(10)) {
  const { port, state } = adapter(f); const prepared = await review(port); assert.equal(prepared.status, 'reviewed');
  assert.equal(new Set(state.calls.filter(c => c.method === 'readAccount').map(c => c.key)).size, 57, 'entire approved batch is validated before any write');
  port.linkCanonical = p => port.rpc('account_provision_link_internal', p);
  // The creator cannot even obtain reset, deletion or session-reset adapters.
  denyAdapterGetters(port.auth, ['updateUserById', 'deleteUser', 'resetPasswordForEmail']);
  const receipts = [], delivered = [];
  const approval = { approved: true, current_source: true, source_main: SOURCE_MAIN, staff_inventory: staffInventory(),
    canonical_keys: keys, operation_id: uuid(9001), expires_at: Date.now() + 60000,
    target: { origin: port.targetUrl, project_ref: 'movzojtnkkmdsjhmlgtq', official_admin: true } };
  const callbacks = {
    persistReceipt: async r => { receipts.push(clone(r)); return { persisted: true, operation_id: r.operation_id,
      sequence: r.sequence, write_allowed: r.phase === 'create_intent' }; },
    deliver: async c => { assert.ok(!JSON.stringify(c).includes(c.password));
      delivered.push({ canonical_key: c.canonical_key, login_username: state.registry.find(r => r.canonical_key === c.canonical_key).login_username,
        auth_user_id: c.target_user_id, password: c.password });
      return { acknowledged: true, operation_id: c.operation_id, target_user_id: c.target_user_id }; },
  };
  const build = (options = {}) => createOriginalStaffExecutor({ prepared, approval, port, ...callbacks, deadlineMs: 5000, executionMode: 'synthetic', ...options });
  state.calls.length = 0;
  return { port, state, prepared, approval, callbacks, receipts, delivered, build };
}

test('CREATE-separated: all 47 originals are created without resets, with unique memory-only delivery', async () => {
  const f = await creator();
  const protectedBefore = stateSnapshot(f.state);
  const runner = f.build(); const result = await runner.run();
  assert.equal(result.status, 'completed'); assert.equal(result.created, 47);
  assert.equal(result.reset, undefined, 'CREATE executor has no reset result/path');
  assert.equal(f.delivered.length, 47); assert.equal(new Set(f.delivered.map(c => c.password)).size, 47);
  assert.equal(f.state.users.length, 58);
  assert.equal(f.state.registry.filter(r => r.eligible && r.migrated_user_id).length, 57);
  assert.equal(f.state.calls.filter(c => c.method === 'createUser').length, 47);
  assert.equal(f.state.calls.filter(c => c.method === 'account_provision_link_internal').length, 47);
  assert.equal(runner.pendingCount(), 0);
  for (const c of f.delivered) {
    assert.ok(c.password.length >= 18 && c.password.length <= 20);
    for (const re of [/^[\x21-\x7e]+$/, /[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/]) assert.match(c.password, re);
    assert.equal(f.state.passwords.get(c.auth_user_id), c.password);
    const row = f.state.registry.find(r => r.canonical_key === c.canonical_key);
    assert.equal(c.login_username, row.login_username);
    assert.equal(row.must_change_password, true);
    assert.equal(f.state.profiles.get(c.auth_user_id).must_change_password, true);
    assert.ok(!JSON.stringify(result).includes(c.password));
    assert.ok(!JSON.stringify(f.receipts).includes(c.password));
  }
  assert.deepEqual(stateSnapshot(f.state), protectedBefore, 'all pre-existing original/excluded identity, authorization and private state preserved');
  assert.doesNotMatch(JSON.stringify(f.receipts), /password|metadata|secret|token/i);
  assert.deepEqual(result.receipts, f.receipts);
});

test('retired reset: fresh-metadata callbacks and all mutation getters remain unreachable', async () => {
  const { port, state } = adapter(); const before = stateSnapshot(state);
  denyAdapterGetters(port, ['registry', 'units', 'listAllUsers', 'readAccount', 'rpc', 'linkCanonical']);
  denyAdapterGetters(port.auth, ['getUserById', 'createUser', 'updateUserById']);
  const result = await runtime.provisionAccounts(port);
  assertRetired(result, state);
  assert.deepEqual(stateSnapshot(state), before, 'no metadata merge/reset is authorized by retired entry');
});

test('retired reset: operation generation and maintenance begin cannot be read or invoked', async () => {
  const { port, state } = adapter();
  state.generations.set(uuid(1), 23); state.operations.set(uuid(901), { target_user_id: uuid(1), generation: 23, status: 'pending' });
  const before = stateSnapshot(state);
  denyAdapterGetters(port, ['rpc', 'account_password_maintenance_begin_internal', 'account_password_finish_internal']);
  denyAdapterGetters(port.auth, ['updateUserById']);
  assertRetired(await runtime.provisionAccounts(port), state);
  assert.deepEqual(stateSnapshot(state), before, 'existing unresolved operation cannot be changed/released');
});

test('CREATE-separated: protected forced flags changed by the last link quarantine before delivery', async () => {
  const f = await creator(); const link = f.port.linkCanonical;
  f.port.linkCanonical = async p => { const r = await link(p); if (p.p_key === 'person_56') {
    f.state.registry[0].must_change_password = true; f.state.profiles.get(PROTECTED).must_change_password = true;
  } return r; };
  const runner = f.build(); const r = await runner.run();
  assert.equal(r.status, 'quarantined'); assert.equal(r.blocked.canonical_key, 'person_56');
  assert.equal(r.blocked.code, 'original_row_drift'); assert.equal(r.created, 46);
  assert.equal(runner.pendingCount(), 47, 'all successful/last unverified candidates retained');
  assert.equal(f.delivered.length, 0); runner.finalize('destroy'); assert.equal(runner.pendingCount(), 0);
});

test('CREATE-separated: complete protected profile drift at the last link prevents delivery', async () => {
  const f = await creator(); const link = f.port.linkCanonical;
  f.port.linkCanonical = async p => { const r = await link(p); if (p.p_key === 'person_56') {
    f.state.profiles.get(PROTECTED).job_title = 'unexpected fixture change';
    f.state.profiles.get(PROTECTED).legacy_source = 'unexpected fixture change';
  } return r; };
  const runner = f.build(); const r = await runner.run();
  assert.equal(r.status, 'quarantined'); assert.equal(r.blocked.code, 'protected_projection_drift');
  assert.equal(r.blocked.canonical_key, 'person_56'); assert.equal(runner.pendingCount(), 47);
  assert.equal(f.delivered.length, 0); runner.finalize('destroy');
});

test('CREATE-separated: protected generation and operation drift at the last link prevents delivery', async () => {
  const f = await creator(); const link = f.port.linkCanonical;
  f.port.linkCanonical = async p => { const r = await link(p); if (p.p_key === 'person_56') {
    f.state.generations.set(PROTECTED, 1); f.state.operations.set(uuid(901), { target_user_id: PROTECTED, generation: 1 });
  } return r; };
  const runner = f.build(); const r = await runner.run();
  assert.equal(r.status, 'quarantined'); assert.equal(r.blocked.code, 'protected_projection_drift');
  assert.equal(runner.pendingCount(), 47); assert.equal(f.delivered.length, 0); runner.finalize('destroy');
});

test('CREATE-separated: exact unlinked Auth reuse never creates duplicates or resets unknown credentials', async () => {
  const f = fixture(); const id = uuid(800);
  f.users.push({ ...clone(f.users[1]), id, email: f.registry[10].internal_email, user_metadata: { original: true } });
  const c = await creator(f, ['person_10']); const before = clone(c.state.users.find(u => u.id === id));
  assert.equal(c.prepared.plan.counts.create, 46); assert.equal(c.prepared.plan.counts.reuse, 1);
  assert.equal(c.prepared.execution.reset.length, 9, 'reuse never becomes an extra reset');
  const r = await c.build().run(); assert.equal(r.status, 'needs_private_original_password_delivery');
  assert.equal(r.created, 0); assert.equal(r.reused, 1); assert.equal(c.state.registry[10].migrated_user_id, id);
  assert.equal(c.state.calls.filter(x => x.method === 'createUser').length, 0); assert.equal(c.delivered.length, 0);
  assert.deepEqual(c.state.users.find(u => u.id === id), before);
  assert.deepEqual(r.needs_private_original_password_delivery, [{ canonical_key: 'person_10', target_user_id: id }]);
});

test('retired reset: provider timeout callback cannot run or generate a reset candidate', async () => {
  const { port, state } = adapter(); let attempts = 0;
  port.auth.updateUserById = async () => { attempts++; throw new Error('private-reset-timeout'); };
  let receipts = 0; const result = await runtime.provisionAccounts(port, () => { receipts++; throw new Error('private-receipt'); });
  assertRetired(result, state); assert.equal(attempts, 0); assert.equal(receipts, 0);
  assert.equal(state.passwords.size, 0); assert.equal(state.operations.size, 0);
  assert.doesNotMatch(JSON.stringify(result), /private-reset-timeout|private-receipt/);
});

test('CREATE-separated: unknown atomic link retains the created candidate without retry or delivery', async () => {
  const f = await creator(fixture(), ['person_10']);
  f.port.linkCanonical = async p => { f.state.calls.push({ method: 'linkCanonical', key: p.p_key }); throw new Error('private-link-timeout'); };
  const runner = f.build(); const r = await runner.run(); await runner.run();
  assert.equal(r.status, 'quarantined'); assert.equal(r.created, 0, 'unverified link is not completed CREATE');
  assert.equal(runner.pendingCount(), 1); assert.equal(f.state.passwords.size, 1);
  assert.equal(f.state.calls.filter(c => c.method === 'createUser').length, 1);
  assert.equal(f.state.calls.filter(c => c.method === 'linkCanonical').length, 1);
  assert.equal(f.state.registry[10].migrated_user_id, null); assert.equal(f.delivered.length, 0);
  assert.ok(r.receipts.some(c => c.phase === 'auth_proven' && c.ownership_proven === true));
  assert.ok(r.receipts.some(c => c.phase === 'quarantined' && c.can_retry_create === false));
  for (const pw of f.state.passwords.values()) assert.ok(!JSON.stringify(r).includes(pw));
  assert.doesNotMatch(JSON.stringify(r), /private-link-timeout/); runner.finalize('destroy');
});

test('CREATE-separated: unknown Auth creation retains candidate with no returned UUID and no retry', async () => {
  const f = await creator(fixture(), ['person_10']); const create = f.port.auth.createUser;
  let candidate; f.port.auth.createUser = async p => { candidate = p.password; await create(p); throw new Error(p.password); };
  const runner = f.build(); const r = await runner.run(); await runner.run();
  assert.equal(r.status, 'quarantined'); assert.equal(r.created, 0); assert.equal(runner.pendingCount(), 1);
  assert.equal(candidate, f.state.passwords.get(uuid(1000)));
  assert.equal(f.state.calls.filter(c => c.method === 'createUser').length, 1);
  assert.equal(f.state.calls.filter(c => c.method === 'account_provision_link_internal').length, 0);
  assert.equal(f.delivered.length, 0); assert.ok(!JSON.stringify(r).includes(candidate));
  assert.ok(r.receipts.some(c => c.phase === 'quarantined' && c.target_user_id === null && c.can_retry_create === false));
  runner.finalize('destroy'); assert.equal(runner.pendingCount(), 0);
});

test('plan-only: whole-batch profile conflicts reject before any CREATE or reset authorization', async () => {
  const { port, state } = adapter(); const read = port.readAccount.bind(port);
  port.readAccount = async (key, id) => { const s = await read(key, id); if (key === 'person_56') s.login_conflicts = [uuid(900)]; return s; };
  const r = await review(port); assert.equal(r.status, 'blocked'); assert.equal(r.blocked.code, 'profile_conflict');
  assert.equal(r.blocked.canonical_key, 'person_56'); assert.equal(r.credentials.length, 0);
  assert.equal(r.plan, undefined); assert.equal(r.baseline, undefined); assert.equal(state.created, 0); assert.equal(state.operations.size, 0);
  assert.equal(state.calls.filter(c => ['createUser', 'updateUserById'].includes(c.method)).length, 0);
});

test('retired reset: replay, wrong operation, target, generation or missing proof never reaches begin/update/finish', async () => {
  for (const mode of ['write_denied', 'wrong_operation', 'wrong_target', 'wrong_generation', 'proof_missing']) {
    const { port, state } = adapter();
    denyAdapterGetters(port, ['rpc', 'begin', 'finish', 'account_password_maintenance_begin_internal', 'account_password_finish_internal']);
    denyAdapterGetters(port.auth, ['updateUserById']);
    const r = await runtime.provisionAccounts(port, undefined, { mode, authorized: true, qaGatePassed: true });
    assertRetired(r, state); assert.equal(state.operations.size, 0, mode);
  }
});

test('target guard refuses old projects and unapproved URLs without even reading the adapter', async () => {
  const urls = ['https://urgkbbconlxeagfgyjee.supabase.co', 'https://movzojtnkkmdsjhmlgtq.supabase.co.evil.test',
    'http://movzojtnkkmdsjhmlgtq.supabase.co', 'https://movzojtnkkmdsjhmlgtq.supabase.co/api',
    'https://user@movzojtnkkmdsjhmlgtq.supabase.co', 'https://movzojtnkkmdsjhmlgtq.supabase.co?key=redacted',
    'https://movzojtnkkmdsjhmlgtq.supabase.co#x', 'not-a-url',
    ' https://movzojtnkkmdsjhmlgtq.supabase.co', 'https://movzojtnkkmdsjhmlgtq.supabase.co:443'];
  for (const url of urls) {
    const { port, state } = adapter(); port.targetUrl = url;
    const result = await runtime.provisionAccounts(port);
    assert.equal(result.status, 'blocked'); assert.equal(result.blocked.code, 'wrong_target');
    assert.equal(state.calls.length, 0); assert.equal(result.credentials.length, 0);
  }
});

test('plan-only: incomplete pagination is rejected before projections or any provisioning', async () => {
  const { port, state } = adapter(); port.listAllUsers = async () => ({ users: clone(state.users), complete: false });
  const r = await review(port); assert.equal(r.status, 'blocked'); assert.equal(r.blocked.code, 'incomplete_auth_inventory');
  assert.equal(state.calls.filter(c => c.method === 'readAccount').length, 0);
  assert.equal(state.created, 0); assert.equal(state.operations.size, 0); assert.equal(r.credentials.length, 0);
});

test('CREATE-separated: receipt callback failure stops before CREATE and sanitizes arbitrary messages', async () => {
  const f = await creator(fixture(), ['person_10']);
  const r = await f.build({ persistReceipt: async () => { throw Object.assign(new Error('private-adapter-message'), { code: 'private-adapter-code' }); } }).run();
  assert.equal(r.status, 'blocked'); assert.equal(r.blocked.code, 'uncertain_adapter_outcome');
  assert.equal(f.state.created, 0); assert.equal(f.state.operations.size, 0); assert.equal(f.delivered.length, 0);
  assert.ok(!JSON.stringify(r).includes('private-adapter'));
});

test('plan-only: exact original inventory ignores inactive extras without assuming 58 registry rows', async () => {
  const f = fixture(); for (let i = 0; i < 19; i++) f.registry.push({ canonical_key: `inactive_${i}`, eligible: false,
    migrated_user_id: null, dept_names: null, display_name: 'غير تشغيلي', must_change_password: false });
  assert.equal(f.registry.length, 77); const { port, state } = adapter(f); const before = clone(state.registry);
  const r = await review(port); assert.equal(r.status, 'reviewed'); assert.equal(r.execution.create.length, 47); assert.equal(r.execution.reset.length, 9);
  assert.equal(r.created, 0); assert.equal(r.reset, 0); assert.deepEqual(state.registry, before);
  assert.equal(state.calls.filter(c => c.method === 'readAccount' && c.key.startsWith('inactive_')).length, 0);
});

test('CREATE-separated: persisted provider proof drift after link stops before next original or delivery', async () => {
  const f = await creator(fixture(), ['person_10', 'person_11']); const link = f.port.linkCanonical;
  f.port.linkCanonical = async p => { const r = await link(p); f.state.users.find(u => u.id === p.p_auth_user).user_metadata.original_registration.operation_id = uuid(999); return r; };
  const runner = f.build(); const r = await runner.run();
  assert.equal(r.status, 'quarantined'); assert.equal(r.blocked.code, 'registration_marker_conflict');
  assert.equal(r.created, 0); assert.equal(runner.pendingCount(), 1); assert.equal(f.delivered.length, 0);
  assert.equal(f.state.calls.filter(c => c.method === 'createUser').length, 1); assert.equal(f.state.operations.size, 0); runner.finalize('destroy');
});

test('plan-only: missing official Auth metadata rejects without overwriting an empty object', async () => {
  const { port, state } = adapter(); const get = port.auth.getUserById.bind(port.auth);
  port.auth.getUserById = async id => { const u = await get(id); delete u.app_metadata; return u; };
  const r = await review(port); assert.equal(r.status, 'blocked'); assert.equal(r.blocked.code, 'invalid_auth_metadata');
  assert.equal(state.operations.size, 0); assert.equal(state.created, 0); assert.equal(r.credentials.length, 0);
});

test('planner declines ambiguous identity and unsafe baseline without exposing raw input', () => {
  const cases = [
    ['duplicate_auth_uuid', f => f.users.push(clone(f.users[0]))],
    ['duplicate_auth_email', f => f.users.push({ ...clone(f.users[1]), id: uuid(800) })],
    ['identity_conflict', f => { f.users[1].email = 'different@msajed.local'; }],
    ['email_case_drift', f => { f.users[1].email = f.users[1].email.toUpperCase(); }],
    ['duplicate_registry_key', f => { f.registry[11].canonical_key = f.registry[10].canonical_key; }],
    ['duplicate_registry_email', f => { f.registry[11].internal_email = f.registry[10].internal_email; }],
    ['duplicate_registry_username', f => { f.registry[11].login_username = f.registry[10].login_username; }],
    ['duplicate_preferred_login', f => { f.registry[11].preferred_login = f.registry[10].preferred_login; }],
    ['duplicate_registry_link', f => { f.registry[2].migrated_user_id = f.registry[1].migrated_user_id; }],
    ['invalid_username', f => { f.registry[10].login_username = 'staff019'; }],
    ['baseline_drift', f => { f.registry.pop(); f.registry.pop(); }],
    ['forced_flags_required', f => { f.registry[1].profile_must_change = false; }],
    ['forced_flags_required', f => { f.registry[10].must_change_password = false; }],
    ['protected_identity_conflict', f => { f.registry[0].must_change_password = true; }],
    ['protected_identity_conflict', f => { f.registry[0].migrated_user_id = uuid(900); }],
    ['duplicate_unit_uuid', f => f.units.push(clone(f.units[0]))],
    ['ambiguous_department', f => f.units.push({ ...clone(f.units[5]), id: uuid(999) })],
    ['ambiguous_department', f => { f.units[4].parent_id = uuid(103); }],
    ['auth_not_ready', f => { f.users[1].email_confirmed_at = null; }],
  ];
  for (const [code, mutate] of cases) {
    const f = fixture(); mutate(f);
    const result = runtime.planProvision(f.registry, f.users, f.units, staffInventory());
    assert.equal(result.status, 'blocked', code);
    assert.equal(result.blocked.code, code);
    assert.deepEqual(result.accounts, []);
  }
});

function withQa(f = fixture()) {
  for (let i = 0; i < 8; i++) {
    const row = { ...clone(f.registry[1]), canonical_key: `qa_${i}`, login_username: `qatester${i}`,
      preferred_login: `اختبار ${i}`, display_name: `اختبار ${i}`, internal_email: `qa-${i}@msajed.local`, migrated_user_id: uuid(700 + i) };
    f.registry.push(row);
    f.users.push({ ...clone(f.users[1]), id: row.migrated_user_id, email: row.internal_email });
  }
  return f;
}

test('reconcile: trusted real57 is reconciled separately from eligible QA8 and dynamic links', () => {
  const f = withQa();
  f.registry[10].migrated_user_id = uuid(810);
  f.registry[10].profile_active = f.registry[10].profile_must_change = true;
  f.users.push({ ...clone(f.users[1]), id: uuid(810), email: f.registry[10].internal_email });
  const before = clone(f);
  const plan = runtime.planProvision(f.registry, f.users, f.units, staffInventory());
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.counts, { eligible: 57, linked: 11, missing: 46, create: 46, reuse: 0, reset: 10, preserve: 1 });
  assert.equal(plan.accounts.length, 57);
  assert.ok(plan.accounts.every(a => staffInventory().canonical_keys.includes(a.canonical_key)));
  assert.deepEqual(f, before, 'all source and QA rows remain immutable');
});

test('reconcile: official omission or untyped ban/deletion facts cannot authorize readiness', () => {
  for (const [field, value] of [['banned_until', undefined], ['deleted_at', undefined], ['banned_until', false], ['deleted_at', 0]]) {
    const f = fixture();
    if (value === undefined) delete f.users[1][field]; else f.users[1][field] = value;
    const plan = runtime.planProvision(f.registry, f.users, f.units, staffInventory());
    assert.equal(plan.status, 'blocked', field);
    assert.equal(plan.blocked.code, 'auth_status_unknown', field);
  }
  for (const field of ['banned_until', 'deleted_at']) {
    const f = fixture(); f.users[1][field] = '2026-10-07T20:00:00Z';
    assert.equal(runtime.planProvision(f.registry, f.users, f.units, staffInventory()).blocked.code, 'auth_not_ready');
  }
});

test('reconcile: accepted existing password flags are preserved rather than reset again', () => {
  const f = withQa(); f.registry[1].must_change_password = f.registry[1].profile_must_change = false;
  const before = clone(f);
  const plan = runtime.planProvision(f.registry, f.users, f.units, staffInventory());
  assert.equal(plan.status, 'ready');
  assert.equal(plan.counts.reset, 8); assert.equal(plan.counts.preserve, 2);
  assert.equal(plan.accounts.find(a => a.canonical_key === 'person_1').action, 'preserve');
  assert.deepEqual(f, before);
});

test('reconcile: legacy mixed mutation entry is blocked before any adapter read or write', async () => {
  const { port, state } = adapter();
  const result = await runtime.provisionAccounts(port);
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocked.code, 'native_reset_endpoint_required');
  assert.equal(state.calls.length, 0, 'no original account operation is reachable');
  assert.equal(result.created, 0); assert.equal(result.reset, 0); assert.equal(result.credentials.length, 0);
  assert.equal(result.required_endpoint, 'account-admin-reset-password');
});

test('reconcile: plan-only entry freezes separate targets and preserves actual linked authorization', async () => {
  const { port, state } = adapter(withQa());
  const before = clone({ registry: state.registry, users: state.users, units: state.units });
  const read = port.readAccount.bind(port);
  port.readAccount = async (key, id) => {
    const snapshot = await read(key, id);
    snapshot.permission_overrides = []; snapshot.page_overrides = [];
    if (key === 'person_1') {
      snapshot.roles = [{ role_code: 'manager', is_primary: true }];
      snapshot.memberships = [{ unit_id: uuid(106), membership_role: 'manager', is_primary: true, active: true }];
      snapshot.permission_overrides = [{ permission_code: 'fixture.permission', effect: 'deny' }];
      snapshot.page_overrides = [{ page_code: 'fixture-page', effect: 'allow' }];
    }
    return snapshot;
  };
  for (const name of ['createUser', 'updateUserById']) Object.defineProperty(port.auth, name,
    { get() { assert.fail('plan-only cannot even obtain a write adapter'); } });
  Object.defineProperty(port, 'rpc', { get() { assert.fail('plan-only cannot obtain any SQL mutation adapter'); } });
  const result = await runtime.provisionAccounts(port, undefined, { mode: 'plan-only', staffInventory: staffInventory() });
  assert.equal(result.status, 'reviewed');
  assert.equal(result.plan.status, 'ready'); assert.equal(result.plan.accounts.length, 57);
  assert.equal(result.execution.status, 'blocked');
  assert.equal(result.execution.create.length, 47); assert.equal(result.execution.reuse.length, 0); assert.equal(result.execution.reset.length, 9);
  assert.equal(result.execution.required_endpoint, 'account-admin-reset-password');
  assert.ok(result.execution.blockers.includes('owned_qa_native_reset_gate_required'));
  assert.ok(result.execution.blockers.includes('parent_owned_native_endpoint_adapter_required'));
  assert.ok(result.execution.blockers.includes('provider_and_projection_readback_required'));
  assert.equal(result.baseline.accounts.person_1.projection.roles[0].role_code, 'manager');
  assert.equal(result.baseline.accounts.person_1.projection.memberships[0].unit_id, uuid(106));
  assert.equal(result.baseline.accounts.person_1.projection.permission_overrides[0].effect, 'deny');
  assert.equal(result.baseline.accounts.person_1.projection.page_overrides[0].effect, 'allow');
  assert.ok(Object.isFrozen(result.plan) && Object.isFrozen(result.plan.accounts) && Object.isFrozen(result.plan.accounts[11].memberships[0]));
  assert.ok(Object.isFrozen(result.execution.reset) && Object.isFrozen(result.baseline.accounts.person_1.projection.roles));
  assert.throws(() => { result.plan.accounts[0].preferred_login = 'changed'; }, TypeError);
  assert.equal(Object.keys(result).includes('baseline'), false, 'memory baseline is not a delivery artifact');
  assert.equal(new Set(state.calls.filter(c => c.method === 'readAccount').map(c => c.key)).size, 57);
  assert.equal(state.calls.filter(c => c.method === 'getUserById').length, 10);
  assert.deepEqual({ registry: state.registry, users: state.users, units: state.units }, before);
  assert.equal(result.created, 0); assert.equal(result.reset, 0); assert.equal(result.credentials.length, 0);
});

test('reconcile: a case-variant excluded owner UUID blocks Auth reuse', () => {
  const f = withQa();
  const owner = f.registry.find(row => row.canonical_key === 'qa_0');
  owner.migrated_user_id = 'ABCDEF00-0000-4000-8000-000000000700';
  const user = f.users.find(row => row.id === uuid(700));
  user.id = owner.migrated_user_id.toLowerCase(); user.email = f.registry[10].internal_email;
  const result = runtime.planProvision(f.registry, f.users, f.units, staffInventory());
  assert.equal(result.status, 'blocked'); assert.equal(result.blocked.code, 'identity_conflict');
});

test('reconcile: late projection conflicts retain exact target and produce zero write candidates', async () => {
  const { port, state } = adapter(withQa());
  const read = port.readAccount.bind(port);
  port.readAccount = async (key, id) => {
    const snapshot = await read(key, id);
    if (key === 'person_56') snapshot.login_conflicts = [uuid(900)];
    return snapshot;
  };
  const result = await runtime.provisionAccounts(port, undefined, { mode: 'plan-only', staffInventory: staffInventory() });
  assert.equal(result.status, 'blocked'); assert.equal(result.blocked.code, 'profile_conflict');
  assert.equal(result.blocked.canonical_key, 'person_56');
  assert.equal(result.plan, undefined); assert.equal(result.baseline, undefined);
  assert.equal(result.created, 0); assert.equal(result.reset, 0); assert.equal(result.credentials.length, 0);
  assert.equal(state.operations.size, 0); assert.equal(state.created, 0);
});

test('reconcile: scope is exact, independently approved and never inferred from row order or prefixes', () => {
  const f = withQa();
  for (const inventory of [undefined, { ...staffInventory(), source_main: 'other' },
    { ...staffInventory(), authority: 'prefix-filter' },
    { ...staffInventory(), canonical_keys: Array(57).fill('faisal') },
    { ...staffInventory(), canonical_keys: staffInventory().canonical_keys.slice(1) }]) {
    const result = runtime.planProvision(f.registry, f.users, f.units, inventory);
    assert.equal(result.status, 'blocked'); assert.equal(result.blocked.code, 'staff_inventory_required');
  }
  const unknown = staffInventory(); unknown.canonical_keys[56] = 'not_in_registry';
  assert.equal(runtime.planProvision(f.registry, f.users, f.units, unknown).blocked.code, 'baseline_drift');
  const renamed = clone(f); renamed.registry[10].canonical_key = 'qa_like_original';
  const exact = staffInventory(); exact.canonical_keys[10] = 'qa_like_original';
  const result = runtime.planProvision(renamed.registry.reverse(), renamed.users, renamed.units, exact);
  assert.equal(result.status, 'ready'); assert.equal(result.accounts.length, 57);
  assert.equal(result.accounts.find(a => a.canonical_key === 'qa_like_original').login_username, f.registry[10].login_username);
  assert.ok(!result.accounts.some(a => a.canonical_key === 'qa_0'));
  for (const field of ['internal_email', 'login_username', 'preferred_login']) {
    const conflict = clone(f); conflict.registry.find(r => r.canonical_key === 'qa_0')[field] = conflict.registry[10][field];
    assert.equal(runtime.planProvision(conflict.registry, conflict.users, conflict.units, staffInventory()).status, 'blocked', field);
  }
});

test('reconcile: all57 linked is valid and exact unlinked Auth reuse remains credential-free', async () => {
  const all = fixture();
  for (let i = 10; i < 57; i++) {
    const row = all.registry[i]; row.migrated_user_id = uuid(2000 + i);
    row.profile_active = row.profile_must_change = true;
    all.users.push({ ...clone(all.users[1]), id: row.migrated_user_id, email: row.internal_email });
  }
  const done = runtime.planProvision(all.registry, all.users, all.units, staffInventory());
  assert.equal(done.status, 'ready'); assert.equal(done.counts.linked, 57); assert.equal(done.counts.create, 0); assert.equal(done.counts.reset, 56);
  const f = withQa(); const id = uuid(800);
  f.users.push({ ...clone(f.users[1]), id, email: f.registry[10].internal_email });
  const { port, state } = adapter(f); const before = clone(state.registry);
  const result = await runtime.provisionAccounts(port, undefined, { mode: 'plan-only', staffInventory: staffInventory() });
  assert.equal(result.status, 'reviewed'); assert.equal(result.execution.create.length, 46);
  assert.equal(result.execution.reuse.length, 1); assert.equal(result.execution.reset.length, 9);
  assert.equal(result.execution.reuse[0].auth_user_id, id);
  assert.deepEqual(Object.keys(result.execution.reset[0]).sort(), ['auth_user_id', 'canonical_key', 'login_username'], 'reset adapter cannot receive role or membership templates');
  assert.equal(result.credentials.length, 0); assert.deepEqual(state.registry, before);
  assert.equal(state.calls.filter(c => c.method === 'createUser' || c.method === 'updateUserById').length, 0);
});

test('reconcile: plan-only pagination, exact official GET facts and full authorization fail closed', async () => {
  for (const mode of ['incomplete', 'get_omitted_ban', 'get_omitted_delete', 'get_wrong_uid', 'get_deleted', 'missing_overrides', 'ambiguous_root', 'protected_flag', 'raw_failure']) {
    const { port, state } = adapter(withQa());
    if (mode === 'incomplete') port.listAllUsers = async () => ({ users: clone(state.users), complete: false });
    if (mode.startsWith('get_')) {
      const get = port.auth.getUserById.bind(port.auth);
      port.auth.getUserById = async id => {
        const user = await get(id);
        if (mode === 'get_omitted_ban') delete user.banned_until;
        if (mode === 'get_omitted_delete') delete user.deleted_at;
        if (mode === 'get_wrong_uid') user.id = uuid(900);
        if (mode === 'get_deleted') user.deleted_at = '2026-10-07T20:00:00Z';
        return user;
      };
    }
    if (mode === 'missing_overrides') {
      const read = port.readAccount.bind(port);
      port.readAccount = async (key, id) => { const row = await read(key, id); delete row.permission_overrides; return row; };
    }
    if (mode === 'ambiguous_root') state.units.push({ ...clone(state.units[0]), id: uuid(900) });
    if (mode === 'protected_flag') state.registry[0].profile_must_change = true;
    if (mode === 'raw_failure') port.registry = async () => { throw new Error('raw-private-input-never-reflected'); };
    const result = await runtime.provisionAccounts(port, undefined, { mode: 'plan-only', staffInventory: staffInventory() });
    assert.equal(result.status, 'blocked', mode); assert.equal(result.created, 0); assert.equal(result.reset, 0);
    assert.equal(result.credentials.length, 0); assert.equal(result.plan, undefined); assert.equal(result.baseline, undefined);
    assert.equal(state.created, 0); assert.equal(state.operations.size, 0);
    assert.doesNotMatch(JSON.stringify(result), /raw-private-input/);
    if (mode === 'incomplete') assert.equal(state.calls.filter(c => c.method === 'readAccount').length, 0);
  }
  const { port, state } = adapter();
  const result = await runtime.provisionAccounts(port, undefined, { mode: 'execute', authorized: true, qaGatePassed: true, nativeEndpoint: 'account-admin-reset-password' });
  assert.equal(result.blocked.code, 'native_reset_endpoint_required'); assert.equal(state.calls.length, 0);
});
