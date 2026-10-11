"""TEST ONLY: deterministic source-bound formal210 builder; no DB/network.

Run from any directory:
  python3 tests/qa_owned_fence_composition_build.py --check
  python3 tests/qa_owned_fence_composition_build.py --write

Only --write can write, and only the named new210 artifact. All source bytes
must match the reviewed pins. No source repair, database driver, fixture
execution, local200 extraction, role creation or gateway binding occurs here.
"""
import argparse
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARTIFACT = 'supabase/migrations/20261008021000_qa_owned_fence_composition.sql'
CONTROL = 'scripts/qa-load-preparation/owned-control.sql'
FENCE = 'scripts/qa-load-preparation/owned-deletion-fence.sql'
PASSWORD_FIXTURE = 'tests/qa_password_fixture.mjs'
INTEGRATED_FIXTURE = 'scripts/qa-load-preparation/lifecycle.fence-integrated.fixture.mjs'
M150 = 'supabase/migrations/20261008015000_qa_password_transport.sql'
M195 = 'supabase/migrations/20261008019500_qa_delete_completion.sql'
M200 = 'supabase/migrations/20261008020000_qa_isolation_enforcement.sql'
M205 = 'supabase/migrations/20261008020500_qa_password_frame_composition.sql'
SOURCE_PINS = {
    CONTROL: '5e44141ba3a1ccaebb29151ea58ab02308ce7817a2bab8c9f9df99d9719168f8',
    FENCE: 'd2f303d5b03b32a20a2a98eea0d1f2bf7a218b65ba64d6957ad46e31315f2129',
    PASSWORD_FIXTURE: '8a5ac5a7237f51e7029860373b7c170ea0080bab9ec59385848e3d0b19a9f8fb',
    INTEGRATED_FIXTURE: 'cc8450b4e8eac1d5a4c95934a272babd7a86067c81cd404516e43490cbbee89d',
    'supabase/migrations/20261008010000_qa_isolation_prerequisites.sql': '08bef568d9ecb8357b96e714affa0dc47ac276521ad993d8231ec6871dfbefe2',
    M150: 'e2454e55dd12ad86e2d29568ce3509cd3f73877d2746139815a9007606c781f6',
    'supabase/migrations/20261008018000_qa_rest_provenance.sql': 'ecb8aba27108fa51c64f8e85c1d8d805075b671555a5135773e105f647a47e46',
    'supabase/migrations/20261008018500_qa_core_rest_admission.sql': 'cfa169e716fc799df5cb314eb382106976a85b7b7ade7817d1aeb53c5bce7ed7',
    'supabase/migrations/20261008019000_qa_typed_producer_references.sql': '6f6c8e273c2d8e1be42da2c884e179ac095e8dc5be5477a1a4e63328f0eec4e5',
    M195: 'c2aca08ae966f4d7c63f79303d36499913a5c88c3d87d7099bd4e51d9ab6803d',
    M200: '1b6a5813ccbd6fa7aac2f0525558853351dac75c0a8645dbfd4203c36ec8de72',
    M205: '8af524f378899316c1e74dbe5843695cfb0c7b886ed475e7a74439908b948261',
}
REFERENCE_TABLES = (
    'profiles', 'user_roles', 'user_memberships', 'account_migration_users',
    'audit_log', 'notifications', 'transactions', 'transaction_assignments',
    'transaction_assignment_users', 'transaction_assignment_targets',
    'transaction_actions', 'transaction_action_versions', 'transaction_action_notes',
    'transaction_links', 'transaction_routes', 'transaction_requests',
    'transaction_history', 'transaction_participants', 'transaction_periods',
)
CAPTURE_TABLES = ('transactions', 'transaction_assignments', 'transaction_actions')
CANONICAL_TABLES = ('app_private.qa_core_provision_context', 'public.legacy_archive',
                    'public.migration_gate', 'public.migration_receipts',
                    'public.workspace_edits', 'public.workspace_versions')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def verify_sources(sources):
    if set(sources) != set(SOURCE_PINS):
        raise ValueError('source manifest keys differ')
    for path, pin in SOURCE_PINS.items():
        if digest(sources[path]) != pin:
            raise ValueError('reviewed source SHA-256 drift: ' + path)
    return sources


def load_sources(root=ROOT):
    return verify_sources({path: (pathlib.Path(root) / path).read_bytes() for path in SOURCE_PINS})


