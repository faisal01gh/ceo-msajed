"""TEST ONLY. Offline source contracts; never connect to a database."""
import ast
import contextlib
import io
import pathlib
import re
import unittest

import qa_owned_fence_composition_build as builder

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / 'supabase/migrations/20261008021000_qa_owned_fence_composition.sql'
PRODUCT = ROOT / 'scripts/qa-load-preparation'


class CompositionContract(unittest.TestCase):
    def test_formal_artifact_embeds_complete_product_bodies(self):
        self.assertTrue(ARTIFACT.is_file(), 'authorized formal210 composition is missing')
        generated = ARTIFACT.read_bytes()
        for name in ('owned-control.sql', 'owned-deletion-fence.sql'):
            source = (PRODUCT / name).read_bytes()
            self.assertEqual(source.count(b'\nBEGIN;\n'), 1)
            self.assertEqual(source.count(b'\nCOMMIT;'), 1)
            payload = source.replace(b'\nBEGIN;\n', b'\n', 1).replace(b'\nCOMMIT;', b'\n', 1)
            self.assertEqual(generated.count(payload), 1, name + ' full body must be preserved')

    def test_offline_sql_lexical_framing(self):
        self.assertTrue((ROOT / 'tests/qa_owned_fence_composition_build_syntax.py').is_file(),
                        'offline lexical-framing verifier is missing')
        from qa_owned_fence_composition_build_syntax import inspect_sql
        report = inspect_sql(ARTIFACT.read_bytes())
        self.assertEqual(report['transaction_commands'], ['BEGIN', 'COMMIT'])
        self.assertGreater(report['dollar_bodies'], 40)
        self.assertEqual(report['evidence_class'], 'offline_lexical_framing_only')

    def test_all_twelve_inputs_are_exact_reviewed_sha256(self):
        sources = builder.load_sources()
        self.assertEqual(len(sources), 12)
        for path, raw in sources.items():
            with self.subTest(path=path):
                self.assertEqual(builder.digest(raw), builder.SOURCE_PINS[path])
                self.assertIn(('-- SOURCE_SHA256 %s %s\n' % (builder.SOURCE_PINS[path], path)).encode(), ARTIFACT.read_bytes())

    def test_each_source_drift_is_rejected_before_build(self):
        sources = builder.load_sources()
        for path in sources:
            with self.subTest(path=path):
                drift = dict(sources)
                drift[path] += b'\n-- changed source\n'
                with self.assertRaisesRegex(ValueError, 'reviewed source SHA-256 drift'):
                    builder.build(drift)

    def test_missing_or_extra_source_manifest_entries_are_rejected(self):
        sources = builder.load_sources()
        missing = dict(sources)
        del missing[builder.M200]
        extra = dict(sources, extra=b'not a source')
        for altered in (missing, extra):
            with self.assertRaisesRegex(ValueError, 'source manifest keys differ'):
                builder.build(altered)

    def test_artifact_is_deterministic_and_byte_reproducible(self):
        sources = builder.load_sources()
        self.assertEqual(builder.build(sources), builder.build(dict(reversed(list(sources.items())))))
        self.assertEqual(ARTIFACT.read_bytes(), builder.build(sources))

    def test_check_cli_is_read_only(self):
        before = ARTIFACT.read_bytes()
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            self.assertEqual(builder.main(['--check']), 0)
        self.assertEqual(ARTIFACT.read_bytes(), before)
        self.assertIn('"database_access": false', captured.getvalue())

    def test_both_approved_fixture_rosters_agree_without_js_execution(self):
        sources = builder.load_sources()
        for path in (builder.PASSWORD_FIXTURE, builder.INTEGRATED_FIXTURE):
            self.assertEqual(builder.attachment_rosters(sources[path]),
                             (builder.REFERENCE_TABLES, builder.CAPTURE_TABLES))
        self.assertEqual(len(builder.REFERENCE_TABLES), 19)
        self.assertEqual(len(builder.CAPTURE_TABLES), 3)

    def test_missing_or_duplicate_attachment_loops_are_rejected(self):
        raw = builder.load_sources()[builder.PASSWORD_FIXTURE]
        for altered in (b'no attachment loops', raw + raw):
            with self.assertRaisesRegex(ValueError, 'exact attachment source loop missing/duplicate'):
                builder.attachment_rosters(altered)
        duplicated_relation = raw.replace(b"['profiles','user_roles'", b"['profiles','profiles','user_roles'", 1)
        with self.assertRaisesRegex(ValueError, 'duplicate attachment source relation'):
            builder.attachment_rosters(duplicated_relation)

    def test_product_transform_only_removes_outer_transaction_tokens(self):
        sources = builder.load_sources()
        for path in (builder.CONTROL, builder.FENCE):
            raw = sources[path]
            expected = raw.replace(b'\nBEGIN;\n', b'\n', 1).replace(b'\nCOMMIT;', b'\n', 1)
            self.assertEqual(builder.product_payload(raw), expected)
            with self.assertRaisesRegex(ValueError, 'outer transaction shape changed'):
                builder.product_payload(raw + b'\nBEGIN;\n')
            with self.assertRaisesRegex(ValueError, 'outer transaction shape changed'):
                builder.product_payload(raw.replace(b'\nCOMMIT;', b'\n-- absent;', 1))

    def test_exact_official195_freeze_and_acl_are_refreshed(self):
        raw = builder.load_sources()[builder.M195]
        start = raw.index(b'DO $freeze$')
        expected = raw[start:].replace(b'CREATE FUNCTION', b'CREATE OR REPLACE FUNCTION', 1).replace(b'\nCOMMIT;', b'\n', 1)
        self.assertEqual(builder.freeze_payload(raw), expected)
        self.assertEqual(ARTIFACT.read_bytes().count(expected), 1)
        self.assertIn(b'ALTER FUNCTION app_private.qa_delete_revision_abi_expected() OWNER TO postgres;', expected)
        self.assertIn(b'REVOKE ALL ON FUNCTION app_private.qa_delete_revision_abi_expected() FROM PUBLIC,anon,authenticated,service_role;', expected)
        with self.assertRaisesRegex(ValueError, 'exact freeze shape changed'):
            builder.freeze_payload(raw.replace(b'DO $freeze$', b'DO $different$', 1))

    def test_old195_native_revision_witness_is_validated_before_any_replacement(self):
        sources = builder.load_sources()
        generated = builder.build(sources)
        marker = b'DO $qa210_revision_witness$'
        self.assertIn(marker, generated,
                      'SQL-FINAL-02: formal210 must validate the existing195 witness, not bless native drift')
        check = generated[generated.index(marker):generated.index(b'END $qa210_revision_witness$;')]
        original = re.findall(rb" SELECT jsonb_build_object\('functions',[^\r\n]+ INTO expected;", sources[builder.M195][sources[builder.M195].index(b'DO $freeze$'):])
        self.assertEqual(len(original), 1)
        self.assertIn(original[0].replace(b' INTO expected;', b' INTO actual;'), check,
                      'exact source-derived function/OID/owner/ACL/config/trigger/FK projection')
        self.assertLess(check.index(b'expected:=app_private.qa_delete_revision_abi_expected();'),
                        check.index(b' INTO actual;'))
        self.assertIn(b'actual IS DISTINCT FROM expected', check)
        self.assertIn(b"USING ERRCODE='55000'", check)
        for later in (b'DO $qa210_attachments$', b'-- QA210 BEGIN OFFICIAL195_FREEZE',
                      b'-- QA210 BEGIN OWNED_CONTROL', b'-- QA210 BEGIN OWNED_DELETION_FENCE'):
            self.assertLess(generated.index(marker), generated.index(later))
        self.assertNotIn(b'qa_delete_catalog_closed()', check,
                         'must not need final attachments or broaden that protected guard')
        self.assertNotRegex(check.upper(), rb'CREATE\s|ALTER\s|GRANT\s|REVOKE\s|DROP\s|INSERT\s|UPDATE\s|DELETE\s')

    def test_retained195_witness_is_the_original_private_literal_sql_contract(self):
        check = builder.revision_witness_checks(builder.load_sources())
        checks = (b"p.proowner IS DISTINCT FROM 'postgres'::regrole::oid",
                  b"p.proacl IS DISTINCT FROM ARRAY['postgres=X/postgres']::aclitem[]",
                  b"p.proconfig IS DISTINCT FROM ARRAY['search_path=\"\"']::text[]",
                  b"p.prolang IS DISTINCT FROM (SELECT oid FROM pg_language WHERE lanname='sql')",
                  b"p.provolatile<>'i'", b'NOT p.prosecdef',
                  b"p.prorettype<>'jsonb'::regtype", b'p.pronargs<>0', b'p.proretset',
                  b'p.prosqlbody IS NOT NULL', b"p.prosrc IS DISTINCT FROM format('SELECT %L::jsonb',expected::text)")
        for required in checks:
            self.assertIn(required, check,
                          'existing195 witness must stay its exact private SQL/literal ABI, not a live catalog refresher')
        self.assertLess(check.index(b'p.proacl IS DISTINCT FROM'),
                        check.index(b'expected:=app_private.qa_delete_revision_abi_expected();'))
        self.assertIn(b'retained195 revision witness metadata drift', check)
        self.assertIn(b'retained195 revision witness literal body drift', check)

    def test_native_witness_entrypoint_has_fresh_exact_hook_atomic_rejection_cases(self):
        target = ROOT / 'tests/qa_m210_witness_final_native.mjs'
        self.assertTrue(target.is_file(),
                        'parent-only native clean/body/config/ACL/owner/FK/trigger/missing-witness roster absent')
        source = target.read_text(encoding='utf-8')
        roster = re.search(r'export const caseNames=Object.freeze\(\[([\s\S]*?)\]\);', source)
        self.assertIsNotNone(roster)
        names = re.findall(r"'([^']+)'", roster[1])
        expected = ['clean210'] + [kind + ':' + callback
            for callback in ('transaction_revision_before', 'transaction_child_revision_after')
            for kind in ('body', 'config', 'acl', 'owner', 'trigger')]
        expected += ['fk', 'witness_missing', 'witness_config', 'witness_live_projection']
        self.assertEqual(names, expected)
        for required in ("createFinalComposedFixture({beforeGuards})", "QA_M210_WITNESS_CASE",
                         "QA_LOCAL_PG_DATABASE", "e.code==='55000'", "await db.exec('ROLLBACK')",
                         "assert.deepEqual(await h.catalog(),before.catalog)",
                         "assert.deepEqual(await h.snapshot(),before.data)",
                         "assert.deepEqual(await witness(db),before.witness)",
                         "throw expectedStop", "verifyManifest(f)"):
            self.assertIn(required, source)
        self.assertIn('source_sql_executed:false', source,
                      'native reports must not claim execution before an attempted actual210 apply')
        self.assertIn('pg_get_functiondef', source)
        self.assertIn('ALTER CONSTRAINT', source)
        self.assertIn('no DATABASE/ROLE creation or schema reset', source)
        self.assertNotIn('resetOwnedSchemas', source)
        self.assertNotRegex(source, r'CREATE DATABASE|DROP DATABASE|CREATE ROLE|DROP ROLE|DROP TRIGGER')

    def test_required_installation_order_is_attachments_freeze_control_fence(self):
        raw = ARTIFACT.read_bytes()
        markers = [b'DO $qa210_predecessor$', b'DO $qa210_attachments$',
                   b'-- QA210 BEGIN OFFICIAL195_FREEZE', b'-- QA210 BEGIN OWNED_CONTROL',
                   b'-- QA210 BEGIN OWNED_DELETION_FENCE',
                   b'-- Read-only closed graph/password-catalog verification;']
        offsets = [raw.index(marker) for marker in markers]
        self.assertEqual(offsets, sorted(offsets))
        self.assertIn(b'SELECT app_private.qa_delete_catalog_closed();\nCOMMIT;', raw)

    def test_predecessor_bodies_are_source_bound_not_substitute_helpers(self):
        sources = builder.load_sources()
        expected = '0b2287166f8d4182f77d47eba80fceb3c4cee01833192573c4870a90d6213522'
        self.assertEqual(builder.digest(builder.function_body(sources[builder.M205], 'qa_reference_guard_before_row')), expected)
        checks = builder.predecessor_checks(sources)
        for path, name in ((builder.M205, 'qa_reference_guard_before_row'),
                           (builder.M150, 'qa_pw_frame_catalog_closed'),
                           (builder.M205, 'qa_delete_catalog_closed')):
            self.assertIn(builder.digest(builder.function_body(sources[path], name)).encode(), checks)
        for name in builder.CANONICAL_TABLES:
            self.assertIn(name.encode(), checks)
        with self.assertRaisesRegex(ValueError, 'predecessor function body missing/duplicate'):
            builder.function_body(sources[builder.M205], 'not_an_approved_function')

    def test_immutable200_hash_and_barrier_are_preserved_not_embedded(self):
        raw = builder.load_sources()[builder.M200]
        self.assertEqual(builder.digest(raw), '1b6a5813ccbd6fa7aac2f0525558853351dac75c0a8645dbfd4203c36ec8de72')
        barrier = (b"DO $blocked$ BEGIN RAISE EXCEPTION 'qa_enforcement_not_ready: "
                   b"prerequisite/legacy8/password/REST/cascade/closure acceptance incomplete' "
                   b"USING ERRCODE='55000'; END $blocked$;")
        self.assertEqual(raw.count(barrier), 1)
        self.assertNotIn(barrier, ARTIFACT.read_bytes())
        self.assertNotIn(b'-- BEGIN LOCAL VERIFIABLE SECTION', ARTIFACT.read_bytes())

    def test_duplicate_filtered_disabled_attachments_fail_closed_no_drop(self):
        raw = builder.attachment_sql()
        self.assertIn(b'ELSIF n<>1 THEN', raw)
        self.assertIn(b"tgtype=item.trigger_type AND tgenabled='O'", raw)
        self.assertIn(b'tgqual IS NULL', raw)
        self.assertIn(b'tgnargs=0', raw)
        self.assertIn(b'tgconstraint=0', raw)
        self.assertIn(b'NOT tgisinternal', raw)
        self.assertIn(b'attachment name collision', raw)
        self.assertIn(b'installed_name COLLATE "C" >= reference_name COLLATE "C"', raw)
        self.assertNotRegex(raw.upper(), rb'DROP\s+TRIGGER|ALTER\s+TABLE|DISABLE\s+TRIGGER')

    def test_gateway_role_binding_is_not_a_migration_assumption(self):
        raw = ARTIFACT.read_bytes()
        self.assertNotIn(b'qa_fixture_auth_gateway', raw)
        self.assertNotRegex(raw.upper(), rb'CREATE\s+ROLE|ALTER\s+ROLE|SET\s+ROLE')
        self.assertIn(b'VALUES(1,NULL,app_private.qa_owned_native_catalog_digest(),NULL);', raw)
        self.assertNotRegex(raw, rb'UPDATE\s+app_private\.qa_owned_native_anchor')
        self.assertIn(b'rolcreaterole', raw)
        self.assertIn(b'gateway_metadata IS NULL', raw)

    def test_no_baseline_fk_rls_acl_reset_or_environment_bypass_added(self):
        raw = ARTIFACT.read_bytes()
        self.assertNotRegex(raw.upper(), rb'DROP\s+(?:SCHEMA|DATABASE|TABLE|TRIGGER)|TRUNCATE\s|DISABLE\s+TRIGGER')
        self.assertNotRegex(raw.upper(), rb'ALTER\s+TABLE\s+(?:PUBLIC|AUTH)\.')
        self.assertNotRegex(raw.upper(), rb'GRANT\s+[^;\n]*ON\s+ALL\s+(?:TABLES|SEQUENCES)')
        self.assertNotIn(b"SET session_replication_role", raw)
        self.assertNotIn(b"SET row_security", raw)
        self.assertNotIn(b"qa_sql_operation_context_backend_pid_check", raw)
        self.assertNotIn(b'raw_user_meta_data jsonb NOT NULL', raw)

    def test_generator_imports_have_no_database_network_or_process_runner(self):
        allowed = {'argparse', 'hashlib', 'json', 'pathlib', 're'}
        for name in ('qa_owned_fence_composition_build.py', 'qa_owned_fence_composition_build_syntax.py'):
            tree = ast.parse((ROOT / 'tests' / name).read_text(encoding='utf-8'))
            imports = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.extend(alias.name.split('.')[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom):
                    imports.append(node.module.split('.')[0])
            self.assertLessEqual(set(imports), allowed)
            calls = [node.func.id for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)]
            self.assertNotIn('exec', calls)
            self.assertNotIn('eval', calls)

    def test_payload_markers_bind_actual_embedded_bytes(self):
        raw = ARTIFACT.read_bytes()
        pattern = rb'-- QA210 BEGIN (\w+) source=([^\n]+?) payload_sha256=([0-9a-f]{64})\n([\s\S]*?)\n-- QA210 END \1\n'
        matches = re.findall(pattern, raw)
        self.assertEqual(len(matches), 3)
        self.assertEqual({x[0] for x in matches}, {b'OFFICIAL195_FREEZE', b'OWNED_CONTROL', b'OWNED_DELETION_FENCE'})
        for label, path, pin, payload in matches:
            self.assertEqual(builder.digest(payload).encode(), pin, label.decode())
            self.assertIn(path.decode(), builder.SOURCE_PINS)

    def test_offline_lexer_rejects_truncated_or_nested_sql(self):
        from qa_owned_fence_composition_build_syntax import inspect_sql
        for raw in (b'BEGIN; SELECT (1; COMMIT;', b"BEGIN; SELECT 'oops; COMMIT;",
                    b'BEGIN; DO $x$ BEGIN; END; COMMIT;', b'BEGIN; /* missing end',
                    b'BEGIN; SELECT 1; BEGIN; COMMIT; COMMIT;', b'BEGIN; SELECT 1; COMMIT',
                    b'BEGIN; SELECT ); COMMIT;', b'ROLLBACK;', b''):
            with self.subTest(sql=raw):
                with self.assertRaises(ValueError):
                    inspect_sql(raw)


if __name__ == '__main__':
    unittest.main(verbosity=2)
