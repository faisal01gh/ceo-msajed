// Actual handler and pinned SDK. Only provider fetch and Deno.serve are captured.
// Synthetic transport tests under --deny-net; no native Auth, SQL, RLS or live proof.
const SOURCE = new URL('../supabase/functions/transactions-api/index.ts', import.meta.url);
const BASE = 'https://runtime-authz-fixture.invalid';
const uid = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const actor = uid(1), txid = uid(2), reqid = uid(3), actionid = uid(4), unit = uid(5), root = uid(6);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const sha = async (v: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))].map(x => x.toString(16).padStart(2, '0')).join('');
type Override = { permission_code: string; effect: string };
type Spec = {
  id: string; action?: string; type?: string; role?: string; grants?: string[];
  accountOverrides?: Override[]; userOverrides?: Override[]; lookupFailure?: string;
  flags?: Record<string, boolean>; tx?: Record<string, unknown>; meta?: Record<string, unknown>;
  body?: Record<string, unknown>; targetRole?: string; foreignTarget?: boolean;
  otherAuthor?: boolean; missingParent?: boolean; countFailure?: string; countMissing?: string;
  existing?: string; expected: number; error?: string; outcome?: string;
};
const closeGrant = ['transactions.close'];
const override = (permission_code: string, effect = 'deny'): Override => ({ permission_code, effect });
const specs: Spec[] = [];
for (const lookupFailure of ['user_roles', 'role_permissions', 'account_migration_users', 'account_permission_overrides', 'user_permissions']) {
  specs.push({ id: 'SRC02-lookup-' + lookupFailure, action: 'close', grants: closeGrant,
    lookupFailure,
    accountOverrides: lookupFailure === 'role_permissions' ? [override('transactions.close', 'allow')] :
      ['account_migration_users', 'account_permission_overrides'].includes(lookupFailure) ? [override('transactions.close')] : [],
    userOverrides: lookupFailure === 'user_permissions' ? [override('transactions.close')] : [],
    expected: 401, error: 'unauthorized' });
}
specs.push(
  { id: 'SRC02-account-deny-over-role', action: 'close', grants: closeGrant, accountOverrides: [override('transactions.close')], expected: 403, error: 'forbidden' },
  { id: 'SRC02-account-allow-over-default-off', action: 'close', grants: [], accountOverrides: [override('transactions.close', 'allow')], expected: 200, outcome: 'closed' },
  { id: 'SRC02-user-deny-final', action: 'close', grants: closeGrant, accountOverrides: [override('transactions.close', 'allow')], userOverrides: [override('transactions.close')], expected: 403, error: 'forbidden' },
  { id: 'SRC02-user-allow-final', action: 'close', grants: closeGrant, accountOverrides: [override('transactions.close')], userOverrides: [override('transactions.close', 'allow')], expected: 200, outcome: 'closed' },
);

