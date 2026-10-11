"""OFFLINE build-time projection only. No imports of JS/DB/network/fixture code.
Frozen nonsecret columns are copied from the retained predecessor column receipt;
new QA/Auth columns are parsed from the exact approved local DDL sources.
Only --write writes the new211 migration; --check compares it exactly.
"""
import argparse
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / 'supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql'

def sha(value):
    return hashlib.sha256(value.encode('utf8') if isinstance(value, str) else value).hexdigest()

def qualify(sql):
    # Qualify executable catalog tokens, NEVER identifiers inside SQL strings.
    pieces = re.split(r"('(?:[^']|'')*')", sql)
    functions = ('array_agg','jsonb_agg','jsonb_build_object','jsonb_array_length','jsonb_array_elements','jsonb_array_elements_text','jsonb_object_keys','jsonb_each','to_jsonb','convert_to','sha256','encode','format','has_table_privilege','pg_get_expr','pg_get_function_arguments','pg_get_function_identity_arguments','pg_get_function_result','pg_get_functiondef','to_regclass','count','bool_and','string_agg','aclexplode','acldefault','current_setting','has_schema_privilege')
    for i in range(0, len(pieces), 2):
        pieces[i] = re.sub(r'(?<![\w.])('+'|'.join(functions)+r')\s*\(', lambda m:'pg_catalog.'+m[1]+'(', pieces[i], flags=re.I)
        pieces[i] = re.sub(r'(?<![\w.])pg_(class|roles|namespace|auth_members|constraint|trigger|proc|attribute|attrdef|language|foreign_server|inherits|rewrite)\b', r'pg_catalog.pg_\1', pieces[i])
    return ''.join(pieces)

