"""Offline navigation, logout, refresh and pagination regressions against app.js.

Only fetch/Response completion is synthetic. No rpc, loader, renderer, sidebar,
logout or pager is replaced. The owned loopback server serves public assets only;
the BrowserContext blocks service workers and aborts every external request.
Run with the cached browser via CHROMIUM_EXECUTABLE_PATH. No browser download,
real login, password command, account, backend or business write is involved.
Details may issue an explicitly permitted synthetic mark_my_transaction_seen
intent; it is recorded and completed in memory, never forwarded to a backend.
Export capture replaces only objectURL/window.open boundaries, not export helpers.
--match accepts navigation, FE-001, FE-003, FE-004, or a test-name substring.
"""
import argparse
import ast
import hashlib
import json
import os
import re
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[1]
CACHED_CHROME = Path('C:/Users/FAiSAL/AppData/Local/hermes/tools/chromium-1208/chrome-win64/chrome.exe')
SOURCE_BASE = '3bb411ea0e0574be34285cd5bab9b971f502862d'
# Extract constants exactly as ui_regressions.py does; never execute ui_renderer.
fixture_names = {'PERMS', 'perms', 'user', 'users', 'units', 'rows', 'detail', 'fixture'}
fixture_nodes = [n for n in ast.parse((REPO / 'tests/ui_renderer.py').read_text(encoding='utf-8')).body
                 if isinstance(n, ast.Assign) and all(isinstance(t, ast.Name) and t.id in fixture_names for t in n.targets)]
fixture_env = {}
exec(compile(ast.Module(body=fixture_nodes, type_ignores=[]), 'declared-ui-fixtures', 'exec'), fixture_env)
FIXTURE = fixture_env['fixture']

INIT = r"""(() => {
  window.calls=[];window.unexpectedFetches=[];window.syntheticWriteIntents=[];
  const allowed=new Set(['/rest/v1/rpc/my_profile', '/rest/v1/rpc/permissions_admin_snapshot',
    '/rest/v1/rpc/transaction_directory_my', '/rest/v1/rpc/list_my_transactions',
    '/rest/v1/rpc/my_permissions', '/auth/v1/logout']);
  window.fetch=(url,options={})=>{
    const parsed=new URL(String(url),location.href);
    const body=options.body?JSON.parse(options.body):null;
    const fixtureId=id=>typeof id==='string'&&id.startsWith('fixture-');
    const details=parsed.pathname==='/functions/v1/transactions-api'&&
      body?.action==='details'&&fixtureId(body.transaction_id);
    const seen=parsed.pathname==='/rest/v1/rpc/mark_my_transaction_seen'&&
      fixtureId(body?.p_transaction_id)&&Number.isSafeInteger(body?.p_revision);
    if(options.method!=='POST'||parsed.origin!==CONFIG.supabaseUrl||
       (!allowed.has(parsed.pathname)&&!details&&!seen)||parsed.search){
      unexpectedFetches.push(String(url));
      return Promise.reject(Error('Unexpected synthetic fetch: '+parsed.pathname));
    }
    if(seen)syntheticWriteIntents.push({command:'mark_my_transaction_seen',
      body,transport:'in-memory'});
    return new Promise((resolve,reject)=>{
      const call={url:String(url),body,transport:'in-memory',
        headers:options.headers,settled:false,consumed:false,afterTransport:null,
        resolve:(status,data)=>{
          const response=new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
          const parse=response.json.bind(response);
          response.json=async()=>{const result=await parse();call.consumed=true;return result};
          // Precise scheduling barrier: rpc has checked its owner before reading
          // response.ok, but its awaiting consumer has not committed data yet.
          Object.defineProperty(response,'ok',{get(){
            if(call.afterTransport){const action=call.afterTransport;call.afterTransport=null;queueMicrotask(action)}
            return status>=200&&status<300;
          }});
          call.settled=true;resolve(response);
        },reject:()=>{call.settled=true;call.consumed=true;reject(Error('synthetic offline'))}};
      calls.push(call);
    });
  };
  window.release=(i,status,data)=>calls[i].resolve(status,data);
  window.rejectCall=i=>calls[i].reject();
})()"""


