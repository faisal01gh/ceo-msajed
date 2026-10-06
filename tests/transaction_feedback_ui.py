"""Transaction feedback: real renderer, synthetic fixtures, every API blocked.
Run: python tests/transaction_feedback_ui.py [TestFeedback.test_name]
"""
import ast, copy, functools, json, threading, unittest
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

REPO=Path(__file__).resolve().parents[1]
allowed={'PERMS','perms','user','users','units','rows','detail','fixture','INIT'}
constants=[n for n in ast.parse((REPO/'tests/ui_renderer.py').read_text(encoding='utf-8')).body if isinstance(n,ast.Assign) and all(isinstance(t,ast.Name) and t.id in allowed for t in n.targets)]
env={};exec(compile(ast.Module(body=constants,type_ignores=[]),'synthetic-fixtures','exec'),env)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

class TestFeedback(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(REPO)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch()
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown()
    def setUp(self):
        self.context=self.browser.new_context(service_workers='block');self.blocked=[];self.errors=[]
        def guard(route):
            if route.request.url.startswith(self.base+'/'):route.continue_()
            else:self.blocked.append(route.request.url);route.abort()
        self.context.route('**/*',guard)
        self.page=self.context.new_page();self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.goto(self.base);self.page.wait_for_selector('#loginForm')
        self.f=copy.deepcopy(env['fixture'])
        # Actual details contract: current_assignees is top-level, not an inherited list row.
        self.f['detail']['transaction'].pop('current_assignees',None)
        self.f['detail']['current_assignees']=['المكلف الحالي من الخادم']
        self.init()
    def init(self):
        self.page.evaluate(env['INIT'],self.f)
        self.page.evaluate('renderApp()')
    def tearDown(self):
        self.assertEqual(self.blocked,[], 'No external network is permitted')
        self.assertEqual(self.errors,[], 'Renderer must not throw')
        self.context.close()
    def open(self):
        self.page.evaluate('openDetails("fixture-transaction")');self.page.wait_for_selector('#waBtn')
    def test_unified_log_keeps_all_content_without_tabs(self):
        self.open()
        self.assertEqual(self.page.locator('[data-workspace-tab]').count(),0)
        log=self.page.locator('.transaction-log')
        self.assertTrue(log.is_visible())
        for text in ['إجراء اختبار','إحالة اختبار','طلب اختبار','سجل اختبار','نسخة اختبار أولى','نسخة اختبار ثانية','ملاحظة اختبار','توجيه اختبار معزول','الدورة']:
            self.assertIn(text,log.inner_text())
        self.assertEqual(self.page.locator('[data-action-revise]').count(),1)
        self.assertEqual(self.page.locator('[data-action-note]').count(),1)
        self.assertEqual(self.page.locator('[data-request-approve]').count(),1)
        self.assertEqual(self.page.locator('[data-request-reject]').count(),1)
        self.assertEqual(self.page.locator('#waBtn,#excelBtn,#pdfBtn').count(),3)

    def test_log_is_typed_chronological_and_decisions_are_readable(self):
        d=self.f['detail']
        d['actions']=[dict(d['actions'][0],id='same-id',created_at='2026-10-05T12:00:00Z'),dict(d['actions'][0],id='second-action',created_at='2026-10-05T12:00:00Z')]
        d['routes']=[dict(d['routes'][0],id='same-id',created_at='2026-10-03T12:00:00Z',directive='توجيه مستقل',raise_reason='سبب مستقل',transfer_reason='تحويل مستقل')]
        d['requests']=[dict(d['requests'][0],created_at='2026-10-02T12:00:00Z',status='rejected',decided_at='2026-10-06T12:00:00Z',decided_by_name='صاحب القرار',decision_reason='<img src=x onerror=alert(1)> سبب القرار',meta={'requested_due_at':'2026-10-15','target_role':'assistant'})]
        d['history']=[{'id':'technical','event_type':'unmapped_technical_name','created_at':'2026-10-04T12:00:00Z','detail':''},{'id':'h1','event_type':'created','created_at':'2026-10-01T00:00:00Z','actor_name':'فاعل'}, {'id':'h2','event_type':'created','created_at':'2026-10-01T00:00:00Z','actor_name':'فاعل'}]
        self.init();self.open()
        keys=self.page.locator('.log-entry').evaluate_all('(els)=>els.map(e=>e.dataset.logKey)')
        self.assertLess(keys.index('history:history:h1'),keys.index('request:request-fixture'))
        self.assertLess(keys.index('request:request-fixture'),keys.index('route:same-id'))
        self.assertLess(keys.index('route:same-id'),keys.index('action:same-id'))
        self.assertIn('decision:request-fixture',keys)
        self.assertLess(keys.index('action:same-id'),keys.index('decision:request-fixture'))
        self.assertIn('action:second-action',keys);self.assertIn('history:history:h2',keys)
        self.assertEqual(set(self.page.locator('.log-entry').evaluate_all('(els)=>els.map(e=>e.dataset.logType)')),{'action','route','request','decision','assignment','cycle','history'})
        text=self.page.locator('.transaction-log').inner_text()
        for value in ['توجيه مستقل','سبب مستقل','تحويل مستقل','صاحب القرار','سبب القرار',self.page.evaluate('fmtDate("2026-10-15")')]:
            self.assertIn(value,text)
        self.assertNotIn('unmapped_technical_name',text)
        self.assertEqual(self.page.locator('.transaction-log img').count(),0)

    def test_current_assignee_is_adjacent_to_due_and_authoritative(self):
        self.open()
        fields=self.page.locator('.details-grid .detail').all_inner_texts()
        self.assertEqual(len(fields),8)
        self.assertIn('تاريخ الاستحقاق',fields[-2])
        self.assertIn('المحال إليه حاليًا',fields[-1])
        self.assertIn('المكلف الحالي من الخادم',fields[-1])
        self.assertNotIn('مستخدم اختبار الواجهة',fields[-1])
        self.assertTrue(self.page.locator('#dueField').is_visible())

    def test_list_read_markers_preserve_eleven_columns(self):
        self.f['list']['rows']=[dict(self.f['list']['rows'][0],id=state,read_state=state,activity_revision=7,has_unread_updates=state!='read') for state in ['unread','updated','read']]
        self.init()
        self.assertEqual(self.page.locator('thead th').count(),11)
        self.assertEqual(self.page.locator('.tx-read-marker').count(),3)
        for state,text in [('unread','غير مقروءة'),('updated','تحديث جديد'),('read','مقروءة')]:
            marker=self.page.locator('[data-read-state="'+state+'"]')
            self.assertIn(text,marker.inner_text())
            self.assertEqual(marker.locator('svg[aria-hidden="true"]').count(),1)
            self.assertTrue(marker.evaluate('e=>!!e.closest("td.tx-title,td.tx-date")'))
        self.assertEqual(self.page.locator('tbody [data-act]').count(),3)

    def revision_fixture(self):
        self.f['list']['rows'][0].update(read_state='updated',activity_revision=7,has_unread_updates=True)
        self.f['detail']['transaction']['activity_revision']=7
        self.init()
    def test_seen_ack_uses_rendered_revision_only_after_modal_is_ready(self):
        self.revision_fixture()
        self.page.evaluate('''()=>{rpc=async(name,body)=>{window.__fixtureCalls.push({name,body,rendered:!!document.querySelector(".transaction-workspace #pdfBtn")});if(name==="mark_my_transaction_seen")return {ok:true,transaction_id:body.p_transaction_id,seen_revision:body.p_revision,activity_revision:body.p_revision,read_state:"read",has_unread_updates:false};throw new Error("unexpected RPC")};}''')
        before=self.page.evaluate('listData.rows[0].last_activity_at')
        self.open();self.page.wait_for_timeout(50)
        calls=self.page.evaluate('window.__fixtureCalls.filter(c=>c.name==="mark_my_transaction_seen")')
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0]['body'],{'p_transaction_id':'fixture-transaction','p_revision':7})
        self.assertTrue(calls[0]['rendered'])
        self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'read')
        self.assertFalse(self.page.evaluate('listData.rows[0].has_unread_updates'))
        self.assertEqual(self.page.evaluate('listData.rows[0].last_activity_at'),before)
    def test_seen_ack_does_not_clear_newer_list_revision(self):
        self.revision_fixture()
        self.page.evaluate('()=>{rpc=(name,body)=>new Promise(resolve=>{window.__ackRelease=resolve;window.__fixtureCalls.push({name,body})});void openDetails("fixture-transaction")}')
        self.page.wait_for_selector('#waBtn');self.page.wait_for_timeout(30)
        self.assertTrue(self.page.evaluate('typeof window.__ackRelease==="function"'))
        self.page.evaluate('listData.rows[0].activity_revision=8;window.__ackRelease({ok:true,transaction_id:"fixture-transaction",seen_revision:7,activity_revision:7,read_state:"read",has_unread_updates:false});')
        self.page.wait_for_timeout(40)
        self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'updated')
        self.assertTrue(self.page.evaluate('listData.rows[0].has_unread_updates'))
    def test_seen_ack_preserves_newer_server_revision_even_when_list_is_stale(self):
        self.revision_fixture()
        self.page.evaluate('''()=>{rpc=async()=>({ok:true,transaction_id:"fixture-transaction",seen_revision:7,activity_revision:8,read_state:"updated",has_unread_updates:true})}''')
        self.open();self.page.wait_for_timeout(50)
        self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'updated')
        self.assertEqual(self.page.evaluate('listData.rows[0].activity_revision'),8)
        self.assertTrue(self.page.evaluate('listData.rows[0].has_unread_updates'))
    def test_seen_receipts_merge_monotonically_across_order_refresh_and_owner(self):
        for older_activity,newer_first in [(8,True),(9,True),(8,False),(9,False)]:
            with self.subTest(older_activity=older_activity,newer_first=newer_first):
                self.revision_fixture()
                before=self.page.evaluate('listData.rows[0].last_activity_at')
                self.page.evaluate('''()=>{window.__seenReleases=[];rpc=(name,body)=>new Promise(resolve=>window.__seenReleases.push(resolve));window.__firstOpen=openDetails("fixture-transaction")}''')
                self.page.wait_for_function('window.__seenReleases.length===1')
                self.page.evaluate('window.__fixture.detail.transaction.activity_revision=8;window.__secondOpen=openDetails("fixture-transaction")')
                self.page.wait_for_function('window.__seenReleases.length===2')
                self.page.evaluate('''activity=>{window.__releaseSeen=async newer=>{const ack=newer?{ok:true,transaction_id:"fixture-transaction",seen_revision:8,activity_revision:8,read_state:"read",has_unread_updates:false}:{ok:true,transaction_id:"fixture-transaction",seen_revision:7,activity_revision:activity,read_state:"updated",has_unread_updates:true};window.__seenReleases[newer?1:0](ack);await Promise.resolve()}}''',older_activity)
                self.page.evaluate('async newer=>{await window.__releaseSeen(newer)}',newer_first)
                self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'read' if newer_first else 'updated')
                # Replacement row from a same-owner list refresh must not discard accepted revisions.
                self.page.evaluate('listData.rows=listData.rows.map(r=>({...r,read_state:"updated",has_unread_updates:true}));renderTable()')
                self.page.evaluate('async newer=>{await window.__releaseSeen(newer)}',not newer_first)
                expected='read' if older_activity==8 else 'updated'
                self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),expected)
                self.assertEqual(self.page.locator('tbody tr').first.locator('.tx-read-marker').get_attribute('data-read-state'),expected)
                self.assertEqual(self.page.evaluate('listData.rows[0].activity_revision'),older_activity)
                self.assertEqual(self.page.evaluate('listData.rows[0].last_activity_at'),before)
                self.page.evaluate('''async()=>{session={...session,token:"ACCOUNT_B_SYNTHETIC"};listData.rows[0].activity_revision=8;rpc=async()=>({ok:true,transaction_id:"fixture-transaction",seen_revision:7,activity_revision:8,read_state:"updated",has_unread_updates:true});await acknowledgeTransactionSeen("fixture-transaction",7,document.querySelector(".overlay"))}''')
                self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'updated')
                self.page.evaluate('document.querySelectorAll(".overlay").forEach(w=>w.remove())')

    def test_seen_ack_requires_exact_verified_receipt(self):
        self.revision_fixture()
        self.page.evaluate('''()=>{rpc=async()=>({ok:true,transaction_id:"another-transaction",seen_revision:7,activity_revision:7,read_state:"read",has_unread_updates:false})}''')
        self.open();self.page.wait_for_timeout(50)
        self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'updated')
        self.assertIn('القراءة',self.page.locator('.modal-feedback').inner_text())
    def test_seen_ack_error_keeps_details_and_marker(self):
        self.revision_fixture()
        self.page.evaluate('()=>{rpc=async()=>{throw new Error("unsafe-server-message <script>")}}')
        self.open();self.page.wait_for_timeout(50)
        self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'updated')
        self.assertTrue(self.page.locator('#pdfBtn').is_visible())
        feedback=self.page.locator('.modal-feedback').inner_text()
        self.assertIn('القراءة',feedback);self.assertNotIn('unsafe-server-message',feedback)
    def test_failed_details_never_acknowledges(self):
        self.revision_fixture()
        self.page.evaluate('()=>{post=async()=>{throw new Error("fixture-load-failure")}}')
        self.page.locator('[data-act="open"]').first.click();self.page.wait_for_timeout(60)
        self.assertEqual(self.page.locator('.transaction-workspace').count(),0)
        self.assertEqual(self.page.evaluate('window.__fixtureCalls.filter(c=>c.name==="mark_my_transaction_seen").length'),0)
        self.assertEqual(self.page.evaluate('listData.rows[0].read_state'),'updated')
    def test_missing_detail_revision_never_sends_zero_ack(self):
        self.f['detail']['transaction'].pop('activity_revision',None);self.init();self.open()
        self.assertEqual(self.page.evaluate('window.__fixtureCalls.filter(c=>c.name==="mark_my_transaction_seen").length'),0)

    def test_secretary_has_own_secretary_queue_without_assistant_authority(self):
        self.f['session']['role']='assistant_secretary';self.f['perms']=[]
        self.f['detail'].update(can_act=False,can_close=False,can_raise_ceo=False,can_reply_raise=False,flags={'scope':False})
        self.f['detail']['actions'][0]['actor_name']='منفذ آخر'
        self.init()
        queue=self.page.locator('[data-tab="secretary_queue"]')
        self.assertEqual(queue.count(),1)
        self.assertEqual(queue.inner_text(),'المعاملات لدى المساعد')
        queue.click();self.page.wait_for_timeout(40)
        self.assertTrue(self.page.evaluate('window.__fixtureCalls.some(c=>c.name==="list_my_transactions"&&c.body.p_tab==="secretary_queue")'))
        self.open()
        self.assertEqual(self.page.locator('#actionBtn,#referralBtn,#raiseCeoBtn,#closeBtn,#cancelBtn,#extensionBtn,[data-request-approve],[data-request-reject],[data-action-note]').count(),0)
        self.assertEqual(self.page.locator('#waBtn,#excelBtn,#pdfBtn').count(),3)
        self.assertEqual(self.page.locator('[data-workspace-tab]').count(),0)
    def test_ceo_referral_choice_uses_backend_authority_not_role(self):
        self.f['session']['role']='employee';self.f['perms']=['transactions.raise_ceo']
        self.f['detail']['can_raise_ceo']=True;self.init()
        self.page.evaluate('openReferral("fixture-transaction")');self.page.wait_for_timeout(40)
        self.assertEqual(self.page.locator('[data-choice="raise-ceo"]').count(),1)
        self.page.locator('[data-choice="raise-ceo"]').click()
        self.assertTrue(self.page.locator('#reason').is_visible())
        self.page.keyboard.press('Escape')
        self.page.evaluate('window.__fixture.detail.can_raise_ceo=false;openReferral("fixture-transaction")');self.page.wait_for_timeout(40)
        self.assertEqual(self.page.locator('[data-choice="raise-ceo"]').count(),0)
    def test_employee_create_and_ceo_view_follow_effective_grants(self):
        self.f['session']['role']='employee';self.f['perms']=[];self.init()
        self.assertEqual(self.page.locator('#createBtn').count(),0)
        self.page.evaluate('sessionPermissions=["transactions.create"];renderApp()')
        self.assertEqual(self.page.locator('#createBtn').count(),1)
        self.page.evaluate('sessionPermissions=[];renderApp()')
        self.assertEqual(self.page.locator('#createBtn').count(),0)
        self.f['session']['role']='manager';self.f['perms']=['transactions.ceo_view'];self.init();self.open()
        self.assertEqual(self.page.locator('#ceoViewBtn').count(),1)

    def notifications_fixture(self,mode='ok'):
        self.page.evaluate('''mode=>{post=async(fn,body)=>{
          window.__fixtureCalls.push({fn,body,rendered:!!document.querySelector(".transaction-workspace")});
          if(body.action==="notifications")return {rows:[{id:"notice-a",transaction_id:"fixture-transaction",title:"تنبيه مصطنع",body:"تفاصيل",created_at:"2026-10-06"}],unread_count:9};
          if(body.action==="details"){if(mode==="load-fail")throw new Error("fixture-load-fail");return window.__fixture.detail}
          if(body.action==="notification_read"){if(mode==="read-fail")throw new Error("unsafe read error");return {ok:true,notification_id:body.notification_id,unread_count:6}}
          throw new Error("unexpected mutation");
        };}''',mode)
        self.page.locator('#notifBtn').click();self.page.wait_for_timeout(40)
    def test_bell_open_refreshes_authoritative_count(self):
        self.notifications_fixture()
        self.assertEqual(self.page.locator('.notification-item').count(),1)
        self.assertIn('9',self.page.locator('#notifBtn').get_attribute('aria-label'))
        self.assertEqual(self.page.evaluate('listData.counters.notifications'),9)
    def test_notification_opens_details_before_read_and_uses_server_count(self):
        self.notifications_fixture();self.assertEqual(self.page.locator('.notification-item').count(),1)
        self.page.locator('.notification-item').click();self.page.wait_for_selector('#waBtn');self.page.wait_for_timeout(50)
        calls=self.page.evaluate('window.__fixtureCalls.filter(c=>c.body?.action)')
        self.assertEqual([c['body']['action'] for c in calls],['notifications','details','notification_read'])
        self.assertTrue(calls[-1]['rendered'])
        self.assertEqual(calls[-1]['body']['notification_id'],'notice-a')
        self.assertNotIn('user_id',calls[-1]['body'])
        self.assertEqual(self.page.evaluate('listData.counters.notifications'),6)
        self.assertEqual(self.page.locator('[data-notif]').count(),0)
    def test_notification_read_failure_retains_counter_and_item(self):
        self.notifications_fixture('read-fail');self.assertEqual(self.page.locator('.notification-item').count(),1)
        self.page.locator('.notification-item').click();self.page.wait_for_selector('#waBtn');self.page.wait_for_timeout(50)
        self.assertEqual(self.page.evaluate('listData.counters.notifications'),9)
        self.assertEqual(self.page.locator('[data-notif]').count(),1)
        self.assertIn('التنبيه',self.page.locator('.transaction-workspace .modal-feedback').inner_text())
        self.assertNotIn('unsafe read error',self.page.locator('.transaction-workspace').inner_text())
    def test_notification_detail_load_failure_does_not_consume_notification(self):
        self.notifications_fixture('load-fail');self.assertEqual(self.page.locator('.notification-item').count(),1)
        self.page.locator('.notification-item').click();self.page.wait_for_timeout(50)
        self.assertEqual(self.page.locator('[data-notif]').count(),1)
        self.assertEqual(self.page.locator('#waBtn').count(),0)
        self.assertEqual(self.page.evaluate('listData.counters.notifications'),9)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.body?.action==="notification_read")'))

    def test_notification_account_switches_cannot_touch_new_owner(self):
        for stage in ['notifications','details','notification_read','list-failure','read-failure','old-modal']:
            with self.subTest(stage=stage):
                self.page.evaluate('document.querySelectorAll(".overlay").forEach(w=>w.remove());window.__noticeClick=null')
                self.init()
                self.page.evaluate('''stage=>{window.__noticeStage=stage;window.__noticeRelease=null;window.__noticeReject=null;post=(fn,body)=>{
                  window.__fixtureCalls.push({fn,body});
                  const held=(stage==="list-failure"?"notifications":stage==="read-failure"?"notification_read":stage);
                  if(body.action===held)return new Promise((resolve,reject)=>{window.__noticeRelease=resolve;window.__noticeReject=reject});
                  if(body.action==="notifications")return Promise.resolve({rows:[{id:"notice-a",transaction_id:"fixture-transaction",title:"تنبيه مصطنع"}],unread_count:9});
                  if(body.action==="details")return Promise.resolve(window.__fixture.detail);
                  if(body.action==="notification_read")return Promise.resolve({ok:true,notification_id:"notice-a",unread_count:6});
                  throw new Error("unexpected request");};window.__noticeList=openNotifications().catch(()=>{})}''',stage)
                if stage not in ['notifications','list-failure']:
                    self.page.wait_for_selector('.notification-item')
                    if stage!='old-modal':
                        self.page.evaluate('()=>{window.__noticeClick=document.querySelector(".notification-item").onclick()}')
                if stage!='old-modal':self.page.wait_for_function('typeof window.__noticeRelease==="function"')
                self.page.evaluate('session={...session,token:"ACCOUNT_B_SYNTHETIC"};setNotificationCount(42)')
                if stage=='old-modal':
                    count=self.page.evaluate('window.__fixtureCalls.length')
                    self.page.evaluate('async()=>{await document.querySelector(".notification-item").onclick()}')
                    self.assertEqual(self.page.evaluate('window.__fixtureCalls.length'),count)
                else:
                    self.page.evaluate('''async stage=>{if(stage.endsWith("failure"))window.__noticeReject(new Error("late synthetic failure"));else window.__noticeRelease(stage==="notifications"?{rows:[{id:"notice-a",title:"A"}],unread_count:9}:stage==="details"?window.__fixture.detail:{ok:true,notification_id:"notice-a",unread_count:6});await (window.__noticeClick||window.__noticeList);await Promise.resolve()}''',stage)
                self.assertEqual(self.page.evaluate('listData.counters.notifications'),42)
                self.assertEqual(self.page.locator('.modal-feedback').count(),0)
                if stage in ['notifications','list-failure']:self.assertEqual(self.page.locator('.overlay').count(),0)
                if stage in ['details','old-modal']:
                    self.assertEqual(self.page.locator('.transaction-workspace').count(),0)
                    self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.name==="mark_my_transaction_seen"||c.body?.action==="notification_read")'))
                self.page.evaluate('document.querySelectorAll(".overlay").forEach(w=>w.remove());window.__noticeClick=null')

    def creation_fixture(self,role='employee',departments=1):
        self.f['session'].update(role=role,dept_name='إدارة الاختبار' if departments else '',dept_names=['إدارة الاختبار'] if departments else [])
        if departments==2:
            self.f['session']['dept_names'].append('إدارة ثانية')
            self.f['directory']['units'].append({'id':'second-unit','name':'إدارة ثانية','unit_type':'department','parent_id':'fixture-sector'})
        self.f['perms']=['transactions.create','transactions.assign_department','transactions.raise_assistant']
        self.init()
        self.page.evaluate('''()=>{post=async(fn,body)=>{window.__fixtureCalls.push({fn,body});if(body.action==="create")return {row:{id:"created-once"}};if(body.action==="details")return window.__fixture.detail;throw new Error("unexpected route")};}''')
        self.page.locator('#createBtn').click();self.page.locator('[name="title"]').fill('إنشاء مصطنع')
    def test_single_department_create_sends_verified_unit_id(self):
        self.creation_fixture();self.page.locator('#saveCreate').click();self.page.wait_for_timeout(50)
        creates=self.page.evaluate('window.__fixtureCalls.filter(c=>c.body?.action==="create")')
        self.assertEqual(len(creates),1)
        self.assertEqual(creates[0]['body'].get('responsible_unit_id'),'fixture-unit')
    def test_multi_department_creation_requires_explicit_choice(self):
        self.creation_fixture(departments=2)
        unit=self.page.locator('[name="responsible_unit_id"]')
        self.assertEqual(unit.count(),1)
        self.assertEqual(unit.input_value(),'')
        self.assertEqual(unit.get_attribute('required'),'')
        self.page.locator('#saveCreate').click();self.page.wait_for_timeout(30)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.body?.action==="create")'))
        unit.select_option('second-unit');self.page.locator('#saveCreate').click();self.page.wait_for_timeout(30)
        self.assertEqual(self.page.evaluate('window.__fixtureCalls.find(c=>c.body?.action==="create").body.responsible_unit_id'),'second-unit')
    def test_no_own_department_blocks_employee_create(self):
        self.creation_fixture(departments=0);self.page.locator('#saveCreate').click();self.page.wait_for_timeout(30)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.body?.action==="create")'))
    def test_creation_raise_is_validated_before_first_mutation(self):
        self.creation_fixture(role='manager');self.page.locator('#createMode').select_option('raise')
        self.page.locator('#saveCreate').click();self.page.wait_for_timeout(30)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.body?.action==="create")'))
        self.page.locator('[name="raise_reason"]').fill('سبب مصطنع');self.page.locator('#saveCreate').click();self.page.wait_for_timeout(30)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.body?.action==="create")'))
    def test_creation_assignment_is_validated_before_first_mutation(self):
        self.creation_fixture(role='manager');self.page.locator('#createMode').select_option('assign')
        self.page.locator('#saveCreate').click();self.page.wait_for_timeout(30)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.body?.action==="create")'))

    def creation_route_failure(self,transport=False):
        self.creation_fixture(role='manager')
        self.page.evaluate('''transport=>{window.__routeAttempts=0;post=async(fn,body)=>{
          window.__fixtureCalls.push({fn,body});
          if(body.action==="create")return {row:{id:"created-once"}};
          if(body.action==="route_manager_assistant"){
            window.__routeAttempts++;
            if(transport)throw new TypeError("fixture ambiguous transport");
            if(window.__routeAttempts===1){const e=new Error("fixture rejected route");e.status=400;throw e}
            return {ok:true};
          }
          if(body.action==="details")return {...window.__fixture.detail,transaction:{...window.__fixture.detail.transaction,id:body.transaction_id}};
          throw new Error("unexpected command");
        };}''',transport)
        self.page.locator('#createMode').select_option('raise')
        self.page.locator('[name="raise_reason"]').fill('سبب مصطنع');self.page.locator('[name="proposed_decision"]').fill('مطلوب مصطنع')
        self.page.locator('#saveCreate').click();self.page.wait_for_timeout(70)
    def test_known_route_failure_retries_only_route_to_created_id(self):
        self.creation_route_failure()
        self.assertTrue(self.page.locator('[name="title"]').is_disabled())
        self.assertTrue(self.page.locator('[name="responsible_unit_id"]').is_disabled())
        self.assertTrue(self.page.locator('#createMode').is_disabled())
        self.assertIn('الإحالة',self.page.locator('#saveCreate').inner_text())
        self.page.locator('#saveCreate').click();self.page.wait_for_timeout(70)
        calls=self.page.evaluate('window.__fixtureCalls.filter(c=>c.body?.action)')
        self.assertEqual([c['body']['action'] for c in calls],['create','route_manager_assistant','route_manager_assistant'])
        self.assertEqual([c['body']['transaction_id'] for c in calls[1:]],['created-once','created-once'])
        self.assertEqual(self.page.locator('#createForm').count(),0)
    def test_ambiguous_route_failure_offers_fresh_read_only_details_not_retry(self):
        self.creation_route_failure(transport=True)
        self.assertTrue(self.page.locator('#saveCreate').is_disabled())
        self.assertTrue(self.page.locator('[name="title"]').is_disabled())
        self.assertIn('التحقق',self.page.locator('.modal-feedback').inner_text())
        self.page.locator('#openCreatedTransaction').click();self.page.wait_for_selector('#waBtn')
        calls=self.page.evaluate('window.__fixtureCalls.filter(c=>c.body?.action)')
        self.assertEqual([c['body']['action'] for c in calls],['create','route_manager_assistant','details'])
        self.assertEqual(calls[-1]['body']['transaction_id'],'created-once')
        self.assertEqual(self.page.locator('#actionBtn,#referralBtn,#raiseCeoBtn,#closeBtn,#cancelBtn,#ceoViewBtn,#extensionBtn,[data-request-approve],[data-request-reject],[data-action-revise],[data-action-note],.details-grid button').count(),0)
        self.assertEqual(self.page.locator('#waBtn,#excelBtn,#pdfBtn').count(),3)

    def test_log_preserves_single_version_and_transfer_decision(self):
        self.f['detail']['action_versions']=[{'action_id':'action-fixture','version_no':1,'body':'نص النسخة الوحيدة'}]
        self.f['detail']['routes'][0].update(route_type='assistant_transfer',status='rejected',decided_at='2026-10-05',decided_by_name='مقرر التحويل',rejection_reason='سبب رفض التحويل')
        self.init();self.open()
        text=self.page.locator('.transaction-log').inner_text()
        self.assertIn('نص النسخة الوحيدة',text)
        self.assertIn('مقرر التحويل',text)
        self.assertEqual(self.page.locator('[data-log-type="decision"]').count(),1)
    def test_request_details_have_readable_labels_not_raw_metadata_keys(self):
        self.f['detail']['requests'][0].update(requested_due_at='2026-10-15',meta={'requester_role':'employee','target_role':'assistant','requested_login':'target-fixture','extra':'تفصيل محفوظ'})
        self.init();self.open()
        text=self.page.locator('[data-log-type="request"]').inner_text()
        self.assertIn('التاريخ المقترح',text)
        self.assertIn('تفصيل محفوظ',text)
        self.assertIn('target-fixture',text)
        self.assertNotIn('requester_role',text);self.assertNotIn('requested_login',text)

    def test_history_only_decision_is_typed_and_keeps_actor(self):
        self.f['detail']['requests']=[]
        self.f['detail']['history']=[{'id':'history-decision','event_type':'request_approved','actor_name':'معتمد سابق','created_at':'2026-10-05','detail':'قرار محفوظ'}]
        self.init();self.open()
        self.assertEqual(self.page.locator('[data-log-type="decision"]').count(),1)
        self.assertIn('معتمد سابق',self.page.locator('[data-log-type="decision"]').inner_text())

    def test_log_control_identifiers_and_text_are_escaped(self):
        identifier='action-\" onclick=\"alert(1)'
        self.f['detail']['actions'][0].update(id=identifier,action_text='<img src=x onerror=alert(1)>')
        self.f['detail']['requests'][0]['id']='request-\" onclick=\"alert(1)'
        self.init();self.open()
        self.assertEqual(self.page.locator('[data-action-revise]').get_attribute('data-action-revise'),identifier)
        self.assertEqual(self.page.locator('.transaction-log [onclick],.transaction-log img').count(),0)
        self.assertIn('<img src=x onerror=alert(1)>',self.page.locator('.transaction-log').inner_text())
    def test_wrong_notification_ack_does_not_consume_local_indicator(self):
        self.notifications_fixture()
        self.page.evaluate('''()=>{const source=post;post=async(fn,body)=>body.action==="notification_read"?{ok:true,notification_id:"different-notification",unread_count:0}:source(fn,body)}''')
        self.page.locator('.notification-item').click();self.page.wait_for_selector('#waBtn');self.page.wait_for_timeout(50)
        self.assertEqual(self.page.evaluate('listData.counters.notifications'),9)
        self.assertEqual(self.page.locator('[data-notif]').count(),1)

    def test_unknown_history_keeps_actor_without_technical_event_name(self):
        self.f['detail']['history']=[{'id':'unknown-event','event_type':'technical_event_unknown','actor_name':'فاعل الحدث غير المصنف','created_at':'2026-10-05','detail':'تفصيل محفوظ غير مصنف'}]
        self.init();self.open()
        text=self.page.locator('[data-log-type="history"]').inner_text()
        self.assertIn('فاعل الحدث غير المصنف',text)
        self.assertIn('تفصيل محفوظ غير مصنف',text)
        self.assertNotIn('technical_event_unknown',text)

    def native_boot_fixture(self,profile=None,cached_uid=None):
        # Native login/confirmation constructors and directory.me contain no actor UUID.
        self.f['session']={'app':'new','token':'NATIVE_FAKE_TOKEN','refresh_token':'NATIVE_FAKE_REFRESH','username':'native-fixture','login_name':'native-fixture','display_name':'مساعد مصطنع','role':'assistant','legacy_role':''}
        if cached_uid is not None:self.f['session']['user_id']=cached_uid
        self.f['directory']['me']=dict(self.f['session']);self.f['directory']['me'].pop('user_id',None)
        self.f['profile']=profile if profile is not None else {'ok':True,'user_id':'44444444-4444-4444-8444-444444444444','must_change_password':False,'name':'مساعد مصطنع','email':None,'can_edit_email':False}
        self.f['detail'].update(can_reply_raise=True,reply_route_id='11111111-1111-4111-8111-111111111111',reply_target_user_id='33333333-3333-4333-8333-333333333333',reply_target_login_name='sender-fixture',reply_target_name='مرسل مصطنع',reply_target_role='manager')
        self.page.evaluate('''f=>{window.__native=f;window.__fixtureCalls=[];session=f.session;directoryData={users:[],units:[],me:null};listData={rows:[],counters:{}};sessionPermissions=[];currentTab="";currentSection="transactions";rpc=async(name,body)=>{window.__fixtureCalls.push({name,body});if(name==="my_profile")return f.profile;if(name==="transaction_directory_my")return f.directory;if(name==="list_my_transactions")return f.list;if(name==="my_permissions")return f.perms;if(name==="mark_my_transaction_seen")return {ok:true,transaction_id:body.p_transaction_id,seen_revision:body.p_revision,activity_revision:body.p_revision,read_state:"read",has_unread_updates:false};throw new Error("unexpected native RPC")};post=async(fn,body)=>{window.__fixtureCalls.push({fn,body});if(body.action==="details")return f.detail;if(body.action==="reply_raise"){window.__nativeActor=replyRaiseBinding(body.transaction_id,f.detail,session).actor_user_id;return {ok:true,replayed:false,transaction_id:body.transaction_id,source_route_id:body.route_id,operation_id:body.operation_id,actor_user_id:f.profile.user_id,reply_route_id:"22222222-2222-4222-8222-222222222222",target_user_id:f.detail.reply_target_user_id,target_login_name:f.detail.reply_target_login_name}}throw new Error("unexpected native command")}}''',self.f)
        self.assertFalse(self.page.evaluate('"user_id" in window.__native.directory.me'))

    def test_native_boot_initializes_actor_from_authenticated_profile_and_replies(self):
        self.native_boot_fixture()
        self.assertIsNone(self.page.evaluate('session.user_id||null'))
        self.page.evaluate('boot()');self.open()
        self.assertEqual(self.page.locator('#replyRaiseBtn').count(),1,'actual BOOT must initialize the native session UUID before reply binding')
        self.assertEqual(self.page.locator('#replyRaiseBtn').inner_text(),'الرد')
        self.assertEqual(self.page.evaluate('session.user_id'),self.f['profile']['user_id'])
        self.page.locator('#replyRaiseBtn').click();self.page.locator('#replyResponse').fill('رد مصطنع من الهوية الأصلية')
        self.page.evaluate('async()=>{await document.getElementById("sendReplyRaise").onclick()}')
        self.assertEqual(self.page.evaluate('window.__nativeActor'),self.f['profile']['user_id'])
        self.assertEqual(self.page.locator('.overlay').count(),0)
        self.assertEqual(self.page.evaluate('JSON.parse(sessionStorage.getItem(SESSION_KEY)).user_id'),self.f['profile']['user_id'])

    def test_native_cached_actor_is_overwritten_only_by_profile(self):
        self.native_boot_fixture(cached_uid='77777777-7777-4777-8777-777777777777')
        self.page.evaluate('boot()');self.open()
        self.assertEqual(self.page.evaluate('session.user_id'),self.f['profile']['user_id'])
        self.assertTrue(self.page.locator('#replyRaiseBtn').is_visible())

    def test_native_reload_resumes_stored_session_without_actor(self):
        self.native_boot_fixture()
        self.page.evaluate('saveSession()')
        self.page.add_init_script('''const f='''+json.dumps(self.f,ensure_ascii=False)+''';window.fetch=async(url,options)=>{const name=String(url).split('/').pop();const data={my_profile:f.profile,transaction_directory_my:f.directory,list_my_transactions:f.list,my_permissions:f.perms}[name];if(data===undefined)throw new Error("unexpected isolated fetch");return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}})};''')
        self.page.reload();self.page.wait_for_selector('#notifBtn')
        self.assertEqual(self.page.evaluate('session.user_id'),self.f['profile']['user_id'])
        # Details use isolated local fixtures, but initialization above is the automatic loadSession -> BOOT path.
        self.page.evaluate('f=>{post=async()=>f.detail}',self.f);self.open()
        self.assertTrue(self.page.locator('#replyRaiseBtn').is_visible())

    def test_native_profile_identity_missing_or_malformed_fails_closed(self):
        for profile in [None,{'ok':True},{'ok':False,'user_id':self.f['session']['user_id']},{'ok':True,'user_id':'invalid'},{'ok':True,'user_id':123}]:
            with self.subTest(profile=profile):
                self.native_boot_fixture(profile=profile if profile is not None else {})
                self.page.evaluate('window.__native.directory.me.user_id="44444444-4444-4444-8444-444444444444";boot()')
                self.assertEqual(self.page.locator('#retryBoot').count(),1)
                self.assertEqual(self.page.locator('#replyRaiseBtn,#notifBtn').count(),0)
                self.assertIsNone(self.page.evaluate('session.user_id||null'))
                self.assertEqual(self.page.evaluate('window.__fixtureCalls.map(c=>c.name)'),['my_profile'])

    def test_native_forced_gate_then_confirmation_constructor_boots_actor(self):
        self.native_boot_fixture(profile={'ok':True,'user_id':'44444444-4444-4444-8444-444444444444','must_change_password':True,'can_edit_email':False})
        self.page.evaluate('boot()')
        self.assertEqual(self.page.locator('#passwordForm').count(),1)
        self.assertEqual(self.page.locator('#notifBtn,#replyRaiseBtn').count(),0)
        self.assertEqual(self.page.evaluate('window.__fixtureCalls.map(c=>c.name)'),['my_profile'])
        self.page.evaluate('''()=>{const source=post;post=async(fn,body)=>{if(fn!==CONFIG.confirmPasswordFn)return source(fn,body);window.__native.profile.must_change_password=false;return {auth:{access_token:"NATIVE_CONFIRMED_FAKE_TOKEN",refresh_token:"NATIVE_CONFIRMED_FAKE_REFRESH"},preferred_login:"native-fixture",login_username:"native-fixture",display_name:"مساعد مصطنع",role:"assistant"}};window.__bootSource=boot;boot=async()=>{window.__constructorHasActor="user_id" in session;return window.__bootSource()}}''')
        self.page.locator('#newPassword').fill('SyntheticLocalOnly8!');self.page.locator('#confirmPassword').fill('SyntheticLocalOnly8!')
        self.page.locator('#passwordBtn').click();self.page.wait_for_selector('#notifBtn')
        self.assertFalse(self.page.evaluate('window.__constructorHasActor'))
        self.assertEqual(self.page.evaluate('session.token'),'NATIVE_CONFIRMED_FAKE_TOKEN')
        self.assertEqual(self.page.evaluate('session.user_id'),self.f['profile']['user_id'])
        self.open();self.assertTrue(self.page.locator('#replyRaiseBtn').is_visible())

    def test_native_delayed_profile_and_business_cannot_initialize_new_owner(self):
        for stage in ['my_profile','list_my_transactions']:
            for reject in [False,True]:
                with self.subTest(stage=stage,reject=reject):
                    self.native_boot_fixture()
                    self.page.evaluate('''stage=>{const source=rpc;rpc=(name,body)=>name===stage?new Promise((resolve,reject)=>{window.__bootRelease=resolve;window.__bootReject=reject}):source(name,body);window.__pendingBoot=boot()}''',stage)
                    self.page.wait_for_function('typeof window.__bootRelease==="function"')
                    self.page.evaluate('''()=>{session={app:"new",token:"NATIVE_B_FAKE_TOKEN",role:"employee"};directoryData={me:{display_name:"B"}};listData={rows:[],counters:{incoming:99}};sessionPermissions=["B-only"];root.innerHTML='<p id="ownerB">B shell</p>'}''')
                    self.page.evaluate('''async ({stage,reject})=>{if(reject){const e=new Error("old unauthorized");e.status=401;window.__bootReject(e)}else window.__bootRelease(stage==="my_profile"?window.__native.profile:window.__native.list);await window.__pendingBoot;delete window.__bootRelease}''',{'stage':stage,'reject':reject})
                    self.assertEqual(self.page.evaluate('session.token'),'NATIVE_B_FAKE_TOKEN')
                    self.assertIsNone(self.page.evaluate('session.user_id||null'))
                    self.assertEqual(self.page.locator('#ownerB').inner_text(),'B shell')
                    self.assertEqual(self.page.evaluate('[directoryData.me.display_name,listData.counters.incoming,sessionPermissions]'),['B',99,['B-only']])

    def reply_fixture(self,allowed=True):
        self.f['session']['role']='assistant';self.f['perms']=['transactions.reply_raise','transactions.raise_ceo']
        self.f['detail'].update(can_reply_raise=allowed,reply_route_id='11111111-1111-4111-8111-111111111111',reply_target_user_id='33333333-3333-4333-8333-333333333333',reply_target_login_name='sender-fixture',reply_target_name='المدير المرسل بالضبط',reply_target_role='manager')
        self.init();self.open()
    def test_reply_is_only_offered_by_explicit_backend_flag(self):
        self.reply_fixture(allowed=False)
        self.assertEqual(self.page.locator('#replyRaiseBtn').count(),0)
        self.page.keyboard.press('Escape');self.f['detail']['can_reply_raise']=True;self.init();self.open()
        self.assertEqual(self.page.locator('#replyRaiseBtn').count(),1)
        self.assertEqual(self.page.locator('#replyRaiseBtn').inner_text(),'الرد')
        self.assertEqual(self.page.locator('#raiseCeoBtn').count(),1)
    def test_reply_posts_immutable_sender_context_response_and_nonce(self):
        self.reply_fixture();self.assertEqual(self.page.locator('#replyRaiseBtn').count(),1)
        self.page.evaluate('''()=>{const source=post;post=async(fn,body)=>{if(body.action!=="reply_raise")return source(fn,body);window.__fixtureCalls.push({fn,body});window.__fixture.list.rows=[];window.__fixture.list.counters.incoming=0;window.__fixture.list.counters.notifications=0;return {ok:true,replayed:false,transaction_id:body.transaction_id,source_route_id:body.route_id,operation_id:body.operation_id,actor_user_id:session.user_id,reply_route_id:"22222222-2222-4222-8222-222222222222",target_user_id:window.__fixture.detail.reply_target_user_id,target_login_name:window.__fixture.detail.reply_target_login_name,target_name:"اسم مباشر أحدث"}}}''')
        self.page.locator('#replyRaiseBtn').click();self.page.wait_for_selector('#replyResponse')
        self.assertIn('الرد إلى',self.page.locator('.overlay').last.inner_text())
        self.assertIn('المدير المرسل بالضبط',self.page.locator('.overlay').last.inner_text())
        self.assertEqual(self.page.locator('.overlay').last.locator('select').count(),0)
        self.page.locator('#sendReplyRaise').click();self.page.wait_for_timeout(30)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.body?.action==="reply_raise")'))
        self.page.locator('#replyResponse').fill('  رد مصطنع يعيدها إلى مرسلها  ')
        self.page.locator('#sendReplyRaise').click();self.page.wait_for_timeout(70)
        calls=self.page.evaluate('window.__fixtureCalls.filter(c=>c.body?.action==="reply_raise")')
        self.assertEqual(len(calls),1);body=calls[0]['body']
        self.assertEqual(set(body),{'app','token','action','transaction_id','route_id','response','operation_id'})
        self.assertEqual(body['route_id'],'11111111-1111-4111-8111-111111111111')
        self.assertEqual(body['response'],'رد مصطنع يعيدها إلى مرسلها')
        import uuid
        self.assertEqual(str(uuid.UUID(body['operation_id'])),body['operation_id'])
        self.assertEqual(self.page.locator('.overlay').count(),0)
        self.assertEqual(self.page.locator('tbody tr').count(),0)
        self.assertEqual(self.page.locator('#statIncoming').inner_text(),'0')
        self.assertIn('لا توجد',self.page.locator('#notifBtn').get_attribute('aria-label'))
        self.assertTrue(self.page.evaluate('window.__fixtureCalls.some(c=>c.name==="list_my_transactions")'))
    def test_reply_receipt_is_bound_to_frozen_candidate_target_and_owner(self):
        wrong={'transaction_id':'foreign-tx','source_route_id':'55555555-5555-4555-8555-555555555555','operation_id':'66666666-6666-4666-8666-666666666666','actor_user_id':'77777777-7777-4777-8777-777777777777','target_user_id':'88888888-8888-4888-8888-888888888888','target_login_name':'Sender-Fixture','reply_route_id':'not-a-uuid','replayed':None}
        for key,value in list(wrong.items())+[('owner','switch')]:
            with self.subTest(field=key):
                self.page.evaluate('document.querySelectorAll(".overlay").forEach(w=>w.remove())')
                self.reply_fixture()
                self.page.evaluate('''()=>{const source=post;window.__replyRelease=null;post=(fn,body)=>{if(body.action!=="reply_raise")return source(fn,body);window.__fixtureCalls.push({fn,body});window.__replyBody=body;return new Promise(resolve=>window.__replyRelease=resolve)}}''')
                self.page.locator('#replyRaiseBtn').click();self.page.locator('#replyResponse').fill('رد محفوظ ثابت')
                self.page.evaluate('()=>{window.__replyPending=document.getElementById("sendReplyRaise").onclick()}')
                self.page.wait_for_function('typeof window.__replyRelease==="function"')
                self.page.evaluate('''async ({key,value})=>{const b=window.__replyBody,d=window.__fixture.detail;const receipt={ok:true,replayed:false,transaction_id:b.transaction_id,source_route_id:b.route_id,operation_id:b.operation_id,actor_user_id:session.user_id,reply_route_id:"22222222-2222-4222-8222-222222222222",target_user_id:d.reply_target_user_id,target_login_name:d.reply_target_login_name,target_name:"اسم أحدث"};if(key==="owner")session={...session,token:"ACCOUNT_B_SYNTHETIC"};else receipt[key]=value;window.__replyRelease(receipt);await window.__replyPending}''',{'key':key,'value':value})
                self.assertEqual(self.page.locator('.overlay').count(),2)
                self.assertEqual(self.page.locator('#replyResponse').input_value(),'رد محفوظ ثابت')
                self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.name==="list_my_transactions")'))
                if key=='owner':self.assertEqual(self.page.locator('.modal-feedback').count(),0)
                else:
                    self.assertIn('تعذر التحقق',self.page.locator('.overlay').last.inner_text())
                    self.page.evaluate('''()=>{post=async(fn,body)=>{window.__fixtureCalls.push({fn,body});throw new TypeError("synthetic ambiguous retry")}}''')
                    self.page.evaluate('async()=>{await document.getElementById("sendReplyRaise").onclick()}')
                    calls=self.page.evaluate('window.__fixtureCalls.filter(c=>c.body?.action==="reply_raise")')
                    self.assertEqual(len(calls),2);self.assertEqual(calls[0]['body'],calls[1]['body'])
        for field,value in [('reply_target_user_id',None),('reply_target_user_id','invalid'),('reply_target_login_name',''),('reply_route_id','invalid'),('user_id','invalid')]:
            with self.subTest(binding=field):
                self.page.evaluate('document.querySelectorAll(".overlay").forEach(w=>w.remove())')
                self.reply_fixture();self.page.keyboard.press('Escape')
                self.page.evaluate('''({field,value})=>{if(field==="user_id")session.user_id=value;else window.__fixture.detail[field]=value}''',{'field':field,'value':value})
                self.open();self.assertEqual(self.page.locator('#replyRaiseBtn').count(),0)

    def test_uncertain_reply_retries_only_original_nonce_and_candidate(self):
        self.reply_fixture();self.assertEqual(self.page.locator('#replyRaiseBtn').count(),1)
        self.page.evaluate('''()=>{const source=post;post=async(fn,body)=>{if(body.action!=="reply_raise")return source(fn,body);window.__fixtureCalls.push({fn,body});throw new TypeError("uncertain synthetic outcome")}}''')
        self.page.locator('#replyRaiseBtn').click();self.page.locator('#replyResponse').fill('الرد الأصلي المصطنع')
        self.page.locator('#sendReplyRaise').click();self.page.wait_for_timeout(70)
        self.assertEqual(self.page.locator('#replyResponse').get_attribute('readonly'),'')
        self.assertIn('التحقق',self.page.locator('.overlay').last.locator('.modal-feedback').inner_text())
        self.page.evaluate('document.getElementById("replyResponse").value="رد آخر لا يرسل"')
        self.page.locator('#sendReplyRaise').click();self.page.wait_for_timeout(70)
        calls=self.page.evaluate('window.__fixtureCalls.filter(c=>c.body?.action==="reply_raise")')
        self.assertEqual(len(calls),2);self.assertEqual(calls[0]['body'],calls[1]['body'])
        self.assertEqual(calls[1]['body']['response'],'الرد الأصلي المصطنع')
        self.page.locator('#refreshReplyDetails').click();self.page.wait_for_timeout(70)
        self.assertEqual(self.page.locator('.transaction-workspace').count(),1)
        self.assertEqual(self.page.locator('#replyRaiseBtn,#actionBtn,#referralBtn').count(),0)
        self.assertEqual(self.page.locator('#waBtn,#excelBtn,#pdfBtn').count(),3)
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>["route_assistant_ceo","route_manager_employees"].includes(c.body?.action))'))
    def test_reply_log_is_not_an_ordinary_referral_and_dedupes_only_explicit_entity(self):
        self.f['detail']['routes']=[{'id':'reply-entity','route_type':'reply','from_name':'المساعد المجيب','to_name':'المرسل الأصلي','created_at':'2026-10-06','meta':{'response':'نص رد محفوظ','reply_to_route_id':'original-raise'}}]
        self.f['detail']['history']=[{'id':'reply-history','event_type':'assistant_reply','actor_name':'المساعد المجيب','created_at':'2026-10-06','detail':'نص رد محفوظ','meta':{'reply_route_id':'reply-entity'}}, {'id':'unlinked-reply-history','event_type':'assistant_reply','actor_name':'مساعد ثان','created_at':'2026-10-06','detail':'نص رد محفوظ','meta':{}}]
        self.init();self.open()
        entries=self.page.locator('[data-log-type="reply"]')
        self.assertEqual(entries.count(),2)
        entity=self.page.locator('[data-log-key="reply:reply-entity"]')
        self.assertIn('رد المساعد',entity.inner_text())
        self.assertIn('المساعد المجيب',entity.inner_text());self.assertIn('المرسل الأصلي',entity.inner_text());self.assertIn('نص رد محفوظ',entity.inner_text())
        self.assertEqual(self.page.locator('[data-log-type="route"]').count(),0)
        self.assertEqual(self.page.locator('[data-workspace-tab]').count(),0)

    def test_reply_is_separate_and_readable_in_transaction_exports(self):
        self.f['detail']['routes']=[{'id':'reply-entity','route_type':'reply','from_name':'المساعد المجيب','to_name':'المرسل الأصلي','created_at':'2026-10-06','meta':{'response':'نص الرد في التصدير'}}]
        self.init()
        self.page.evaluate('''()=>{download=(name,type,content)=>{window.__transactionXml=content};printHtml=(title,body)=>{window.__transactionPrint=body};exportTransactionExcel(window.__fixture.detail);printTransaction(window.__fixture.detail)}''')
        for content in self.page.evaluate('[window.__transactionXml,window.__transactionPrint]'):
            self.assertIn('رد المساعد',content)
            self.assertIn('نص الرد في التصدير',content)
            self.assertIn('المرسل الأصلي',content)
    def test_unconfirmed_reply_response_does_not_close_or_report_success(self):
        self.reply_fixture();self.assertEqual(self.page.locator('#replyRaiseBtn').count(),1)
        self.page.evaluate('''()=>{const source=post;post=async(fn,body)=>body.action==="reply_raise"?{ok:false}:source(fn,body)}''')
        self.page.locator('#replyRaiseBtn').click();self.page.locator('#replyResponse').fill('رد مصطنع')
        self.page.locator('#sendReplyRaise').click();self.page.wait_for_timeout(60)
        self.assertEqual(self.page.locator('.overlay').count(),2)
        self.assertEqual(self.page.locator('#replyResponse').get_attribute('readonly'),'')
        self.assertIn('تعذر التحقق',self.page.locator('.overlay').last.inner_text())
        self.assertFalse(self.page.evaluate('window.__fixtureCalls.some(c=>c.name==="list_my_transactions")'))

    def test_reply_dialog_keyboard_and_responsive_fit(self):
        import os
        output=Path.home()/('AppData/Local/hermes/cache/scratch' if os.name=='nt' else '.cache/hermes/scratch')/'transaction-feedback-reply'
        output.mkdir(parents=True,exist_ok=True)
        for width in [1440,390]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width':width,'height':900 if width>700 else 844})
                self.reply_fixture();self.page.locator('#replyRaiseBtn').click();self.page.wait_for_selector('#replyResponse');self.page.wait_for_timeout(250)
                self.assertEqual(self.page.evaluate('document.activeElement.id'),'replyResponse')
                geometry=self.page.locator('.modal').last.evaluate('e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth,client:e.clientWidth})')
                self.assertLessEqual(geometry['width'],width);self.assertLessEqual(geometry['scroll'],geometry['client']+1)
                self.assertEqual(self.page.locator('#replyResponse').get_attribute('required'),'')
                self.page.screenshot(path=str(output/f'{width}-reply.png'))
                for _ in range(8):
                    self.page.keyboard.press('Tab');self.assertTrue(self.page.evaluate('document.querySelector(".overlay:last-of-type").contains(document.activeElement)'))
                self.page.keyboard.press('Escape');self.assertEqual(self.page.locator('.overlay').count(),1)
                self.assertEqual(self.page.evaluate('document.activeElement.id'),'replyRaiseBtn')
                self.page.keyboard.press('Escape')
    def test_sender_fixture_shows_returned_reply_updated_marker_and_notification(self):
        self.f['session']['role']='manager';self.f['perms']=['transactions.create','transactions.raise_assistant']
        self.f['list']['rows']=[dict(self.f['list']['rows'][0],read_state='updated',activity_revision=8,current_assignees=['المدير المرسل بالضبط'])]
        self.f['list']['counters'].update(incoming=1,notifications=1)
        self.f['detail']['transaction']['activity_revision']=8
        self.f['detail'].update(current_assignees=['المدير المرسل بالضبط'],can_reply_raise=False)
        self.f['detail']['routes']=[{'id':'returned-reply','route_type':'reply','from_name':'المساعد المجيب','to_name':'المدير المرسل بالضبط','created_at':'2026-10-06','meta':{'response':'رد مع إعادة المعاملة'}}]
        self.init();self.page.evaluate('currentTab="incoming";renderApp()')
        self.assertEqual(self.page.locator('[data-read-state="updated"]').count(),1)
        self.assertEqual(self.page.locator('#statIncoming').inner_text(),'1')
        self.page.evaluate('''()=>{const source=post;post=async(fn,body)=>{if(body.action==="notifications")return {rows:[{id:"sender-reply-notice",transaction_id:"fixture-transaction",title:"رد المساعد",body:"رد مع إعادة المعاملة",created_at:"2026-10-06"}],unread_count:1};if(body.action==="notification_read")return {ok:true,notification_id:body.notification_id,unread_count:0};return source(fn,body)}}''')
        self.page.locator('#notifBtn').click();self.page.wait_for_selector('.notification-item');self.page.locator('.notification-item').click();self.page.wait_for_selector('#waBtn')
        self.assertIn('رد مع إعادة المعاملة',self.page.locator('[data-log-type="reply"]').inner_text())
        self.assertIn('المدير المرسل بالضبط',self.page.locator('.details-grid .detail').last.inner_text())
        self.assertEqual(self.page.locator('#replyRaiseBtn').count(),0)
        self.assertIn('لا توجد',self.page.locator('#notifBtn').get_attribute('aria-label'))

if __name__=='__main__':unittest.main(verbosity=2)
