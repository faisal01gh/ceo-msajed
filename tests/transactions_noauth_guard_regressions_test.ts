// Actual entrypoint + pinned Supabase SDK 2.57.4; only fetch and serve captured.
// Complete synthetic state, invalid origins, no native/provider acceptance.
const SOURCE = new URL('../supabase/functions/transactions-api/index.ts', import.meta.url);
const BASE = 'https://backend-guards.invalid';
const uid = (n: number) => '82000000-0000-4000-8000-' + String(n).padStart(12, '0');
const actor = uid(1), target = uid(2), txid = uid(10), foreign = uid(11), unit = uid(20), root = uid(21);
const assignment = uid(30), actionid = uid(40), reqid = uid(50);
const clone = <T>(v: T): T => structuredClone(v);
const sha = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
type Failure = { table: string; method: string; select?: string; occurrence?: number };
type Spec = { id: string; action: string; expected: number; error?: string; role?: string; grants?: string[];
  account?: string; user?: string; tx?: Record<string, unknown>; flags?: Record<string, unknown>;
  direct?: boolean; unstarted?: boolean; body?: Record<string, unknown>; fail?: Failure; requestType?: string; requestMeta?: Record<string, unknown>; route?: Record<string, unknown>;
  prior?: string[]; outcome?: string; inspect?: (c: any, check: (v: unknown, m: string) => void) => void };