def listing(tag, number=1):
    return dict(FIXTURE['list'], rows=[dict(FIXTURE['list']['rows'][0], id='fixture-'+tag,
                                         title=tag, number=tag)], page=number, total=151)


class PublicFixture(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ('/', '/index.html'):
            # The public shell contains remote connection hints. Remove those
            # hints from this fixture so even speculative DNS/connect is absent.
            html = (REPO / 'index.html').read_text(encoding='utf-8')
            data = re.sub(r'<link\b[^>]*\brel="(?:preconnect|dns-prefetch)"[^>]*>', '', html).encode('utf-8')
            content_type = 'text/html; charset=utf-8'
        elif path == '/app.js':
            data = APP_SOURCE.read_bytes()
            content_type = 'text/javascript; charset=utf-8'
        elif path == '/styles.css':
            data = (REPO / 'styles.css').read_bytes()
            content_type = 'text/css; charset=utf-8'
        elif path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class NavigationRaces(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.addClassCleanup(cls.pw.stop)
        cls.browser = cls.pw.chromium.launch(executable_path=CHROME,
            args=['--disable-background-networking', '--disable-component-update', '--no-first-run'])
        cls.addClassCleanup(cls.browser.close)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), PublicFixture)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.addClassCleanup(cls.server.server_close)
        cls.addClassCleanup(cls.server.shutdown)
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    def setUp(self):
        self.blocked, self.errors = [], []
        self.observations = []
        self.context = self.browser.new_context(service_workers='block')
        self.addCleanup(self.context.close)
        def guard(route):
            if route.request.url.startswith(self.base+'/'):
                route.continue_()
            else:
                self.blocked.append(route.request.url)
                route.abort()
        self.context.route('**/*', guard)
        def block_socket(socket):
            self.blocked.append(socket.url)
            socket.close()
        self.context.route_web_socket('**/*', block_socket)
        self.context.add_init_script(INIT)
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.base)
        self.page.wait_for_selector('#loginForm')
        self.install_session('A')
        self.finish_boot('A-READY')

    def tearDown(self):
        unexpected = self.page.evaluate('unexpectedFetches')
        transports = self.page.evaluate('calls.map(c=>c.transport)')
        writes = self.page.evaluate('syntheticWriteIntents')
        AUDIT.append({'scenario': self._testMethodName, 'externalRequests': self.blocked,
                      'pageErrors': self.errors, 'unexpectedSyntheticFetches': unexpected,
                      'fetchCount': len(transports), 'allFetchesInMemory': all(t == 'in-memory' for t in transports),
                      'syntheticWriteIntents': writes, 'realBusinessWrites': 0,
                      'observations': self.observations})
        self.assertEqual(self.blocked, [], 'ZERO external requests required')
        self.assertEqual(unexpected, [], 'Unexpected synthetic transport call')
        self.assertEqual(self.errors, [], 'Actual app consumer leaked a page error')
        self.assertTrue(all(t == 'in-memory' for t in transports), 'Every fetch must terminate in memory')

    def request(self, name):
        suffix = '/'+name
        self.page.wait_for_function('s=>calls.some(c=>c.url.endsWith(s)&&!c.settled)', arg=suffix)
        return self.page.evaluate('s=>calls.map((c,i)=>({c,i})).filter(x=>x.c.url.endsWith(s)&&!x.c.settled).at(-1).i', suffix)

    def respond(self, index, data, status=200):
        self.page.evaluate('([i,s,d])=>release(i,s,d)', [index, status, data])
        self.page.wait_for_function('i=>calls[i].consumed', arg=index)
        # A browser task boundary drains chained promise jobs; no timing sleeps.
        self.page.evaluate('() => 0')

    def install_session(self, actor):
        self.page.evaluate('''([f,actor])=>{
          session={...f.session,token:'SYNTHETIC-'+actor,display_name:actor};
          currentTab='';currentSection='transactions';page=1;
          void boot();
        }''', [FIXTURE, actor])

    def finish_boot(self, tag):
        self.respond(self.request('my_profile'), FIXTURE['profile'])
        self.respond(self.request('transaction_directory_my'), FIXTURE['directory'])
        self.respond(self.request('my_permissions'), FIXTURE['perms'])
        self.respond(self.request('list_my_transactions'), listing(tag))
        self.page.wait_for_selector('#tableHost')

    def navigate(self, section):
        self.page.locator(f'[data-section="{section}"]').click()

    def section_request(self, section):
        self.navigate(section)
        return self.request('my_profile' if section == 'profile' else 'permissions_admin_snapshot')

    def section_data(self, section, tag):
        if section == 'profile':
            return dict(FIXTURE['profile'], name=tag)
        return dict(FIXTURE['permissions'], users=[dict(FIXTURE['permissions']['users'][0],
                                                       canonical_key=tag, display_name=tag)])

    def assert_transactions(self, message):
        self.assertEqual(self.page.evaluate('currentSection'), 'transactions', message)
        self.assertEqual(self.page.locator('#tableHost').count(), 1, message)
        self.assertEqual(self.page.locator('[data-section="transactions"][aria-current="page"]').count(), 1)

    def ordinary_navigation(self, section):
        call = self.section_request(section)
        self.respond(call, self.section_data(section, 'CURRENT'))
        self.assertEqual(self.page.evaluate('currentSection'), section)
        self.assertIn('CURRENT', self.page.locator('#app').inner_text()
                      if section == 'permissions' else self.page.locator('#profileName').input_value())
        self.navigate('transactions')
        self.assert_transactions('Ordinary section back navigation must render transactions')

    def newer_selection(self, section):
        call = self.section_request(section)
        self.navigate('transactions')
        self.respond(call, self.section_data(section, 'OBSOLETE'))
        self.assert_transactions('RED_NAV_NEWER_SELECTION: older section completion overwrote the newer selection')

    def newer_selection_rejection(self, section):
        call = self.section_request(section)
        self.navigate('transactions')
        self.respond(call, {'error': 'obsolete section failure'}, 503)
        self.assertEqual(self.page.locator('.ui-notice').count(), 0,
                         'RED_NAV_STALE_NOTICE: obsolete section rejection notified the current view')
        self.assert_transactions('Stale rejection must retain the newer selection')

    def pending_logout_relogin(self, section):
        call = self.section_request(section)
        self.page.locator('#logoutBtn').click()
        self.respond(self.request('logout'), {})
        self.page.wait_for_selector('#loginForm')
        self.install_session('B')
        self.finish_boot('B-READY')
        self.respond(call, self.section_data(section, 'OLD-ACCOUNT'))
        self.assertEqual(self.page.locator('.ui-notice').count(), 0,
                         'RED_NAV_OLD_OWNER_NOTICE: pending old-account result notified the new session')
        self.assert_transactions('Pending old-account section must not render into the new session')
        self.assertEqual(self.page.evaluate('[profileData,permissionsData]'), [None, None])
        self.assertIn('B-READY', self.page.locator('#tableHost').inner_text())

    def completed_owner_handoff(self, section):
        call = self.section_request(section)
        # Establish B in the exact microtask gap between real rpc's successful
        # owner check and its caller's commit. Transport itself is not replaced.
        self.page.evaluate('''([i,f])=>{calls[i].afterTransport=()=>{
          clearSession();session={...f.session,token:'SYNTHETIC-B'};
          profileData={...f.profile,name:'B-PROFILE'};
          permissionsData={...f.permissions,users:[]};permissionsSelectedUser='B-SELECTED';
          currentSection='transactions';renderApp();
        }}''', [call, FIXTURE])
        self.respond(call, self.section_data(section, 'OLD-ACCOUNT'))
        self.assertEqual(self.page.evaluate('profileData.name'), 'B-PROFILE',
                         'RED_PROFILE_COMMIT_OWNER: completed old-account profile replaced the new model')
        self.assertEqual(self.page.evaluate('permissionsData.users'), [],
                         'RED_PERMISSIONS_COMMIT_OWNER: completed old-account permissions replaced the new model')
        self.assertEqual(self.page.evaluate('permissionsSelectedUser'), 'B-SELECTED')
        self.assert_transactions('RED_NAV_COMPLETED_OWNER: completed old-account section rendered the new session')

    def pending_details_and_logout(self):
        button = self.page.locator('[data-act="open"]').first
        transaction_id = button.get_attribute('data-id')
        button.click()
        details = self.request('transactions-api')
        self.assertEqual(self.page.evaluate('i=>calls[i].body.action', details), 'details')
        self.assertEqual(self.page.evaluate('i=>calls[i].body.transaction_id', details), transaction_id)
        self.page.locator('#logoutBtn').click()
        logout = self.request('logout')
        marker = 'SYNTHETIC-OLD-DETAILS-LOGOUT'
        data = dict(FIXTURE['detail'], transaction=dict(FIXTURE['detail']['transaction'],
                    id=transaction_id, title=marker, subject=marker))
        return details, logout, data, marker

    def finish_synthetic_seen_intents(self):
        pending = self.page.evaluate('''calls.map((c,i)=>({c,i})).filter(x=>
          x.c.url.endsWith('/mark_my_transaction_seen')&&!x.c.settled).map(x=>x.i)''')
        for index in pending:
            body = self.page.evaluate('i=>calls[i].body', index)
            self.respond(index, {'ok': True, 'transaction_id': body['p_transaction_id'],
                         'seen_revision': body['p_revision'], 'activity_revision': body['p_revision'],
                         'read_state': 'read', 'has_unread_updates': False})

    def assert_clean_interactive_login(self, marker):
        snapshot = self.page.evaluate('''marker=>({
          overlays:document.querySelectorAll('.overlay').length,stack:modalStack.length,
          oldText:document.body.textContent.includes(marker),appInert:root.inert,
          modalOpen:document.body.classList.contains('modal-open'),
          loginForms:document.querySelectorAll('#loginForm').length,sessionCleared:session===null,
          notices:document.querySelectorAll('.ui-notice').length
        })''', marker)
        self.observations.append({'afterLogout': snapshot})
        self.assertEqual(snapshot, {'overlays': 0, 'stack': 0, 'oldText': False,
                         'appInert': False, 'modalOpen': False, 'loginForms': 1,
                         'sessionCleared': True, 'notices': 0},
                         'RED_FE001_LOGOUT_CLEANUP: old details must not cover or disable login')
        # Exercise public controls without submitting login or using credentials.
        self.page.locator('#username').click()
        self.page.locator('#username').fill('synthetic-local-only')
        self.assertTrue(self.page.evaluate('document.activeElement.id==="username"'))
        self.page.locator('#toggleLoginPassword').click()
        self.assertEqual(self.page.locator('#password').get_attribute('type'), 'text')
        self.assertEqual(self.page.locator('#toggleLoginPassword').get_attribute('aria-pressed'), 'true')

    def test_fe001_details_complete_during_pending_logout(self):
        details, logout, data, marker = self.pending_details_and_logout()
        self.respond(details, data)
        # Observe the baseline dialog while logout is still held. A future fix
        # may prevent it entirely; never require the bug as a test precondition.
        pending = self.page.evaluate('''i=>({logoutPending:!calls[i].settled,
          overlays:document.querySelectorAll('.overlay').length,stack:modalStack.length,
          appInert:root.inert,sessionPresent:session!==null})''', logout)
        self.observations.append({'detailsCompletedBeforeLogout': pending})
        self.assertTrue(pending['logoutPending'], 'Logout must still be deferred at details completion')
        self.finish_synthetic_seen_intents()
        self.respond(logout, {})
        self.page.wait_for_selector('#loginForm')
        # No dialog removal, Escape, or modal cleanup is performed by the test.
        self.assert_clean_interactive_login(marker)

    def test_fe001_details_complete_after_logout(self):
        details, logout, data, marker = self.pending_details_and_logout()
        self.respond(logout, {})
        self.page.wait_for_selector('#loginForm')
        self.respond(details, data)
        self.assert_clean_interactive_login(marker)
        self.assertEqual(self.page.evaluate('syntheticWriteIntents'), [],
                         'Stale details must not even start a synthetic seen intent')

    def delayed_refresh_then_profile(self):
        self.page.evaluate('window.originalTableHost=document.getElementById("tableHost")')
        self.page.locator('#resetFilters').click()
        refresh = self.request('list_my_transactions')
        profile = self.section_request('profile')
        self.respond(profile, self.section_data('profile', 'PROFILE-STAYS'))
        self.page.wait_for_selector('#profileName')
        self.assertFalse(self.page.evaluate('originalTableHost.isConnected'))
        return refresh

    def test_fe003_refresh_renders_replacement_transactions_host(self):
        refresh = self.delayed_refresh_then_profile()
        self.navigate('transactions')
        self.assert_transactions('Returning through the sidebar must create a current table')
        self.assertTrue(self.page.evaluate('document.getElementById("tableHost")!==originalTableHost'))
        data = dict(listing('REPLACEMENT-LATEST'), total=203,
                    counters={'incoming': 17, 'late': 8, 'pending_approval': 6, 'closed_today': 4})
        self.respond(refresh, data)
        snapshot = self.page.evaluate('''()=>({model:listData.rows[0].title,
          rendered:document.querySelector('#tableHost .tx-title').firstChild.textContent,
          total:document.getElementById('rowTotal').textContent,
          pager:document.querySelector('#pagerHost .pager span').textContent,
          counters:['statIncoming','statLate','statPending','statClosedToday'].map(id=>document.getElementById(id).textContent)
        })''')
        self.observations.append({'replacementHostCompletion': snapshot})
        self.assertEqual(snapshot, {'model': 'REPLACEMENT-LATEST', 'rendered': 'REPLACEMENT-LATEST',
                         'total': '203', 'pager': '1 / 5', 'counters': ['17', '8', '6', '4']},
                         'RED_FE003_REPLACEMENT_HOST: latest rows, counters and pager must reach current DOM')
        self.assert_transactions('Refresh must retain the current transactions selection')

    def test_fe003_refresh_completes_while_profile_remains(self):
        refresh = self.delayed_refresh_then_profile()
        self.respond(refresh, listing('LATEST-WHILE-PROFILE'))
        self.assertEqual(self.page.evaluate('listData.rows[0].title'), 'LATEST-WHILE-PROFILE')
        self.assertEqual(self.page.evaluate('currentSection'), 'profile')
        self.assertEqual(self.page.locator('#profileName').input_value(), 'PROFILE-STAYS')
        self.assertEqual(self.page.locator('[data-section="profile"][aria-current="page"]').count(), 1)
        self.assertEqual(self.page.locator('#tableHost').count(), 0,
                         'A refresh completed while Profile remains must not navigate')
        self.assertEqual(self.page.locator('.ui-notice').count(), 0)

    def requested_page(self, index):
        return self.page.evaluate('i=>calls[i].body.p_page', index)

    def click_next(self):
        self.page.locator('#nextPage').click()
        return self.request('list_my_transactions')

    def fail_page_two(self):
        self.assert_displayed_page('A-READY', 1)
        request = self.click_next()
        self.assertEqual(self.requested_page(request), 2)
        self.respond(request, {'error': 'synthetic page two failure'}, 503)
        self.assertEqual(self.page.locator('#retryList').count(), 1)
        self.assertEqual(self.page.locator('.ui-notice').count(), 1)
        self.assert_displayed_page('A-READY', 1)

    def assert_displayed_page(self, tag, number):
        # Observe accepted data and the visible pager independently of the
        # mutable request variable. Never equate an outgoing p_page to a commit.
        snapshot = self.page.evaluate('''()=>({committedPage:listData.page,
          committedTitle:listData.rows[0].title,
          visibleTitle:document.querySelector('#tableHost .tx-title').firstChild.textContent,
          visiblePager:document.querySelector('#pagerHost .pager span').textContent})''')
        self.observations.append({'display': snapshot, 'observedGlobalPage': self.page.evaluate('page')})
        self.assertEqual(snapshot, {'committedPage': number, 'committedTitle': tag,
                         'visibleTitle': tag, 'visiblePager': f'{number} / 4'})

    def capture_list_exports(self):
        self.page.evaluate('''()=>{
          if(window.outputCapture)return;
          window.outputCapture={blobs:[],prints:[]};
          const createURL=URL.createObjectURL.bind(URL);
          URL.createObjectURL=blob=>{
            const entry={text:null,type:blob.type};outputCapture.blobs.push(entry);
            blob.text().then(text=>{entry.text=text});return createURL(blob);
          };
          window.open=()=>{
            const entry={html:''};outputCapture.prints.push(entry);
            return {document:{write:text=>{entry.html+=text},close(){}},focus(){},print(){}};
          };
        }''')
        before = self.page.evaluate('outputCapture.blobs.length')
        self.page.locator('#excelListBtn').click()
        self.page.wait_for_function('n=>outputCapture.blobs.length===n+1&&outputCapture.blobs[n].text!==null', arg=before)
        self.page.locator('#pdfListBtn').click()
        output = self.page.evaluate('''()=>{
          const parser=new DOMParser(),blob=outputCapture.blobs.at(-1);
          const excel=parser.parseFromString(blob.text,'application/xml');
          const print=parser.parseFromString(outputCapture.prints.at(-1).html,'text/html');
          return {excel:[...excel.getElementsByTagName('Row')].slice(1).map(row=>
            [...row.getElementsByTagName('Data')].slice(0,3).map(cell=>cell.textContent)),
            print:[...print.querySelectorAll('tbody tr')].map(row=>
              [...row.querySelectorAll('td')].slice(0,3).map(cell=>cell.textContent))};
        }''')
        self.observations.append({'actualExportOutput': output})
        return output

    def assert_exported_page(self, tag, number):
        row = [str(1+(number-1)*50), tag, tag]
        self.assertEqual(self.capture_list_exports(), {'excel': [row], 'print': [row]},
                         'RED_FE004_EXPORT_PAGE: export and print must number the committed rows')

    def test_fe004_failed_next_exports_keep_page_one(self):
        self.fail_page_two()
        self.assert_exported_page('A-READY', 1)

    def test_fe004_failed_next_click_retries_page_two_and_recovers(self):
        self.fail_page_two()
        retry = self.click_next()
        self.assertEqual(self.requested_page(retry), 2,
                         'RED_FE004_NEXT_RETRY: Next after failed page two must not skip to page three')
        self.respond(retry, listing('NEXT-RECOVERED', 2))
        self.assert_displayed_page('NEXT-RECOVERED', 2)
        self.assert_exported_page('NEXT-RECOVERED', 2)
        self.assertEqual(self.page.locator('#retryList').count(), 0)

    def test_fe004_failed_next_retry_button_recovers_page_two(self):
        self.fail_page_two()
        self.page.locator('#retryList').click()
        retry = self.request('list_my_transactions')
        self.assertEqual(self.requested_page(retry), 2, 'Explicit retry must preserve requested page two')
        self.respond(retry, listing('RETRY-RECOVERED', 2))
        self.assert_displayed_page('RETRY-RECOVERED', 2)
        self.assert_exported_page('RETRY-RECOVERED', 2)
        self.assertEqual(self.page.locator('#retryList').count(), 0)

    def test_fe004_pending_next_exports_keep_committed_page(self):
        request = self.click_next()
        self.assertEqual(self.requested_page(request), 2)
        self.assert_displayed_page('A-READY', 1)
        self.assert_exported_page('A-READY', 1)
        self.respond(request, listing('PENDING-RECOVERED', 2))
        self.assert_displayed_page('PENDING-RECOVERED', 2)
        self.assert_exported_page('PENDING-RECOVERED', 2)

    def test_fe004_ordinary_next_success(self):
        request = self.click_next()
        self.assertEqual(self.requested_page(request), 2)
        self.respond(request, listing('PAGE-TWO', 2))
        self.assert_displayed_page('PAGE-TWO', 2)
        self.assert_exported_page('PAGE-TWO', 2)
        request = self.click_next()
        self.assertEqual(self.requested_page(request), 3)
        self.respond(request, listing('PAGE-THREE', 3))
        self.assert_displayed_page('PAGE-THREE', 3)
        self.assert_exported_page('PAGE-THREE', 3)

    def test_fe004_stale_failure_cannot_roll_back_newer_success(self):
        older = self.click_next()
        self.assertEqual(self.requested_page(older), 2)
        # Change the filter through its real handler, then accept a newer page
        # two. Rolling the old failure back to its previous page one is wrong.
        self.page.locator('#statusFilter').select_option('open')
        filtered = self.request('list_my_transactions')
        self.assertNotEqual(filtered, older)
        self.assertEqual(self.requested_page(filtered), 1)
        self.respond(filtered, listing('FILTERED-ONE'))
        newer = self.click_next()
        self.assertEqual(self.requested_page(newer), 2)
        self.respond(newer, listing('NEWER-TWO', 2))
        self.respond(older, {'error': 'obsolete page failure'}, 503)
        self.assert_displayed_page('NEWER-TWO', 2)
        self.assertEqual(self.page.locator('.ui-notice').count(), 0)
        self.assertEqual(self.page.locator('#retryList').count(), 0)
        self.assert_exported_page('NEWER-TWO', 2)
        request = self.click_next()
        self.assertEqual(self.requested_page(request), 3,
                         'Stale failure must not roll back the newer successful page')
        self.respond(request, listing('AFTER-STALE-THREE', 3))
        self.assert_displayed_page('AFTER-STALE-THREE', 3)