// SRC01: a decision must not bypass the permission or direct-action authority.
for (const [type, permission, outcome] of [
  ['close', 'transactions.close', 'closed'], ['reopen', 'transactions.reopen', 'open'],
  ['extension', 'transactions.set_due_date', 'extension'], ['change_responsible', 'transactions.change_responsible', 'responsible'],
]) {
  const tx = { status: type === 'reopen' ? 'closed' : 'open' };
  specs.push(
    { id: 'SRC01-' + type + '-user-deny', type, tx, grants: [permission], userOverrides: [override(permission)], expected: 403, error: 'forbidden' },
    { id: 'SRC01-' + type + '-default-off', type, tx, grants: [], expected: 403, error: 'forbidden' },
    { id: 'SRC01-' + type + '-role-allow', type, tx, grants: [permission], expected: 200, outcome },
    { id: 'SRC01-' + type + '-explicit-allow', type, tx, grants: [], userOverrides: [override(permission, 'allow')], expected: 200, outcome },
    { id: 'SRC01-' + type + '-reject-with-denied-permission', type, tx, grants: [], userOverrides: [override(permission)], body: { approve: false, decision_reason: 'synthetic rejection' }, expected: 200, outcome: 'rejected' },
    { id: 'SRC01-' + type + '-invisible', type, tx, grants: [permission, 'transactions.act_all'], flags: { visible: false }, expected: 403, error: 'forbidden' },
    { id: 'SRC01-' + type + '-out-of-scope', type, tx, grants: [permission], flags: { scope: false, incoming: false }, expected: 403, error: 'forbidden' },
    { id: 'SRC01-' + type + '-incompatible-state', type, tx: { status: type === 'reopen' ? 'open' : 'closed' }, grants: [permission], expected: 409, error: 'invalid_state' },
    { id: 'SRC01-' + type + '-cancelled-state', type, tx: { status: 'cancelled' }, grants: [permission, 'transactions.act_all'], expected: 409, error: 'invalid_state' },
  );
  for (const role of ['ceo', 'ceo_office_manager', 'ceo_secretary']) specs.push({ id: 'SRC01-' + type + '-' + role + '-deny-beats-act-all', type, role, tx,
    grants: [permission, 'transactions.act_all'], userOverrides: [override(permission)], meta: { target_role: 'ceo' }, expected: 403, error: 'forbidden' });
}
specs.push(
  { id: 'SRC01-close-forward-denied-before-writes', tx: { close_level: 'ceo' }, grants: closeGrant, userOverrides: [override('transactions.close')], expected: 403, error: 'forbidden' },
  { id: 'SRC01-close-forward-preserved', tx: { close_level: 'ceo' }, grants: closeGrant, expected: 200, outcome: 'forwarded' },
  { id: 'SRC01-close-forwarded-next-level-deny', role: 'assistant', tx: { close_level: 'assistant' }, grants: closeGrant, userOverrides: [override('transactions.close')], meta: { target_role: 'assistant', requester_role: 'manager', forwarded_from_request: uid(80) }, expected: 403, error: 'forbidden' },
  { id: 'SRC01-close-forwarded-next-level-allow', role: 'assistant', tx: { close_level: 'assistant' }, grants: closeGrant, meta: { target_role: 'assistant', requester_role: 'manager', forwarded_from_request: uid(80) }, expected: 200, outcome: 'closed' },
  { id: 'SRC01-secretary-not-assistant', role: 'assistant_secretary', grants: closeGrant, meta: { target_role: 'assistant' }, expected: 403, error: 'forbidden' },
  { id: 'SRC01-reopen-higher-authority-required', type: 'reopen', tx: { status: 'closed', close_level: 'ceo' }, grants: ['transactions.reopen'], expected: 403, error: 'forbidden' },
  { id: 'SRC01-reopen-legacy-target-out-of-scope', type: 'reopen', tx: { status: 'closed', origin: 'legacy', responsible_login_name: null }, grants: ['transactions.reopen'], meta: { responsible_unit_id: uid(98), responsible_login_name: 'fixture_target' }, expected: 403, error: 'forbidden_scope' },
  { id: 'SRC01-extension-higher-authority-required', type: 'extension', tx: { current_level: 'ceo' }, grants: ['transactions.set_due_date'], expected: 403, error: 'forbidden' },
  { id: 'SRC01-responsible-manager-target-out-of-scope', type: 'change_responsible', grants: ['transactions.change_responsible'], foreignTarget: true, expected: 403, error: 'forbidden' },
  { id: 'SRC01-responsible-assistant-target-out-of-scope', type: 'change_responsible', role: 'assistant', grants: ['transactions.change_responsible'], foreignTarget: true, expected: 403, error: 'forbidden' },
  { id: 'SRC01-responsible-manager-higher-level', type: 'change_responsible', tx: { current_level: 'assistant' }, grants: ['transactions.change_responsible'], expected: 403, error: 'forbidden' },
  { id: 'SRC01-responsible-assistant-higher-level', type: 'change_responsible', role: 'assistant', tx: { current_level: 'ceo' }, grants: ['transactions.change_responsible'], expected: 403, error: 'forbidden' },
  { id: 'SRC01-responsible-delegated-act-all', type: 'change_responsible', tx: { current_level: 'assistant' }, grants: ['transactions.change_responsible', 'transactions.act_all'], expected: 200, outcome: 'responsible' },
  { id: 'SRC01-cancel-existing-role-scope-contract', type: 'cancel', grants: [], expected: 200, outcome: 'cancelled' },
  { id: 'SRC01-cancel-out-of-scope', type: 'cancel', grants: [], flags: { scope: false, incoming: false }, expected: 403, error: 'forbidden' },
  { id: 'SRC01-cancel-closed-state', type: 'cancel', grants: [], tx: { status: 'closed' }, expected: 409, error: 'invalid_state' },
  { id: 'SRC01-cancel-rejection-preserved', type: 'cancel', grants: [], body: { approve: false, decision_reason: 'synthetic rejection' }, expected: 200, outcome: 'rejected' },
);