const specs: Spec[] = [];
function seed(s: Spec) {
  const account = (n: number, login: string, role: string) => ({ canonical_key: login, preferred_login: login,
    display_name: login, role_code: role, migrated_user_id: uid(n), org_name: 'synthetic sector',
    dept_names: ['synthetic department'], eligible: true });
  const accounts = [account(1, 'synthetic_actor', s.role || 'manager'), account(2, 'synthetic_target', 'employee'),
    account(3, 'synthetic_ceo', 'ceo'), account(4, 'synthetic_assistant', 'assistant'), account(5, 'synthetic_requester', 'employee'), account(6, 'synthetic_manager', 'manager')];
  const tx = { id: txid, number: 'SYNTHETIC-ONLY', title: 'synthetic parent', subject: 'original subject',
    origin: 'new', status: 'open', current_level: 'manager', close_level: 'manager', responsible_unit_id: unit,
    responsible_user_id: actor, responsible_login_name: 'synthetic_actor', responsible_name: 'synthetic_actor',
    created_by_name: 'synthetic_actor', workflow_started: true, due_at: '2026-11-01T00:00:00.000Z',
    created_at: '2026-10-01T00:00:00.000Z', ...s.tx };
  const tables: Record<string, any[]> = {
    account_migration_users: accounts,
    user_roles: [{ user_id: actor, role_code: s.role || 'manager' }],
    role_permissions: (s.grants || []).map(permission_code => ({ role_code: s.role || 'manager', permission_code })),
    account_permission_overrides: s.account ? [{ canonical_key: 'synthetic_actor', permission_code: 'transactions.raise_ceo', effect: s.account }] : [],
    user_permissions: s.user ? [{ user_id: actor, permission_code: 'transactions.raise_ceo', effect: s.user }] : [],
    profiles: accounts.map(a => ({ id: a.migrated_user_id, login_name: a.preferred_login, active: true })),
    organizational_units: [{ id: root, name: 'synthetic sector', parent_id: null, unit_type: 'sector', active: true },
      { id: unit, name: 'synthetic department', parent_id: root, unit_type: 'department', active: true }],
    user_memberships: [{ user_id: actor, unit_id: unit, active: true, membership_role: s.role || 'manager' }],
    transactions: [tx, { ...tx, id: foreign, title: 'unrelated synthetic parent' }],
    transaction_assignments: [{ id: assignment, transaction_id: txid, unit_id: unit, status: 'active', assignment_type: s.direct ? 'direct' : 'responsible', visibility_scope: 'manager_assistant' }],
    transaction_assignment_targets: [{ id: uid(31), assignment_id: assignment, user_id: actor, login_name: 'synthetic_actor', display_name: 'synthetic_actor', active: true }],
    transaction_routes: [{ id: uid(32), transaction_id: txid, route_type: s.direct ? 'direct_assign' : 'raise', from_login_name: 'synthetic_actor', to_login_name: 'synthetic_assistant', status: 'completed', created_at: '2026-10-02T00:00:00Z', meta: s.direct ? { directive_owner: 'الرئيس التنفيذي' } : {}, ...s.route }],
    transaction_actions: [{ id: actionid, transaction_id: txid, actor_name: 'synthetic_actor', action_text: 'original action', current_version: 1 }],
    transaction_action_versions: [{ id: uid(41), action_id: actionid, version_no: 1, body: 'original action' }],
    transaction_action_notes: [{ id: uid(42), transaction_id: txid, action_id: actionid, note: 'original note' }],
    transaction_requests: [{ id: reqid, transaction_id: txid, request_type: s.requestType || 'extension', status: 'pending', reason: 'synthetic reason', requested_by_login_name: 'synthetic_requester', requested_by_name: 'synthetic_requester', requested_due_at: '2026-12-01T00:00:00.000Z', meta: { requester_role: 'employee', to_login: 'synthetic_target', ...s.requestMeta } }],
    transaction_periods: [{ id: uid(60), transaction_id: txid, cycle_no: 1, started_at: '2026-10-01T00:00:00.000Z', ended_at: tx.status === 'closed' ? '2026-10-02T00:00:00.000Z' : null }],
    transaction_links: [{ id: uid(61), transaction_id: txid, url: 'https://synthetic-document.invalid' }],
    transaction_history: [{ id: uid(62), transaction_id: txid, event_type: 'created', detail: 'existing history' }],
    audit_log: [{ id: uid(63), entity_id: txid, event_type: 'created', detail: 'existing audit' }],
    notifications: [{ id: uid(64), transaction_id: txid, target_login_name: 'synthetic_actor', user_id: actor, event_type: 'existing', read_at: null }],
  };
  // Unrelated populated rows expose accidental unscoped reads/writes.
  for (const name of ['transaction_assignments', 'transaction_routes', 'transaction_actions', 'transaction_action_notes', 'transaction_requests', 'transaction_periods', 'transaction_links', 'transaction_history', 'notifications']) {
    tables[name].push({ ...clone(tables[name][0]), id: uid(100 + Object.keys(tables).indexOf(name)), transaction_id: foreign });
  }
  const otherAction = tables.transaction_actions[1].id, otherAssignment = tables.transaction_assignments[1].id;
  tables.transaction_action_notes[1].action_id = otherAction;
  tables.transaction_action_versions.push({ id: uid(180), action_id: otherAction, version_no: 1, body: 'unrelated version' });
  tables.transaction_assignment_targets.push({ ...tables.transaction_assignment_targets[0], id: uid(181), assignment_id: otherAssignment });
  if (s.unstarted) {
    tables.transactions[0].workflow_started = false;
    for (const name of ['transaction_assignments', 'transaction_routes', 'transaction_actions', 'transaction_action_notes', 'transaction_requests']) tables[name] = tables[name].filter(row => row.transaction_id !== txid);
    tables.transaction_assignment_targets = tables.transaction_assignment_targets.filter(row => row.assignment_id !== assignment);
    tables.transaction_action_versions = tables.transaction_action_versions.filter(row => row.action_id !== actionid);
  }
  return { tables, sequence: 1000 };
}
function matches(row: any, params: URLSearchParams) {
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(key)) continue;
    if (value.startsWith('eq.')) { if (String(row[key]) !== value.slice(3)) return false; }
    else if (value.startsWith('is.')) { if (value === 'is.null' ? row[key] != null : String(row[key]) !== value.slice(3)) return false; }
    else if (value.startsWith('in.(')) { if (!value.slice(4, -1).split(',').includes(String(row[key]))) return false; }
    else throw new Error('fixture unsupported filter: ' + key);
  }
  return true;
}
async function probe(s: Spec) {
  const originals = { fetch: globalThis.fetch, serve: Deno.serve, url: Deno.env.get('SUPABASE_URL'), key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') };
  // Query permission state without ever dispatching a native fetch.
  if ((await Deno.permissions.query({ name: 'net', host: 'backend-guards.invalid' })).state !== 'denied') throw new Error('fixture requires --deny-net');
  const state = seed(s), before = clone(state), writes: any[] = [], reads: any[] = [], unsupported: string[] = [];
  let handler: ((r: Request) => Promise<Response>) | undefined, status = 0, result: any, thrown: string | null = null;
  let failureMatches = 0, failureInjected = false, failureSequence = 0, sequence = 0;
  Deno.env.set('SUPABASE_URL', BASE); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-not-a-provider-key');
  try {
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url), method = request.method;
      const table = url.pathname.split('/').at(-1)!, seq = ++sequence;
      const raw = ['GET', 'HEAD'].includes(method) ? '' : await request.text();
      const body = raw ? JSON.parse(raw) : null;
      const entry: any = { seq, method, table, query: Object.fromEntries(url.searchParams), body };
      if (url.origin !== BASE) { unsupported.push('origin'); throw new Error('fixture unsupported origin'); }
      if (url.pathname === '/auth/v1/user') { reads.push(entry); return Response.json({ id: actor, email: 'synthetic@backend-guards.invalid' }); }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        if (table === 'next_transaction_number') {
          entry.method = 'RPC'; entry.before = clone(state); const number = 'SYNTHETIC-' + state.sequence++;
          entry.after = clone(state); writes.push(entry); return Response.json(number);
        }
        reads.push(entry);
        if (table === 'account_session_check_internal') return Response.json(true);
        if (table === 'user_context_internal') return Response.json({ login_name: 'synthetic_actor', full_name: 'synthetic_actor', role: s.role || 'manager', org_name: 'synthetic sector', dept_names: ['synthetic department'], active: true, must_change_password: false });
        if (table === 'transaction_feedback_flags_internal') return Response.json({ visible: true, incoming: true, scope: true, shared: false, current_assignees: ['synthetic_actor'], ...s.flags });
        writes.push(entry); unsupported.push('rpc:' + table); throw new Error('fixture unsupported RPC');
      }
      const isWrite = !['GET', 'HEAD'].includes(method);
      (isWrite ? writes : reads).push(entry);
      if (!(table in state.tables)) { unsupported.push('table:' + table); throw new Error('fixture unsupported table'); }
      if (s.fail && s.fail.table === table && s.fail.method === method && (!s.fail.select || s.fail.select === entry.query.select) && ++failureMatches === (s.fail.occurrence || 1)) {
        failureInjected = true; failureSequence = seq; entry.failed = true;
        return Response.json({ code: 'SYNTHETIC_ERROR', message: 'synthetic_private_detail', details: 'synthetic_private_detail', hint: 'synthetic_private_detail' }, { status: 400 });
      }
      let rows = state.tables[table].filter(row => matches(row, url.searchParams));
      const order = url.searchParams.get('order');
      if (order) { const [key, dir] = order.split('.'); rows.sort((a, b) => (String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true })) * (dir === 'desc' ? -1 : 1)); }
      const limit = url.searchParams.get('limit'); if (limit) rows = rows.slice(0, Number(limit));
      if (method === 'HEAD') return new Response(null, { headers: { 'content-range': '*/' + rows.length } });
      if (method === 'GET') {
        const data = clone(rows), select = url.searchParams.get('select') || '*';
        if (table === 'transaction_assignments' && select.includes('transaction_assignment_targets')) for (const row of data) row.transaction_assignment_targets = clone(state.tables.transaction_assignment_targets.filter(t => t.assignment_id === row.id));
        return Response.json(select.includes('*') || select.includes('(') ? data : data.map(row => Object.fromEntries(select.split(',').filter(k => k in row).map(k => [k, row[k]]))));
      }
      let affected: any[];
      entry.before = clone(state);
      if (method === 'POST') { affected = (Array.isArray(body) ? body : [body]).map(row => ({ id: uid(state.sequence++), ...row })); state.tables[table].push(...affected); }
      else if (method === 'PATCH') { affected = rows; for (const row of rows) Object.assign(row, clone(body)); }
      else if (method === 'DELETE') { affected = rows; state.tables[table] = state.tables[table].filter(row => !rows.includes(row)); }
      else { unsupported.push('method'); throw new Error('fixture unsupported method'); }
      entry.affectedIds = affected.map(row => row.id); entry.after = clone(state);
      return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? affected[0] || null : affected, { status: method === 'POST' ? 201 : 200 });
    };
    Object.defineProperty(Deno, 'serve', { value: (fn: any) => { handler = fn; return {}; }, configurable: true });
    await import(SOURCE.href + '?noauth-guards=' + crypto.randomUUID());
    if (!handler) throw new Error('fixture handler missing');
    const token = ['synthetic-not-a-jwt', btoa(JSON.stringify({ sub: actor, iss: BASE + '/auth/v1', role: 'authenticated', session_id: uid(900) })), 'synthetic-not-a-signature'].join('.');
    const response = await handler(new Request('https://backend-guards-client.invalid', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      app: 'new', token, action: s.action, transaction_id: txid, request_id: reqid, action_id: actionid,
      reason: 'synthetic reason', raise_reason: 'synthetic reason', proposed_decision: 'synthetic proposal',
      to_login: 'synthetic_target', due_at: '2026-12-01T00:00:00.000Z', approve: true,
      unit_id: unit, directive: 'synthetic directive', targets: ['synthetic_target'], text: 'revised action', ...s.body }) }));
    status = response.status; result = await response.json();
  } catch (e) { thrown = String(e); }
  finally {
    globalThis.fetch = originals.fetch; Object.defineProperty(Deno, 'serve', { value: originals.serve, configurable: true });
    for (const [key, value] of [['SUPABASE_URL', originals.url], ['SUPABASE_SERVICE_ROLE_KEY', originals.key]]) if (value === undefined) Deno.env.delete(key!); else Deno.env.set(key!, value);
  }
  const failures: string[] = [], check = (v: unknown, m: string) => { if (!v) failures.push(m); };
  check(!thrown && unsupported.length === 0, 'fixture/handler error: ' + thrown + ' ' + unsupported.join(','));
  check(reads.some(r => r.table === 'user') && reads.some(r => r.table === 'account_session_check_internal'), 'actual SDK identity path reached');
  check(status === s.expected, 'expected HTTP ' + s.expected + ', got ' + status);
  check(!JSON.stringify(result).includes('synthetic_private_detail'), 'public error detail leaked');
  const unchanged = JSON.stringify(before) === JSON.stringify(state);
  const otherAction = before.tables.transaction_actions.find(t => t.transaction_id === foreign)?.id;
  const otherAssignment = before.tables.transaction_assignments.find(t => t.transaction_id === foreign)?.id;
  const foreignRows = (v: typeof state) => Object.fromEntries(Object.entries(v.tables).map(([name, rows]) => [name,
    rows.filter(r => r.id === foreign || r.transaction_id === foreign || (otherAction && r.action_id === otherAction) || (otherAssignment && r.assignment_id === otherAssignment))]));
  check(JSON.stringify(foreignRows(before)) === JSON.stringify(foreignRows(state)), 'unrelated populated parent and children changed');
  if (s.expected >= 400) {
    check(JSON.stringify(result) === JSON.stringify({ error: s.error || 'forbidden' }), 'exact generic error response');
    if ((!s.fail || s.fail.method === 'GET') && !s.prior) { check(writes.length === 0, 'prevalidation/read rejection wrote ' + writes.length + ' intents'); check(unchanged, 'complete populated snapshot changed'); }
  } else check(result?.ok === true, 'successful response');
  if (s.fail) check(failureInjected, 'injection reached');
  if (s.prior) {
    const actual = writes.filter(w => !w.failed).map(w => w.method + ' ' + w.table);
    check(JSON.stringify(actual) === JSON.stringify(s.prior), 'exact prior partial effects: ' + JSON.stringify(actual));
    check(!writes.some(w => w.seq > failureSequence), 'dependent write after failed prerequisite');
    const last = writes.filter(w => !w.failed).at(-1);
    check(JSON.stringify(state) === JSON.stringify(last?.after || before), 'failed prerequisite mutated state');
  }
  const tx = state.tables.transactions.find(t => t.id === txid)!;
  if (s.outcome === 'ceo') check(tx.current_level === 'ceo' && state.tables.notifications.some(n => n.event_type === 'raise_ceo'), 'escalation and notification preserved');
  if (s.outcome === 'employee') check(tx.current_level === 'employee' && state.tables.transaction_assignment_targets.some(t => t.login_name === 'synthetic_target' && t.active), 'routing positive preserved');
  if (['closed', 'open', 'cancelled'].includes(s.outcome || '')) check(tx?.status === s.outcome, 'lifecycle outcome');
  if (s.outcome === 'due') check(tx.due_at === '2026-12-01T00:00:00.000Z', 'date outcome');
  if (s.outcome === 'responsible') check(tx.responsible_user_id === target && tx.responsible_login_name === 'synthetic_target', 'responsible outcome');
  s.inspect?.({ state, before, writes, reads, result, failureSequence }, check);
  const receipt = { id: s.id, expectedStatus: s.expected, status, failures, thrown, unsupported, failureInjected,
    injectedFailure: s.fail || null, failureSequence, expectedPriorEffects: s.prior || null,
    beforeSha256: await sha(JSON.stringify(before)), afterSha256: await sha(JSON.stringify(state)),
    sourceSha256: await sha(await Deno.readTextFile(SOURCE)), fixtureSha256: await sha(await Deno.readTextFile(new URL(import.meta.url))),
    layer: 'ACTUAL_HANDLER_PINNED_SDK_2.57.4_SYNTHETIC_FETCH', networkDenied: true, nativeAcceptance: false,
    realNetworkEffects: 0, realBusinessEffects: 0, realProviderEffects: 0, writeIntents: writes.length,
    unchanged, before, after: state, writes, reads, result };
  console.log('NOAUTH_RECEIPT ' + JSON.stringify(receipt));
  if (failures.length) throw new Error(s.id + ': ' + failures.join('; '));
}