for section in ('profile', 'permissions'):
    for case in ('ordinary_navigation', 'newer_selection', 'newer_selection_rejection',
                 'pending_logout_relogin', 'completed_owner_handoff'):
        def scenario(self, section=section, case=case):
            getattr(self, case)(section)
        setattr(NavigationRaces, 'test_nav_'+section+'_'+case, scenario)


class Receipts(unittest.TextTestResult):
    def startTest(self, test):
        super().startTest(test)
        self.scenarios.append({'name': test.id(), 'status': 'running'})

    def addSuccess(self, test):
        super().addSuccess(test)
        self.scenarios[-1]['status'] = 'passed'

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.scenarios[-1].update(status='failed', assertion=self._exc_info_to_string(err, test))

    def addError(self, test, err):
        super().addError(test, err)
        self.scenarios.append({'name': test.id(), 'status': 'error', 'error': self._exc_info_to_string(err, test)})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.scenarios = []


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--app-source', type=Path, default=REPO / 'app.js')
    parser.add_argument('--match', default='', help='navigation, FE-001, FE-003, FE-004, or a test-name substring')
    options = parser.parse_args()
    APP_SOURCE = options.app_source.resolve()
    CHROME = os.environ.get('CHROMIUM_EXECUTABLE_PATH', str(CACHED_CHROME))
    AUDIT = []
    names = unittest.defaultTestLoader.getTestCaseNames(NavigationRaces)
    groups = {'navigation': 'test_nav_', 'FE-001': 'test_fe001_',
              'FE-003': 'test_fe003_', 'FE-004': 'test_fe004_'}
    match = groups.get(options.match, options.match)
    suite = unittest.TestSuite(NavigationRaces(name) for name in names if match in name)
    if not suite.countTestCases():
        parser.error('No scenarios match --match')
    result = unittest.TextTestRunner(verbosity=2, resultclass=Receipts).run(suite)
    report = {'sourceBase': SOURCE_BASE, 'appSource': str(APP_SOURCE),
              'appSha256': hashlib.sha256(APP_SOURCE.read_bytes()).hexdigest(),
              'harnessSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'command': [sys.executable, *sys.argv], 'chromiumExecutablePath': CHROME,
              'mode': 'offline synthetic only; not deployed/native acceptance',
              'testsRun': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
              'passed': sum(s['status']=='passed' for s in result.scenarios),
              'externalRequestCount': sum(len(a['externalRequests']) for a in AUDIT) if AUDIT else None,
              'pageErrors': [e for a in AUDIT for e in a['pageErrors']],
              'syntheticWriteIntentCount': sum(len(a['syntheticWriteIntents']) for a in AUDIT),
              'realBusinessWrites': 0,
              'scenarios': result.scenarios, 'audit': AUDIT, 'success': result.wasSuccessful()}
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    sys.exit(0 if result.wasSuccessful() else 1)
