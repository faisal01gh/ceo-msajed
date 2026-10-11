"""Offline-only source contract; never import runtime or contact PostgreSQL."""
import pathlib
import re
import unittest

import importlib.util
import hashlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql'
SPEC = importlib.util.spec_from_file_location('completed_read_builder', ROOT / 'tests/qa_completed_replay_read_api_build.py')
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)  # Pure offline generator only; no runtime/fixture imports.

ALLOWED_CALLS = frozenset(('acldefault','aclexplode','array_agg','convert_to','count','current_setting',
    'encode','format','has_schema_privilege','has_table_privilege','jsonb_agg','jsonb_array_elements',
    'jsonb_array_length','jsonb_build_object','jsonb_each','jsonb_object_agg','jsonb_object_keys',
    'jsonb_typeof','pg_get_expr','pg_get_function_arguments','pg_get_function_identity_arguments',
    'pg_get_function_result','pg_get_functiondef','sha256','statement_timestamp','string_agg',
    'to_jsonb','to_regclass'))

def executable_sql(body):
    return re.sub(r"'(?:[^']|'')*'|--[^\n]*|/\*[\s\S]*?\*/", ' ', body)

def audit_body(body):
    sql = executable_sql(body)
    assert sql.strip().startswith('WITH'), 'fixed SELECT/CTE body required'
    assert sql.count(';') == 1 and sql.rstrip().endswith(';'), 'one fixed statement required'
    assert not re.search(r'\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CALL|EXECUTE|PERFORM|COPY|ALTER|CREATE|DROP|GRANT|REVOKE|FOR UPDATE|FOR SHARE)\b', sql, re.I), 'effect-bearing statement denied'
    calls = re.findall(r'\b([a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*)\s*\(', sql, re.I)
    assert all(c.startswith('pg_catalog.') and c.split('.')[1] in ALLOWED_CALLS for c in calls), 'unknown or noncatalog callable denied'
    bare = re.findall(r'(?<![\w.])([a-z_][a-z_0-9]*)\s*\(', sql, re.I)
    syntax = {'materialized','as','in','any','exists','coalesce','values','relation_roster','column_roster','e','x','keys','unit','member','from','not','and','or','where'}
    assert all(c.lower() in syntax for c in bare), 'unqualified callable denied: '+repr(sorted(set(bare)-syntax))
    assert not re.search(r'to_jsonb\s*\(\s*(?:u|s|x)\s*\)', sql, re.I), 'whole Auth/session row materialization denied'
    assert not re.search(r'\bx\.(?:'+ '|'.join(BUILDER.SECRET_COLUMNS)+r')\b', sql, re.I), 'secret-column materialization denied'
    return sorted(set(calls))