// BSR-01: final explicit deny must survive the documented direct-assignment fallback.
for (const actAll of [false, true]) for (const entry of [
  { name: 'user-deny', user: 'deny' }, { name: 'account-deny', account: 'deny' },
  { name: 'user-deny-after-account-allow', account: 'allow', user: 'deny' },
]) specs.push({ id: `BSR-01 ${entry.name} act_all=${actAll}`, action: 'route_assistant_ceo', expected: 403,
  direct: true, grants: ['transactions.raise_ceo', ...(actAll ? ['transactions.act_all'] : [])], ...entry });
for (const entry of [
  { name: 'documented-fallback', grants: [] },
  { name: 'documented-fallback-with-act_all', grants: ['transactions.act_all'] },
  { name: 'user-allow-over-account-deny', account: 'deny', user: 'allow', grants: [] },
  { name: 'role-grant', grants: ['transactions.raise_ceo'], direct: false },
]) specs.push({ id: 'BSR-01 positive ' + entry.name, action: 'route_assistant_ceo', expected: 200, direct: true, outcome: 'ceo', ...entry });
specs.push({ id: 'BSR-01 no-direct-no-grant-denied', action: 'route_assistant_ceo', expected: 403 });
specs.push({ id: 'BSR-01 public-who-hides-session-and-deny-provenance', action: 'directory', expected: 200, user: 'deny', inspect(c, check) {
  check(JSON.stringify(Object.keys(c.result.me).sort()) === JSON.stringify(['app', 'login_name', 'display_name', 'role', 'org_name', 'dept_name', 'dept_names', 'user_id', 'permissions'].sort()), 'public who keys and nonenumerability invariant');
  check(!JSON.stringify(c.result).includes(uid(900)), 'session id not serialized');
} });

