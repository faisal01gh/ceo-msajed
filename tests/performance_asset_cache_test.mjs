import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const expectedVersion = '20261013-release-closure-1';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const handlers = new Map();
const network = [];
const context = vm.createContext({ URL, Promise, self: { location: { origin: 'https://fixture.invalid' },
  addEventListener: (name, callback) => handlers.set(name, callback) },
  fetch: request => { network.push(request.url); return Promise.resolve({}); },
  caches: { match: () => Promise.resolve(undefined) } });
vm.runInContext(source, context);
test('new release assets and service worker invalidate the preceding cache', () => {
  assert.ok(html.includes(`./app.js?v=${expectedVersion}`));
  assert.ok(html.includes(`./styles.css?v=${expectedVersion}`));
  assert.equal(vm.runInContext('CACHE', context), `ceo-msajed-static-${expectedVersion}`);
  for (const path of vm.runInContext('STATIC', context).filter(path => /\.(js|css)\?/.test(path))) {
    assert.ok(path.endsWith(`?v=${expectedVersion}`));
  }
});
test('service worker never captures external authenticated business or Auth traffic', () => {
  for (const url of [
    'https://movzojtnkkmdsjhmlgtq.supabase.co/rest/v1/rpc/list_my_transactions',
    'https://movzojtnkkmdsjhmlgtq.supabase.co/functions/v1/transactions-api',
    'https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1/user',
  ]) {
    let captured = false;
    handlers.get('fetch')({ request: { url, method: 'GET', mode: 'cors', destination: 'script' },
      respondWith: () => { captured = true; } });
    assert.equal(captured, false);
  }
  assert.equal(network.length, 0);
});
test('service worker delegates writes without any caching or fetch side effect', () => {
  let captured = false;
  handlers.get('fetch')({ request: { url: 'https://fixture.invalid/local-fixture', method: 'POST' },
    respondWith: () => { captured = true; } });
  assert.equal(captured, false);
  assert.equal(network.length, 0);
});