class CompletedReadSource(unittest.TestCase):
    def test_formal_function_only_least_privilege_abi(self):
        self.assertTrue(MIGRATION.is_file(), 'missing formal completed-read migration211')
        source = MIGRATION.read_text(encoding='utf8')
        self.assertEqual(len(re.findall(r'CREATE(?: OR REPLACE)? FUNCTION', source)), 1)
        self.assertIn('public.qa_completed_cleanup_replay_read(', source)
        self.assertIn("LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''", source)
        self.assertIn('OWNER TO postgres;', source)
        self.assertRegex(source, r'REVOKE ALL ON FUNCTION [\s\S]+ FROM PUBLIC,anon,authenticated,service_role;')
        self.assertRegex(source, r'GRANT EXECUTE ON FUNCTION [\s\S]+ TO supabase_read_only_user;')
        self.assertNotRegex(source, r'(?i)GRANT\s+(?:USAGE|SELECT)|ALTER\s+(?:ROLE|TABLE)|CREATE\s+(?:ROLE|TABLE|TRIGGER|POLICY)')
        self.assertIn("has_schema_privilege('supabase_read_only_user','public','USAGE')", source)
        self.assertIn("RAISE EXCEPTION 'completed read prerequisites denied'", source)

    def test_completed_proof_binds_live_catalog_plan_receipts_and_final_snapshot(self):
        source = MIGRATION.read_text(encoding='utf8')
        body = source.split('AS $read$', 1)[1].split('$read$;', 1)[0]
        self.assertNotIn('SELECT NULL::jsonb', body, 'missing completed proof implementation')
        for required in ["'already_completed'", 'p_run', 'p_source', 'p_operation', 'p_generation', 'p_uid', 'p_canonical',
                         'approved_plan_digest_pg', 'signature_digest', 'signing_key_hash', 'role_plan_digest',
                         'terminal_receipt_digest_pg', 'native_root_digest_pg', 'final_cleanup_digest_pg',
                         'current_protected_digest', 'protected_snapshot_digest', 'metadata_digest_pg',
                         'control_identity_digest', 'catalog_digest', 'completion_counters',
                         'pg_catalog.jsonb_array_length(a.payload->\'resources\')=57',
                         "d.status='completed'", "'all_exact_native_effects_observed'",
                         'd.auth_readback_digest', 'd.absence_observed_at', 'd.completed_receipt',
                         "pg_catalog.current_setting('transaction_read_only')='on'",
                         "pg_catalog.current_setting('role',true)='supabase_read_only_user'",
                         'current_protected_digest=d.protected_snapshot_digest',
                         'n.catalog_digest=anchor.catalog_digest', 'p_expected', 'FROM auth.users',
                         'FROM auth.sessions', 'FROM app_private.qa_owned_deletions',
                         'FROM app_private.qa_password_frames', 'FROM app_private.qa_sql_operation_context',
                         'FROM app_private.qa_core_provision_context', 'FROM app_private.account_password_operations']:
            self.assertIn(required, body)
        self.assertNotRegex(body, r'(?i)\b(?:INSERT|UPDATE|DELETE|TRUNCATE|EXECUTE|CALL|PERFORM|nextval|setval|set_config)\s*(?:\(|INTO|FROM|TABLE)')
        self.assertNotIn('app_private.qa_owned_protected_population_digest()', body)
        self.assertNotIn('app_private.qa_owned_native_catalog_digest()', body)
        self.assertNotIn('app_private.qa_owned_identity_snapshot()', body)

    def test_transaction_columns_match_actual_final_source_order(self):
        # Native source-bound column readback, same complete set; no alternative order.
        expected = ['id', 'number', 'origin', 'legacy_source', 'legacy_sn', 'legacy_sid', 'legacy_department_name', 'legacy_channel', 'legacy_note', 'legacy_payload', 'legacy_synced_at', 'title', 'subject', 'attachment_url', 'priority', 'status', 'responsible_unit_id', 'responsible_user_id', 'current_level', 'ceo_attention', 'due_at', 'created_by', 'created_by_name', 'created_at', 'closed_at', 'cancelled_at', 'last_activity_at', 'updated_at', 'close_level', 'responsible_login_name', 'responsible_name', 'workflow_started', 'closed_reason', 'cancelled_reason', 'migration_status', 'activity_revision']
        self.assertEqual(BUILDER.PROJECTION_MANIFEST['public.transactions'], expected)

    def test_installer_anchor_owner_is_independent_of_acl_expansion(self):
        # Inspect the actual fixed SQL template without loading moving source pins.
        # An explicit empty relacl emits no aclexplode rows, even for a new owner.
        template = (ROOT / 'tests/qa_completed_replay_read_api_build.py').read_text(encoding='utf8')
        guard = template.split('-- Approved anchors/receipts', 1)[1].split('AND self.proowner', 1)[0]
        guard = re.sub(r'--[^\n]*', '', guard)
        anchors = ('approved_plans', 'run_receipts', 'native_anchor', 'deletions', 'native_effects')
        owner_clauses = re.findall(
            r"AND EXISTS\(SELECT 1 FROM pg_catalog\.pg_class anchor_owner "
            r"WHERE anchor_owner\.oid='(app_private\.qa_owned_[a-z_]+)'::pg_catalog\.regclass "
            r"AND anchor_owner\.relowner='postgres'::pg_catalog\.regrole\)", guard)
        self.assertEqual(owner_clauses, ['app_private.qa_owned_' + name for name in anchors],
                         'each exact anchor must exist and be postgres-owned independently of aclexplode')
        owner_end = guard.rfind("anchor_owner.relowner='postgres'::pg_catalog.regrole)")
        self.assertLess(owner_end, guard.index('CROSS JOIN LATERAL pg_catalog.aclexplode'))
        # Table and column privilege checks remain separate and strict.
        for required in ("acl.grantee<>'postgres'::pg_catalog.regrole",
                         "acl.grantor<>'postgres'::pg_catalog.regrole",
                         'pg_catalog.aclexplode(at.attacl)',
                         "anchor_column_acl.grantee<>'postgres'::pg_catalog.regrole",
                         "anchor_column_acl.grantor<>'postgres'::pg_catalog.regrole"):
            self.assertIn(required, guard)

    def test_immutable_anchor_column_acl_drift_is_fail_closed(self):
        body = MIGRATION.read_text(encoding='utf8').split('AS $read$', 1)[1].split('$read$;', 1)[0]
        self.assertIn('anchor_column_acl', body, 'missing installer-anchor column ACL denial')
        self.assertIn('pg_catalog.aclexplode(at.attacl)', body)
        self.assertIn("anchor_column_acl.grantee<>'postgres'::pg_catalog.regrole", body)
        self.assertIn("anchor_column_acl.grantor<>'postgres'::pg_catalog.regrole", body)

    def test_fresh_combined_readback_digest_binds_complete_nonsecret_proof(self):
        body=MIGRATION.read_text(encoding='utf8').split('AS $read$',1)[1].split('$read$;',1)[0]
        self.assertTrue("'current_final_readback_digest_pg'" in body, 'missing current combined final readback digest')
        self.assertIn("pg_catalog.convert_to((result)::text,'UTF8')",body)

    # Supplemental already-implemented coverage, not invented RED evidence.
    def test_exact_build_time_projection_and_preserved_predecessor_pins(self):
        self.assertEqual(MIGRATION.read_bytes(), BUILDER.build().encode('utf8'))
        self.assertEqual(BUILDER.SOURCE_PINS['supabase/migrations/20261008021000_qa_owned_fence_composition.sql'],
                         '9a35584dc6aff806df982fb8ef130471f924a378012a1f76f1e048c5d07de4a4')
        path='scripts/qa-load-preparation/owned-control.sql'
        original=BUILDER.SOURCE_PINS[path]
        try:
            BUILDER.SOURCE_PINS[path]='0'*64
            with self.assertRaisesRegex(ValueError,'source drift'):
                BUILDER.build()
        finally:
            BUILDER.SOURCE_PINS[path]=original

    def test_closed_read_capability_rejects_mutating_counterexamples(self):
        body=MIGRATION.read_text(encoding='utf8').split('AS $read$',1)[1].split('$read$;',1)[0]
        self.assertTrue(audit_body(body))
        for mutation in ["pg_catalog.nextval('public.any_sequence')", "pg_catalog.setval('public.any_sequence',1)",
                         "pg_catalog.set_config('role','postgres',false)", 'app_private.qa_owned_fence_catalog_attested()',
                         'app_private.qa_owned_protected_population_digest()', 'public.qa_owned_delete_finalize_internal(NULL,1)',
                         "pg_catalog.pg_advisory_xact_lock(1)", 'to_jsonb(u)', 'pg_catalog.to_jsonb(x.encrypted_password)']:
            mutated=re.sub(r'\) SELECT result[\s\S]*? FROM proof;', ') SELECT '+mutation+' FROM proof;',body)
            self.assertNotEqual(mutated,body,'counterexample injection must actually alter source')
            with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                audit_body(mutated)
        with self.assertRaises(AssertionError):
            audit_body(body.replace('WITH', 'WITH dangerous AS (DELETE FROM auth.users RETURNING id),',1))

    def test_complete_nonsecret_proof_and_counter_schema(self):
        source=MIGRATION.read_text(encoding='utf8')
        for key, query in BUILDER.COUNTER_QUERIES.items():
            self.assertIn("'"+key+"',("+BUILDER.qualify(query)+")",source)
        self.assertEqual(len(BUILDER.COUNTER_QUERIES),18)
        returned=source.split('proof AS (',1)[1].split(') result',1)[0]
        self.assertNotRegex(returned, r"'(?:(?:payload|plan_payload|signature|auth_projection)|(?:access|refresh)_token|password|jwt|effect_old|effect_new|full_row)'[,)]")
        self.assertIn('pd.current_protected_digest',returned)
        self.assertIn('m.metadata_digest_pg',returned)
        self.assertIn('n.catalog_digest',returned)
        self.assertNotIn('SELECT * FROM auth',source)

if __name__ == '__main__':
    unittest.main(verbosity=2)