// BSR-02: the direct endpoints must share decide_request's authoritative states.
for (const actAll of [false, true]) for (const entry of [
  { action: 'close', permission: 'close', states: [['open', 200, 'closed'], ['closed', 409], ['cancelled', 409]] },
  { action: 'reopen', permission: 'reopen', states: [['open', 409], ['closed', 200, 'open'], ['cancelled', 409]] },
  { action: 'set_due_date', permission: 'set_due_date', states: [['open', 200, 'due'], ['closed', 409], ['cancelled', 409]] },
  { action: 'change_responsible', permission: 'change_responsible', states: [['open', 200, 'responsible'], ['closed', 409], ['cancelled', 409]] },
]) for (const [status, expected, outcome] of entry.states) specs.push({
  id: `BSR-02 ${entry.action} ${status} act_all=${actAll}`, action: entry.action, tx: { status },
  grants: ['transactions.' + entry.permission, ...(actAll ? ['transactions.act_all'] : [])],
  expected: Number(expected), error: 'invalid_state', outcome: outcome as string | undefined,
});
for (const action of ['close', 'reopen', 'set_due_date', 'change_responsible']) specs.push({
  id: `BSR-02 ${action} invisible`, action, grants: ['transactions.' + action, 'transactions.act_all'],
  flags: { visible: false }, expected: 403,
});
specs.push({ id: 'BSR-02 reopen-open-legacy-before-context-write', action: 'reopen', expected: 409, error: 'invalid_state',
  grants: ['transactions.reopen', 'transactions.act_all'], tx: { origin: 'legacy', responsible_unit_id: null, responsible_login_name: null },
  body: { responsible_unit_id: unit, responsible_login_name: 'synthetic_target' } });