def attachment_rosters(raw):
    """Read the two approved attachment loops as text, never evaluate JS."""
    result = []
    for callback in ('qa_reference_guard_before_row', 'qa_delete_capture'):
        pattern = (rb"for\(const t of \[([^\]]+)\]\)await (?:db|d)\.exec\(`"
                   rb"[^`\n]*?execute function app_private\." + callback.encode() + rb"\(\)`\);")
        matches = re.findall(pattern, raw, re.I)
        if len(matches) != 1:
            raise ValueError('exact attachment source loop missing/duplicate: ' + callback)
        names = tuple(x.decode('ascii') for x in re.findall(rb"'([a-z_]+)'", matches[0]))
        if len(set(names)) != len(names):
            raise ValueError('duplicate attachment source relation')
        result.append(names)
    return tuple(result)


def product_payload(raw):
    """Remove ONLY the two outer transaction tokens, keeping all other bytes."""
    if raw.count(b'\nBEGIN;\n') != 1 or raw.count(b'\nCOMMIT;') != 1:
        raise ValueError('product source outer transaction shape changed')
    if raw.index(b'\nBEGIN;\n') > raw.index(b'\nCOMMIT;'):
        raise ValueError('product source transaction order changed')
    return raw.replace(b'\nBEGIN;\n', b'\n', 1).replace(b'\nCOMMIT;', b'\n', 1)


def freeze_payload(raw):
    """Exact official195 freeze plus original owner/revokes, replacing CREATE only."""
    matches = re.findall(rb'DO \$freeze\$[\s\S]*?END \$freeze\$;', raw)
    if len(matches) != 1 or matches[0].count(b'CREATE FUNCTION') != 1:
        raise ValueError('official195 exact freeze shape changed')
    start = raw.index(matches[0])
    tail = raw[start:]
    if tail.count(b'\nCOMMIT;') != 1 or tail.replace(b'\nCOMMIT;', b'\n', 1).rstrip().endswith(b'$freeze$;'):
        raise ValueError('official195 freeze ACL tail missing')
    return tail.replace(b'CREATE FUNCTION', b'CREATE OR REPLACE FUNCTION', 1).replace(b'\nCOMMIT;', b'\n', 1)


def function_body(raw, name):
    pattern = (rb'CREATE (?:OR REPLACE )?FUNCTION app_private\.' + re.escape(name.encode()) +
               rb'\(\) RETURNS [\s\S]*? AS \$\$([\s\S]*?)\$\$;')
    matches = re.findall(pattern, raw)
    if len(matches) != 1:
        raise ValueError('exact predecessor function body missing/duplicate: ' + name)
    return matches[0].replace(b'\r\n', b'\n')


def predecessor_checks(sources):
    contracts = ((M205, 'qa_reference_guard_before_row'),
                 (M150, 'qa_pw_frame_catalog_closed'),
                 (M205, 'qa_delete_catalog_closed'))
    values = ',\n'.join(" ('app_private.%s()', '%s')" % (name, digest(function_body(sources[path], name)))
                         for path, name in contracts)
    required = ','.join("'%s'" % name for name in CANONICAL_TABLES)
    return ("""-- Fail closed on absent native baseline or altered approved dispatcher/catalogs.
-- This does not extract, replace, bypass or weaken immutable200's activation gate.
DO $qa210_predecessor$
DECLARE contract record;p record;relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY[""" + required + """] LOOP
  IF to_regclass(relation_name) IS NULL THEN
   RAISE EXCEPTION 'qa210 canonical native prerequisite missing: %',relation_name USING ERRCODE='55000';
  END IF;
 END LOOP;
 FOR contract IN SELECT * FROM (VALUES
""" + values + """
 ) v(signature,source_digest) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(contract.signature);
  IF NOT FOUND THEN RAISE EXCEPTION 'qa210 exact predecessor missing: %',contract.signature USING ERRCODE='55000';END IF;
  IF p.proowner IS DISTINCT FROM 'postgres'::regrole::oid OR NOT p.prosecdef
  OR p.provolatile<>'v' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') IS DISTINCT FROM contract.source_digest
  THEN RAISE EXCEPTION 'qa210 exact predecessor metadata/body drift: %',contract.signature USING ERRCODE='55000';END IF;
 END LOOP;
END $qa210_predecessor$;
""").encode()


