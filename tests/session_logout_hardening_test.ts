// Actual worktree handler; only fetch and serve boundaries are intercepted.
// Disposable credentials stay in memory. Evidence contains counts/booleans only.
const SOURCE = new URL('../supabase/functions/session-logout/index.ts', import.meta.url);
const BASE = 'https://logout-provider.invalid';
const CLIENT = 'https://logout-client.invalid';
const assert = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const randomPart = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const dummyToken = () => [encode({alg: 'HS256', typ: 'JWT'}), encode({sub: crypto.randomUUID(), session_id: crypto.randomUUID(), iss: BASE + '/auth/v1', exp: 4102444800}), randomPart()].join('.');
type Probe = { id: string; token?: unknown; providerStatus?: number; networkFailure?: boolean; method?: string; badJSON?: boolean; origin?: string; want: number; dispatches: number };
type Case = { id: string; probes: () => Probe[] };
const cases: Case[] = [
  {id: 'missing token', probes: () => [{id: 'absent', want: 401, dispatches: 0}, {id: 'empty', token: '', want: 401, dispatches: 0}]},
  {id: 'malformed token', probes: () => [
    {id: 'non-string', token: {value: crypto.randomUUID()}},
    {id: 'wrong-segment-count', token: randomPart()},
    {id: 'whitespace', token: ' ' + dummyToken()},
    {id: 'invalid-json', token: [randomPart(), randomPart(), randomPart()].join('.')},
    {id: 'non-object-claims', token: [encode({alg: 'HS256'}), encode(null), randomPart()].join('.')},
    {id: 'non-object-header', token: [encode([]), encode({sub: crypto.randomUUID()}), randomPart()].join('.')},
    {id: 'invalid-signature-encoding', token: [encode({alg: 'HS256'}), encode({sub: crypto.randomUUID()}), randomPart().slice(0, 1)].join('.')},
  ].map(p => ({...p, want: 401, dispatches: 0}))},
  {id: 'provider HTTP failure', probes: () => [500, 200, 202, 302].map(providerStatus => ({id: 'provider-' + providerStatus, token: dummyToken(), providerStatus, want: 502, dispatches: 1}))},
  {id: 'network failure', probes: () => [{id: 'fetch-rejection', token: dummyToken(), networkFailure: true, want: 502, dispatches: 1}]},
  {id: 'invalid/expired session', probes: () => [401, 403].map(providerStatus => ({id: 'provider-' + providerStatus, token: dummyToken(), providerStatus, want: 401, dispatches: 1}))},
  {id: 'successful logout', probes: () => [
    {id: 'provider-204', token: dummyToken(), providerStatus: 204, want: 200, dispatches: 1},
    // Adjacent method/CORS regressions stay inside the six required cases.
    {id: 'options', method: 'OPTIONS', want: 200, dispatches: 0},
    {id: 'get', method: 'GET', want: 405, dispatches: 0},
    {id: 'bad-json', badJSON: true, want: 400, dispatches: 0},
    {id: 'untrusted-origin', method: 'OPTIONS', origin: CLIENT, want: 200, dispatches: 0},
    {id: 'second-allowed-origin', method: 'OPTIONS', origin: 'https://faisal01gh.github.io', want: 200, dispatches: 0},
  ]},
];

