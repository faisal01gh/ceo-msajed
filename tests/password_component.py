"""Password component acceptance, synthetic renderer only; no staff/Auth requests."""
import argparse, functools, json, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
repo=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
parser=argparse.ArgumentParser();parser.add_argument('--url',choices=['https://ceo-msajed.pages.dev']);args=parser.parse_args()
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(repo)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=args.url or f'http://127.0.0.1:{server.server_port}'
checks=[];blocked=[];errors=[]
def check(name,ok,info=None):checks.append({'name':name,'passed':bool(ok),'info':info})
with sync_playwright() as pw:
    browser=pw.chromium.launch();context=browser.new_context(service_workers='block')
    def guard(route):
        if route.request.url.startswith(base+'/'):route.continue_()
        else:blocked.append(route.request.url);route.abort()
    context.route('**/*',guard)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append('console: '+m.text) if m.type=='error' else None)
    for width in [1440,390]:
        for mode in ['forced','profile']:
            page.set_viewport_size({'width':width,'height':900 if width>700 else 844});page.goto(base);page.wait_for_selector('#loginForm')
            if mode=='forced':
                page.evaluate('passwordChangeView({auth:{access_token:"LOCAL_RENDERER_NOT_A_TOKEN",refresh_token:null}})')
                first,second,submit,toggle='newPassword','confirmPassword','passwordBtn','toggleNewPassword'
            else:
                page.evaluate('session={token:"LOCAL_RENDERER_NOT_A_TOKEN"};openOwnPasswordChange()')
                first,second,submit,toggle='profileNewPassword','profileConfirmPassword','saveProfilePassword','toggleProfileNewPassword'
            scope=page.locator('.password-card') if mode=='forced' else page.locator('.modal')
            page.wait_for_timeout(80)
            prefix=f'{width}/{mode}'
            check(prefix+'/single-shared-list',scope.locator('.password-requirements').count()==1)
            check(prefix+'/initial-disabled',page.locator('#'+submit).is_disabled())
            check(prefix+'/initial-neutral',scope.locator('[data-password-rule].ok').count()==0)
            live=scope.locator('[data-password-match-status][role="status"][aria-live="polite"][aria-atomic="true"]')
            check(prefix+'/polite-match-live-region',live.count()==1)
            check(prefix+'/initial-live-region-empty',live.count()==1 and live.inner_text()=='')
            page.evaluate('''()=>{window.__passwordMatchStatus=document.querySelector('[data-password-match-status]');window.__matchAnnouncements=0;if(window.__passwordMatchStatus){new MutationObserver(()=>window.__matchAnnouncements++).observe(window.__passwordMatchStatus,{subtree:true,childList:true,characterData:true})}}''')
            layout=page.evaluate('''ids=>{const a=document.getElementById(ids[0]),b=document.getElementById(ids[1]),list=(a.closest('.password-card')||a.closest('.modal')).querySelector('.password-requirements');if(!list)return null;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),lr=list.getBoundingClientRect(),rows=[...list.querySelectorAll('[data-password-rule]')].map(e=>e.getBoundingClientRect());return {first:ar.y,second:br.y,end:br.bottom,list:lr.y,vertical:rows.every((r,i)=>!i||r.y>=rows[i-1].bottom),width:document.documentElement.scrollWidth}}''',[first,second])
            check(prefix+'/vertical-order',layout is not None and layout['first']<layout['second'] and layout['list']>=layout['end'] and layout['vertical'],layout)
            if layout:check(prefix+'/page-fit',layout['width']<=width+1)
            for value,rule in [('A','upper'),('a','lower'),('!','symbol'),('Abcd12!x','length'),('1','digit')]:
                page.locator('#'+first).fill(value)
                element=scope.locator('[data-password-rule="'+rule+'"]')
                check(prefix+'/'+rule+'/instant',element.count()==1 and 'ok' in (element.get_attribute('class') or ''))
                check(prefix+'/'+rule+'/still-disabled',page.locator('#'+submit).is_disabled())
            page.locator('#'+first).fill('Abcdef1!');page.locator('#'+second).fill('Different2!')
            element=scope.locator('[data-password-rule="match"]')
            check(prefix+'/mismatch-neutral',element.count()==1 and 'ok' not in (element.get_attribute('class') or '') and not scope.locator('.bad').count())
            check(prefix+'/mismatch-disabled',page.locator('#'+submit).is_disabled())
            check(prefix+'/mismatch-live-status',live.count()==1 and live.inner_text()=='كلمتا المرور غير متطابقتين')
            page.locator('#'+second).fill('Abcdef1!')
            check(prefix+'/match-live-status',live.count()==1 and live.inner_text()=='كلمتا المرور متطابقتان')
            check(prefix+'/persistent-live-region',page.evaluate('''()=>!!window.__passwordMatchStatus&&window.__passwordMatchStatus.isConnected&&window.__passwordMatchStatus===document.querySelector('[data-password-match-status]')'''))
            check(prefix+'/live-status-mutated',page.evaluate('window.__matchAnnouncements>=2'))
            check(prefix+'/all-rules-green',scope.locator('[data-password-rule].ok').count()==6)
            check(prefix+'/valid-enabled',page.locator('#'+submit).is_enabled())
            page.locator('#'+first).fill('Aa1!😀xy');page.locator('#'+second).fill('Aa1!😀xy')
            check(prefix+'/seven-unicode-characters-disabled',page.locator('#'+submit).is_disabled())
            page.locator('#'+first).fill('Aa1!😀xyz');page.locator('#'+second).fill('Aa1!😀xyz')
            check(prefix+'/eight-unicode-characters-enabled',page.locator('#'+submit).is_enabled())
            page.locator('#'+first).fill('Abcdefg!');page.locator('#'+second).fill('Abcdefg!')
            check(prefix+'/digit-required',page.locator('#'+submit).is_disabled())
            page.locator('#'+first).fill('Abcdef1 ');page.locator('#'+second).fill('Abcdef1 ')
            check(prefix+'/space-not-symbol',page.locator('#'+submit).is_disabled())
            page.locator('#'+toggle).click();check(prefix+'/toggle-preserved',page.locator('#'+first).get_attribute('type')=='text')
            # Report only neutral state metadata, never input values.
            check(prefix+'/no-password-text-in-list',not scope.locator('.password-requirements').count() or 'Abcdef' not in scope.locator('.password-requirements').inner_text())
    check('no-api-requests',not blocked,blocked);check('no-page-errors',not errors,errors);browser.close()
server.shutdown();print(json.dumps({'checks':len(checks),'failures':[c for c in checks if not c['passed']],'passed':all(c['passed'] for c in checks)},ensure_ascii=False,indent=2));sys.exit(0 if all(c['passed'] for c in checks) else 1)