const revise = (id: string, extra: Partial<Spec> = {}): Spec => ({ id: 'SRC03-revise-' + id, action: 'revise_action', grants: [], expected: 403, error: 'forbidden', ...extra });
specs.push(
  revise('author-invisible', { flags: { visible: false } }),
  revise('act-all-invisible', { grants: ['transactions.act_all'], otherAuthor: true, flags: { visible: false } }),
  revise('author-lost-scope', { flags: { scope: false, incoming: false } }),
  revise('manager-higher-level', { tx: { current_level: 'ceo' }, flags: { incoming: false } }),
  revise('closed', { tx: { status: 'closed' }, grants: ['transactions.act_all'] }),
  revise('cancelled', { tx: { status: 'cancelled' } }),
  revise('missing-parent', { missingParent: true, expected: 404, error: 'not_found' }),
  revise('other-author', { otherAuthor: true }),
  revise('secretary-read-only', { role: 'assistant_secretary', flags: { incoming: false } }),
  revise('author-still-authorized', { expected: 200, outcome: 'revised' }),
  revise('employee-assigned-author', { role: 'employee', flags: { scope: false }, expected: 200, outcome: 'revised' }),
  revise('delegated-act-all', { grants: ['transactions.act_all'], otherAuthor: true, flags: { scope: false, incoming: false }, expected: 200, outcome: 'revised' }),
);

const route = (id: string, extra: Partial<Spec> = {}): Spec => ({ id: 'SRC03-route-' + id, action: 'route_exec_assistant', role: 'ceo', grants: ['transactions.raise_assistant'], expected: 403, error: 'forbidden', ...extra });
specs.push(
  route('invisible', { flags: { visible: false } }),
  route('closed', { tx: { status: 'closed' } }),
  route('cancelled', { tx: { status: 'cancelled' } }),
  route('missing-permission', { grants: [] }),
  route('explicit-deny', { grants: ['transactions.raise_assistant', 'transactions.act_all'], userOverrides: [override('transactions.raise_assistant')] }),
  route('assistant-cannot-impersonate-exec', { role: 'assistant' }),
  route('secretary-not-assistant-or-exec', { role: 'assistant_secretary' }),
  route('target-secretary-not-assistant', { targetRole: 'assistant_secretary', expected: 400, error: 'invalid_target' }),
  route('target-manager-not-assistant', { targetRole: 'manager', expected: 400, error: 'invalid_target' }),
  route('target-missing', { body: { to_login: 'fixture_absent' }, expected: 400, error: 'invalid_target' }),
  route('missing-parent', { missingParent: true, expected: 404, error: 'not_found' }),
  route('valid-assistant', { expected: 200, outcome: 'routed' }),
  route('exec-visible-broader-scope', { flags: { scope: false, incoming: false }, expected: 200, outcome: 'routed' }),
);