async function runCase(spec: Case) {
  const originalFetch = globalThis.fetch, originalServe = Deno.serve;
  let denialVerified = false;
  try { await originalFetch('https://network-denial-check.invalid'); }
  catch (e) { denialVerified = e instanceof Deno.errors.NotCapable || e instanceof Deno.errors.PermissionDenied; }
  assert(denialVerified, 'Harness requires verified --deny-net');
  const sourceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await Deno.readFile(SOURCE))), b => b.toString(16).padStart(2, '0')).join('');
  const oldURL = Deno.env.get('SUPABASE_URL'), oldKey = Deno.env.get('SUPABASE_ANON_KEY');
  const key = randomPart(), providerDetail = randomPart();
  const originalConsole = {log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug};
  let handler: ((req: Request) => Promise<Response>) | undefined;
  let logCalls = 0;
  const results = [];
  const failures: string[] = [];
  Deno.env.set('SUPABASE_URL', BASE);
  Deno.env.set('SUPABASE_ANON_KEY', key);
  for (const method of Object.keys(originalConsole) as (keyof typeof originalConsole)[]) console[method] = () => { logCalls++; };
  try {
    Object.defineProperty(Deno, 'serve', {configurable: true, value: (fn: typeof handler) => { handler = fn; return {}; }});
    await import(SOURCE.href + '?logout=' + crypto.randomUUID());
    assert(handler, 'Actual Deno.serve handler was not captured');
    for (const probe of spec.probes()) {
      const businessState = {transactions: [{id: 'owned-synthetic-transaction', status: 'open'}], profiles: [{id: 'owned-synthetic-profile', active: true}]};
      const before = JSON.stringify(businessState);
      let requests = 0, unexpectedRequests = 0, businessWrites = 0;
      let requestContractValid = true;
      globalThis.fetch = async (input, init) => {
        requests++;
        const req = input instanceof Request ? input : new Request(input, init);
        const url = new URL(req.url);
        if (url.origin !== BASE || url.pathname !== '/auth/v1/logout' || url.search !== '' || req.method !== 'POST') {
          unexpectedRequests++;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            businessWrites++;
            businessState.transactions[0].status = 'unexpected-write';
          }
          throw new Error('Unexpected synthetic provider dispatch');
        }
        requestContractValid &&= req.headers.get('apikey') === key && req.headers.get('authorization') === 'Bearer ' + probe.token;
        if (probe.providerStatus === 302) requestContractValid &&= req.redirect === 'error' || req.redirect === 'manual';
        if (probe.networkFailure) throw new Error(providerDetail);
        const status = probe.providerStatus ?? 204;
        return new Response(status === 204 ? null : providerDetail, {status});
      };
      const method = probe.method ?? 'POST', origin = probe.origin ?? 'https://ceo-msajed.pages.dev';
      let response: Response | undefined;
      try {
        response = await handler!(new Request(CLIENT, {method, headers: {'content-type': 'application/json', origin}, ...(method === 'POST' ? {body: probe.badJSON ? '{' : JSON.stringify({token: probe.token})} : {})}));
      } catch { /* Never serialize a thrown value: it can contain credentials. */ }
      const body = response ? await response.text() : '';
      const corsPreserved = !!response && response.headers.get('Access-Control-Allow-Methods') === 'POST,OPTIONS' && response.headers.get('Access-Control-Allow-Headers') === 'content-type,apikey' && response.headers.get('Vary') === 'Origin' && response.headers.get('Cache-Control') === 'no-store' && response.headers.get('Content-Type') === 'application/json; charset=utf-8' && response.headers.get('Access-Control-Allow-Origin') === (origin === CLIENT ? null : origin);
      let parsed: {ok?: unknown; error?: unknown} = {};
      try { parsed = JSON.parse(body); } catch { /* OPTIONS retains plain "ok". */ }
      const successBodyValid = probe.want !== 200 || (method === 'OPTIONS' ? body === 'ok' : body === '{"ok":true}');
      const genericFailure = probe.want < 400 || (parsed.ok !== true && typeof parsed.error === 'string' && /^[a-z_]+$/.test(parsed.error));
      const responseSanitized = !body.includes(key) && !body.includes(providerDetail) && !(typeof probe.token === 'string' && probe.token.length > 0 && body.includes(probe.token));
      const unchanged = before === JSON.stringify(businessState);
      const reasons: string[] = [];
      if (!response) reasons.push('handler threw instead of returning non-success');
      if (response?.status !== probe.want) reasons.push('expected status ' + probe.want + ', got ' + (response?.status ?? 'none'));
      if (requests !== probe.dispatches) reasons.push('expected provider dispatches ' + probe.dispatches + ', got ' + requests);
      if (unexpectedRequests || !requestContractValid) reasons.push('unexpected provider request contract');
      if (!unchanged || businessWrites) reasons.push('synthetic business state changed');
      if (!corsPreserved) reasons.push('CORS/method response contract changed');
      if (!successBodyValid || !genericFailure) reasons.push('incorrect success/failure body');
      if (!responseSanitized || logCalls) reasons.push('response or logging confidentiality failed');
      failures.push(...reasons.map(reason => probe.id + ': ' + reason));
      results.push({id: probe.id, status: response?.status ?? null, expectedStatus: probe.want, providerStatus: probe.networkFailure ? null : (requests ? probe.providerStatus ?? 204 : null), handlerRequests: 1, providerRequests: requests, expectedProviderRequests: probe.dispatches, unexpectedRequests, requestContractValid, syntheticBusinessWrites: businessWrites, businessSnapshotEqual: unchanged, responseSanitized, corsPreserved, logCalls, passed: reasons.length === 0, reasons});
    }
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(Deno, 'serve', {value: originalServe, configurable: true});
    Object.assign(console, originalConsole);
    if (oldURL === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', oldURL);
    if (oldKey === undefined) Deno.env.delete('SUPABASE_ANON_KEY'); else Deno.env.set('SUPABASE_ANON_KEY', oldKey);
  }
  const evidence = {case: spec.id, sourceSha256, fixtureType: 'owned synthetic transport; actual handler; no SDK dependency in handler', nativeAcceptance: false, networkDenialVerified: denialVerified, results, passed: failures.length === 0};
  const path = Deno.env.get('AUTHZ_EVIDENCE');
  if (path) await Deno.writeTextFile(path, JSON.stringify(evidence) + '\n', {append: true});
  assert(failures.length === 0, failures.join('; '));
}

for (const spec of cases) Deno.test('SRC04 ' + spec.id, () => runCase(spec));
