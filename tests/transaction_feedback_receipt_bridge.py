"""Unaltered actual local SQL receipt -> actual renderer's reply consumer.
Run ownership_bridge.mjs first. Every browser API remains blocked/intercepted.
Not native provider authentication or deployed acceptance.
"""
import argparse, copy, json, unittest
from pathlib import Path
from transaction_feedback_ui import TestFeedback
parser=argparse.ArgumentParser()
parser.add_argument('--witness',default='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/transaction-feedback-parity/sql-receipt.json')
args=parser.parse_args()
witness=json.loads(Path(args.witness).read_text(encoding='utf-8'))

class ReceiptBridge(TestFeedback):
    def test_actual_sql_fresh_and_replay_receipts_and_identity_negative_controls(self):
        original=copy.deepcopy(self.f)
        fresh=witness['receipt']
        foreign_target={**fresh,'target_user_id':'90000000-0000-4000-8000-000000000099'}
        foreign_source={**fresh,'source_route_id':'90000000-0000-4000-8000-000000000098'}
        for label,receipt,accepted in [('fresh SQL receipt',fresh,True),('persisted SQL replay receipt',witness['replay'],True),('foreign target negative control',foreign_target,False),('foreign source negative control',foreign_source,False)]:
            with self.subTest(label=label):
                self.f=copy.deepcopy(original)
                self.f['session'].update(role='assistant')
                self.f['session'].pop('user_id',None)
                self.f['directory']['me'].pop('user_id',None)
                self.f['directory']['me']['role']='assistant'
                self.f['list']['rows'][0].update(id=fresh['transaction_id'],activity_revision=witness['transaction']['activity_revision'])
                self.f['detail'].update(transaction=witness['transaction'],can_reply_raise=True,reply_route_id=fresh['source_route_id'],reply_target_user_id=fresh['target_user_id'],reply_target_login_name=fresh['target_login_name'],reply_target_name=fresh['target_name'],current_assignees=['assistant display'])
                self.init()
                self.page.evaluate('''data=>{
                    document.querySelectorAll('.overlay').forEach(e=>e.remove());
                    window.__receiptBridge=data;window.__receiptBridgeRefreshed=false;
                    crypto.randomUUID=()=>data.operation;
                    const originalRpc=rpc;
                    rpc=async(name,body)=>{
                        if(name==='my_profile')return data.profile;
                        if(name==='transaction_directory_my')return window.__fixture.directory;
                        if(name==='my_permissions')return window.__fixture.perms;
                        return originalRpc(name,body);
                    };
                    const original=post;
                    post=async(fn,body)=>{
                        if(body.action==='reply_raise'){
                            window.__fixtureCalls.push({action:body.action,body});
                            return data.receipt;
                        }
                        return original(fn,body);
                    };
                    refresh=async()=>{window.__receiptBridgeRefreshed=true};
                }''',{'receipt':receipt,'operation':fresh['operation_id'],'profile':witness['profile']})
                self.page.evaluate('boot()')
                self.assertEqual(self.page.evaluate('session.user_id'),fresh['actor_user_id'])
                self.assertEqual(self.page.locator('#notifBtn').count(),1,'bridge must complete business BOOT, not only assign identity before an RPC fixture failure')
                self.page.evaluate('id=>openDetails(id)',fresh['transaction_id'])
                self.page.wait_for_selector('#replyRaiseBtn')
                self.assertEqual(self.page.locator('#replyRaiseBtn').inner_text(),'الرد')
                self.page.locator('#replyRaiseBtn').click()
                self.page.locator('#replyResponse').fill(witness['response'])
                self.page.locator('#sendReplyRaise').click()
                self.page.wait_for_timeout(40)
                self.assertEqual(self.page.evaluate('window.__receiptBridgeRefreshed'),accepted)
                self.assertEqual(self.page.locator('.overlay').count(),0 if accepted else 2)
                call=self.page.evaluate('window.__fixtureCalls.filter(c=>c.action==="reply_raise").at(-1).body')
                self.assertEqual(call['transaction_id'],fresh['transaction_id'])
                self.assertEqual(call['route_id'],fresh['source_route_id'])
                self.assertEqual(call['operation_id'],fresh['operation_id'])
                self.assertEqual(call['response'],witness['response'])
                if not accepted:
                    self.assertTrue(self.page.locator('#replyResponse').evaluate('e=>e.readOnly'))
                    self.assertIn('تعذر التحقق',self.page.locator('.modal-feedback').inner_text())
                    self.assertEqual(self.page.locator('#replyResponse').input_value(),witness['response'])

suite=unittest.TestSuite([ReceiptBridge('test_actual_sql_fresh_and_replay_receipts_and_identity_negative_controls')])
result=unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