def revision_witness_checks(sources):
    """Validate the retained195 native witness before attachments or re-freeze."""
    freeze = freeze_payload(sources[M195])
    projection = re.findall(rb" SELECT jsonb_build_object\('functions',[^\r\n]+ INTO expected;", freeze)
    if len(projection) != 1:
        raise ValueError('official195 exact revision witness projection missing/duplicate')
    return b"""-- Compare to the trusted EXISTING195 witness, never refresh unexplained drift.
-- This narrow proof deliberately does not call the final attachment-dependent guard.
DO $qa210_revision_witness$
DECLARE expected jsonb;actual jsonb;signature text;p record;
BEGIN
 FOREACH signature IN ARRAY ARRAY['app_private.qa_delete_revision_abi_expected()',
   'app_private.transaction_revision_before()',
   'app_private.transaction_child_revision_after()',
   'app_private.qa_delete_graph_relations()'] LOOP
  IF to_regprocedure(signature) IS NULL THEN
   RAISE EXCEPTION 'qa210 retained195 revision witness prerequisite missing: %',signature USING ERRCODE='55000';
  END IF;
 END LOOP;
 SELECT * INTO p FROM pg_proc WHERE oid='app_private.qa_delete_revision_abi_expected()'::regprocedure;
 IF p.proowner IS DISTINCT FROM 'postgres'::regrole::oid
 OR p.proacl IS DISTINCT FROM ARRAY['postgres=X/postgres']::aclitem[]
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
 OR p.prolang IS DISTINCT FROM (SELECT oid FROM pg_language WHERE lanname='sql')
 OR p.provolatile<>'i' OR NOT p.prosecdef OR p.prokind<>'f'
 OR p.prorettype<>'jsonb'::regtype OR p.pronargs<>0 OR p.proretset
 OR p.prosqlbody IS NOT NULL THEN
  RAISE EXCEPTION 'qa210 retained195 revision witness metadata drift' USING ERRCODE='55000';
 END IF;
 expected:=app_private.qa_delete_revision_abi_expected();
 IF p.prosrc IS DISTINCT FROM format('SELECT %L::jsonb',expected::text) THEN
  RAISE EXCEPTION 'qa210 retained195 revision witness literal body drift' USING ERRCODE='55000';
 END IF;
""" + projection[0].replace(b' INTO expected;', b' INTO actual;') + b"""
 IF expected IS NULL OR actual IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'qa210 retained195 revision ABI or FK catalog drift' USING ERRCODE='55000';
 END IF;
END $qa210_revision_witness$;
"""


def attachment_sql():
    """Attach exact existing callbacks; reuse one valid attachment, reject drift."""
    reference = ','.join("'%s'" % name for name in REFERENCE_TABLES)
    capture = ','.join("'%s'" % name for name in CAPTURE_TABLES)
    return ("""-- Approved Reference Guard and DELETE capture attachment shapes only.
-- Reuse one exact existing callback attachment; never add a duplicate or DROP one.
-- Capture must precede the reference guard under PostgreSQL trigger-name order.
DO $qa210_attachments$
DECLARE item record;relation_oid oid;callback_oid oid;n integer;installed_name text;reference_name text;
BEGIN
 FOR item IN
  SELECT table_name,'app_private.qa_reference_guard_before_row()'::text signature,
         'zz_qa_owned_reference_guard'::text trigger_name,31::integer trigger_type,
         'INSERT OR UPDATE OR DELETE'::text events
  FROM unnest(ARRAY[""" + reference + """]) table_name
  UNION ALL
  SELECT table_name,'app_private.qa_delete_capture()',
         'aa_qa_owned_delete_capture',11,'DELETE'
  FROM unnest(ARRAY[""" + capture + """]) table_name
 LOOP
  relation_oid:=to_regclass(format('public.%I',item.table_name));
  callback_oid:=to_regprocedure(item.signature);
  IF relation_oid IS NULL OR callback_oid IS NULL THEN
   RAISE EXCEPTION 'qa210 approved attachment prerequisite missing on %',item.table_name USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO n FROM pg_trigger WHERE tgrelid=relation_oid AND tgfoid=callback_oid;
  IF n=0 THEN
   IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=relation_oid AND tgname=item.trigger_name) THEN
    RAISE EXCEPTION 'qa210 attachment name collision on %',item.table_name USING ERRCODE='55000';
   END IF;
   EXECUTE format('CREATE TRIGGER %I BEFORE %s ON %s FOR EACH ROW EXECUTE FUNCTION %s',item.trigger_name,item.events,relation_oid::regclass,item.signature);
  ELSIF n<>1 THEN
   RAISE EXCEPTION 'qa210 duplicate approved attachment on %',item.table_name USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=relation_oid AND tgfoid=callback_oid
    AND NOT tgisinternal AND tgtype=item.trigger_type AND tgenabled='O'
    AND NOT tgdeferrable AND NOT tginitdeferred AND tgconstraint=0 AND tgqual IS NULL
    AND tgnargs=0 AND tgattr=''::int2vector) THEN
   RAISE EXCEPTION 'qa210 filtered/disabled/altered attachment on %',item.table_name USING ERRCODE='55000';
  END IF;
 END LOOP;
 FOR item IN SELECT table_name FROM unnest(ARRAY[""" + capture + """]) table_name LOOP
  relation_oid:=to_regclass(format('public.%I',item.table_name));
  SELECT tgname::text INTO STRICT installed_name FROM pg_trigger WHERE tgrelid=relation_oid AND tgfoid='app_private.qa_delete_capture()'::regprocedure;
  SELECT tgname::text INTO STRICT reference_name FROM pg_trigger WHERE tgrelid=relation_oid AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure;
  IF installed_name COLLATE "C" >= reference_name COLLATE "C" THEN
   RAISE EXCEPTION 'qa210 capture must precede reference guard on %',item.table_name USING ERRCODE='55000';
  END IF;
 END LOOP;
END $qa210_attachments$;
""").encode()