const deletion = (id: string, extra: Partial<Spec> = {}): Spec => ({ id: 'SRC03-delete-' + id, action: 'delete_hard', grants: ['transactions.delete_hard'], expected: 403, error: 'forbidden', ...extra });
specs.push(
  deletion('invisible', { flags: { visible: false }, grants: ['transactions.delete_hard', 'transactions.act_all'] }),
  deletion('view-only-out-of-scope', { flags: { scope: false, incoming: false }, grants: ['transactions.delete_hard', 'transactions.view_all'] }),
  deletion('closed', { tx: { status: 'closed' } }),
  deletion('cancelled', { tx: { status: 'cancelled' }, grants: ['transactions.delete_hard', 'transactions.act_all'] }),
  deletion('workflow-started', { tx: { workflow_started: true }, expected: 409, error: 'workflow_started' }),
  deletion('missing-permission', { grants: ['transactions.act_all'] }),
  deletion('ceo-explicit-deny', { role: 'ceo', grants: ['transactions.delete_hard', 'transactions.act_all'], userOverrides: [override('transactions.delete_hard')] }),
  deletion('secretary-read-only', { role: 'assistant_secretary', flags: { incoming: false } }),
  deletion('missing-parent', { missingParent: true, expected: 404, error: 'not_found' }),
  deletion('empty-before-workflow', { expected: 200, outcome: 'deleted' }),
  deletion('authorized-assigned-creator', { role: 'employee', flags: { scope: false }, expected: 200, outcome: 'deleted' }),
);
for (const table of ['transaction_routes', 'transaction_actions', 'transaction_assignments']) specs.push(
  deletion('existing-' + table, { existing: table, expected: 409, error: 'workflow_started' }),
  deletion('count-error-' + table, { countFailure: table, expected: 503, error: 'delete_precheck_failed' }),
  deletion('count-unavailable-' + table, { countMissing: table, expected: 503, error: 'delete_precheck_failed' }),
);

