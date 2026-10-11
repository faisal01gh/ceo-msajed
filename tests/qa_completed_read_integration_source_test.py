"""SOURCE/OFFLINE ONLY. Never import native entrypoints or connect to SQL."""
import pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class IntegrationSource(unittest.TestCase):
 def test_native_reader_is_separate_child_buffer_with_actual_role(self):
  p=ROOT/'tests/qa_completed_read_native_reader.mjs'
  self.assertTrue(p.exists(),'separate real-role psql reader missing')
  s=p.read_text()
  for token in ["spawnSync", "input:Buffer.from", "SET LOCAL ROLE supabase_read_only_user", "SET TRANSACTION READ ONLY", "session_user", "current_user", "transaction_read_only", "ownerPid", "state='idle'", "pg_foreign_server", "parseCompletedReadQuery"]:self.assertIn(token,s)
  self.assertNotIn('RUNTIME_COMPLETED_CLOSING_SELECT',s)
  self.assertNotIn('...process.env',s)
  self.assertNotIn('exclude=[]',s)
 def test_owned_receipt_resource_reappearance_uses_native_constraints(self):
  s=(ROOT/'tests/qa_completed_read_native_cases.mjs').read_text()
  self.assertIn("['owned receipt resource reappeared'",s)
  self.assertIn('INSERT INTO app_private.qa_owned_resources',s)
 def test_write_rejection_is_exercised_before_long_digest_drift_rosters(self):
  s=(ROOT/'tests/qa_completed_cleanup_replay_native.mjs').read_text()
  self.assertLess(s.index('const writer=api.createRuntimeProvenanceGate'),s.index('for(const key of EXPECTED_KEYS)'), 'signed-approval expiry must not masquerade as the writer rejection')
 def test_anchor_owner_empty_acl_cases_are_both_parent_only(self):
  s=(ROOT/'tests/qa_completed_read_native_cases.mjs').read_text()
  self.assertIn("['qa_owned_approved_plans','qa_owned_run_receipts']",s,'both owner-negative anchors missing')
  for token in ['OWNER TO anon','REVOKE ALL ON TABLE','aclexplode','empty ACL anchor owner drift']:self.assertIn(token,s)
 def test_official211_installed_exactly_once_after210(self):
  s=(ROOT/'tests/qa_final_composed_fixture.mjs').read_text()
  self.assertIn('20261008021100_qa_completed_cleanup_replay_read.sql',s,'211 absent official manifest')
  self.assertEqual(s.count('await apply(names[9])'),1)
 def test_native_entrypoint_rejects_raw_closing_and_keeps57(self):
  s=(ROOT/'tests/qa_completed_cleanup_replay_native.mjs').read_text()
  self.assertNotIn('RUNTIME_COMPLETED_CLOSING_SELECT',s,'native entrypoint still raw')
  for token in ['retainBeforePreparation','readAsActualRole','assert.equal(result.resourcesCreated,57)','assert.equal(result.testsExecuted,57)','assert.equal(result.resourcesCleaned,57)','fullSnapshot','readonlyMutationDenials','trustedDriftDenials']:self.assertIn(token,s)
if __name__=='__main__':unittest.main()