// BSR-03: visibility from history is not current action authority.
for (const current_level of ['assistant', 'ceo']) specs.push({
  id: `BSR-03 stale-manager ${current_level}`, action: 'route_manager_employees', expected: 403,
  grants: ['transactions.assign_department'], tx: { current_level }, flags: { incoming: false, shared: true },
});
for (const status of ['closed', 'cancelled']) for (const actAll of [false, true]) specs.push({
  id: `BSR-03 ${status} act_all=${actAll}`, action: 'route_manager_employees', expected: 403,
  grants: ['transactions.assign_department', ...(actAll ? ['transactions.act_all'] : [])], tx: { status }, flags: { incoming: false },
});
specs.push({ id: 'BSR-03 invisible', action: 'route_manager_employees', expected: 403, grants: ['transactions.assign_department', 'transactions.act_all'], flags: { visible: false } });
for (const current_level of ['employee', 'manager', 'assistant', 'ceo']) for (const kind of ['incoming', 'delegated']) specs.push({
  id: `BSR-03 positive ${kind} ${current_level}`, action: 'route_manager_employees', expected: 200, outcome: 'employee',
  grants: ['transactions.assign_department', ...(kind === 'delegated' ? ['transactions.act_all'] : [])],
  tx: { current_level }, flags: { incoming: kind === 'incoming' },
});
for (const current_level of ['employee', 'manager']) specs.push({
  id: `BSR-03 positive current-scope ${current_level}`, action: 'route_manager_employees', expected: 200, outcome: 'employee',
  grants: ['transactions.assign_department'], tx: { current_level }, flags: { incoming: false },
});

