"""Reviewer regression cases. Synthetic renderer only; every API request blocked."""
import ast, functools, json, sys, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

repo=Path(__file__).resolve().parents[1]
# Reuse this repository's declared fixture constants, not executable app code.
source=(repo/'tests/ui_renderer.py').read_text(encoding='utf-8')
allowed={'PERMS','perms','user','users','units','rows','detail','fixture','INIT'}
constants=[n for n in ast.parse(source).body if isinstance(n,ast.Assign) and all(isinstance(t,ast.Name) and t.id in allowed for t in n.targets)]
env={};exec(compile(ast.Module(body=constants,type_ignores=[]),'declared-ui-fixtures','exec'),env)
fixture,init=env['fixture'],env['INIT']
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(repo)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
checks=[];blocked=[]
def check(name,ok,info=None):checks.append({'name':name,'passed':bool(ok),'info':info})
with sync_playwright() as pw:
    browser=pw.chromium.launch();context=browser.new_context(service_workers='block')
    def guard(route):
        if route.request.url.startswith(base+'/'):route.continue_()
        else:blocked.append(route.request.url);route.abort()
    context.route('**/*',guard)
    def fresh(width=1440):
        page=context.new_page();page.set_viewport_size({'width':width,'height':900 if width>700 else 844});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base);page.wait_for_selector('#loginForm');page.evaluate(init,fixture);page.evaluate('priorityFilter="عاجل";renderApp()');return page,errors

    page,errors=fresh()
    page.evaluate('()=>{rpc=async()=>{throw new Error("fixture-list-failure")}}')
    page.locator('#resetFilters').click();page.wait_for_timeout(120)
    check('reset-failure-preserves-retry',page.locator('#retryList').count()==1)
    check('reset-failure-preserves-rows',page.locator('tbody tr').count()==2)
    check('reset-failure-shows-error',page.locator('.ui-notice').count()==1)
    check('reset-failure-no-pageerror',not errors,errors);page.close()

    page,errors=fresh()
    page.evaluate('()=>{rpc=(name)=>name==="my_profile"?Promise.resolve(window.__fixture.profile):new Promise(resolve=>{window.__releaseList=resolve})}')
    page.locator('#resetFilters').click();page.wait_for_function('typeof window.__releaseList==="function"')
    page.locator('[data-section="profile"]').click();page.wait_for_selector('#profileName')
    page.evaluate('void window.__releaseList(window.__fixture.list)');page.wait_for_timeout(120)
    check('reset-navigation-preserves-profile',page.locator('#profileName').count()==1)
    check('reset-navigation-no-pageerror',not errors,errors);page.close()

    page,errors=fresh(390)
    page.locator('#resetFilters').focus();page.keyboard.press('Enter');page.wait_for_timeout(120)
    check('mobile-reset-keeps-visible-focus',page.evaluate('document.activeElement!==document.body&&document.activeElement.checkVisibility()'))
    check('mobile-reset-disclosure-accessible',page.locator('#filtersPanel').get_attribute('open') is not None)
    check('mobile-reset-no-pageerror',not errors,errors);page.close()

    page,errors=fresh()
    page.evaluate('()=>{post=()=>new Promise(resolve=>{window.__releaseDetails=resolve})}')
    page.locator('[data-act="open"]').first.focus();page.keyboard.press('Enter')
    page.wait_for_function('typeof window.__releaseDetails==="function"')
    page.locator('#search').focus()
    page.evaluate('void window.__releaseDetails(window.__fixture.detail)');page.wait_for_selector('.overlay');page.wait_for_timeout(80)
    page.keyboard.press('Escape')
    check('delayed-open-restores-original-invoker',page.evaluate('document.activeElement===document.querySelector("[data-act=open]")'))
    check('delayed-open-no-pageerror',not errors,errors);page.close()

    page,errors=fresh()
    page.evaluate('openOwnPasswordChange()');page.wait_for_timeout(80)
    check('password-invalid-submit-disabled',page.locator('#saveProfilePassword').is_disabled())
    # Exercise defense-in-depth directly; an actual disabled-button click cannot submit.
    page.evaluate('document.getElementById("saveProfilePassword").onclick()');page.wait_for_timeout(80)
    message=page.locator('.modal-feedback').inner_text()
    check('password-invalid-has-specific-feedback','كلمة المرور' in message and 'الاتصال' not in message,message)
    check('password-invalid-no-backend-call',not page.evaluate('window.__fixtureCalls.length'))
    check('password-invalid-no-pageerror',not errors,errors);page.close()

    page,errors=fresh()
    page.evaluate('()=>{currentSection="permissions";renderPermissionsApp();rpc=async name=>{if(name==="permissions_admin_set_by_account")return {};throw new Error("fixture-snapshot-failure")}}')
    toggle=page.locator('[data-permission-toggle]').first;wanted=not toggle.is_checked();toggle.click();page.wait_for_timeout(80)
    check('permission-refresh-failure-keeps-acknowledged-state',toggle.is_checked()==wanted)
    message=page.locator('.ui-notice').inner_text()
    check('permission-refresh-failure-has-accurate-feedback','تعذر تحديث' in message and 'بقيت القيمة السابقة' not in message,message)
    check('permission-refresh-failure-no-pageerror',not errors,errors);page.close()
    browser.close()
server.shutdown();check('no-api-requests',not blocked,blocked)
report={'data':'isolated synthetic fixtures, not authenticated backend acceptance','checks':checks,'passed':all(c['passed'] for c in checks)}
print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(0 if report['passed'] else 1)
