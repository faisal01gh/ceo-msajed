"""Actual native app startup/handlers in Chromium; synthetic transport only.

No rpc/post/render/login/password consumer is replaced. Local assets are served
on loopback; external traffic is blocked and asserted absent. A deterministic
300ms scheduler releases the actual search debounce after logout/login.
"""
import functools
import json
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[1]
UID = '11111111-1111-4111-8111-111111111111'
PROFILE = {'ok': True, 'user_id': UID, 'must_change_password': False}
INIT = r"""(() => {
  window.calls=[];window.debounces=[];
  const nativeTimer=window.setTimeout.bind(window);
  window.setTimeout=(fn,ms,...args)=>ms===300?(debounces.push(()=>fn(...args)), -debounces.length):nativeTimer(fn,ms,...args);
  window.fetch=(url,options={})=>new Promise((resolve,reject)=>{
    const call={url:String(url),body:options.body?JSON.parse(options.body):null,headers:options.headers,
      resolve:(status,data)=>{
        const response=new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
        const parse=response.json.bind(response);
        response.json=async()=>{const value=await parse();call.consumed=true;return value};
        resolve(response);
      },reject};
    calls.push(call);
  });
  window.release=(index,status,data)=>{calls[index].resolve(status,data);calls[index].settled=true};
  window.rejectCall=index=>{calls[index].reject(Error('fixture offline'));calls[index].settled=true};
  window.fireSearch=()=>debounces.shift()();
})()"""


def listing(tag):
    return {'rows': [{'id': 'owned-row-'+tag, 'number': tag, 'title': tag,
                     'priority': 'عادي', 'status': 'open', 'days': 1}],
            'total': 1, 'page': 1, 'page_size': 50, 'counters': {}}