function seed(s: Spec) {
  const account = (n: number, login: string, role: string) => ({ canonical_key: login, preferred_login: login, display_name: login,
    role_code: role, org_name: 'synthetic sector', dept_names: ['synthetic department'], migrated_user_id: uid(n), eligible: true });
  const accounts = [account(1, 'fixture_actor', s.role || 'manager'), account(11, 'fixture_requester', 'employee'),
    account(12, 'fixture_target', s.targetRole || 'assistant'), account(13, 'fixture_ceo', 'ceo')];
  if (s.foreignTarget) { accounts[2].org_name = 'other sector'; accounts[2].dept_names = ['other department']; }
  accounts.push(account(999, 'synthetic_faisal_protected', 'employee'));
  const transaction = { id: txid, number: 'SYNTHETIC-1', title: 'synthetic transaction', status: 'open', origin: 'new',
    current_level: 'manager', close_level: 'manager', responsible_unit_id: unit, responsible_login_name: 'fixture_actor',
    responsible_name: 'fixture_actor', workflow_started: false, due_at: '2026-11-01T00:00:00.000Z', ...s.tx };
  const tables: Record<string, any[]> = {
    user_roles: [{ user_id: actor, role_code: s.role || 'manager' }],
    role_permissions: (s.grants ?? closeGrant).map(permission_code => ({ role_code: s.role || 'manager', permission_code })),
    account_permission_overrides: (s.accountOverrides || []).map(x => ({ canonical_key: 'fixture_actor', ...x })),
    user_permissions: (s.userOverrides || []).map(x => ({ user_id: actor, ...x })), account_migration_users: accounts,
    profiles: accounts.map(a => ({ id: a.migrated_user_id, login_name: a.preferred_login, active: true })),
    organizational_units: [{ id: root, name: 'synthetic sector', parent_id: null, unit_type: 'sector', active: true },
      { id: unit, name: 'synthetic department', parent_id: root, unit_type: 'department', active: true }],
    transactions: s.missingParent ? [] : [transaction], transaction_routes: [], transaction_assignments: [], transaction_assignment_targets: [],
    transaction_actions: [], transaction_action_versions: [], transaction_action_notes: [], transaction_periods: [],
    transaction_requests: [{ id: reqid, transaction_id: txid, request_type: s.type || 'close', status: 'pending',
      requested_by_login_name: 'fixture_requester', requested_by_name: 'fixture_requester', reason: 'synthetic reason',
      requested_due_at: '2026-12-01T00:00:00.000Z', meta: { requester_role: 'employee', to_login: 'fixture_target', ...s.meta } }],
    transaction_history: [], audit_log: [], notifications: [],
    protected_faisal_sentinel: [{ id: uid(999), label: 'Faisal synthetic protected sentinel', permissions: ['unchanged'], state: 'unchanged' }],
  };
  // Protected synthetic account and transaction live in the same business tables.
  tables.user_roles.push({ user_id: uid(999), role_code: 'employee' });
  tables.user_permissions.push({ user_id: uid(999), permission_code: 'transactions.close', effect: 'deny' });
  tables.transactions.push({ ...transaction, id: uid(998), title: 'Faisal protected synthetic transaction', responsible_login_name: 'synthetic_faisal_protected', responsible_user_id: uid(999) });
  if (s.action === 'revise_action') {
    tables.transaction_actions.push({ id: actionid, transaction_id: txid, actor_name: s.otherAuthor ? 'fixture_requester' : 'fixture_actor', current_version: 1, action_text: 'original', status: 'recorded' });
    tables.transaction_action_versions.push({ id: uid(30), action_id: actionid, version_no: 1, body: 'original', actor_name: 'fixture_actor' });
  }
  if (s.existing) tables[s.existing].push({ id: uid(31), transaction_id: txid, status: 'completed' });
  return { tables, sequence: 1000 };
}
function matches(row: any, p: URLSearchParams) {
  for (const [k, v] of p) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(k)) continue;
    if (v.startsWith('eq.')) { if (String(row[k]) !== v.slice(3)) return false; }
    else if (v.startsWith('is.')) { if (v === 'is.null' ? row[k] != null : String(row[k]) !== v.slice(3)) return false; }
    else if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').includes(String(row[k]))) return false; }
    else throw new Error('fixture_filter_unsupported');
  }
  return true;
}
async function probe(s: Spec) {
  const originalFetch = globalThis.fetch, originalServe = Deno.serve, originalError = console.error;
  const oldURL = Deno.env.get('SUPABASE_URL'), oldKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let denialVerified = false;
  try { await originalFetch('https://must-not-connect.invalid'); }
  catch (e) { denialVerified = e instanceof Deno.errors.NotCapable || e instanceof Deno.errors.PermissionDenied; }
  if (!denialVerified) throw new Error('fixture_requires_deny_net');
  const state = seed(s), before = clone(state), intents: string[] = [], reads: string[] = [], unsupported: string[] = [];
  let handler: ((r: Request) => Promise<Response>) | undefined, status = 0, result: any, thrown = false;
  let failureInjected = false, rawErrorLogged = false;
  Deno.env.set('SUPABASE_URL', BASE);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', crypto.randomUUID());
  console.error = (...args: any[]) => { if (args.some(x => String(x?.message || x).includes('synthetic_db_private'))) rawErrorLogged = true; };
  try {
    globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method || request?.method || 'GET', table = url.pathname.split('/').at(-1)!;
      if (url.origin !== BASE) { unsupported.push('origin'); throw new Error('fixture_origin_unsupported'); }
      if (url.pathname === '/auth/v1/user' && method === 'GET') { reads.push('auth'); return Response.json({ id: actor, email: 'fixture@owned.invalid' }); }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        reads.push(table);
        if (table === 'account_session_check_internal') return Response.json(true);
        if (table === 'user_context_internal') return Response.json({ login_name: 'fixture_actor', full_name: 'fixture_actor', role: s.role || 'manager', org_name: 'synthetic sector', dept_names: ['synthetic department'], active: true, must_change_password: false });
        if (table === 'transaction_feedback_flags_internal') return Response.json({ visible: true, incoming: true, scope: true, shared: false, current_assignees: [], ...s.flags });
        // Every other RPC is a write intent, including sequence allocation.
        intents.push('RPC ' + table); unsupported.push('rpc'); throw new Error('fixture_rpc_unsupported');
      }
      if (!['GET', 'HEAD'].includes(method)) intents.push(method + ' ' + table);
      else reads.push(table);
      if (!(table in state.tables)) { unsupported.push('table'); throw new Error('fixture_table_unsupported'); }
      if ((method === 'GET' && s.lookupFailure === table && (table !== 'account_migration_users' || url.searchParams.get('select') === 'canonical_key')) || (method === 'HEAD' && s.countFailure === table)) {
        failureInjected = true;
        return Response.json({ code: 'XX000', message: 'synthetic_db_private', details: 'synthetic_db_private', hint: 'synthetic_db_private' }, { status: 500 });
      }
      let rows = state.tables[table].filter(row => matches(row, url.searchParams));
      const limit = url.searchParams.get('limit'); if (limit) rows = rows.slice(0, Number(limit));
      if (method === 'HEAD') return new Response(null, { headers: s.countMissing === table ? {} : { 'content-range': '*/' + rows.length } });
      if (method === 'GET') {
        const result = clone(rows);
        if (table === 'transaction_assignments') for (const r of result) r.transaction_assignment_targets = clone(state.tables.transaction_assignment_targets.filter(t => t.assignment_id === r.id));
        return Response.json(result);
      }
      const raw = init?.body ?? (request ? await request.clone().text() : null), body = typeof raw === 'string' && raw ? JSON.parse(raw) : null;
      let affected: any[] = [];
      if (method === 'POST') { affected = (Array.isArray(body) ? body : [body]).map(row => ({ id: uid(state.sequence++), ...clone(row) })); state.tables[table].push(...affected); }
      else if (method === 'PATCH') { affected = rows; for (const row of rows) Object.assign(row, clone(body)); }
      else if (method === 'DELETE') { affected = rows; state.tables[table] = state.tables[table].filter(row => !rows.includes(row)); }
      else { unsupported.push('method'); throw new Error('fixture_method_unsupported'); }
      const accept = new Headers(init?.headers || request?.headers).get('accept');
      return Response.json(accept?.includes('application/vnd.pgrst.object+json') ? (affected[0] || null) : clone(affected), { status: method === 'POST' ? 201 : 200 });
    };
    Object.defineProperty(Deno, 'serve', { value: (fn: any) => { handler = fn; return {}; }, configurable: true });
    await import(SOURCE.href + '?authz=' + crypto.randomUUID());
    if (!handler) throw new Error('fixture_handler_missing');
    const token = [crypto.randomUUID(), btoa(JSON.stringify({ sub: actor, iss: BASE + '/auth/v1', role: 'authenticated', session_id: crypto.randomUUID() })), crypto.randomUUID()].join('.');
    const response = await handler(new Request('https://runtime-client.invalid', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://runtime-client.invalid' },
      body: JSON.stringify({ app: 'new', token, action: s.action || 'decide_request', transaction_id: txid, request_id: reqid, action_id: actionid,
        reason: 'synthetic reason', text: 'revised', to_login: 'fixture_target', directive: 'synthetic directive', approve: true, ...s.body }) }));
    status = response.status; result = await response.json();
  } catch { thrown = true; }
  finally {
    globalThis.fetch = originalFetch; console.error = originalError;
    Object.defineProperty(Deno, 'serve', { value: originalServe, configurable: true });
    if (oldURL === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', oldURL);
    if (oldKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY'); else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', oldKey);
  }
  const failures: string[] = [];
  const check = (ok: unknown, reason: string) => { if (!ok) failures.push(reason); };
  check(!thrown, 'handler must return a response'); check(unsupported.length === 0, 'unhandled fixture transport');
  check(reads.includes('auth') && reads.includes('account_session_check_internal'), 'actual SDK auth/session required');
  check(status === s.expected, 'expected status ' + s.expected + ', got ' + status);
  const unchanged = JSON.stringify(before) === JSON.stringify(state);
  check(JSON.stringify(before.tables.protected_faisal_sentinel) === JSON.stringify(state.tables.protected_faisal_sentinel), 'protected Faisal synthetic sentinel changed');
  const protectedRows = (v: typeof state) => Object.fromEntries(Object.entries(v.tables).map(([table, rows]) => [table, rows.filter(r => r.id === uid(998) || r.id === uid(999) || r.user_id === uid(999) || r.migrated_user_id === uid(999))]));
  const protectedBusinessUnchanged = JSON.stringify(protectedRows(before)) === JSON.stringify(protectedRows(state));
  check(protectedBusinessUnchanged, 'protected Faisal synthetic business rows changed');
  check(!JSON.stringify(result || {}).includes('synthetic_db_private') && !rawErrorLogged, 'provider details leaked');
  if (s.lookupFailure || s.countFailure) check(failureInjected, 'failure injection not reached');
  if (s.expected >= 400) {
    check(result?.error === s.error, 'expected sanitized error');
    check(unchanged, 'whole business snapshot changed'); check(intents.length === 0, 'write intents before denial: ' + intents.length);
  } else {
    check(result?.ok === true, 'success body'); check(intents.length > 0, 'expected real handler writes');
    const tx = state.tables.transactions.find(t => t.id === txid);
    if (s.outcome === 'closed' || s.outcome === 'open' || s.outcome === 'cancelled') check(tx?.status === s.outcome, 'transaction final status');
    if (s.outcome === 'extension') check(tx?.due_at === '2026-12-01T00:00:00.000Z', 'approved due date');
    if (s.outcome === 'responsible') check(tx?.responsible_login_name === 'fixture_target' && tx?.responsible_user_id === uid(12), 'validated responsible target');
    if (s.outcome === 'rejected') check(state.tables.transaction_requests[0].status === 'rejected' && JSON.stringify(before.tables.transactions) === JSON.stringify(state.tables.transactions), 'rejection must not perform requested action');
    if (s.outcome === 'forwarded') check(tx?.status === 'open' && state.tables.transaction_requests.some(r => r.id !== reqid && r.status === 'pending' && r.meta.forwarded_from_request === reqid && r.meta.target_role === 'assistant'), 'close forwarded without closing');
    if (s.outcome === 'revised') check(state.tables.transaction_actions[0].action_text === 'revised' && state.tables.transaction_actions[0].actor_name === before.tables.transaction_actions[0].actor_name && state.tables.transaction_action_versions.length === 2 && state.tables.transaction_action_versions[0].body === 'original', 'revision preserves original author and version');
    if (s.outcome === 'routed') check(tx?.current_level === 'assistant' && tx?.workflow_started === true && state.tables.transaction_routes.some(r => r.to_login_name === 'fixture_target') && state.tables.notifications.some(n => n.target_login_name === 'fixture_target'), 'route and notification target actual assistant');
    if (s.outcome === 'deleted') check(!tx && state.tables.audit_log.some(a => a.event_type === 'hard_delete'), 'delete and audit');
    if (!s.action && !['rejected'].includes(s.outcome || '')) check(state.tables.transaction_requests[0].status === 'approved', 'request approved');
  }
  const receipt = { id: s.id, expectedStatus: s.expected, status, negative: s.expected >= 400, writeIntents: intents.length, effects: intents,
    wholeBusinessSnapshotUnchanged: unchanged, beforeSha256: await sha(JSON.stringify(before)), afterSha256: await sha(JSON.stringify(state)),
    protectedFaisalUnchanged: protectedBusinessUnchanged && JSON.stringify(before.tables.protected_faisal_sentinel) === JSON.stringify(state.tables.protected_faisal_sentinel),
    sourceSha256: await sha(await Deno.readTextFile(SOURCE)), networkDenied: denialVerified, failureInjected, failures, nativeAcceptance: false };
  const evidence = Deno.env.get('AUTHZ_EVIDENCE');
  if (evidence) await Deno.writeTextFile(evidence, JSON.stringify(receipt) + '\n', { append: true });
  if (failures.length) throw new Error(s.id + ': ' + failures.join('; '));
}
for (const spec of specs) Deno.test(spec.id, () => probe(spec));
