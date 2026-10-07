"""Deployed public-login acceptance; no credential submission or data mutations."""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser();parser.add_argument('--url',default='https://ceo-msajed.pages.dev');parser.add_argument('--output',required=True);args=parser.parse_args()
repo=Path(__file__).resolve().parents[1];out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
base=args.url.rstrip('/');sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
report={'sha':sha,'origin':base,'mode':'real deployed public login; no fixture data and no auth submission','assets':[],'sizes':[],'page_errors':[],'console_errors':[],'failed_requests':[],'checks':[]}
def check(name,ok,info=None):report['checks'].append({'name':name,'passed':bool(ok),'info':info})
with sync_playwright() as pw:
    browser=pw.chromium.launch();context=browser.new_context()
    context.add_init_script('window.__cspViolations=[];document.addEventListener("securitypolicyviolation",e=>window.__cspViolations.push({directive:e.violatedDirective,blocked:e.blockedURI}));')
    for name,path in [('index.html','/'),('app.js','/app.js?v=20261007-1'),('styles.css','/styles.css?v=20261007-1'),('service-worker.js','/service-worker.js')]:
        response=context.request.get(base+path);data=response.body();committed=subprocess.check_output(['git','show',sha+':'+name],cwd=repo)
        # Git normalization can make the checkout CRLF; compare committed bytes.
        item={'file':name,'status':response.status,'matches_commit':data==committed,'sha256':hashlib.sha256(data).hexdigest(),'commit_sha256':hashlib.sha256(committed).hexdigest()};report['assets'].append(item)
        check('asset/'+name,response.status==200 and data==committed,item)
    page=context.new_page();page.on('pageerror',lambda e:report['page_errors'].append(str(e)));page.on('console',lambda m:report['console_errors'].append(m.text) if m.type=='error' else None);page.on('requestfailed',lambda r:report['failed_requests'].append({'url':r.url,'failure':r.failure}))
    for width in [1440,1280,1024,768,390]:
        page.set_viewport_size({'width':width,'height':900 if width>700 else 844});page.goto(base+'/');page.wait_for_selector('#loginForm')
        geometry=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,button:document.getElementById("loginBtn").getBoundingClientRect().height,font:getComputedStyle(document.body).fontFamily})');report['sizes'].append(geometry)
        check(f'{width}/page-fit',geometry['scroll']<=width+1,geometry);check(f'{width}/primary-target',geometry['button']>=44)
        check(f'{width}/identity',page.title()=='جمعية عمارة المساجد')
        page.locator('#loginBtn').click();check(f'{width}/empty-form-feedback','أكمل الحقلين' in page.locator('#loginMsg').inner_text())
        check(f'{width}/csp',not page.evaluate('window.__cspViolations'),page.evaluate('window.__cspViolations'))
        check(f'{width}/script-version','20261007-1' in page.locator('script[src]').get_attribute('src'))
        page.locator('#toggleLoginPassword').click();check(f'{width}/show-hide',page.locator('#password').get_attribute('type')=='text')
        page.screenshot(path=str(out/f'{width}-public-login.png'),full_page=True)
    page.wait_for_function('navigator.serviceWorker.controller!==null',timeout=20000)
    worker=page.evaluate('async()=>{const r=await navigator.serviceWorker.ready;return {script:r.active?.scriptURL,state:r.active?.state,caches:await caches.keys()}}')
    check('service-worker/active',worker['state']=='activated',worker);check('service-worker/new-cache','ceo-msajed-static-20261007-1' in worker['caches'],worker)
    check('no-page-errors',not report['page_errors']);check('no-console-errors',not report['console_errors']);check('no-failed-requests',not report['failed_requests'])
    browser.close()
report['passed']=all(c['passed'] for c in report['checks']);(out/'public-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'sha':sha,'passed':report['passed'],'checks':len(report['checks']),'failures':[c['name'] for c in report['checks'] if not c['passed']],'assets':report['assets'],'page_errors':report['page_errors'],'console_errors':report['console_errors'],'report':str(out/'public-report.json')},ensure_ascii=False))
sys.exit(0 if report['passed'] else 1)