// BSR-04: every resolved detail-read error rejects the complete payload.
for (const fail of [
  { table: 'transaction_actions', method: 'GET', select: 'id' },
  { table: 'transaction_actions', method: 'GET', select: '*' },
  { table: 'transaction_action_versions', method: 'GET' },
  { table: 'transaction_action_notes', method: 'GET' },
  { table: 'transaction_routes', method: 'GET', occurrence: 2 },
  { table: 'transaction_requests', method: 'GET' }, { table: 'transaction_history', method: 'GET' },
  { table: 'transaction_periods', method: 'GET' }, { table: 'transaction_links', method: 'GET' },
  { table: 'transaction_assignments', method: 'GET', select: '*,transaction_assignment_targets(*)' },
]) specs.push({ id: `BSR-04 resolved-error ${fail.table} ${fail.select || ''}`, action: 'details', fail, expected: 500, error: 'server_error', inspect(c, check) {
  if (fail.table === 'transaction_actions' && fail.select === 'id') check(!c.reads.some((r: any) => ['transaction_action_versions', 'transaction_action_notes'].includes(r.table)), 'failed parent action selector must stop dependent selectors');
} });
specs.push({ id: 'BSR-04 positive complete-parent-scoped-detail', action: 'details', expected: 200, inspect(c, check) {
  for (const key of ['actions', 'action_versions', 'action_notes', 'routes', 'requests', 'history', 'periods', 'links', 'assignments']) check(c.result[key]?.length === 1, 'complete parent payload ' + key);
  const actionIds = c.reads.find((r: any) => r.table === 'transaction_actions' && r.query.select === 'id');
  check(actionIds?.query.transaction_id === 'eq.' + txid, 'action IDs scoped to authorized parent');
  for (const table of ['transaction_action_versions', 'transaction_action_notes']) {
    const r = c.reads.find((r: any) => r.table === table);
    check(r?.seq > actionIds?.seq && r?.query.action_id === 'in.(' + actionid + ')', 'dependent selector scope/order ' + table);
  }
  check(c.writes.length === 0 && JSON.stringify(c.before) === JSON.stringify(c.state), 'detail is read only');
} });
specs.push({ id: 'BSR-04 hidden-parent-before-dependent-selectors', action: 'details', expected: 403, flags: { visible: false }, inspect(c, check) {
  check(!c.reads.some((r: any) => ['transaction_actions', 'transaction_action_versions', 'transaction_action_notes'].includes(r.table)), 'hidden parent prevents detail selection');
} });

specs.push({ id: 'BSR-05a set_due_date failed-update-no-success-history', action: 'set_due_date', grants: ['transactions.set_due_date'],
  fail: { method: 'PATCH', table: 'transactions' }, expected: 500, error: 'server_error', prior: [] });

const closePrefix = ['PATCH transaction_periods', 'PATCH transaction_assignment_targets', 'PATCH transaction_assignments'];
for (const entry of [
  { action: 'close', fail: { method: 'GET', table: 'transaction_periods', select: 'id,started_at' }, prior: [] },
  { action: 'close', fail: { method: 'PATCH', table: 'transaction_periods' }, prior: [] },
  { action: 'close', fail: { method: 'GET', table: 'transaction_assignments', select: 'id' }, prior: ['PATCH transaction_periods'] },
  { action: 'close', fail: { method: 'PATCH', table: 'transaction_assignment_targets' }, prior: ['PATCH transaction_periods'] },
  { action: 'close', fail: { method: 'PATCH', table: 'transaction_assignments' }, prior: closePrefix.slice(0, 2) },
  { action: 'close', fail: { method: 'PATCH', table: 'transactions' }, prior: closePrefix },
  { action: 'reopen', fail: { method: 'GET', table: 'transaction_periods', select: 'cycle_no' }, prior: [] },
  { action: 'reopen', fail: { method: 'POST', table: 'transaction_periods' }, prior: [] },
  { action: 'reopen', fail: { method: 'PATCH', table: 'transactions' }, prior: ['POST transaction_periods'] },
]) specs.push({ id: `BSR-05b ${entry.action} failed-${entry.fail.method}-${entry.fail.table}`, expected: 500, error: 'server_error',
  grants: ['transactions.close', 'transactions.reopen'], tx: { status: entry.action === 'reopen' ? 'closed' : 'open' }, ...entry });

