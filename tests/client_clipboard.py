"""Actual app.js clipboard behavior in Chromium; every network request forbidden."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

repo=Path(__file__).resolve().parents[1]
source=(repo/'app.js').read_text(encoding='utf-8')
source=source[:source.index('\nroot.addEventListener("click"')]
checks=[];blocked=[]
def check(name,ok): checks.append({'name':name,'passed':bool(ok)})
with sync_playwright() as pw:
    browser=pw.chromium.launch()
    context=browser.new_context(service_workers='block')
    context.route('**/*',lambda r:(blocked.append(r.request.url),r.abort()))
    def fresh(mode):
        p=context.new_page()
        p.set_content('<!doctype html><html><body><main id="app"></main></body></html>')
        p.add_script_tag(content=source)
        p.evaluate('''mode=>{
          fetch=()=>{throw Error('External network forbidden')};
          session={app:'new',token:'synthetic-A'};
          window.d={transaction:{title:'</textarea><img src=x onerror="window.injected=true">',subject:'PRIVATE-A',created_at:'2026-10-01',responsible_name:'A'}};
          window.w=modal('Current transaction','<button id="copy">Copy</button>');
          window.notices=[];showNotice=(message,success)=>notices.push({message,success});
          const clipboard=mode==='missing'?undefined:{writeText:text=>{
            window.written=text;
            if(mode==='sync')throw Error('denied synchronously');
            if(mode==='denied')return Promise.reject(Error('denied'));
            return new Promise((resolve,reject)=>{window.resolveCopy=resolve;window.rejectCopy=reject});
          }};
          Object.defineProperty(navigator,'clipboard',{configurable:true,value:clipboard});
          window.copyError=null;
          try{window.copyJob=Promise.resolve(copyWhatsApp(d)).catch(e=>{copyError=e.message})}catch(e){copyError=e.message;window.copyJob=Promise.resolve()}
        }''',mode)
        return p
    for mode in ['missing','denied','sync']:
        p=fresh(mode);p.evaluate('copyJob')
        state=p.evaluate('''()=>{const t=w.querySelector('textarea');return {error:copyError,count:w.querySelectorAll('textarea').length,readonly:t?.readOnly,value:t?.value,selected:t&&t.selectionEnd===t.value.length&&t.selectionStart===0,focused:document.activeElement===t,injected:!!window.injected,images:w.querySelectorAll('img').length,success:notices.some(n=>n.success)}}''')
        check(mode+'/manual-copy',state['error'] is None and state['count']==1 and state['readonly'] and state['selected'] and state['focused'])
        check(mode+'/injection-safe',(state.get('value') or '').find('</textarea><img')>=0 and not state['injected'] and state['images']==0)
        check(mode+'/no-false-success',not state['success']);p.close()
    p=fresh('deferred')
    check('pending/no-success',p.evaluate('notices.length===0'))
    p.evaluate('async()=>{resolveCopy();await copyJob}')
    check('resolved/success',p.evaluate('notices.length===1&&notices[0].success===true&&written.includes("PRIVATE-A")&&!w.querySelector("textarea")'));p.close()
    for outcome in ['success','failure']:
        for switch in ['owner','dialog']:
            p=fresh('deferred')
            p.evaluate('''switchKind=>{if(switchKind==='owner')session={app:'new',token:'synthetic-B'};w.remove();window.newDialog=modal('New dialog','<p>New content</p>')}''',switch)
            p.evaluate('''async outcome=>{if(outcome==='success')resolveCopy();else rejectCopy(Error('denied'));await copyJob}''',outcome)
            check('stale-'+switch+'/'+outcome,p.evaluate('notices.length===0&&!document.querySelector("textarea")&&!newDialog.textContent.includes("PRIVATE-A")'));p.close()
    # A missing dialog may create a manual-copy dialog, still using text value only.
    p=fresh('deferred')
    p.evaluate('''async()=>{resolveCopy();await copyJob;w.remove();notices=[];Object.defineProperty(navigator,'clipboard',{value:undefined});try{await copyWhatsApp(d)}catch(e){copyError=e.message}}''')
    check('no-dialog/manual-copy',p.evaluate('!!document.querySelector("[role=dialog] textarea[readonly]")'));p.close()
    browser.close()
check('external-network',not blocked)
failed=[c['name'] for c in checks if not c['passed']]
output=json.dumps({'checks':len(checks),'passed':len(checks)-len(failed),'failures':failed,'blocked':blocked},ensure_ascii=False)
print(output)
if len(sys.argv)>1:
    path=Path('C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/client-fixes-tdd-evidence.md')
    with path.open('a',encoding='utf-8') as f:f.write(f'\n## {sys.argv[1]} clipboard\nCommand: uv run --offline --with playwright python -B tests/client_clipboard.py {sys.argv[1]}\n\n{output}\nExit: {bool(failed)*1}\n')
sys.exit(bool(failed))