def source_block(label, path, payload):
    marker = '-- QA210 BEGIN %s source=%s payload_sha256=%s\n' % (label, path, digest(payload))
    return marker.encode() + payload + ('\n-- QA210 END %s\n' % label).encode()


def build(sources):
    verify_sources(sources)
    expected_rosters = (REFERENCE_TABLES, CAPTURE_TABLES)
    for path in (PASSWORD_FIXTURE, INTEGRATED_FIXTURE):
        if attachment_rosters(sources[path]) != expected_rosters:
            raise ValueError('approved attachment roster drift: ' + path)
    if b"'0b2287166f8d4182f77d47eba80fceb3c4cee01833192573c4870a90d6213522'" not in sources[CONTROL]:
        raise ValueError('owned controller final205 predecessor pin missing')
    if digest(function_body(sources[M205], 'qa_reference_guard_before_row')) != '0b2287166f8d4182f77d47eba80fceb3c4cee01833192573c4870a90d6213522':
        raise ValueError('final205 dispatcher/controller source binding differs')
    header = b'''-- Formal source-bound QA owned-fence forward composition; LOCAL REVIEW ONLY.
-- Generated by TEST-ONLY tests/qa_owned_fence_composition_build.py. Do not hand-edit.
-- Authorized new installation source, not proof of deployment or acceptance.
-- Prerequisites: actual100/150/180/185/190/195, independently authorized native
-- bounded200 local section, and final205; complete200 still raises SQLSTATE55000.
-- No embedded200 section, marker extraction, activation gate change or environment bypass.
-- Full existing owned-control/fence SQL retained byte-for-byte except outer BEGIN/COMMIT
-- tokens, lifted into this one atomic transaction. Original UNAPPLIED comments remain
-- source provenance, not a second activation policy. No Core/PW/graph replacement.
-- Attachment rosters/shapes: qa_password_fixture.mjs:14-15 and
-- lifecycle.fence-integrated.fixture.mjs:24-27; no fixture setup/grants/roles copied.
-- Official195 freeze/owner/ACL replay changes only CREATE to CREATE OR REPLACE,
-- only after exact retained195 native witness validation and graph attachments.
-- No unapproved revision drift becomes expected; all original FKs/RLS/ACLs remain.
-- Existing exact Reference/Capture attachments are reused, duplicates/drift rejected.
-- Gateway anchor remains installer-only NULL/unactivated as in original product SQL;
-- native TEST initialization may bind separately approved actual safe role metadata.
-- No signed plans, target identities, authority keys, role grants or provider calls.
-- This migration is intentionally one-shot; owned tables/functions already present
-- cause atomic failure rather than a reset, DROP, stub, skip or partial replacement.
'''
    for path in sorted(SOURCE_PINS):
        header += ('-- SOURCE_SHA256 %s %s\n' % (SOURCE_PINS[path], path)).encode()
    sql = (header + b'BEGIN;\n' + predecessor_checks(sources) + revision_witness_checks(sources) + attachment_sql()
           + source_block('OFFICIAL195_FREEZE', M195, freeze_payload(sources[M195]))
           + source_block('OWNED_CONTROL', CONTROL, product_payload(sources[CONTROL]))
           + source_block('OWNED_DELETION_FENCE', FENCE, product_payload(sources[FENCE]))
           + b'-- Read-only closed graph/password-catalog verification; no gateway activation.\n'
           + b'SELECT app_private.qa_delete_catalog_closed();\nCOMMIT;\n')
    return sql


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='byte-compare only; never write')
    mode.add_argument('--write', action='store_true', help='write ONLY the new210 artifact')
    args = parser.parse_args(argv)
    result = build(load_sources())
    target = ROOT / ARTIFACT
    if args.check:
        if not target.is_file() or target.read_bytes() != result:
            raise SystemExit('formal210 artifact missing or not reproducible from reviewed sources')
    else:
        target.write_bytes(result)
    print(json.dumps({'test_only': True, 'mode': 'check' if args.check else 'write',
                      'artifact': ARTIFACT, 'sha256': digest(result), 'bytes': len(result),
                      'source_count': len(SOURCE_PINS), 'reference_attachments': len(REFERENCE_TABLES),
                      'capture_attachments': len(CAPTURE_TABLES), 'database_access': False}, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