const activePrefix = ['PATCH transaction_assignment_targets', 'PATCH transaction_assignments'];
const historyPrefix = ['POST transaction_history', 'POST audit_log'];
for (const entry of [
  { requestType: 'extension', grants: ['transactions.set_due_date'], prior: [], outcome: 'due' },
  { requestType: 'change_responsible', grants: ['transactions.change_responsible'], prior: [], outcome: 'responsible' },
  { requestType: 'cancel', grants: [], prior: activePrefix, outcome: 'cancelled' },
]) {
  specs.push({ id: `BSR-05c approve-${entry.requestType}-failed-parent-update`, action: 'decide_request', ...entry,
    outcome: undefined, fail: { method: 'PATCH', table: 'transactions' }, expected: 500, error: 'server_error' });
  specs.push({ id: `BSR-05c positive approve-${entry.requestType}`, action: 'decide_request', ...entry, prior: undefined, expected: 200, inspect(c, check) {
    check(c.state.tables.transaction_requests[0].status === 'approved', 'request approved');
    check(c.state.tables.notifications.some((n: any) => n.event_type === 'request_approved'), 'requester notified');
  } });
}
for (const entry of [
  { requestType: 'close', grants: ['transactions.close'], prior: [...closePrefix, 'PATCH transactions', ...historyPrefix] },
  { requestType: 'reopen', grants: ['transactions.reopen'], prior: ['POST transaction_periods', 'PATCH transactions', ...historyPrefix], tx: { status: 'closed' } },
  { requestType: 'extension', grants: ['transactions.set_due_date'], prior: ['PATCH transactions', ...historyPrefix] },
  { requestType: 'change_responsible', grants: ['transactions.change_responsible'], prior: ['PATCH transactions', ...historyPrefix] },
  { requestType: 'cancel', grants: [], prior: [...activePrefix, 'PATCH transactions', ...historyPrefix] },
  { requestType: 'close-forward', grants: ['transactions.close'], tx: { close_level: 'ceo' }, prior: ['POST transaction_requests', ...historyPrefix, 'POST notifications'] },
  { requestType: 'reject', grants: [], prior: [], body: { approve: false, decision_reason: 'synthetic rejection' } },
]) specs.push({ id: `BSR-05c ${entry.requestType}-failed-decision-update`, action: 'decide_request', ...entry,
  requestType: ['close-forward', 'reject'].includes(entry.requestType) ? 'close' : entry.requestType,
  fail: { method: 'PATCH', table: 'transaction_requests' }, expected: 500, error: 'server_error' });
for (const entry of [
  { action: 'change_responsible', grants: ['transactions.change_responsible'], prior: [] },
  { action: 'request_cancel', grants: ['transactions.act_all'], prior: activePrefix },
]) specs.push({ id: `BSR-05c direct-${entry.action}-failed-update`, ...entry, fail: { method: 'PATCH', table: 'transactions' }, expected: 500, error: 'server_error' });
for (const action of ['reopen', 'decide_request']) {
  const common = { action, grants: ['transactions.reopen'], requestType: 'reopen',
    tx: { status: 'closed', origin: 'legacy', responsible_unit_id: null, responsible_login_name: null },
    body: { responsible_unit_id: unit, responsible_login_name: 'synthetic_target' },
    requestMeta: { responsible_unit_id: unit, responsible_login_name: 'synthetic_target' } };
  specs.push({ id: `BSR-05c ${action}-failed-legacy-context-update`, ...common, fail: { method: 'PATCH', table: 'transactions' }, prior: [], expected: 500, error: 'server_error' });
  specs.push({ id: `BSR-05c positive ${action}-legacy-context`, ...common, expected: 200, outcome: 'open' });
}

const routePrefix = [...activePrefix, 'POST transaction_routes'];
const assignPrefix = [...activePrefix, 'POST transaction_assignments', 'POST transaction_assignment_targets', 'POST notifications', 'POST transaction_routes'];
const routingCases: Partial<Spec>[] = [
  { action: 'route_employee_manager', role: 'employee', grants: ['transactions.raise_manager'], prior: routePrefix },
  { action: 'route_manager_employees', grants: ['transactions.assign_department'], prior: assignPrefix },
  { action: 'route_manager_assistant', grants: ['transactions.raise_assistant'], prior: routePrefix },
  { action: 'route_assistant_scope', role: 'assistant', grants: ['transactions.assign_sector'], body: { responsible_unit_id: unit }, prior: assignPrefix },
  { action: 'route_assistant_ceo', grants: ['transactions.raise_ceo'], prior: routePrefix },
  { action: 'route_exec_assistant', role: 'ceo', grants: ['transactions.raise_assistant'], body: { to_login: 'synthetic_assistant' }, prior: routePrefix },
  { action: 'direct_exec_employee', role: 'ceo', grants: ['transactions.assign_cross_sector'], prior: assignPrefix },
  { action: 'mark_ceo_view', grants: ['transactions.ceo_view'], prior: [] },
  { action: 'decide_assistant_transfer', role: 'assistant', grants: ['transactions.decide_assistant_transfer'],
    route: { route_type: 'assistant_transfer', status: 'pending', to_login_name: 'synthetic_actor', from_login_name: 'synthetic_requester' },
    body: { route_id: uid(32) }, prior: ['PATCH transaction_routes', ...activePrefix] },
];
for (const entry of routingCases) {
  specs.push({ id: `BSR-05d ${entry.action}-failed-parent-update`, action: entry.action!, ...entry,
    fail: { method: 'PATCH', table: 'transactions' }, expected: 500, error: 'server_error' });
  specs.push({ id: `BSR-05d positive ${entry.action}`, action: entry.action!, ...entry, prior: undefined, expected: 200, inspect(c, check) {
    check(c.writes.length > 0 && !c.writes.some((w: any) => w.failed), 'successful writes');
    check(c.state.tables.transaction_history.length === c.before.tables.transaction_history.length + 1, 'successful history');
  } });
}
for (const approve of [true, false]) specs.push({ id: `BSR-05d transfer-decision-failed-route-update approve=${approve}`, action: 'decide_assistant_transfer',
  role: 'assistant', grants: ['transactions.decide_assistant_transfer'], route: { route_type: 'assistant_transfer', status: 'pending', to_login_name: 'synthetic_actor' },
  body: { route_id: uid(32), approve }, fail: { method: 'PATCH', table: 'transaction_routes' }, prior: [], expected: 500, error: 'server_error' });