# PROJECTION_MANIFEST is added by the build-time source-bound construction below.
PROJECTION_MANIFEST = {'app_private.account_credential_state': ['user_id', 'generation', 'session_valid_after'], 'app_private.account_password_operations': ['operation_id', 'actor_id', 'actor_session_id', 'target_id', 'kind', 'status', 'generation', 'source', 'qa_control', 'dispatch_state', 'dispatch_token', 'dispatch_admitted_at', 'candidate_verified_session'], 'app_private.qa_account_manifest': ['user_id', 'canonical_key', 'login_alias', 'principal_class', 'run_id', 'owned_creation_operation', 'owned_creation_receipt_id', 'tombstoned_at'], 'app_private.qa_core_provision_context': ['backend_pid', 'sql_xid', 'source_function', 'canonical_key', 'target_user', 'login_name', 'display_name', 'role_code', 'expected_memberships'], 'app_private.qa_password_frames': ['backend_pid', 'sql_xid', 'entry_oid', 'operation_id', 'phase', 'actor_uid', 'actor_sid', 'target_uid', 'canonical_key', 'generation', 'kind', 'control', 'native_created_at', 'native_not_after', 'actor_cutoff', 'target_cutoff', 'sequence', 'state', 'effect_table', 'effect_op', 'effect_old', 'effect_new'], 'app_private.qa_run_members': ['run_id', 'user_id', 'role_code', 'active'], 'app_private.qa_runs': ['run_id', 'phase', 'active', 'expires_at', 'created_at'], 'app_private.qa_sql_operation_context': ['backend_pid', 'sql_xid', 'operation_id', 'table_oid', 'old_key', 'actor_uid', 'actor_sid', 'run_id', 'operation_mode', 'root_transaction_ids', 'parent_ids', 'old_references'], 'app_private.qa_transaction_manifest': ['transaction_id', 'run_id', 'owned_creation_operation', 'tombstoned_at'], 'app_private.transaction_read_state': ['transaction_id', 'user_id', 'seen_revision', 'seen_at'], 'auth.refresh_tokens': ['id', 'session_id'], 'auth.sessions': ['id', 'user_id', 'created_at', 'not_after'], 'auth.users': ['id', 'email', 'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'email_confirmed_at', 'banned_until', 'deleted_at'], 'public.account_migration_aliases': ['alias', 'canonical_key', 'source', 'source_login', 'active', 'last_activity_at', 'created_at'], 'public.account_migration_users': ['canonical_key', 'preferred_login', 'display_name', 'role_code', 'job_title', 'org_name', 'dept_names', 'internal_email', 'eligible', 'migrated_user_id', 'must_change_password', 'migrated_at', 'password_changed_at', 'created_at', 'login_username'], 'public.account_permission_overrides': ['canonical_key', 'permission_code', 'effect', 'created_by', 'created_at', 'updated_at'], 'public.audit_log': ['id', 'actor_id', 'event_type', 'entity_type', 'entity_id', 'detail', 'meta', 'created_at'], 'public.auth_login_attempts': ['ident', 'attempts', 'first_at', 'blocked_until'], 'public.legacy_archive': ['source_table', 'source_key', 'payload', 'row_hash', 'imported_at'], 'public.legacy_auth_directory': ['legacy_user_id', 'login_name', 'display_name', 'legacy_role', 'job_title', 'sectors', 'dept_names', 'active', 'imported_at'], 'public.legacy_login_credentials': ['username', 'pass_hash', 'source', 'display_name', 'legacy_role', 'job_title', 'org_name', 'dept_name', 'dept_names', 'active', 'migrated_user_id', 'auth_email', 'migrated_at', 'imported_at'], 'public.migration_gate': ['id', 'token_hash', 'expires_at', 'enabled'], 'public.migration_receipts': ['id', 'source_table', 'batch_count', 'received_at'], 'public.notifications': ['id', 'user_id', 'transaction_id', 'event_type', 'title', 'body', 'read_at', 'created_at', 'target_login_name', 'target_name'], 'public.organizational_units': ['id', 'name', 'unit_type', 'parent_id', 'active', 'legacy_name', 'created_at'], 'public.permissions': ['code', 'name_ar', 'created_at'], 'public.profiles': ['id', 'login_name', 'full_name', 'job_title', 'active', 'legacy_source', 'legacy_username', 'created_at', 'updated_at', 'must_change_password', 'contact_email'], 'public.role_permissions': ['role_code', 'permission_code'], 'public.roles': ['code', 'name_ar', 'created_at'], 'public.transaction_action_notes': ['id', 'action_id', 'transaction_id', 'actor_name', 'note', 'created_at'], 'public.transaction_action_versions': ['id', 'action_id', 'version_no', 'body', 'actor_id', 'actor_name', 'decision_status', 'decision_by', 'decision_reason', 'decision_at', 'created_at', 'decision_by_name'], 'public.transaction_actions': ['id', 'transaction_id', 'assignment_id', 'actor_id', 'actor_name', 'action_text', 'status', 'current_version', 'created_at', 'updated_at', 'legacy_sid'], 'public.transaction_assignment_targets': ['id', 'assignment_id', 'user_id', 'login_name', 'display_name', 'active', 'assigned_at', 'completed_at'], 'public.transaction_assignment_users': ['assignment_id', 'user_id', 'active', 'assigned_at', 'completed_at'], 'public.transaction_assignments': ['id', 'transaction_id', 'unit_id', 'assignment_type', 'directive', 'attachment_url', 'status', 'created_by', 'created_at', 'completed_at', 'visibility_scope'], 'public.transaction_history': ['id', 'transaction_id', 'event_type', 'actor_id', 'actor_name', 'detail', 'meta', 'created_at', 'legacy_key'], 'public.transaction_links': ['id', 'transaction_id', 'assignment_id', 'link_type', 'url', 'label', 'created_by', 'created_at'], 'public.transaction_participants': ['transaction_id', 'user_id', 'participation_type', 'active', 'created_at'], 'public.transaction_periods': ['id', 'transaction_id', 'cycle_no', 'started_at', 'ended_at', 'duration_days', 'created_at'], 'public.transaction_requests': ['id', 'transaction_id', 'request_type', 'requested_by', 'reason', 'requested_due_at', 'requested_user_id', 'status', 'decided_by', 'decision_reason', 'decided_at', 'created_at', 'requested_by_login_name', 'requested_by_name', 'decided_by_login_name', 'decided_by_name', 'meta'], 'public.transaction_routes': ['id', 'transaction_id', 'route_type', 'from_user_id', 'from_role', 'to_user_id', 'to_unit_id', 'directive', 'raise_reason', 'proposed_decision', 'transfer_reason', 'status', 'rejection_reason', 'decided_by', 'decided_at', 'created_at', 'from_login_name', 'from_name', 'to_login_name', 'to_name', 'visibility_scope', 'meta'], 'public.transaction_sequences': ['year', 'last_value'], 'public.transactions': ['id', 'number', 'origin', 'legacy_source', 'legacy_sn', 'legacy_sid', 'legacy_department_name', 'legacy_channel', 'legacy_note', 'legacy_payload', 'legacy_synced_at', 'title', 'subject', 'attachment_url', 'priority', 'status', 'responsible_unit_id', 'responsible_user_id', 'current_level', 'ceo_attention', 'due_at', 'created_by', 'created_by_name', 'created_at', 'closed_at', 'cancelled_at', 'last_activity_at', 'updated_at', 'close_level', 'responsible_login_name', 'responsible_name', 'workflow_started', 'closed_reason', 'cancelled_reason', 'migration_status', 'activity_revision'], 'public.user_memberships': ['user_id', 'unit_id', 'membership_role', 'is_primary', 'active', 'created_at'], 'public.user_permissions': ['user_id', 'permission_code', 'effect', 'created_at'], 'public.user_roles': ['user_id', 'role_code', 'is_primary', 'created_at'], 'public.workspace_edits': ['scope', 'revision', 'request_id', 'actor', 'operations', 'created_at'], 'public.workspace_versions': ['scope', 'revision']}
SOURCE_PINS = {'supabase/migrations/20261002141915_transactions_foundation_indexes.sql': '69581d59b6da6c84645306c4dfa11c7323e19a307bd26e19ec801784dd6ac086', 'supabase/migrations/20261002_transactions_foundation.sql': '26e4f63c803b56ab825ab04b9d77ce5f01c64b296f245bde6aa5638e68aeb720', 'supabase/migrations/20261003150203_transactions_runtime_extensions.sql': '153ad4fc9b0aa0574529c6c2dacfc68896c904dc44d91b14661a00bfc96694ed', 'supabase/migrations/20261003153412_transaction_action_decision_actor.sql': '29bbb87ea60223d13ffa7bfcce68941170512bc010db870b0122b88c643ac501', 'supabase/migrations/20261003153805_legacy_auth_directory.sql': '4d5fb6934795658b2c525eb8cacc147a17c9c9759571395642b4cef1beeec67c', 'supabase/migrations/20261003155140_legacy_open_review_state.sql': '103a64e678ff453e6fc8230c909dab1b78e483192155752c843ad031377aa576', 'supabase/migrations/20261003165841_active_account_migration_registry.sql': '4b8087244a97299039084c8338ff9726bbe699cd10ca9460ee584e4ef2e8d1b8', 'supabase/migrations/20261003170538_resolve_open_legacy_transaction_context.sql': '54f98a5224e1a7c5fe0834466b62200b28d99a2d13f64886ce35b8fd3d71f49b', 'supabase/migrations/20261003170945_fast_transaction_listing_rpc.sql': 'b112ec6421aee8699bbed0f98db060be2cd9d10d99a15c38e9956c905a47206b', 'supabase/migrations/20261003175332_reconcile_precreated_active_accounts.sql': '9a12fdc3ab35a1f0149a4b19223793ada9b8862ec4cf6967edeecfaf0b788063', 'supabase/migrations/20261003175846_fast_user_context_rpc.sql': '89e8478dda3cc2b9d7f0e21bd5c55e005477a773ae6d989aa13a5787d03583dc', 'supabase/migrations/20261003180229_direct_authenticated_transaction_reads.sql': '096e34848d58c5617f8f47e148a4603f988dd96cc1bd6d1881345aba8a64884a', 'supabase/migrations/20261003180434_slim_transaction_listing_payload.sql': 'e665924a29b42caf2d25270356f6f7e546cafe8e07313e3ef29616f0ad590922', 'supabase/migrations/20261003180502_migration_role_indexes.sql': 'edfd61d980e02e0b08f0eb455b0559c94815850c89c2f33db43151d688d1bd1b', 'supabase/migrations/20261004174500_permissions_transactions_section.sql': '8edadcf14ac3975428ddd3e68f8eda1cefa14c02640906dee3049bd49c69ac27', 'supabase/migrations/20261004195600_full_editable_transaction_permissions.sql': '7d17600a588730c32b81778dc58ce7a943c3a6b7f1b7963ee633e7129bdd77a6', 'supabase/migrations/20261004201800_remove_generic_transaction_assign.sql': 'f350d42c7a4939390a3d5b554d7231946036bba409c8f276c9b4b981e0a7882d', 'supabase/migrations/20261004202500_harden_permissions_rpc_boundary.sql': '9d4ade02921428216709a2c952a4c8d54757a5cc5e125095c9750c92ba634f7a', 'supabase/migrations/20261004203200_permissions_invoker_wrappers.sql': '18f883c845aa766ed8ed4dfcc3c7967949ae7d2dadae92638ee5ef48f6cd392c', 'supabase/migrations/20261004210000_full_staff_registry_profiles.sql': '502b712c41fab3735615a4442a4874aff29ee7c4fbd5305cd207a966cb513c2d', 'supabase/migrations/20261004211500_transaction_action_notes.sql': 'be6a1e2bda4b120095b94f39bb1653c7041cdd5ab91c0ef302f55141f89d1f98', 'supabase/migrations/20261004212500_profile_admin_name.sql': 'edf09286348254a33cd93b2fce9699a961c459ac6bb6a38a03c8f23ef8e98706', 'supabase/migrations/20261004213500_profile_permission_setter.sql': '695c90b8ec5d079ccd058f74cbfc277aac04b7692ac9167b326e5af2870ef6a3', 'supabase/migrations/20261004214500_hide_job_titles_from_directory.sql': 'f4ae360ac76638a3ce34e6d04bb5cd0d18fee702f90b6fd2e56ee6cc93254913', 'supabase/migrations/20261005182000_transaction_detail_edit_permissions.sql': '0925413eeeee75d2b6469fb01645b41cc4da6de00e578ee0d7a1c25e3a3eea67', 'supabase/migrations/20261005185500_english_login_usernames.sql': 'ab1bee04f230292d9a43d1601b6bbad91028666edb45f86fcc572c5e7f68b98b', 'supabase/migrations/20261005191000_first_name_login_usernames.sql': '0da2fec4fcc367c25baa2ba84b066afbbed7550d22168dea8b8f954efa1c05d7', 'supabase/migrations/20261005200000_password_operations_and_safe_provisioning.sql': '40eb7f3342f4eb8f3689ad5eb3d41bac7d08082b28de1ed7c646c95171672afc', 'supabase/migrations/20261006193000_transaction_custody_read_state.sql': '41fa62c9f2bdab2870c0303dc328525151fc8bd315a04d68657645d5a0d0bedf', 'supabase/migrations/20261006194500_transaction_assistant_reply.sql': '0561d2ba86a88fcf6ce197e69701ae70289c02bd10451963eb0950706fed6ccd', 'supabase/migrations/20261007190000_transaction_executive_custody.sql': '25460e9eb60a762e36fcdb3afbbde9a202d8e588369251c8d634a545f6e95408', 'supabase/migrations/20261008010000_qa_isolation_prerequisites.sql': '08bef568d9ecb8357b96e714affa0dc47ac276521ad993d8231ec6871dfbefe2', 'supabase/migrations/20261008015000_qa_password_transport.sql': 'e2454e55dd12ad86e2d29568ce3509cd3f73877d2746139815a9007606c781f6', 'supabase/migrations/20261008018000_qa_rest_provenance.sql': 'ecb8aba27108fa51c64f8e85c1d8d805075b671555a5135773e105f647a47e46', 'supabase/migrations/20261008018500_qa_core_rest_admission.sql': 'cfa169e716fc799df5cb314eb382106976a85b7b7ade7817d1aeb53c5bce7ed7', 'supabase/migrations/20261008019000_qa_typed_producer_references.sql': '6f6c8e273c2d8e1be42da2c884e179ac095e8dc5be5477a1a4e63328f0eec4e5', 'supabase/migrations/20261008019500_qa_delete_completion.sql': 'c2aca08ae966f4d7c63f79303d36499913a5c88c3d87d7099bd4e51d9ab6803d', 'supabase/migrations/20261008020000_qa_isolation_enforcement.sql': '1b6a5813ccbd6fa7aac2f0525558853351dac75c0a8645dbfd4203c36ec8de72', 'supabase/migrations/20261008020500_qa_password_frame_composition.sql': '8af524f378899316c1e74dbe5843695cfb0c7b886ed475e7a74439908b948261', 'supabase/migrations/20261008021000_qa_owned_fence_composition.sql': '9a35584dc6aff806df982fb8ef130471f924a378012a1f76f1e048c5d07de4a4', 'scripts/qa-load-preparation/lifecycle.fence-final.fixture.mjs': 'fd1ac54ec50cde8654d649e4eb5dd6462e95d93e64dc4006523be9436828ebec', 'scripts/qa-load-preparation/owned-attestation.mjs': 'dd0dae44c9a5f0f993d8beea28737433829762fb896691978f5bb56c7c2a22e5', 'scripts/qa-load-preparation/owned-control.sql': '5e44141ba3a1ccaebb29151ea58ab02308ce7817a2bab8c9f9df99d9719168f8', 'scripts/qa-load-preparation/owned-deletion-fence.sql': 'd2f303d5b03b32a20a2a98eea0d1f2bf7a218b65ba64d6957ad46e31315f2129', 'tests/qa_final_composed_fixture.mjs': 'a57f8bcd6c0a6d797ea9f631c8aad5e8113724f32813f9c6300f51ee586617c8', 'tests/qa_isolation_enforcement.mjs': '6e3cd387416d6cda7b62b5855d2d564f4bb110f813c08f7f6b5d8cfd2d893bcf', 'tests/qa_isolation_fixture.mjs': 'd33c2ece8d1064e8433302e9d7867492c8a54dd0cc14f4011c1baa206c5c3982'}
FROZEN_COLUMN_RECEIPT_SHA256 = '3bfd53c8d5d79b926929acde21b1461603f9e04444d29bdb7796eb881288a7a1'


def load_sources():
    sources = {p:(ROOT/p).read_bytes() for p in SOURCE_PINS}
    for p, raw in sources.items():
        if sha(raw) != SOURCE_PINS[p]:
            raise ValueError('completed-read projection source drift: '+p)
    return sources


EXPECTED_KEYS = ('rolePlanDigest','approvedPlanDigestPg','signatureDigest','signingKeyHash','metadataDigestPg','controlIdentityDigest','ownershipReceiptDigest','protectedSnapshotDigest','authAbsenceDigest','terminalReceiptDigest','nativeRootDigest','finalCleanupDigest','apiBodyDigest')
SECRET_COLUMNS = ('token_hash','pass_hash','encrypted_password','token','refresh_token','access_token','secret','recovery_token','confirmation_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token')
COUNTER_QUERIES = {
 'ownedSources':'SELECT count(*) FROM app_private.qa_owned_sources',
 'ownedOperations':'SELECT count(*) FROM app_private.qa_owned_operations',
 'ownedResources':'SELECT count(*) FROM app_private.qa_owned_resources',
 'ownedFrames':'SELECT count(*) FROM app_private.qa_owned_frames',
 'closureEmpty':'SELECT count(*) FROM app_private.qa_owned_frame_empty',
 'nativeFrames':'SELECT count(*) FROM app_private.qa_owned_native_frames',
 'passwordFrames':'SELECT count(*) FROM app_private.qa_password_frames',
 'sqlOperationFrames':'SELECT count(*) FROM app_private.qa_sql_operation_context',
 'coreFrames':'SELECT count(*) FROM app_private.qa_core_provision_context',
 'passwordOperations':'SELECT count(*) FROM app_private.account_password_operations',
 'pending':'SELECT count(*) FROM app_private.qa_owned_deletions WHERE status<>\'completed\'',
 'fences':'SELECT count(*) FROM app_private.qa_owned_deletion_fences',
 'qaRuns':'SELECT count(*) FROM app_private.qa_runs',
 'qaAccounts':'SELECT count(*) FROM app_private.qa_account_manifest',
 'qaMembers':'SELECT count(*) FROM app_private.qa_run_members',
 'qaTransactions':'SELECT count(*) FROM app_private.qa_transaction_manifest',
 'sessions':'SELECT count(*) FROM auth.sessions s WHERE EXISTS(SELECT 1 FROM app_private.qa_owned_deletions d WHERE d.target_user_id=s.user_id)',
 'targetAuth':'SELECT count(*) FROM auth.users u WHERE EXISTS(SELECT 1 FROM app_private.qa_owned_deletions d WHERE d.target_user_id=u.id)',
}

def pgsha(expression):
    return "pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(("+expression+")::text,'UTF8')),'hex')"

def flat_canonical(expression):
    # Only the two CLOSED flat scalar receipts and official flat absence proof.
    return "(SELECT '{'||pg_catalog.string_agg(pg_catalog.to_jsonb(k)::text||':'||v::text,',' ORDER BY k COLLATE \"C\")||'}' FROM pg_catalog.jsonb_each("+expression+") e(k,v))"

def build():
    sources = load_sources()
    att = sources['scripts/qa-load-preparation/owned-attestation.mjs'].decode('utf8')
    literals = re.findall(r'OWNED_CONTROL_PRIMARY_METADATA_SELECT=(".*");',att)
    if len(literals)!=1:raise ValueError('primary metadata source missing/ambiguous')
    primary = qualify(json.loads(literals[0]))
    inventory = []
    shapes = []
    for table, columns in PROJECTION_MANIFEST.items():
        safe=[c for c in columns if c not in SECRET_COLUMNS]
        projection="pg_catalog.jsonb_build_object("+','.join("'"+c+"',pg_catalog.to_jsonb(x."+c+")" for c in safe)+")"
        # At completed all-run zero, the original resource/source exclusions are
        # necessarily empty. Retained run receipt exclusion remains explicit.
        predicate=" WHERE NOT EXISTS(SELECT 1 FROM app_private.qa_owned_run_receipts r WHERE r.run_id=x.run_id)" if table=='app_private.qa_runs' else ''
        rows="(SELECT coalesce(pg_catalog.jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM (SELECT "+projection+" v FROM "+table+" x"+predicate+") q)"
        inventory.append("SELECT '"+table+"'::text surface,"+pgsha(rows)+" digest")
        shapes.append("('"+table+"',ARRAY["+','.join("'"+c+"'" for c in columns)+"]::text[])")
    counters="pg_catalog.jsonb_build_object("+','.join("'"+k+"',("+qualify(v)+")" for k,v in COUNTER_QUERIES.items())+")"
    control_hash=SOURCE_PINS['scripts/qa-load-preparation/owned-control.sql']
    fence_hash=SOURCE_PINS['scripts/qa-load-preparation/owned-deletion-fence.sql']
    own_tables=['app_private.qa_owned_'+s for s in ('approved_plans','run_receipts','sources','operations','resources','frames','frame_empty','deletions','deletion_fences','native_anchor','native_frames','native_effects')]
    roster=list(PROJECTION_MANIFEST)+own_tables
    relation_values=','.join("('"+t+"')" for t in sorted(roster))
    return """-- LOCAL-ONLY independent completed read API; NOT activation or a write permit.
-- 211 follows already-official immutable210; this independent source is after205.
-- No predecessor reapplication, permission repair or incomplete/write admission.
-- Generated offline by tests/qa_completed_replay_read_api_build.py. Fixed SELECT.
-- PostgreSQL jsonb-text SHA256 and JS canonical SHA256 are DISTINCT conventions.
-- Verify the retained original signed plan locally; SQL does NOT verify Ed25519.
BEGIN;
DO $prerequisites$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='supabase_read_only_user') THEN
  RAISE EXCEPTION 'completed read prerequisites denied' USING ERRCODE='42501';
 END IF;
 IF NOT pg_catalog.has_schema_privilege('supabase_read_only_user','public','USAGE') THEN
  RAISE EXCEPTION 'completed read prerequisites denied' USING ERRCODE='42501';
 END IF;
END $prerequisites$;
CREATE FUNCTION public.qa_completed_cleanup_replay_read(
 p_run uuid,p_source uuid,p_operation uuid,p_generation bigint,p_uid uuid,p_canonical text,p_expected jsonb
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' STRICT PARALLEL UNSAFE AS $read$
WITH
 primary_metadata AS MATERIALIZED ("""+primary+""" AS metadata),
 metadata_digest AS MATERIALIZED (
 SELECT metadata,"""+pgsha('metadata')+""" metadata_digest_pg,
 """+pgsha("metadata->'controlIdentity'")+""" control_identity_digest FROM primary_metadata
 ),
 native_catalog AS MATERIALIZED (
 SELECT """+pgsha("metadata->'nativeCatalog'")+""" catalog_digest FROM primary_metadata
 ),
 counters AS MATERIALIZED (SELECT """+counters+""" completion_counters),
 protected_surface_digests AS MATERIALIZED (
 """+'\n UNION ALL\n '.join(inventory)+"""
 ),
 protected_digest AS MATERIALIZED (
 SELECT """+pgsha('pg_catalog.jsonb_object_agg(surface,digest)')+""" current_protected_digest FROM protected_surface_digests
 ),
 relation_roster(surface) AS (VALUES """+relation_values+"""),
 column_roster(surface,columns) AS (VALUES """+','.join(shapes)+"""),
 approved AS MATERIALIZED (
 SELECT a.plan_id,a.payload,a.signing_key_hash,a.source_hash,a.expires_at,r.completed_at,
 """+pgsha('a.payload')+""" approved_plan_digest_pg,
 """+pgsha('a.signature')+""" signature_digest,
 a.payload->>'rolePlanDigest' role_plan_digest
 FROM app_private.qa_owned_approved_plans a JOIN app_private.qa_owned_run_receipts r ON r.plan_id=a.plan_id
 WHERE r.run_id=p_run AND r.completed_at IS NOT NULL AND r.plan_payload=a.payload
 AND a.payload->>'runId'=p_run::text AND a.expires_at>pg_catalog.statement_timestamp()
 AND pg_catalog.jsonb_array_length(a.payload->'resources')=57
 AND pg_catalog.jsonb_typeof(a.payload->'units')='array' AND pg_catalog.jsonb_array_length(a.payload->'units')>0
 AND pg_catalog.jsonb_typeof(a.payload->'protectedUIDs')='array'
 AND pg_catalog.jsonb_typeof(a.payload->'protectedCanonicalKeys')='array'
 AND a.source_hash='"""+control_hash+"""' AND a.payload->>'sourceHash'=a.source_hash
 AND a.payload->'sourceHashes'=pg_catalog.jsonb_build_object('owned-control.sql','"""+control_hash+"""','owned-deletion-fence.sql','"""+fence_hash+"""')
 AND a.signature ~ '^[A-Za-z0-9+/]{86}==$'
 ),
 resources AS MATERIALIZED (
 SELECT s FROM approved a CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(a.payload->'resources') x(s)
 ),
 terminal AS MATERIALIZED (
 SELECT d.*,r.s,
 """+pgsha('d.completed_receipt')+""" terminal_receipt_digest_pg,
 """+pgsha('d.native_root_receipt')+""" native_root_digest_pg,
 """+flat_canonical('d.completed_receipt')+""" terminal_canonical,
 """+flat_canonical('d.native_root_receipt')+""" root_canonical,
 """+pgsha(flat_canonical("pg_catalog.jsonb_build_object('protocol','official-get-user-not-found-v1','operation_id',d.operation_id,'generation',d.generation,'target_user_id',d.target_user_id,'status',404,'user',NULL)"))+""" current_auth_absence_digest
 FROM app_private.qa_owned_deletions d JOIN resources r ON r.s->>'sourceId'=d.source_id::text WHERE d.run_id=p_run
 ),
 final_digest AS MATERIALIZED (
 SELECT """+pgsha("pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('sourceId',source_id,'receipt',completed_receipt,'nativeRoot',native_root_receipt) ORDER BY source_id::text COLLATE \"C\")")+""" final_cleanup_digest_pg,
 """+pgsha("'['||pg_catalog.string_agg('{\"nativeRoot\":'||root_canonical||',\"receipt\":'||terminal_canonical||',\"sourceId\":'||pg_catalog.to_jsonb(source_id)::text||'}',',' ORDER BY source_id::text COLLATE \"C\")||']'")+""" final_cleanup_digest_js FROM terminal
 ),
 self_catalog AS MATERIALIZED (
 SELECT p.*,"""+pgsha('p.prosrc')+""" proof_source_digest
 FROM pg_catalog.pg_proc p WHERE p.oid='public.qa_completed_cleanup_replay_read(uuid,uuid,uuid,bigint,uuid,text,jsonb)'::pg_catalog.regprocedure
 ),
 proof AS (
 SELECT pg_catalog.jsonb_build_object(
 'version',1,'status','already_completed','run_id',p_run,'source_id',p_source,'operation_id',p_operation,
 'generation',p_generation,'target_user_id',p_uid,'canonical_key',p_canonical,
 'plan_id',a.plan_id,'approved_plan_digest_pg',a.approved_plan_digest_pg,'signature_digest',a.signature_digest,
 'signing_key_hash',a.signing_key_hash,'role_plan_digest',a.role_plan_digest,
 'source_hashes',a.payload->'sourceHashes','control_identity_digest',m.control_identity_digest,
 'metadata_digest_pg',m.metadata_digest_pg,'native_catalog_digest',n.catalog_digest,'proof_source_digest',self.proof_source_digest,
 'ownership_receipt_digest',d.ownership_receipt_digest,'creation_projection_digest',d.native_root_receipt->>'projection_digest',
 'protected_snapshot_digest',d.protected_snapshot_digest,'current_protected_digest',pd.current_protected_digest,
 'auth_absence_digest',d.auth_readback_digest,'current_auth_absence_digest',d.current_auth_absence_digest,
 'terminal_receipt_digest_pg',d.terminal_receipt_digest_pg,'native_root_digest_pg',d.native_root_digest_pg,
 'terminal_receipt_digest_js',"""+pgsha('d.terminal_canonical')+""",'native_root_digest_js',"""+pgsha('d.root_canonical')+""",
 'final_cleanup_digest_pg',f.final_cleanup_digest_pg,'final_cleanup_digest_js',f.final_cleanup_digest_js,
 'completion_counters',c.completion_counters,'unfiltered',true,'resource_count',57
 ) result
 FROM approved a CROSS JOIN metadata_digest m CROSS JOIN native_catalog n CROSS JOIN counters c
 CROSS JOIN protected_digest pd CROSS JOIN final_digest f CROSS JOIN self_catalog self
 CROSS JOIN app_private.qa_owned_native_anchor anchor JOIN terminal d ON true
 WHERE d.source_id=p_source AND d.operation_id=p_operation AND d.generation=p_generation
 AND d.target_user_id=p_uid AND d.canonical_key=p_canonical
 AND p_generation BETWEEN 1 AND 9007199254740991 AND p_canonical<>''
 AND pg_catalog.current_setting('transaction_read_only')='on'
 AND pg_catalog.current_setting('role',true)='supabase_read_only_user' AND current_user='postgres'
 AND pg_catalog.has_schema_privilege('supabase_read_only_user','public','USAGE')
 AND NOT pg_catalog.has_schema_privilege('supabase_read_only_user','app_private','USAGE')
 AND NOT pg_catalog.has_schema_privilege('supabase_read_only_user','auth','USAGE')
 AND pg_catalog.jsonb_typeof(p_expected)='object'
 AND (SELECT pg_catalog.array_agg(k ORDER BY k COLLATE "C") FROM pg_catalog.jsonb_object_keys(p_expected) keys(k))=ARRAY["""+','.join("'"+k+"'" for k in sorted(EXPECTED_KEYS))+"""]::text[]
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(p_expected) e WHERE pg_catalog.jsonb_typeof(e.value)<>'string' OR e.value #>> '{}' !~ '^[0-9a-f]{64}$')
 AND a.approved_plan_digest_pg=p_expected->>'approvedPlanDigestPg' AND a.signature_digest=p_expected->>'signatureDigest'
 AND a.signing_key_hash=p_expected->>'signingKeyHash' AND a.role_plan_digest=p_expected->>'rolePlanDigest'
 AND a.payload->>'controlIdentityDigest'=m.control_identity_digest AND m.control_identity_digest=p_expected->>'controlIdentityDigest'
 AND m.metadata_digest_pg=p_expected->>'metadataDigestPg' AND self.proof_source_digest=p_expected->>'apiBodyDigest'
 AND d.ownership_receipt_digest=p_expected->>'ownershipReceiptDigest'
 AND d.protected_snapshot_digest=p_expected->>'protectedSnapshotDigest'
 AND d.auth_readback_digest=p_expected->>'authAbsenceDigest'
 AND """+pgsha('d.terminal_canonical')+"""=p_expected->>'terminalReceiptDigest'
 AND """+pgsha('d.root_canonical')+"""=p_expected->>'nativeRootDigest'
 AND f.final_cleanup_digest_js=p_expected->>'finalCleanupDigest'
 AND anchor.id=1 AND (SELECT pg_catalog.count(*) FROM app_private.qa_owned_native_anchor)=1
 AND n.catalog_digest=anchor.catalog_digest
 AND anchor.gateway_metadata=pg_catalog.jsonb_build_object('role',m.metadata->'gateway'->'role','memberships',m.metadata->'gateway'->'memberships')
 AND m.metadata->'gateway'->'businessWrite'='false'::jsonb
 AND (SELECT pg_catalog.count(*) FROM approved)=1
 AND (SELECT pg_catalog.count(*) FROM terminal)=57
 AND (SELECT pg_catalog.count(*) FROM app_private.qa_owned_deletions WHERE run_id=p_run)=57
 AND (SELECT pg_catalog.count(DISTINCT target_user_id) FROM terminal)=57
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(c.completion_counters) e WHERE e.value<>'0'::jsonb)
 -- Fixed complete table/column universe. Missing objects raise, extra objects deny.
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class cl JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
  WHERE ns.nspname IN ('auth','public','app_private') AND cl.relkind IN ('r','p','v','m','f')
  AND (cl.relkind<>'r' OR cl.relispartition OR NOT EXISTS(SELECT 1 FROM relation_roster rr WHERE rr.surface=ns.nspname||'.'||cl.relname)))
 AND (SELECT pg_catalog.count(*) FROM relation_roster)=(SELECT pg_catalog.count(*) FROM pg_catalog.pg_class cl JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace WHERE ns.nspname IN ('auth','public','app_private') AND cl.relkind='r')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_server)
 AND NOT EXISTS(SELECT 1 FROM column_roster cr WHERE cr.columns IS DISTINCT FROM
  (SELECT pg_catalog.array_agg(at.attname::text ORDER BY at.attnum) FROM pg_catalog.pg_attribute at WHERE at.attrelid=pg_catalog.to_regclass(cr.surface) AND at.attnum>0 AND NOT at.attisdropped))
 AND NOT EXISTS(SELECT 1 FROM relation_roster rr JOIN pg_catalog.pg_class cl ON cl.oid=pg_catalog.to_regclass(rr.surface)
  WHERE EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class=cl.oid)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits ih WHERE ih.inhrelid=cl.oid OR ih.inhparent=cl.oid)
  OR (cl.relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles ownerrole WHERE ownerrole.rolname=current_user AND (ownerrole.rolsuper OR ownerrole.rolbypassrls OR (ownerrole.oid=cl.relowner AND NOT cl.relforcerowsecurity)))))
 -- Approved anchors/receipts are installer-owned, private, never caller writable.
 -- Owner/existence checks cannot depend on aclexplode: explicit empty ACL has no rows.
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_class anchor_owner WHERE anchor_owner.oid='app_private.qa_owned_approved_plans'::pg_catalog.regclass AND anchor_owner.relowner='postgres'::pg_catalog.regrole)
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_class anchor_owner WHERE anchor_owner.oid='app_private.qa_owned_run_receipts'::pg_catalog.regclass AND anchor_owner.relowner='postgres'::pg_catalog.regrole)
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_class anchor_owner WHERE anchor_owner.oid='app_private.qa_owned_native_anchor'::pg_catalog.regclass AND anchor_owner.relowner='postgres'::pg_catalog.regrole)
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_class anchor_owner WHERE anchor_owner.oid='app_private.qa_owned_deletions'::pg_catalog.regclass AND anchor_owner.relowner='postgres'::pg_catalog.regrole)
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_class anchor_owner WHERE anchor_owner.oid='app_private.qa_owned_native_effects'::pg_catalog.regclass AND anchor_owner.relowner='postgres'::pg_catalog.regrole)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class cl CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(cl.relacl,pg_catalog.acldefault('r',cl.relowner))) acl
  WHERE cl.oid=ANY(ARRAY['app_private.qa_owned_approved_plans'::pg_catalog.regclass,'app_private.qa_owned_run_receipts'::pg_catalog.regclass,'app_private.qa_owned_native_anchor'::pg_catalog.regclass,'app_private.qa_owned_deletions'::pg_catalog.regclass,'app_private.qa_owned_native_effects'::pg_catalog.regclass])
  AND (cl.relowner<>'postgres'::pg_catalog.regrole OR acl.grantee<>'postgres'::pg_catalog.regrole OR acl.grantor<>'postgres'::pg_catalog.regrole))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute at CROSS JOIN LATERAL pg_catalog.aclexplode(at.attacl) anchor_column_acl
  WHERE at.attrelid=ANY(ARRAY['app_private.qa_owned_approved_plans'::pg_catalog.regclass,'app_private.qa_owned_run_receipts'::pg_catalog.regclass,'app_private.qa_owned_native_anchor'::pg_catalog.regclass,'app_private.qa_owned_deletions'::pg_catalog.regclass,'app_private.qa_owned_native_effects'::pg_catalog.regclass])
  AND (anchor_column_acl.grantee<>'postgres'::pg_catalog.regrole OR anchor_column_acl.grantor<>'postgres'::pg_catalog.regrole))
 AND self.proowner='postgres'::pg_catalog.regrole AND self.prosecdef AND self.provolatile='s' AND self.proisstrict
 AND self.proparallel='u' AND self.prokind='f' AND NOT self.proleakproof AND self.prosupport=0
 AND self.proconfig=ARRAY['search_path=""']::text[]
 AND self.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
 AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc pp WHERE pp.pronamespace=self.pronamespace AND pp.proname=self.proname)=1
 AND (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(coalesce(self.proacl,pg_catalog.acldefault('f',self.proowner))))=2
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(self.proacl,pg_catalog.acldefault('f',self.proowner))) acl
  WHERE acl.grantee NOT IN ('postgres'::pg_catalog.regrole,'supabase_read_only_user'::pg_catalog.regrole)
  OR acl.grantor<>'postgres'::pg_catalog.regrole OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable)
 -- Uniqueness over all signed resource identity axes, not just requested source.
 AND NOT EXISTS(SELECT 1 FROM (VALUES('sourceId'),('createOperation'),('receiptId'),('canonicalKey'),('loginAlias'),('email')) keys(k)
  WHERE (SELECT pg_catalog.count(DISTINCT s->>k) FROM resources)<>57)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(a.payload->'units') unit(u)
  WHERE NOT EXISTS(SELECT 1 FROM public.organizational_units ou WHERE pg_catalog.to_jsonb(ou)=unit.u))
 AND NOT EXISTS(SELECT 1 FROM terminal d WHERE NOT coalesce(
  d.status='completed' AND d.generation BETWEEN 1 AND 9007199254740991
  AND d.s->>'runId'=p_run::text AND d.s->>'rolePlanDigest'=a.role_plan_digest
  AND d.s->>'canonicalKey'=d.canonical_key AND d.s->>'kind' IN ('owned-load-qa','owned-role-e2e')
  AND d.s->>'createOperation' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND d.s->>'receiptId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS(SELECT 1 FROM public.roles role WHERE role.code=d.s->>'role')
  AND pg_catalog.jsonb_array_length(d.s->'memberships')>0
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(d.s->'memberships') member(m)
   WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(a.payload->'units') unit(u) WHERE unit.u->>'id'=member.m->>'unit_id'))
  AND NOT (a.payload->'protectedUIDs' ? d.target_user_id::text)
  AND NOT (a.payload->'protectedCanonicalKeys' ? d.canonical_key)
  AND d.target_user_id<>'0a1df502-9232-4ef5-af2d-df585ad7f187'::uuid AND d.canonical_key<>'faisal'
  AND d.prepared_at IS NOT NULL AND d.absence_observed_at IS NOT NULL AND d.absence_observed_at>=d.prepared_at
  AND d.current_auth_absence_digest=d.auth_readback_digest
  AND pd.current_protected_digest=d.protected_snapshot_digest
  AND d.completed_receipt=pg_catalog.jsonb_build_object('operation_id',d.operation_id,'run_id',d.run_id,'target_user_id',d.target_user_id,'canonical_key',d.canonical_key,'generation',d.generation,'status','completed','ownership_receipt_digest',d.ownership_receipt_digest,'protected_snapshot_digest',d.protected_snapshot_digest,'prepared_at',d.prepared_at,'auth_readback_digest',d.auth_readback_digest,'db_absent',true,'auth_absent',true)
  AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(d.native_root_receipt))=10
  AND d.native_root_receipt->>'operation_id'=d.operation_id::text AND d.native_root_receipt->>'generation'=d.generation::text
  AND d.native_root_receipt->>'target_user_id'=d.target_user_id::text
  AND d.native_root_receipt->>'source_oid'=('app_private.qa_owned_native_root()'::pg_catalog.regprocedure::oid)::text
  AND d.native_root_receipt->>'gateway_oid'=anchor.gateway_oid::text
  AND d.native_root_receipt->>'backend_pid' ~ '^[1-9][0-9]*$' AND d.native_root_receipt->>'sql_xid' ~ '^[1-9][0-9]*$'
  AND d.native_root_receipt->>'effect'='DELETE' AND d.native_root_receipt->>'closure'='all_exact_native_effects_observed'
  AND d.native_root_receipt->>'projection_digest' ~ '^[0-9a-f]{64}$'
  AND d.ownership_receipt_digest="""+pgsha("pg_catalog.jsonb_build_object('run',p_run,'source',d.source_id,'uid',d.target_user_id,'canonical',d.canonical_key,'create_operation',d.s->>'createOperation','creation_receipt',d.s->>'receiptId','get_digest',d.native_root_receipt->>'projection_digest')")+"""
  AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=d.target_user_id OR u.email=d.s->>'email')
  AND NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=d.target_user_id)
  AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=d.target_user_id)
  AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=d.target_user_id)
  AND NOT EXISTS(SELECT 1 FROM public.user_memberships r WHERE r.user_id=d.target_user_id)
  AND NOT EXISTS(SELECT 1 FROM public.user_permissions r WHERE r.user_id=d.target_user_id)
  AND NOT EXISTS(SELECT 1 FROM app_private.account_credential_state r WHERE r.user_id=d.target_user_id)
  AND NOT EXISTS(SELECT 1 FROM public.account_migration_users r WHERE r.migrated_user_id=d.target_user_id),false))
 -- Every retained effect has a terminal parent and exact native FK/RI/guard binding.
 AND NOT EXISTS(SELECT 1 FROM app_private.qa_owned_native_effects e WHERE NOT coalesce(
  e.effect_state='observed' AND e.effect_slot>0 AND e.depth IN (2,3)
  AND e.observed_pid>0 AND e.observed_xid IS NOT NULL AND e.guard_oid IS NOT NULL
  AND pg_catalog.jsonb_typeof(e.pk)='object' AND e.pk<>'{}'::jsonb AND pg_catalog.jsonb_typeof(e.effect_old)='object'
  AND ((e.effect_op='DELETE' AND e.effect_new IS NULL) OR (e.effect_op='UPDATE' AND pg_catalog.jsonb_typeof(e.effect_new)='object'))
  AND EXISTS(SELECT 1 FROM app_private.qa_owned_deletions parent WHERE parent.operation_id=e.operation_id AND parent.generation=e.generation AND parent.status='completed')
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint fk WHERE fk.oid=e.fk_oid AND fk.contype='f' AND fk.convalidated AND fk.conrelid=e.table_oid AND fk.confrelid=e.parent_table AND fk.confdeltype IN ('c','n'))
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger ri WHERE ri.tgconstraint=e.fk_oid AND ri.tgfoid=e.ri_oid AND ri.tgisinternal AND ri.tgenabled='O')
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger guard WHERE guard.tgrelid=e.table_oid AND guard.tgfoid=e.guard_oid AND guard.tgtype=31 AND guard.tgenabled='O'),false))
 ) SELECT result||pg_catalog.jsonb_build_object('current_final_readback_digest_pg',"""+pgsha('result')+""") FROM proof;
$read$;
ALTER FUNCTION public.qa_completed_cleanup_replay_read(uuid,uuid,uuid,bigint,uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.qa_completed_cleanup_replay_read(uuid,uuid,uuid,bigint,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.qa_completed_cleanup_replay_read(uuid,uuid,uuid,bigint,uuid,text,jsonb) TO supabase_read_only_user;
COMMIT;
"""


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--write',action='store_true')
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    expected=build().encode('utf8')
    if args.write:
        ARTIFACT.write_bytes(expected)
    if args.check and ARTIFACT.read_bytes()!=expected:
        raise SystemExit('completed-read migration differs from exact fixed-source projection')
    print(json.dumps({'source_only':True,'artifact':str(ARTIFACT),'sha256':sha(expected),'bytes':len(expected),'action':'write' if args.write else 'check'}))

if __name__=='__main__':main()