def directory(role):
    return {'users': [], 'units': [], 'me': {'role': role, 'display_name': 'Owned fixture'}}


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class TestClientBootstrapInterleavings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(REPO)))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()

    def setUp(self):
        self.blocked = []
        self.errors = []
        self.context = self.browser.new_context(service_workers='block')
        def guard(route):
            if route.request.url.startswith(self.base+'/'):
                route.continue_()
            else:
                self.blocked.append(route.request.url)
                route.abort()
        self.context.route('**/*', guard)
        self.context.add_init_script(INIT)
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.base)
        self.page.wait_for_selector('#loginForm')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.blocked, [], 'External request attempted')
        self.assertEqual(self.errors, [], 'Actual consumer leaked a page error')

    def request(self, suffix):
        self.page.wait_for_function('suffix=>calls.some(c=>c.url.endsWith(suffix)&&!c.settled)', arg=suffix)
        return self.page.evaluate('s=>calls.map((c,i)=>({c,i})).filter(x=>x.c.url.endsWith(s)&&!x.c.settled).at(-1).i', suffix)

    def respond(self, index, data, status=200):
        self.page.evaluate('([i,s,d])=>release(i,s,d)', [index, status, data])
        self.page.wait_for_function('i=>calls[i].consumed===true', arg=index)
        self.page.evaluate('async()=>{for(let i=0;i<40;i++)await Promise.resolve()}')

    def login_to_gate(self, actor='A', role='employee'):
        self.page.locator('#username').fill('owned-fixture-'+actor)
        self.page.locator('#password').fill('OwnedLogin9!')
        self.page.locator('#loginBtn').click()
        self.respond(self.request('/account-resolve'), {'eligible': True, 'migrated': True,
            'internal_email': actor+'@example.invalid', 'role': role, 'preferred_login': actor})
        self.respond(self.request('/auth/v1/token?grant_type=password'),
            {'access_token': actor+'-old', 'refresh_token': actor+'-refresh'})
        return self.request('/my_profile')

    def batch(self, gate):
        self.respond(gate, PROFILE)
        for name in ['transaction_directory_my', 'list_my_transactions', 'my_permissions']:
            self.request('/'+name)
        return {name: self.request('/'+name) for name in ['transaction_directory_my', 'list_my_transactions', 'my_permissions']}

    def release_batch(self, batch, role='employee', tag='BOOT'):
        self.respond(batch['transaction_directory_my'], directory(role))
        self.respond(batch['list_my_transactions'], listing(tag))
        self.respond(batch['my_permissions'], [])

    def ready(self, role='employee'):
        batch = self.batch(self.login_to_gate(role=role))
        self.release_batch(batch, role, 'A-READY')
        self.page.wait_for_selector('#tableHost')

    def switch_with_search(self, role='employee', release_profile=True):
        self.ready(role)
        self.page.locator('#search').fill('owned-current-filter')
        self.page.locator('#logoutBtn').click()
        self.respond(self.request('/auth/v1/logout'), {})
        self.page.wait_for_selector('#loginForm')
        gate = self.login_to_gate('B', role)
        batch = self.batch(gate) if release_profile else None
        self.page.evaluate('void fireSearch()')
        latest = self.request('/list_my_transactions')
        self.assertEqual(self.page.locator('#tableHost').count(), 0)
        return gate, batch, latest

    def test_current_prerequisite_error_is_not_suppressed_by_newer_search(self):
        _, batch, latest = self.switch_with_search()
        self.respond(latest, listing('B-LATEST'))
        self.respond(batch['list_my_transactions'], listing('B-OLD'))
        self.respond(batch['transaction_directory_my'], directory('employee'))
        self.respond(batch['my_permissions'], {'error': 'fixture unavailable'}, 503)
        self.assertEqual(self.page.locator('#retryBoot').count(), 1, 'Current permissions failure must offer bootstrap retry')
        self.assertEqual(self.page.locator('#tableHost').count(), 0)
        self.assertEqual(self.page.evaluate('session.token'), 'B-old')
        self.assertEqual(self.page.evaluate('listData.rows[0].title'), 'B-LATEST')
        self.page.locator('#retryBoot').click()
        batch = self.batch(self.request('/my_profile'))
        self.release_batch(batch, tag='B-RECOVERED')
        self.page.wait_for_selector('#tableHost')
        self.assertIn('B-RECOVERED', self.page.locator('#tableHost').inner_text())

    def test_invalid_profile_fails_closed_despite_newer_search(self):
        gate, _, latest = self.switch_with_search(release_profile=False)
        self.respond(latest, listing('UNPROVEN'))
        self.respond(gate, {'ok': True, 'user_id': 'not-a-uuid'})
        self.assertEqual(self.page.locator('#retryBoot').count(), 1, 'Invalid current profile must not be suppressed')
        self.assertEqual(self.page.locator('#tableHost').count(), 0)
        self.assertEqual(self.page.evaluate('session.token'), 'B-old')

    def test_latest_completion_after_boot_hands_off_to_actual_fresh_table(self):
        _, batch, latest = self.switch_with_search()
        self.release_batch(batch, tag='B-SUPERSEDED')
        self.page.wait_for_selector('#tableHost')
        self.respond(latest, listing('B-LATEST'))
        self.assertEqual(self.page.locator('#rowTotal').inner_text(), '1', 'Latest model must reach table created by boot')
        self.assertIn('B-LATEST', self.page.locator('#tableHost').inner_text())
        self.assertNotIn('B-SUPERSEDED', self.page.locator('#tableHost').inner_text())

    def test_latest_completion_before_boot_waits_for_proven_prerequisites(self):
        _, batch, latest = self.switch_with_search()
        self.respond(latest, listing('B-LATEST'))
        self.assertEqual(self.page.locator('#tableHost').count(), 0)
        self.release_batch(batch)
        self.page.wait_for_selector('#tableHost')
        self.assertIn('B-LATEST', self.page.locator('#tableHost').inner_text())

    def test_canonical_role_corrects_tab_with_new_generation_and_current_filters(self):
        _, batch, latest = self.switch_with_search('manager')
        self.release_batch(batch, role='employee')
        self.assertEqual(self.page.evaluate('currentTab'), 'incoming', 'Canonical employee role must replace cached manager scope')
        corrected = self.request('/list_my_transactions')
        self.assertNotEqual(corrected, latest, 'Role correction must create its own latest generation')
        payload = self.page.evaluate('i=>calls[i].body', corrected)
        self.assertEqual(payload['p_tab'], 'incoming')
        self.assertEqual(payload['p_search'], 'owned-current-filter')
        self.respond(corrected, listing('B-CORRECTED'))
        self.respond(latest, listing('B-UNSUPPORTED-SCOPE'))
        self.page.wait_for_selector('#tableHost')
        self.assertEqual(self.page.locator('[data-tab].active').count(), 1)
        self.assertIn('B-CORRECTED', self.page.locator('#tableHost').inner_text())
        self.assertNotIn('B-UNSUPPORTED-SCOPE', self.page.locator('#tableHost').inner_text())

    def test_canonical_role_corrects_already_completed_scope_list(self):
        _, batch, latest = self.switch_with_search('manager')
        self.respond(latest, listing('UNSUPPORTED-COMPLETED'))
        self.assertEqual(self.page.locator('#tableHost').count(), 0)
        self.release_batch(batch, role='employee')
        self.assertEqual(self.page.evaluate('currentTab'), 'incoming')
        corrected = self.request('/list_my_transactions')
        self.assertNotEqual(corrected, latest)
        self.respond(corrected, listing('CORRECTED-COMPLETED'))
        self.page.wait_for_selector('#tableHost')
        self.assertIn('CORRECTED-COMPLETED', self.page.locator('#tableHost').inner_text())
        self.assertNotIn('UNSUPPORTED-COMPLETED', self.page.locator('#tableHost').inner_text())

    def test_canonical_role_discards_unsupported_boot_list_rejection(self):
        _, batch, latest = self.switch_with_search('manager')
        self.respond(batch['transaction_directory_my'], directory('employee'))
        self.respond(batch['list_my_transactions'], {'error': 'unsupported scope'}, 403)
        self.respond(batch['my_permissions'], [])
        self.assertEqual(self.page.evaluate('currentTab'), 'incoming')
        corrected = self.request('/list_my_transactions')
        self.respond(corrected, listing('AUTHORIZED'))
        self.respond(latest, {'error': 'obsolete list'}, 401)
        self.respond(self.request('/auth/v1/token?grant_type=refresh_token'), {'error': 'obsolete invalid grant'}, 400)
        self.page.wait_for_selector('#tableHost')
        self.assertEqual(self.page.evaluate('session?.token'), 'B-old')
        self.assertIn('AUTHORIZED', self.page.locator('#tableHost').inner_text())
        self.assertEqual(self.page.locator('#loginForm').count(), 0)
        self.assertEqual(self.page.locator('.ui-notice').count(), 0)

    def test_forced_gate_never_hands_off_search_results(self):
        gate, _, latest = self.switch_with_search(release_profile=False)
        self.respond(gate, dict(PROFILE, must_change_password=True))
        self.respond(latest, listing('FORBIDDEN'))
        self.assertEqual(self.page.locator('#passwordForm').count(), 1)
        self.assertEqual(self.page.locator('#tableHost').count(), 0)
        self.assertNotIn('FORBIDDEN', self.page.locator('#app').inner_text())

    def password_change(self):
        self.page.evaluate('window.passwordOwner=session;openOwnPasswordChange()')
        self.page.locator('#profileNewPassword').fill('OwnedChanged9!')
        self.page.locator('#profileConfirmPassword').fill('OwnedChanged9!')
        self.page.locator('#saveProfilePassword').click()
        command = self.request('/account-confirm-password')
        self.respond(command, {'ok': True, 'auth': {'access_token': 'PASSWORD-access', 'refresh_token': 'PASSWORD-refresh'}})
        self.assertTrue(self.page.evaluate('session===passwordOwner'))
        self.assertEqual(self.page.evaluate('JSON.parse(sessionStorage.getItem(SESSION_KEY)).token'), 'PASSWORD-access')
        return command

    def old_refresh_boot(self):
        self.ready()
        self.page.evaluate('void boot()')
        self.respond(self.request('/my_profile'), {}, 401)
        return self.request('/auth/v1/token?grant_type=refresh_token')

    def finish_old_boot_after_password(self, outcome):
        old = self.old_refresh_boot()
        command = self.password_change()
        operation = self.page.evaluate('i=>calls[i].body.operation_id', command)
        if outcome == 'network':
            self.page.evaluate('rejectCall', old)
        else:
            self.respond(old, {'access_token': 'OBSOLETE-access', 'refresh_token': 'OBSOLETE-refresh'} if outcome == 200 else {'error': 'old rejection'}, outcome)
        self.assertEqual(self.page.evaluate('session?.token'), 'PASSWORD-access', 'Old refresh must not overwrite or clear password credentials')
        self.assertEqual(self.page.evaluate('JSON.parse(sessionStorage.getItem(SESSION_KEY)).refresh_token'), 'PASSWORD-refresh')
        self.assertEqual(self.page.evaluate('calls.filter(c=>c.url.endsWith("/my_profile")&&!c.settled).length'), 1, 'Obsolete refresh error must reuse the new credentials instead of aborting boot')
        retry = self.request('/my_profile')
        self.assertNotEqual(self.page.evaluate('i=>calls[i].headers.Authorization', retry), 'Bearer A-old')
        self.assertEqual(self.page.evaluate('i=>calls[i].headers.Authorization', retry), 'Bearer PASSWORD-access')
        self.release_batch(self.batch(retry), tag='PASSWORD-BOOT')
        self.page.wait_for_selector('#tableHost')
        self.assertEqual(self.page.locator('#loginForm').count(), 0)
        self.assertTrue(self.page.evaluate('session===passwordOwner'))
        self.assertEqual(self.page.evaluate('calls.filter(c=>c.url.endsWith("/account-confirm-password")).length'), 1)
        self.assertEqual(self.page.evaluate('i=>calls[i].body.operation_id', command), operation)

    def test_old_refresh_success_cannot_rewind_password_command(self):
        self.finish_old_boot_after_password(200)

    def test_old_refresh_400_cannot_logout_password_version_via_boot(self):
        self.finish_old_boot_after_password(400)

    def test_old_refresh_401_cannot_logout_password_version_via_boot(self):
        self.finish_old_boot_after_password(401)

    def test_old_refresh_403_cannot_logout_password_version_via_boot(self):
        self.finish_old_boot_after_password(403)

    def test_old_refresh_503_reuses_password_version(self):
        self.finish_old_boot_after_password(503)

    def test_old_refresh_network_error_reuses_password_version(self):
        self.finish_old_boot_after_password('network')

    def test_new_password_version_401_does_not_join_old_refresh(self):
        self.ready()
        self.page.locator('#search').fill('old-refresh')
        self.page.evaluate('void fireSearch()')
        self.respond(self.request('/list_my_transactions'), {}, 401)
        old = self.request('/auth/v1/token?grant_type=refresh_token')
        self.password_change()
        self.page.locator('#search').fill('new-version')
        self.page.evaluate('void fireSearch()')
        self.respond(self.request('/list_my_transactions'), {}, 401)
        count = self.page.evaluate('calls.filter(c=>c.url.endsWith("/auth/v1/token?grant_type=refresh_token")).length')
        self.assertEqual(count, 2, 'New credential pair must have independent single-flight refresh')
        newer = self.request('/auth/v1/token?grant_type=refresh_token')
        self.assertEqual(self.page.evaluate('i=>calls[i].body.refresh_token', newer), 'PASSWORD-refresh')
        self.respond(old, {'error': 'obsolete invalid grant'}, 400)
        self.page.locator('#search').fill('join-new-version')
        self.page.evaluate('void fireSearch()')
        self.respond(self.request('/list_my_transactions'), {}, 401)
        self.assertEqual(self.page.evaluate('calls.filter(c=>c.url.includes("grant_type=refresh_token")).length'), 2, 'Old finally must not delete newer in-flight entry')
        self.respond(newer, {'access_token': 'LATEST-access', 'refresh_token': 'LATEST-refresh'})
        pending = self.page.evaluate('calls.map((c,i)=>({c,i})).filter(x=>x.c.url.endsWith("/list_my_transactions")&&!x.c.settled).map(x=>x.i)')
        for index in pending:
            self.respond(index, listing('LATEST-LIST'))
        self.assertEqual(self.page.evaluate('session.token'), 'LATEST-access')
        self.assertIn('LATEST-LIST', self.page.locator('#tableHost').inner_text())


if __name__ == '__main__':
    unittest.main(verbosity=2)