const otherMutations: Partial<Spec>[] = [
  { action: 'create', grants: ['transactions.create'], body: { title: 'new synthetic parent', responsible_unit_id: unit },
    fail: { method: 'POST', table: 'transaction_periods' }, prior: ['RPC next_transaction_number', 'POST transactions'] },
  { action: 'add_action', fail: { method: 'POST', table: 'transaction_action_versions' }, prior: ['POST transaction_actions'] },
  { action: 'add_action', fail: { method: 'PATCH', table: 'transactions' }, prior: ['POST transaction_actions', 'POST transaction_action_versions', ...historyPrefix] },
  { action: 'revise_action', fail: { method: 'POST', table: 'transaction_action_versions' }, prior: [] },
  { action: 'revise_action', fail: { method: 'PATCH', table: 'transaction_actions' }, prior: ['POST transaction_action_versions'] },
  { action: 'resolve_legacy_context', grants: ['transactions.act_all', 'transactions.change_responsible'], tx: { origin: 'legacy', migration_status: 'needs_review' },
    body: { responsible_unit_id: unit, responsible_login_name: 'synthetic_target', title: 'resolved synthetic parent' }, fail: { method: 'PATCH', table: 'transactions' }, prior: [] },
  { action: 'change_subject', grants: ['transactions.edit_subject'], body: { subject: 'new synthetic subject' }, fail: { method: 'PATCH', table: 'transactions' }, prior: [] },
  { action: 'change_responsible_unit', grants: ['transactions.change_responsible_unit'], body: { responsible_unit_id: unit, responsible_login_name: 'synthetic_target' },
    fail: { method: 'PATCH', table: 'transactions' }, prior: [] },
  { action: 'change_priority', grants: ['transactions.change_priority'], body: { priority: 'عاجل' }, fail: { method: 'PATCH', table: 'transactions' }, prior: [] },
  { action: 'delete_hard', grants: ['transactions.delete_hard'], unstarted: true, fail: { method: 'POST', table: 'audit_log' }, prior: [] },
  { action: 'delete_hard', grants: ['transactions.delete_hard'], unstarted: true, fail: { method: 'DELETE', table: 'transactions' }, prior: ['POST audit_log'] },
];
for (const entry of otherMutations) specs.push({ id: `BSR-05e ${entry.action}-failed-${entry.fail!.method}-${entry.fail!.table}`, action: entry.action!, ...entry, expected: 500, error: 'server_error' });
for (const entry of otherMutations.filter((x, i, xs) => xs.findIndex(y => y.action === x.action) === i)) specs.push({
  id: `BSR-05e positive ${entry.action}`, action: entry.action!, ...entry, fail: undefined, prior: undefined, expected: 200,
  inspect(c, check) {
    check(c.writes.length > 0 && !c.writes.some((w: any) => w.failed), 'successful writes');
    const tx = c.state.tables.transactions.find((t: any) => t.id === txid);
    if (entry.action === 'delete_hard') check(!tx, 'parent deleted');
    if (entry.action === 'create') check(c.state.tables.transactions.length === c.before.tables.transactions.length + 1 && c.state.tables.transaction_periods.length === c.before.tables.transaction_periods.length + 1, 'created parent and period');
    if (entry.action === 'add_action') check(c.state.tables.transaction_actions.length === c.before.tables.transaction_actions.length + 1 && c.state.tables.transaction_action_versions.length === c.before.tables.transaction_action_versions.length + 1, 'action and first version created');
    if (entry.action === 'revise_action') check(c.state.tables.transaction_actions[0].action_text === 'revised action' && c.state.tables.transaction_action_versions[0].body === 'original action', 'revision preserves previous version');
    if (entry.action === 'resolve_legacy_context') check(tx?.migration_status === 'ready', 'context resolved');
    if (entry.action === 'change_subject') check(tx?.subject === 'new synthetic subject', 'subject updated');
    if (entry.action === 'change_responsible_unit') check(tx?.responsible_user_id === target && tx?.responsible_unit_id === unit, 'validated ownership updated');
    if (entry.action === 'change_priority') check(tx?.priority === 'عاجل', 'priority updated');
  },
});

for (const s of specs) Deno.test(s.id, () => probe(s));
