"""Isolated UI renderer tests; synthetic data, ZERO database requests."""
import argparse, json, threading, functools, contextlib, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser();parser.add_argument('--source',default=str(Path(__file__).resolve().parents[1]));parser.add_argument('--url');parser.add_argument('--no-screenshots',action='store_true');parser.add_argument('--output',required=True);parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
server=None
if args.url:
    base=args.url.rstrip('/')
else:
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=args.source))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
PERMS=['view_all','act_all','create','edit_subject','change_responsible_unit','change_priority','change_responsible','close','reopen','set_due_date','ceo_view','delete_hard','raise_manager','assign_department','assign_sector','assign_cross_sector','add_supporting','raise_assistant','transfer_assistant','decide_assistant_transfer','raise_ceo']
perms=['transactions.'+x for x in PERMS]+['profiles.admin_edit_name']
user={'canonical_key':'ui-fixture-user','user_id':'fixture-auth','display_name':'مستخدم اختبار الواجهة','login_name':'ui-fixture','role':'ceo_office_manager','org_name':'قطاع الاختبار','dept_name':'إدارة الاختبار','dept_names':['إدارة الاختبار']}
users=[user,dict(user,canonical_key='ui-fixture-assistant',display_name='مساعد الاختبار',login_name='assistant-fixture',role='assistant'),dict(user,canonical_key='ui-fixture-employee',display_name='موظف الاختبار',login_name='employee-fixture',role='employee')]
units=[{'id':'fixture-sector','name':'قطاع الاختبار','unit_type':'sector','parent_id':None},{'id':'fixture-unit','name':'إدارة الاختبار','unit_type':'department','parent_id':'fixture-sector'}]
rows=[{'id':'fixture-transaction','number':'2026-UI-001','title':'معاملة اختبار معزولة للتحقق من عرض المحتوى الطويل والمسافات','responsible_unit_name':'إدارة الاختبار','responsible_name':user['display_name'],'supporting_count':2,'current_assignees':['موظف الاختبار','مساعد الاختبار'],'priority':'عاجل جدًا','status':'open','days':12,'late':True,'last_activity_at':'2026-10-04T12:00:00Z','current_level':'manager','origin':'new','responsible_unit_id':'fixture-unit','responsible_login_name':user['login_name']}, {'id':'fixture-closed','number':'2026-UI-002','title':'معاملة مغلقة للتحقق من الحالة','priority':'عادي','status':'closed','days':3,'current_assignees':[],'last_activity_at':'2026-10-04T12:00:00Z'}]
detail={'transaction':dict(rows[0],subject='هذه بيانات مصطنعة لاختبار الواجهة فقط. لا تمثل معاملة حقيقية ولا تحفظ في أي قاعدة بيانات.\nتفاصيل متعددة الأسطر لاختبار القراءة.',created_at='2026-10-01T12:00:00Z',due_at='2026-10-10T12:00:00Z',workflow_started=True,attachment_url='https://example.com/document',migration_status='ready'), 'assignments':[{'id':'assignment-fixture','unit_id':'fixture-unit','assignment_type':'supporting','status':'active','created_at':'2026-10-04','directive':'توجيه اختبار معزول','transaction_assignment_targets':[{'display_name':'موظف الاختبار'}]}], 'actions':[{'id':'action-fixture','actor_name':user['display_name'],'created_at':'2026-10-04','action_text':'إجراء اختبار الواجهة — قراءة المحتوى دون حفظ.'}], 'action_versions':[{'action_id':'action-fixture','version_no':1,'body':'نسخة اختبار أولى'},{'action_id':'action-fixture','version_no':2,'body':'نسخة اختبار ثانية'}], 'action_notes':[{'action_id':'action-fixture','actor_name':'مساعد الاختبار','created_at':'2026-10-04','note':'ملاحظة اختبار'}], 'periods':[{'cycle_no':1,'started_at':'2026-10-01','ended_at':None}], 'routes':[{'id':'route-fixture','from_name':'مستخدم الاختبار','to_name':'موظف الاختبار','created_at':'2026-10-04','directive':'إحالة اختبار','proposed_decision':'قرار اختبار'}], 'requests':[{'id':'request-fixture','requested_by_name':'موظف الاختبار','created_at':'2026-10-04','reason':'طلب اختبار معزول','request_type':'extension','status':'pending','meta':{'requester_role':'employee'}}], 'history':[{'actor_name':'مستخدم الاختبار','created_at':'2026-10-04','detail':'سجل اختبار العرض'}], 'can_act':True,'can_close':True,'can_raise_ceo':True,'flags':{'scope':True}}
fixture={'session':dict(user,username=user['login_name'],app='new',token='ISOLATED_UI_TEST_NOT_A_TOKEN'), 'directory':{'users':users,'units':units,'me':user}, 'list':{'rows':rows,'total':102,'page':1,'page_size':50,'counters':{'incoming':3,'late':2,'pending_approval':1,'closed_today':1,'notifications':2}}, 'permissions':{'users':[dict(u,permissions=[{'code':p,'name_ar':'صلاحية اختبار '+p.split('.')[-1],'effective_enabled':i%2==0,'editable':True} for i,p in enumerate(perms)]) for u in users],'tabs':[{'code':'transactions','name_ar':'المعاملات'},{'code':'profiles','name_ar':'بيانات المستخدم'}]}, 'profile':{'name':user['display_name'],'email':'ui-fixture@example.invalid','can_edit_email':False}, 'detail':detail,'perms':perms}
INIT='''f=>{session=f.session;directoryData=f.directory;listData=f.list;sessionPermissions=f.perms;permissionsData=f.permissions;profileData=f.profile;currentSection="transactions";currentTab="all";page=1;permissionsSelectedUser=f.session.canonical_key; window.__fixture=f;window.__fixtureCalls=[];rpc=async(name,body)=>{window.__fixtureCalls.push({name,body});if(name==="list_my_transactions")return f.list;if(name==="my_profile")return f.profile;if(name==="permissions_admin_snapshot")return f.permissions;throw new Error("Fixture rejected unexpected RPC: "+name)};post=async(fn,body)=>{window.__fixtureCalls.push({fn,body});if(body.action==="details")return f.detail;if(body.action==="notifications")return {rows:[{id:"notice-fixture",title:"تنبيه اختبار",body:"لا بيانات حقيقية",created_at:"2026-10-04",read_at:null}]};throw new Error("Fixture rejected write: "+body.action)};}'''
GEOMETRY='''() => {const vis=e=>!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=="hidden";return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,dialog:[...document.querySelectorAll(".modal")].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:e.scrollWidth,client:e.clientWidth}}),controls:[...document.querySelectorAll("button,input,select,textarea")].filter(vis).map(e=>{let r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,text:(e.innerText||e.getAttribute("aria-label")||"").slice(0,45),w:Math.round(r.width),h:Math.round(r.height),name:e.getAttribute("aria-label")||[...e.labels||[]].map(l=>l.innerText).join(" ")}}),font:getComputedStyle(document.body).fontFamily};}'''
report={'mode':'baseline' if args.baseline else 'acceptance','data':'isolated synthetic fixtures; not authenticated backend acceptance','source':args.url or args.source,'sizes':[],'failures':[],'blocked_external_requests':[],'console_errors':[],'page_errors':[],'checks':[]}
with sync_playwright() as pw:
    browser=pw.chromium.launch();context=browser.new_context(service_workers='block')
    def guard(route):
        if route.request.url.startswith(base+'/'):route.continue_()
        else:report['blocked_external_requests'].append(route.request.url);route.abort()
    context.route('**/*',guard)
    page=context.new_page();page.on('console',lambda m: report['console_errors'].append(m.text) if m.type=='error' else None);page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
    def check(name,ok,info=None):
        report['checks'].append({'name':name,'passed':bool(ok),'info':info})
        if not ok:report['failures'].append(name)
    def snap(name,w):
        page.wait_for_timeout(250)
        if not args.no_screenshots:page.screenshot(path=str(out/f'{w}-{name}.png'),full_page=True)
        g=page.evaluate(GEOMETRY);report['sizes'].append({'surface':name,'width':w,'geometry':g})
        check(f'{w}/{name}/page-overflow',g['documentWidth']<=w+1,g['documentWidth'])
        if not args.baseline:verify_controls(name,w)
        for d in g['dialog']:check(f'{w}/{name}/dialog-fit',d['x']>=-1 and d['y']>=-1 and d['width']<=w+1 and d['scroll']<=d['client']+1,d)
    def verify_controls(name,w):
        issues=page.evaluate("""() => {const scope=document.querySelector('.overlay:last-of-type')||document.querySelector('#app');const elements=[...scope.querySelectorAll('button,input,select,textarea,summary')].filter(e=>e.getClientRects().length&&!e.closest('[hidden],[inert]'));return elements.map(e=>{let r=e.getBoundingClientRect();if(e.type==='checkbox'&&e.labels?.length)r=e.labels[0].getBoundingClientRect();const name=e.getAttribute('aria-label')||(e.labels?.length?[...e.labels].map(l=>l.textContent).join(' '):e.textContent);return {id:e.id,tag:e.tagName,name:name.trim(),w:r.width,h:r.height}}).filter(e=>!e.name||e.w<43.9||e.h<43.9)}""")
        check(f'{w}/{name}/control-names-and-touch',not issues,issues)
    for w in [1440,1280,1024,768,390]:
        page.set_viewport_size({'width':w,'height':900 if w>700 else 844});page.goto(base);page.wait_for_selector('#loginForm');snap('login',w)
        check(f'{w}/login/primary-touch',page.locator('#loginBtn').bounding_box()['height']>=44)
        page.evaluate('passwordChangeView({auth:{access_token:"fixture",refresh_token:null}})');snap('password',w)
        # Values are synthetic validation samples on a local-only renderer, never credentials.
        page.locator('#newPassword').fill('ValidationSample8!');page.locator('#confirmPassword').fill('DifferentSample9!')
        if args.baseline:check(f'{w}/password/mismatch','غير متطابقة' in page.locator('#passwordMatch').inner_text())
        else:check(f'{w}/password/mismatch','ok' not in (page.locator('#passwordMatch').get_attribute('class') or '') and page.locator('[data-password-match-status]').inner_text()=='كلمتا المرور غير متطابقتين')
        page.locator('#confirmPassword').fill('ValidationSample8!')
        if args.baseline:check(f'{w}/password/match','متطابقة' in page.locator('#passwordMatch').inner_text())
        else:check(f'{w}/password/match','ok' in (page.locator('#passwordMatch').get_attribute('class') or '') and page.locator('[data-password-match-status]').inner_text()=='كلمتا المرور متطابقتان')
        page.locator('#toggleNewPassword').click();check(f'{w}/password/toggle',page.locator('#newPassword').get_attribute('type')=='text')
        page.evaluate(INIT,fixture);page.evaluate('renderApp()');snap('transactions',w)
        check(f'{w}/table/all-columns',page.locator('thead th').count()==11)
        # Open filter disclosure without asserting old/new markup.
        if page.locator('#filterToggle').count():page.locator('#filterToggle').click()
        if page.locator('.filter-disclosure summary').count() and page.locator('.filter-disclosure').get_attribute('open') is None:page.locator('.filter-disclosure summary').click()
        page.locator('#priorityFilter').select_option('عاجل');page.wait_for_timeout(80);check(f'{w}/filter/payload',page.evaluate('window.__fixtureCalls.some(c=>c.name==="list_my_transactions"&&c.body.p_priority==="عاجل")'))
        page.evaluate('priorityFilter="";openCreate()');snap('create',w);page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove())')
        page.evaluate('openDetails("fixture-transaction")');page.wait_for_selector('#waBtn');snap('workspace',w)
        modal=page.locator('.modal').last;check(f'{w}/dialog/semantics',modal.get_attribute('role')=='dialog' and modal.get_attribute('aria-modal')=='true')
        if not args.baseline:
            check(f'{w}/workspace/default-overview',page.locator('[data-workspace-tab="overview"]').get_attribute('aria-selected')=='true')
            for key,copy in [('actions','إجراء اختبار'),('routes','إحالة اختبار'),('requests','طلب اختبار'),('history','سجل اختبار')]:
                tab=page.locator(f'[data-workspace-tab="{key}"]');tab.click();panel=page.locator('#'+tab.get_attribute('aria-controls'));check(f'{w}/workspace/{key}',panel.is_visible() and copy in panel.inner_text())
            page.locator('[data-workspace-tab="overview"]').focus();page.keyboard.press('ArrowLeft');check(f'{w}/workspace/arrow-navigation',page.locator('[data-workspace-tab="actions"]').get_attribute('aria-selected')=='true')
            page.locator('[data-workspace-tab="overview"]').click()
            page.locator('#priorityField').focus();page.keyboard.press('Enter');page.wait_for_timeout(80);check(f'{w}/metadata/keyboard',page.locator('.overlay').count()==2)
            page.keyboard.press('Escape');check(f'{w}/nested/escape',page.locator('.overlay').count()==1)
            check(f'{w}/nested/restore-focus',page.evaluate('document.activeElement.id==="priorityField"'))
            for _ in range(25):
                page.keyboard.press('Tab');check(f'{w}/dialog/trap',page.evaluate('document.querySelector(".overlay:last-of-type").contains(document.activeElement)'))
            page.keyboard.press('Escape');check(f'{w}/dialog/escape',page.locator('.overlay').count()==0)
        page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove());openReferral("fixture-transaction")');snap('referrals',w);page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove());openAction("fixture-transaction")');snap('action',w)
        if not args.baseline:
            for function in ['childEmployeeRaise','childManagerAssign','childManagerRaise','childAssistantScope','childAssistantTransfer','childAssistantCeo','childExecAssistant','childExecDirect']:
                page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove())')
                page.evaluate(function+'("fixture-transaction")');snap('form-'+function,w)
            page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove())')
            check(f'{w}/modal/background-restored',page.evaluate('!document.getElementById("app").inert&&!document.body.classList.contains("modal-open")'))
        page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove());currentSection="permissions";renderPermissionsApp()');snap('permissions',w)
        check(f'{w}/permissions/all-keys',page.locator('[data-permission-toggle]').count()==len(perms))
        check(f'{w}/permissions/no-job-title',not page.locator('.permission-role').count())
        page.evaluate('currentSection="profile";renderProfileApp()');snap('profile',w);page.locator('#changeProfilePassword').click();snap('profile-password',w)
        page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove());currentSection="transactions";renderApp();openNotifications()');page.wait_for_selector('.notification-item');snap('notifications',w)
        page.evaluate('[...document.querySelectorAll(".overlay")].reverse().forEach(w=>w.remove());listData.rows=[];renderTable()');snap('empty',w)
    if not args.baseline:
        page.evaluate(INIT,fixture);page.evaluate('currentSection="transactions";renderApp()')
        for role in ['ceo','ceo_office_manager','ceo_secretary','assistant','assistant_secretary','manager','employee']:
            page.evaluate('role=>{session.role=role;renderApp()}',role)
            check(f'role/{role}/permissions-access',page.locator('[data-section="permissions"]').count()==(1 if role=='ceo_office_manager' else 0))
        page.evaluate(INIT,fixture);page.evaluate('renderApp()')
        page.evaluate('window.__savedRpc=rpc;rpc=async()=>{throw new Error("fixture-read-failure")};refresh()');page.wait_for_timeout(80)
        check('refresh/retains-previous-results',page.locator('tbody tr').count()==2 and page.locator('#retryList').count()==1)
        page.evaluate('rpc=window.__savedRpc;refresh()');page.wait_for_timeout(80);check('refresh/recovery',page.locator('#retryList').count()==0)
        page.evaluate('document.querySelector(".ui-notice")?.remove()')
        with page.expect_download() as download_info:page.evaluate('exportListExcel()')
        download=download_info.value;download.save_as(str(out/'fixture-list.xls'))
        import xml.etree.ElementTree as ET
        xmlroot=ET.parse(out/'fixture-list.xls').getroot();check('excel/real-file-valid',len(xmlroot.findall('.//{urn:schemas-microsoft-com:office:spreadsheet}Row'))==3)
        page.evaluate('navigator.clipboard.writeText=async text=>{window.__copied=text};copyWhatsApp(window.__fixture.detail)')
        check('whatsapp/summary',page.evaluate('window.__copied.includes("عنوان المعاملة:")&&window.__copied.includes("عدد أيام المعاملة:")&&window.__copied.includes("المطلوب:")&&window.__copied.includes("الإدارة المسؤولة:")&&window.__copied.includes("المسؤول عن المعاملة:")'))
        page.evaluate('printHtml=(title,body)=>{window.__printPreview={title,body}};printTransaction(window.__fixture.detail)')
        check('pdf/refined-output',page.evaluate('window.__printPreview.body.includes("إجراءات العمل")&&window.__printPreview.body.includes("الإحالات والتوجيهات")&&window.__printPreview.body.includes("سجل المعاملة")&&window.__printPreview.body.includes("مسؤول المعاملة")'))
    # Error path must never reach network; initial RPC rejects locally.
    page.set_viewport_size({'width':390,'height':844});page.evaluate('rpc=async()=>{throw new Error("fixture-network-failure")};boot()');page.wait_for_timeout(120);snap('error',390)
    check('error/recovery',page.get_by_role('button',name='إعادة المحاولة').count()>0)
    if not args.baseline:
        page.evaluate('rpc=()=>new Promise(()=>{});void boot()');snap('loading',390)
        check('loading/status',page.get_by_role('status').count()>0)
    page.emulate_media(reduced_motion='reduce');page.evaluate('loginView()');check('reduced-motion',page.evaluate('getComputedStyle(document.querySelector("#loginBtn")).transitionDuration') in ['0s','0s, 0s'])
    check('no-external-requests',not report['blocked_external_requests']);check('no-page-errors',not report['page_errors']);check('no-console-errors',not report['console_errors'])
    browser.close()
if server:server.shutdown()
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'mode':report['mode'],'surfaces':len(report['sizes']),'checks':len(report['checks']),'failures':report['failures'],'page_errors':report['page_errors'],'blocked_external_requests':len(report['blocked_external_requests']),'report':str(out/'report.json')},ensure_ascii=False))
sys.exit(1 if report['failures'] else 0)
