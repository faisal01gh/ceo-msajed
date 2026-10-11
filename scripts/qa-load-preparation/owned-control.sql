-- UNAPPLIED separately-owned QA control; NOT production activation.
-- Only new private objects/service-only RPCs and one source-pinned explicit
-- forward-consumption branch. Approved migration files/Core/PW/graph decisions,
-- original branch bytes/OID/ACL/defaults and RLS stay unchanged.
BEGIN;
-- Native deferred RI closure, not a new custom deferred writer. The parent
-- relation is necessarily empty (CHECK false); only deleting the exact frame
-- before transaction end permits COMMIT. Internal RI callbacks preserve the
-- accepted graph closed-catalog decision, which rejects new custom callbacks.
CREATE TABLE app_private.qa_owned_frame_empty(id integer PRIMARY KEY CHECK(false));
CREATE TABLE app_private.qa_owned_frames(
 backend_pid integer NOT NULL CHECK(backend_pid>0),sql_xid xid8 NOT NULL,
 source_oid oid NOT NULL,run_id uuid NOT NULL,source_id uuid NOT NULL,
 phase text NOT NULL CHECK(phase IN ('bootstrap','dispose')),
 effect_table oid,effect_op text,effect_old jsonb,effect_new jsonb,
 effect_state text NOT NULL DEFAULT 'admitted' CHECK(effect_state IN ('admitted','armed','consumed')),
 effect_sequence integer NOT NULL DEFAULT 0,
 closure integer NOT NULL DEFAULT 1 CHECK(closure=1),
 PRIMARY KEY(backend_pid,sql_xid),
 CONSTRAINT qa_owned_native_closure FOREIGN KEY(closure)
 REFERENCES app_private.qa_owned_frame_empty(id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE app_private.qa_owned_frame_empty OWNER TO postgres;
ALTER TABLE app_private.qa_owned_frames OWNER TO postgres;
REVOKE ALL ON app_private.qa_owned_frame_empty,app_private.qa_owned_frames FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE app_private.qa_owned_operations (
 run_id uuid NOT NULL REFERENCES app_private.qa_runs(run_id),
 operation_id uuid NOT NULL, scope text NOT NULL, resource_key text NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','dispatched','completed','unknown')),
 actual text NOT NULL CHECK(actual IN ('pending','fulfilled','rejected')),
 history jsonb NOT NULL CHECK(jsonb_typeof(history)='array'),
 PRIMARY KEY(run_id,operation_id), UNIQUE(run_id,scope,resource_key)
);
CREATE TABLE app_private.qa_owned_resources (
 receipt_id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES app_private.qa_runs(run_id),
 create_operation uuid NOT NULL, source_id uuid NOT NULL, owner_uid uuid NOT NULL,
 canonical_key text NOT NULL CHECK(canonical_key<>''),
 kind text NOT NULL CHECK(kind IN ('owned-load-qa','owned-role-e2e')),
 surface text NOT NULL, pk jsonb NOT NULL CHECK(jsonb_typeof(pk)='object' AND pk<>'{}'::jsonb),
 row_digest text NOT NULL CHECK(row_digest ~ '^[0-9a-f]{64}$'),
 auth_get_digest text NOT NULL CHECK(auth_get_digest ~ '^[0-9a-f]{64}$'),
 session_id uuid, disposed_at timestamptz,
 FOREIGN KEY(run_id,create_operation) REFERENCES app_private.qa_owned_operations(run_id,operation_id),
 UNIQUE(run_id,surface,pk)
);
ALTER TABLE app_private.qa_owned_operations OWNER TO postgres;
ALTER TABLE app_private.qa_owned_resources OWNER TO postgres;
REVOKE ALL ON app_private.qa_owned_operations,app_private.qa_owned_resources FROM PUBLIC,anon,authenticated,service_role;
-- Private, externally signed reviewed-plan anchors. Only the trusted installation
-- owner can insert verified signatures. Service callers cannot approve a plan.
CREATE TABLE app_private.qa_owned_approved_plans(
 plan_id uuid PRIMARY KEY,payload jsonb NOT NULL,signature text NOT NULL,
 signing_key_hash text NOT NULL CHECK(signing_key_hash ~ '^[0-9a-f]{64}$'),
 source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),expires_at timestamptz NOT NULL
);
ALTER TABLE app_private.qa_owned_operations ADD COLUMN reserved_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE TABLE app_private.qa_owned_run_receipts(
 run_id uuid PRIMARY KEY,plan_id uuid NOT NULL UNIQUE REFERENCES app_private.qa_owned_approved_plans,
 plan_payload jsonb NOT NULL,completed_at timestamptz
);
CREATE TABLE app_private.qa_owned_sources(
 run_id uuid NOT NULL REFERENCES app_private.qa_runs,source_id uuid NOT NULL UNIQUE,
 source jsonb NOT NULL,create_operation uuid NOT NULL UNIQUE,creation_receipt uuid NOT NULL UNIQUE,
 user_id uuid UNIQUE,session_id uuid UNIQUE,auth_projection jsonb,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','linked','tested','db_disposed','absent')),
 PRIMARY KEY(run_id,source_id)
);
ALTER TABLE app_private.qa_owned_resources ADD COLUMN full_row jsonb NOT NULL,
 ADD COLUMN table_oid oid NOT NULL,ADD COLUMN effect_sequence integer NOT NULL;
CREATE FUNCTION app_private.qa_owned_service() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR auth.jwt()->>'role' IS DISTINCT FROM 'service_role'
 OR coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb ?| ARRAY['x-qa-actor-user','x-qa-actor-sid']
 OR current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'owned source service denied' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION app_private.qa_owned_catalog_closed() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE t oid;contract record;seq oid;
BEGIN
 -- Exact reviewed local relation inventory, NOT a schema/prefix admission.
 -- Real vendor Auth/storage catalogs require separate complete attestation; an
 -- empty unfamiliar table is not evidence of supported provider cleanup.
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND c.relkind IN ('r','p','f','v','m') AND
  (format('%I.%I',n.nspname,c.relname)<>ALL(ARRAY['app_private.account_credential_state','app_private.qa_core_provision_context','public.legacy_archive','public.migration_gate','public.migration_receipts','public.workspace_edits','public.workspace_versions','app_private.account_password_operations','app_private.qa_account_manifest','app_private.qa_password_frames','app_private.qa_run_members','app_private.qa_runs','app_private.qa_sql_operation_context','app_private.qa_transaction_manifest','app_private.transaction_read_state','auth.sessions','auth.users','auth.refresh_tokens','public.account_migration_aliases','public.account_migration_users','public.account_permission_overrides','public.audit_log','public.auth_login_attempts','public.legacy_auth_directory','public.legacy_login_credentials','public.notifications','public.organizational_units','public.permissions','public.profiles','public.role_permissions','public.roles','public.transaction_action_notes','public.transaction_action_versions','public.transaction_actions','public.transaction_assignment_targets','public.transaction_assignment_users','public.transaction_assignments','public.transaction_history','public.transaction_links','public.transaction_participants','public.transaction_periods','public.transaction_requests','public.transaction_routes','public.transaction_sequences','public.transactions','public.user_memberships','public.user_permissions','public.user_roles','app_private.qa_owned_approved_plans','app_private.qa_owned_run_receipts','app_private.qa_owned_sources','app_private.qa_owned_operations','app_private.qa_owned_resources','app_private.qa_owned_frames','app_private.qa_owned_frame_empty','app_private.qa_owned_deletions','app_private.qa_owned_deletion_fences','app_private.qa_owned_native_anchor','app_private.qa_owned_native_frames','app_private.qa_owned_native_effects']) OR c.relkind<>'r' OR c.relispartition
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=c.oid)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND tgenabled<>'O')))
 OR EXISTS(SELECT 1 FROM pg_foreign_server)
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND (NOT convalidated OR cardinality(conkey)<>cardinality(confkey)))
 THEN RAISE EXCEPTION 'owned global catalog/foreign/non-FK scope unattested' USING ERRCODE='55000';END IF;

 -- Closed canonical Core/workspace/import contracts, native PG17-verified from
 -- accepted200:776-782 and the frozen predecessor definitions in the approved
 -- enforcement fixture. No observer, prefix, schema, or generic JSON admission.
 FOR contract IN SELECT * FROM (VALUES
 ('app_private.qa_core_provision_context', '[{"n":1,"acl":null,"name":"backend_pid","type":"23","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":2,"acl":null,"name":"sql_xid","type":"5069","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":3,"acl":null,"name":"source_function","type":"26","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":4,"acl":null,"name":"canonical_key","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":5,"acl":null,"name":"target_user","type":"2950","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":6,"acl":null,"name":"login_name","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":7,"acl":null,"name":"display_name","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":8,"acl":null,"name":"role_code","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":9,"acl":null,"name":"expected_memberships","type":"3802","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""}]'::jsonb, '[{"def":"PRIMARY KEY (backend_pid, sql_xid, source_function, canonical_key, target_user)","key":[1,2,3,4,5],"type":"p"}]'::jsonb, false),
 ('public.legacy_archive', '[{"n":1,"acl":null,"name":"source_table","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":2,"acl":null,"name":"source_key","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":3,"acl":null,"name":"payload","type":"3802","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":4,"acl":null,"name":"row_hash","type":"25","typmod":-1,"default":null,"notnull":false,"identity":"","collation":"100","generated":""},{"n":5,"acl":null,"name":"imported_at","type":"1184","typmod":-1,"default":"now()","notnull":true,"identity":"","collation":"0","generated":""}]'::jsonb, '[{"def":"PRIMARY KEY (source_table, source_key)","key":[1,2],"type":"p"}]'::jsonb, true),
 ('public.migration_gate', '[{"n":1,"acl":null,"name":"id","type":"23","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":2,"acl":null,"name":"token_hash","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":3,"acl":null,"name":"expires_at","type":"1184","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":4,"acl":null,"name":"enabled","type":"16","typmod":-1,"default":"false","notnull":true,"identity":"","collation":"0","generated":""}]'::jsonb, '[{"def":"PRIMARY KEY (id)","key":[1],"type":"p"}]'::jsonb, true),
 ('public.migration_receipts', '[{"n":1,"acl":null,"name":"id","type":"20","typmod":-1,"default":null,"notnull":true,"identity":"a","collation":"0","generated":""},{"n":2,"acl":null,"name":"source_table","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":3,"acl":null,"name":"batch_count","type":"23","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":4,"acl":null,"name":"received_at","type":"1184","typmod":-1,"default":"now()","notnull":true,"identity":"","collation":"0","generated":""}]'::jsonb, '[]'::jsonb, true),
 ('public.workspace_edits', '[{"n":1,"acl":null,"name":"scope","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":2,"acl":null,"name":"revision","type":"20","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":3,"acl":null,"name":"request_id","type":"2950","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":4,"acl":null,"name":"actor","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":5,"acl":null,"name":"operations","type":"3802","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"0","generated":""},{"n":6,"acl":null,"name":"created_at","type":"1184","typmod":-1,"default":"now()","notnull":true,"identity":"","collation":"0","generated":""}]'::jsonb, '[{"def":"UNIQUE (scope, request_id)","key":[1,3],"type":"u"}]'::jsonb, true),
 ('public.workspace_versions', '[{"n":1,"acl":null,"name":"scope","type":"25","typmod":-1,"default":null,"notnull":true,"identity":"","collation":"100","generated":""},{"n":2,"acl":null,"name":"revision","type":"20","typmod":-1,"default":"0","notnull":true,"identity":"","collation":"0","generated":""}]'::jsonb, '[{"def":"PRIMARY KEY (scope)","key":[1],"type":"p"}]'::jsonb, true)
 ) v(name,columns,constraints,service_crud) LOOP
  t:=to_regclass(contract.name);
  IF t IS NULL THEN CONTINUE;END IF; -- old bounded predecessor compatibility
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t AND c.relowner='postgres'::regrole AND c.relkind='r' AND c.relpersistence='p' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity AND c.relreplident='d' AND c.reloptions IS NULL AND c.reloftype=0 AND c.relchecks=0)
  OR (SELECT jsonb_agg(jsonb_build_object('n',a.attnum,'name',a.attname,'type',a.atttypid,'typmod',a.atttypmod,'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text,'collation',a.attcollation) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t AND a.attnum>0) IS DISTINCT FROM contract.columns
  OR (SELECT coalesce(jsonb_agg(jsonb_build_object('type',contype,'key',conkey,'def',pg_get_constraintdef(oid)) ORDER BY contype,conkey),'[]') FROM pg_constraint WHERE conrelid=t) IS DISTINCT FROM contract.constraints
  OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t AND (NOT convalidated OR condeferrable OR condeferred))
  OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=t AND (NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indisunique OR NOT indimmediate OR indpred IS NOT NULL OR indexprs IS NOT NULL OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t AND conindid=indexrelid)))
  OR (SELECT count(*) FROM pg_index WHERE indrelid=t)<>jsonb_array_length(contract.constraints)
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=t AND (a.grantor<>'postgres'::regrole OR (a.grantee<>'postgres'::regrole AND (NOT contract.service_crud OR a.grantee<>'service_role'::regrole OR a.privilege_type<>ALL(ARRAY['SELECT','INSERT','UPDATE','DELETE']) OR a.is_grantable))))
  OR has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR (NOT contract.service_crud AND has_table_privilege('service_role',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  OR (contract.service_crud AND (NOT has_table_privilege('service_role',t,'SELECT') OR NOT has_table_privilege('service_role',t,'INSERT') OR NOT has_table_privilege('service_role',t,'UPDATE') OR NOT has_table_privilege('service_role',t,'DELETE')))
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t AND (tgisinternal OR NOT (
   (contract.service_crud AND tgfoid=to_regprocedure('app_private.qa_enforcement_shared_write_guard()') AND tgtype=30 AND NOT tgdeferrable AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector)
   OR (tgfoid=to_regprocedure('app_private.qa_owned_fence_before_row()') AND tgtype=31 AND NOT tgdeferrable AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector))))
  OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=t AND tgfoid=to_regprocedure('app_private.qa_enforcement_shared_write_guard()'))<>(CASE WHEN contract.service_crud THEN 1 ELSE 0 END)
  OR (to_regprocedure('app_private.qa_owned_fence_before_row()') IS NOT NULL AND (SELECT count(*) FROM pg_trigger WHERE tgrelid=t AND tgfoid=to_regprocedure('app_private.qa_owned_fence_before_row()'))<>1)
  THEN RAISE EXCEPTION 'owned canonical predecessor contract drift on %',contract.name USING ERRCODE='55000';END IF;
 END LOOP;
 IF to_regclass('public.migration_receipts') IS NOT NULL THEN
  seq:=to_regclass('public.migration_receipts_id_seq');
  IF seq IS NULL OR NOT EXISTS(SELECT 1 FROM pg_sequence WHERE seqrelid=seq AND seqtypid='bigint'::regtype AND seqstart=1 AND seqincrement=1 AND seqmin=1 AND seqmax=9223372036854775807 AND seqcache=1 AND NOT seqcycle)
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=seq AND relkind='S' AND relowner='postgres'::regrole AND relpersistence='p')
  OR (SELECT count(*) FROM pg_depend WHERE classid='pg_class'::regclass AND objid=seq AND refclassid='pg_class'::regclass AND refobjid='public.migration_receipts'::regclass AND refobjsubid=1 AND deptype='i')<>1
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a WHERE c.oid=seq AND (a.grantor<>'postgres'::regrole OR (a.grantee<>'postgres'::regrole AND (a.grantee<>'service_role'::regrole OR a.privilege_type<>ALL(ARRAY['USAGE']) OR a.is_grantable))))
  OR NOT has_sequence_privilege('service_role',seq,'USAGE')
  THEN RAISE EXCEPTION 'owned canonical receipt identity drift' USING ERRCODE='55000';END IF;
 END IF;
 FOREACH t IN ARRAY ARRAY['public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=t AND relkind='r' AND NOT relispartition)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=t OR inhparent=t) OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=t)
  OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=t AND NOT tgisinternal)<>1
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t AND NOT tgisinternal AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure AND tgtype=31 AND tgenabled='O' AND NOT tgdeferrable AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t AND tgenabled<>'O')
  THEN RAISE EXCEPTION 'owned exact row-producer catalog unsupported' USING ERRCODE='55000';END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['app_private.qa_owned_approved_plans'::regclass,'app_private.qa_owned_run_receipts'::regclass,'app_private.qa_owned_sources'::regclass,'app_private.qa_owned_operations'::regclass,'app_private.qa_owned_resources'::regclass,'app_private.qa_owned_frames'::regclass,'app_private.qa_owned_frame_empty'::regclass] LOOP
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid=t AND (relowner<>'postgres'::regrole OR relkind<>'r' OR relispartition))
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=t)
  OR has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_table_privilege('service_role',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN RAISE EXCEPTION 'owned private ACL/catalog drift' USING ERRCODE='55000';END IF;
 END LOOP;
END $$;
CREATE FUNCTION app_private.qa_owned_protected_snapshot() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN (WITH owned AS (
 -- Persisted creation/GET receipts keep the exclusion stable after Auth vanishes.
 SELECT s.user_id AS id FROM app_private.qa_owned_sources s
 JOIN app_private.qa_owned_operations o ON o.run_id=s.run_id AND o.operation_id=s.create_operation
 WHERE s.user_id IS NOT NULL AND s.auth_projection->>'id'=s.user_id::text
 AND s.auth_projection->'metadata'->>'receipt_id'=s.creation_receipt::text
 AND s.auth_projection->'metadata'->>'operation_id'=s.create_operation::text
 AND s.auth_projection->'metadata'->>'run_id'=s.run_id::text
 AND o.scope='create' AND o.state='completed' AND o.actual='fulfilled'
 UNION SELECT u.id FROM auth.users u JOIN app_private.qa_owned_sources s ON u.email=s.source->>'email'
 JOIN app_private.qa_owned_operations o ON o.run_id=s.run_id AND o.operation_id=s.create_operation
 WHERE u.created_at>=o.reserved_at AND u.raw_user_meta_data->>'run_id'=s.run_id::text
 AND u.raw_user_meta_data->>'source_id'=s.source_id::text AND u.raw_user_meta_data->>'operation_id'=s.create_operation::text
 AND u.raw_user_meta_data->>'receipt_id'=s.creation_receipt::text AND o.scope='create' AND o.state IN ('dispatched','completed','unknown'))
 SELECT jsonb_build_object(
 'auth',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'created_at',created_at,'confirmed_at',email_confirmed_at,'banned_until',banned_until,'deleted_at',deleted_at) ORDER BY id),'[]'::jsonb) FROM auth.users WHERE id NOT IN (SELECT id FROM owned)),
 'registry',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY canonical_key),'[]'::jsonb) FROM public.account_migration_users a WHERE (migrated_user_id IS NULL OR migrated_user_id NOT IN (SELECT id FROM owned)) AND NOT EXISTS(SELECT 1 FROM app_private.qa_owned_resources r JOIN app_private.qa_owned_native_effects e ON e.receipt_id=r.receipt_id AND e.effect_old=r.full_row AND e.effect_state='observed' AND e.effect_new=to_jsonb(a) JOIN app_private.qa_owned_deletions d ON d.operation_id=e.operation_id AND d.generation=e.generation AND d.source_id=r.source_id WHERE r.table_oid='public.account_migration_users'::regclass AND to_jsonb(a) @> r.pk)),
 'profiles',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb) FROM public.profiles p WHERE id NOT IN (SELECT id FROM owned)),
 'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY user_id,role_code),'[]'::jsonb) FROM public.user_roles r WHERE user_id NOT IN (SELECT id FROM owned)),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY user_id,unit_id,membership_role),'[]'::jsonb) FROM public.user_memberships m WHERE user_id NOT IN (SELECT id FROM owned))));
END $$;
CREATE FUNCTION app_private.qa_owned_units(p jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_array_length(p->'units')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'units') j WHERE NOT EXISTS(SELECT 1 FROM public.organizational_units u WHERE to_jsonb(u)=j))
$$;
CREATE FUNCTION public.qa_owned_preflight_internal(p_plan uuid,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p app_private.qa_owned_approved_plans%rowtype;j jsonb;m jsonb;
BEGIN
 PERFORM app_private.qa_owned_service();PERFORM app_private.qa_owned_catalog_closed();SELECT * INTO STRICT p FROM app_private.qa_owned_approved_plans WHERE plan_id=p_plan FOR SHARE;
 IF jsonb_typeof(p.payload->'resources') IS DISTINCT FROM 'array' OR jsonb_typeof(p.payload->'units') IS DISTINCT FROM 'array' OR jsonb_typeof(p.payload->'protectedUIDs') IS DISTINCT FROM 'array' OR jsonb_typeof(p.payload->'protectedCanonicalKeys') IS DISTINCT FROM 'array' OR p.payload->>'runId' IS DISTINCT FROM p_run::text OR p.expires_at<=clock_timestamp() OR p.signature=''
 OR p.payload->>'controlIdentityDigest' IS DISTINCT FROM encode(sha256(convert_to(app_private.qa_owned_identity_snapshot()::text,'UTF8')),'hex')
 OR (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) FROM jsonb_array_elements_text(p.payload->'protectedUIDs')) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x->>'id' ORDER BY x->>'id'),'[]'::jsonb) FROM jsonb_array_elements(app_private.qa_owned_protected_snapshot()->'auth') x)
 OR (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) FROM jsonb_array_elements_text(p.payload->'protectedCanonicalKeys')) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x->>'canonical_key' ORDER BY x->>'canonical_key'),'[]'::jsonb) FROM jsonb_array_elements(app_private.qa_owned_protected_snapshot()->'registry') x)
 OR (SELECT count(DISTINCT x->>'sourceId') FROM jsonb_array_elements(p.payload->'resources') x)<>57 OR (SELECT count(DISTINCT x->>'canonicalKey') FROM jsonb_array_elements(p.payload->'resources') x)<>57 OR (SELECT count(DISTINCT x->>'loginAlias') FROM jsonb_array_elements(p.payload->'resources') x)<>57 OR (SELECT count(DISTINCT x->>'email') FROM jsonb_array_elements(p.payload->'resources') x)<>57
 OR NOT app_private.qa_owned_units(p.payload) OR jsonb_array_length(p.payload->'resources')<>57
 OR (SELECT count(*) FROM jsonb_array_elements(p.payload->'resources') x WHERE x->>'kind'='owned-load-qa')<>50
 OR (SELECT count(*) FROM jsonb_array_elements(p.payload->'resources') x WHERE x->>'kind'='owned-role-e2e')<>7
 OR (SELECT count(DISTINCT x->>'role') FROM jsonb_array_elements(p.payload->'resources') x WHERE x->>'kind'='owned-role-e2e')<>7
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_run_receipts WHERE run_id=p_run OR plan_id=p_plan)
 THEN RAISE EXCEPTION 'owned plan preflight/no retry denied' USING ERRCODE='42501';END IF;
 FOR j IN SELECT value FROM jsonb_array_elements(p.payload->'resources') LOOP
  IF j->>'runId' IS DISTINCT FROM p_run::text OR EXISTS(SELECT 1 FROM public.account_migration_users a WHERE a.canonical_key=j->>'canonicalKey' OR a.login_username=j->>'loginAlias' OR a.preferred_login=j->>'loginAlias' OR a.internal_email=j->>'email')
  OR EXISTS(SELECT 1 FROM app_private.qa_account_manifest q WHERE q.canonical_key=j->>'canonicalKey' OR q.login_alias=j->>'loginAlias')
  OR EXISTS(SELECT 1 FROM auth.users WHERE email=j->>'email') OR NOT EXISTS(SELECT 1 FROM public.roles WHERE code=j->>'role')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.payload->'protectedCanonicalKeys') k WHERE k=j->>'canonicalKey' OR k=j->>'loginAlias')
  OR jsonb_array_length(j->'memberships')=0 THEN RAISE EXCEPTION 'owned source collision/protected/role' USING ERRCODE='42501';END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(j->'memberships') LOOP
   IF m->>'membership_role' NOT IN ('member','manager','assistant','office') OR m-ARRAY['unit_id','membership_role','is_primary']<>'{}'::jsonb OR jsonb_typeof(m->'is_primary')<>'boolean'
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.payload->'units') u WHERE u->>'id'=m->>'unit_id')
   THEN RAISE EXCEPTION 'owned current unit binding' USING ERRCODE='42501';END IF;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'external_auth_delete_window_attested',app_private.qa_owned_fence_catalog_attested(),'plan',p.payload,'creator_oid','public.qa_owned_bootstrap_internal(uuid,uuid,uuid)'::regprocedure::oid,'creator_definition',pg_get_functiondef('public.qa_owned_bootstrap_internal(uuid,uuid,uuid)'::regprocedure),'disposal_definition',pg_get_functiondef('public.qa_owned_dispose_internal(uuid,uuid)'::regprocedure),'dispatch_definition',pg_get_functiondef('app_private.qa_reference_guard_before_row()'::regprocedure));
END $$;
CREATE FUNCTION public.qa_owned_prepare_internal(p_plan uuid,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb;j jsonb;
BEGIN
 PERFORM public.qa_owned_preflight_internal(p_plan,p_run);
 SELECT payload INTO p FROM app_private.qa_owned_approved_plans WHERE plan_id=p_plan FOR UPDATE;
 INSERT INTO app_private.qa_owned_run_receipts VALUES(p_run,p_plan,p,NULL);
 INSERT INTO app_private.qa_runs(run_id,phase,active,expires_at) SELECT p_run,'active',true,expires_at FROM app_private.qa_owned_approved_plans WHERE plan_id=p_plan;
 FOR j IN SELECT value FROM jsonb_array_elements(p->'resources') LOOP
 INSERT INTO app_private.qa_owned_sources(run_id,source_id,source,create_operation,creation_receipt) VALUES(p_run,(j->>'sourceId')::uuid,j,(j->>'createOperation')::uuid,(j->>'receiptId')::uuid);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'run_id',p_run,'reserved',57);
END $$;
CREATE FUNCTION public.qa_owned_operation_internal(p_run uuid,p_operation uuid,p_scope text,p_key text,p_state text,p_actual text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;o app_private.qa_owned_operations%rowtype;
BEGIN
 PERFORM app_private.qa_owned_service();SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id::text=p_key FOR UPDATE;
 IF p_scope NOT IN ('create','link','login','test','logout','dispose','auth-delete','finish') OR (p_scope='create' AND p_operation<>s.create_operation) THEN RAISE EXCEPTION 'owned operation binding' USING ERRCODE='42501';END IF;
 IF p_state='reserved' AND p_actual='pending' THEN
 INSERT INTO app_private.qa_owned_operations VALUES(p_run,p_operation,p_scope,p_key,p_state,p_actual,jsonb_build_array(jsonb_build_object('state',p_state,'actual',p_actual)));
 ELSE
 SELECT * INTO STRICT o FROM app_private.qa_owned_operations WHERE run_id=p_run AND operation_id=p_operation FOR UPDATE;
 IF o.scope<>p_scope OR o.resource_key<>p_key OR p_state NOT IN ('dispatched','completed','unknown') OR p_actual NOT IN ('pending','fulfilled','rejected') OR (o.state='reserved' AND p_state<>'dispatched') THEN RAISE EXCEPTION 'owned operation transition' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_owned_operations SET state=CASE WHEN state='unknown' OR p_state='unknown' THEN 'unknown' ELSE p_state END,actual=CASE WHEN actual<>'pending' THEN actual ELSE p_actual END,history=history||jsonb_build_array(jsonb_build_object('state',p_state,'actual',p_actual)) WHERE run_id=p_run AND operation_id=p_operation;
 END IF;
 RETURN jsonb_build_object('ok',true,'operation_id',p_operation);
END $$;
CREATE FUNCTION app_private.qa_owned_revalidate() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_owned_frames%rowtype;s app_private.qa_owned_sources%rowtype;r app_private.qa_owned_run_receipts%rowtype;p app_private.qa_owned_approved_plans%rowtype;u jsonb;
BEGIN
 PERFORM app_private.qa_owned_service();PERFORM app_private.qa_owned_catalog_closed();SELECT * INTO STRICT f FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id();
 IF f.source_oid IS DISTINCT FROM (CASE f.phase WHEN 'bootstrap' THEN 'public.qa_owned_bootstrap_internal(uuid,uuid,uuid)'::regprocedure::oid ELSE 'public.qa_owned_dispose_internal(uuid,uuid)'::regprocedure::oid END) THEN RAISE EXCEPTION 'owned actual source OID' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=f.run_id AND source_id=f.source_id FOR UPDATE;
 SELECT * INTO STRICT r FROM app_private.qa_owned_run_receipts WHERE run_id=f.run_id FOR SHARE;
 SELECT * INTO STRICT p FROM app_private.qa_owned_approved_plans WHERE plan_id=r.plan_id FOR SHARE;
 IF r.plan_payload IS DISTINCT FROM p.payload OR p.payload->>'controlIdentityDigest' IS DISTINCT FROM encode(sha256(convert_to(app_private.qa_owned_identity_snapshot()::text,'UTF8')),'hex') OR NOT app_private.qa_owned_units(p.payload) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.payload->'resources') j WHERE j=s.source)
 OR s.user_id IS NULL OR s.user_id='0a1df502-9232-4ef5-af2d-df585ad7f187'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.payload->'protectedUIDs') j WHERE j::uuid=s.user_id)
 THEN RAISE EXCEPTION 'owned immutable receipt/protected binding' USING ERRCODE='42501';END IF;
 IF f.phase='dispose' THEN
  PERFORM app_private.qa_owned_finalize_proof(f.run_id,f.source_id);
  -- Exact proof binds current fence/op/generation/native absence; no generic frame bypass.
  u:=s.auth_projection;
 ELSE
  SELECT jsonb_build_object('id',id,'email',email,'metadata',raw_user_meta_data,'app_metadata',raw_app_meta_data,'created_at',created_at,'confirmed_at',email_confirmed_at,'banned_until',banned_until,'deleted_at',deleted_at) INTO u FROM auth.users WHERE id=s.user_id FOR SHARE;
 END IF;
 IF u IS NULL OR u IS DISTINCT FROM s.auth_projection OR u->>'email' IS DISTINCT FROM s.source->>'email'
 OR u->>'confirmed_at' IS NULL OR u->>'deleted_at' IS NOT NULL OR ((u->>'banned_until')::timestamptz>clock_timestamp())
 OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_operations o WHERE o.run_id=s.run_id AND o.operation_id=s.create_operation AND (u->>'created_at')::timestamptz>=o.reserved_at AND o.state='completed' AND o.actual='fulfilled')
 OR u->'metadata'->>'run_id' IS DISTINCT FROM s.run_id::text OR u->'metadata'->>'source_id' IS DISTINCT FROM s.source_id::text
 OR u->'metadata'->>'operation_id' IS DISTINCT FROM s.create_operation::text OR u->'metadata'->>'receipt_id' IS DISTINCT FROM s.creation_receipt::text
 OR (f.phase='bootstrap' AND (s.state<>'reserved' OR p.expires_at<=clock_timestamp()))
 OR (f.phase='dispose' AND (s.state<>'tested' OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=s.user_id)))
 THEN RAISE EXCEPTION 'owned persisted Auth/private phase proof' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION app_private.qa_owned_consume(p_table oid,p_op text,p_old jsonb,p_new jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_owned_frames%rowtype;n integer;
BEGIN
 SELECT * INTO f FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF f.effect_state<>'armed' OR f.effect_table IS DISTINCT FROM p_table OR f.effect_op IS DISTINCT FROM p_op OR f.effect_old IS DISTINCT FROM p_old OR f.effect_new IS DISTINCT FROM p_new THEN RAISE EXCEPTION 'owned exact native effect mismatch' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_owned_revalidate();UPDATE app_private.qa_owned_frames SET effect_state='consumed' WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid AND effect_state='armed' AND effect_sequence=f.effect_sequence;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'owned reentrant/reused effect' USING ERRCODE='42501';END IF;RETURN true;
END $$;
CREATE FUNCTION app_private.qa_owned_effect(p_table oid,p_row jsonb,p_delete boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_owned_frames%rowtype;s app_private.qa_owned_sources%rowtype;cols text;pred text;pk jsonb;ret jsonb;live jsonb;n integer;guarded boolean;
BEGIN
 PERFORM app_private.qa_owned_revalidate();SELECT * INTO STRICT f FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id();SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=f.run_id AND source_id=f.source_id;
 IF (f.phase='dispose') IS DISTINCT FROM p_delete OR f.effect_state='armed' OR p_table<>ALL(ARRAY['public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass,'app_private.account_credential_state'::regclass,'app_private.qa_account_manifest'::regclass,'app_private.qa_run_members'::regclass]) THEN RAISE EXCEPTION 'owned closed effect surface/phase' USING ERRCODE='42501';END IF;
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND NOT attisdropped;
 SELECT jsonb_object_agg(a.attname,p_row->a.attname),string_agg(format('to_jsonb(t)->%L=$1->%L',a.attname,a.attname),' AND ' ORDER BY k.ord) INTO pk,pred FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.contype='p' AND c.conrelid=p_table;
 IF pk IS NULL OR EXISTS(SELECT 1 FROM jsonb_each(pk) j WHERE j.value='null') THEN RAISE EXCEPTION 'owned full PK required' USING ERRCODE='42501';END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE %s FOR UPDATE',p_table::regclass,pred) INTO live USING p_row;
 IF (p_delete AND live IS DISTINCT FROM p_row) OR (NOT p_delete AND live IS NOT NULL) THEN RAISE EXCEPTION 'owned native row drift/collision' USING ERRCODE='42501';END IF;
 guarded:=p_table=ANY(ARRAY['public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass]);
 UPDATE app_private.qa_owned_frames SET effect_state='armed',effect_table=p_table,effect_op=CASE WHEN p_delete THEN 'DELETE' ELSE 'INSERT' END,effect_old=CASE WHEN p_delete THEN p_row END,effect_new=CASE WHEN NOT p_delete THEN p_row END,effect_sequence=effect_sequence+1 WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid;
 IF p_delete THEN EXECUTE format('DELETE FROM %s t WHERE %s AND to_jsonb(t)=$1 RETURNING to_jsonb(t)',p_table::regclass,pred) INTO ret USING p_row;
 ELSE EXECUTE format('INSERT INTO %s(%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) RETURNING to_jsonb(%s.*)',p_table::regclass,cols,cols,p_table::regclass,p_table::regclass) INTO ret USING p_row;END IF;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 OR ret IS DISTINCT FROM p_row OR (guarded AND NOT EXISTS(SELECT 1 FROM app_private.qa_owned_frames WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid AND effect_state='consumed')) THEN RAISE EXCEPTION 'owned suppressed/mismatched/unconsumed effect' USING ERRCODE='42501';END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE %s',p_table::regclass,pred) INTO live USING p_row;
 IF (p_delete AND live IS NOT NULL) OR (NOT p_delete AND live IS DISTINCT FROM p_row) THEN RAISE EXCEPTION 'owned persisted effect mismatch' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_owned_frames SET effect_state='consumed' WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid;
 IF NOT p_delete THEN INSERT INTO app_private.qa_owned_resources(receipt_id,run_id,create_operation,source_id,owner_uid,canonical_key,kind,surface,pk,row_digest,auth_get_digest,full_row,table_oid,effect_sequence)
 VALUES(gen_random_uuid(),s.run_id,s.create_operation,s.source_id,s.user_id,s.source->>'canonicalKey',s.source->>'kind',p_table::regclass::text,pk,encode(sha256(convert_to(ret::text,'UTF8')),'hex'),encode(sha256(convert_to(s.auth_projection::text,'UTF8')),'hex'),ret,p_table,f.effect_sequence+1);END IF;RETURN ret;
END $$;
CREATE FUNCTION public.qa_owned_create_preflight_internal(p_run uuid,p_source uuid,p_operation uuid,p_receipt uuid,p_email text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;p app_private.qa_owned_approved_plans%rowtype;
BEGIN
 PERFORM app_private.qa_owned_service();PERFORM app_private.qa_owned_catalog_closed();
 -- Admission is actual installed catalog coverage, never caller approval.
 PERFORM app_private.qa_owned_fence_catalog_closed();PERFORM app_private.qa_owned_native_gateway();
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source FOR UPDATE;
 SELECT a.* INTO STRICT p FROM app_private.qa_owned_approved_plans a JOIN app_private.qa_owned_run_receipts r ON r.plan_id=a.plan_id WHERE r.run_id=p_run FOR SHARE OF a;
 IF s.state<>'reserved' OR s.user_id IS NOT NULL OR s.create_operation<>p_operation OR s.creation_receipt<>p_receipt OR s.source->>'email' IS DISTINCT FROM p_email
 OR p.expires_at<=clock_timestamp() OR NOT app_private.qa_owned_units(p.payload)
 OR p.payload->>'controlIdentityDigest' IS DISTINCT FROM encode(sha256(convert_to(app_private.qa_owned_identity_snapshot()::text,'UTF8')),'hex')
 OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_operations WHERE run_id=p_run AND operation_id=p_operation AND scope='create' AND resource_key=p_source::text AND state='dispatched' AND actual='pending')
 OR EXISTS(SELECT 1 FROM auth.users WHERE email=p_email)
 OR EXISTS(SELECT 1 FROM public.account_migration_users WHERE canonical_key=s.source->>'canonicalKey' OR login_username=s.source->>'loginAlias' OR preferred_login=s.source->>'loginAlias')
 THEN RAISE EXCEPTION 'owned before-CREATE admission denied' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('ok',true,'run_id',p_run,'source_id',p_source);
END $$;
CREATE FUNCTION public.qa_owned_bootstrap_internal(p_run uuid,p_source uuid,p_uid uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;j jsonb;m jsonb;u jsonb;
BEGIN
 PERFORM app_private.qa_owned_service();SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source FOR UPDATE;j:=s.source;
 IF s.state<>'reserved' OR s.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.profiles WHERE id=p_uid)
 OR EXISTS(SELECT 1 FROM public.account_migration_users WHERE migrated_user_id=p_uid OR canonical_key=j->>'canonicalKey' OR login_username=j->>'loginAlias')
 OR EXISTS(SELECT 1 FROM app_private.qa_account_manifest WHERE user_id=p_uid)
 OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_operations WHERE run_id=p_run AND operation_id=s.create_operation AND state='completed' AND actual='fulfilled') THEN RAISE EXCEPTION 'owned bootstrap no retry/identity receipt' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',id,'email',email,'metadata',raw_user_meta_data,'app_metadata',raw_app_meta_data,'created_at',created_at,'confirmed_at',email_confirmed_at,'banned_until',banned_until,'deleted_at',deleted_at) INTO u FROM auth.users WHERE id=p_uid FOR SHARE;
 UPDATE app_private.qa_owned_sources SET user_id=p_uid,auth_projection=u WHERE run_id=p_run AND source_id=p_source;
 INSERT INTO app_private.qa_owned_frames(backend_pid,sql_xid,source_oid,run_id,source_id,phase) VALUES(pg_backend_pid(),pg_current_xact_id(),'public.qa_owned_bootstrap_internal(uuid,uuid,uuid)'::regprocedure,p_run,p_source,'bootstrap');
 PERFORM app_private.qa_owned_revalidate();
 PERFORM app_private.qa_owned_effect('public.profiles'::regclass,jsonb_build_object('id',p_uid,'login_name',j->>'loginAlias','full_name',j->>'displayName','job_title',NULL,'active',true,'legacy_source',NULL,'legacy_username',NULL,'created_at',now(),'updated_at',now(),'must_change_password',false,'contact_email',NULL));
 PERFORM app_private.qa_owned_effect('public.user_roles'::regclass,jsonb_build_object('user_id',p_uid,'role_code',j->>'role','is_primary',true,'created_at',now()));
 FOR m IN SELECT value FROM jsonb_array_elements(j->'memberships') LOOP PERFORM app_private.qa_owned_effect('public.user_memberships'::regclass,jsonb_build_object('user_id',p_uid,'unit_id',(m->>'unit_id')::uuid,'membership_role',m->>'membership_role','is_primary',(m->>'is_primary')::boolean,'active',true,'created_at',now()));END LOOP;
 PERFORM app_private.qa_owned_effect('public.account_migration_users'::regclass,jsonb_build_object('canonical_key',j->>'canonicalKey','preferred_login',j->>'loginAlias','login_username',j->>'loginAlias','display_name',j->>'displayName','role_code',j->>'role','job_title',NULL,'org_name',NULL,'dept_names','[]'::jsonb,'internal_email',j->>'email','eligible',true,'migrated_user_id',p_uid,'must_change_password',false,'migrated_at',now(),'password_changed_at',NULL,'created_at',now()));
 PERFORM app_private.qa_owned_effect('app_private.account_credential_state'::regclass,jsonb_build_object('user_id',p_uid,'generation',0,'session_valid_after',clock_timestamp()));
 PERFORM app_private.qa_owned_effect('app_private.qa_account_manifest'::regclass,jsonb_build_object('user_id',p_uid,'canonical_key',j->>'canonicalKey','login_alias',j->>'loginAlias','principal_class','current_owned_QA','run_id',p_run,'owned_creation_operation',s.create_operation,'owned_creation_receipt_id',s.creation_receipt,'tombstoned_at',NULL));
 PERFORM app_private.qa_owned_effect('app_private.qa_run_members'::regclass,jsonb_build_object('run_id',p_run,'user_id',p_uid,'role_code',j->>'role','active',true));
 DELETE FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND effect_state='consumed';
 IF EXISTS(SELECT 1 FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'owned unclosed bootstrap' USING ERRCODE='55000';END IF;
 UPDATE app_private.qa_owned_sources SET state='linked' WHERE run_id=p_run AND source_id=p_source;
 RETURN jsonb_build_object('ok',true,'status','linked','target_user_id',p_uid,'canonical_key',j->>'canonicalKey','source_id',p_source,'receipt_id',s.creation_receipt);
END $$;
CREATE FUNCTION app_private.qa_owned_verify_rows(p_run uuid,p_source uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE r app_private.qa_owned_resources%rowtype;row jsonb;s app_private.qa_owned_sources%rowtype;
BEGIN
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source;
 FOR r IN SELECT * FROM app_private.qa_owned_resources WHERE run_id=p_run AND source_id=p_source LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE to_jsonb(t) @> $1',r.table_oid::regclass) INTO row USING r.pk;
  IF row IS DISTINCT FROM r.full_row THEN RAISE EXCEPTION 'owned current persisted-row/role/membership drift' USING ERRCODE='42501';END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.user_roles WHERE user_id=s.user_id)<>(SELECT count(*) FROM app_private.qa_owned_resources WHERE run_id=p_run AND source_id=p_source AND table_oid='public.user_roles'::regclass)
 OR (SELECT count(*) FROM public.user_memberships WHERE user_id=s.user_id)<>(SELECT count(*) FROM app_private.qa_owned_resources WHERE run_id=p_run AND source_id=p_source AND table_oid='public.user_memberships'::regclass)
 THEN RAISE EXCEPTION 'owned extra role/membership denied' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.qa_owned_test_internal(p_run uuid,p_source uuid,p_sid uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;
BEGIN
 PERFORM app_private.qa_owned_service();SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source FOR UPDATE;
 PERFORM app_private.qa_owned_verify_rows(p_run,p_source);
 IF s.state<>'linked' OR NOT app_private.qa_session_live(s.user_id,p_sid,clock_timestamp())
 OR NOT coalesce((SELECT allowed AND actor_class='QA_ACTIVE' FROM app_private.qa_scope_internal(s.user_id,s.user_id)),false)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text((SELECT plan_payload->'protectedUIDs' FROM app_private.qa_owned_run_receipts WHERE run_id=p_run)) u WHERE coalesce((SELECT allowed FROM app_private.qa_scope_internal(s.user_id,u::uuid)),false)) THEN RAISE EXCEPTION 'owned bounded QA test/session denied' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_owned_sources SET state='tested',session_id=p_sid WHERE run_id=p_run AND source_id=p_source;
 RETURN jsonb_build_object('ok',true,'uid',s.user_id,'sid',p_sid,'role',s.source->>'role','self_allowed',true,'protected_denied',true);
END $$;
CREATE FUNCTION app_private.qa_owned_closure(p_run uuid,p_source uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;t record;n bigint;needles jsonb;cols text;
BEGIN
 PERFORM app_private.qa_owned_catalog_closed();
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source;
 -- Native FK catalog is global. Bind every ordered composite pair against
 -- the exact parent projection; only receipted owned child rows are removable.
 FOR t IN
  SELECT c.conrelid child,c.confrelid parent,c.conkey,c.confkey,p.row
  FROM pg_constraint c JOIN (
   SELECT table_oid parent,full_row row FROM app_private.qa_owned_resources WHERE run_id=p_run AND source_id=p_source
   UNION ALL SELECT 'auth.users'::regclass::oid,jsonb_build_object('id',s.user_id)) p ON p.parent=c.confrelid
  WHERE c.contype='f' ORDER BY c.conrelid,c.oid
 LOOP
  IF EXISTS(SELECT 1 FROM unnest(t.conkey) k JOIN pg_attribute a ON a.attrelid=t.child AND a.attnum=k
   WHERE a.attname<>ALL(ARRAY['id','user_id','session_id','run_id','source_id','role_code','unit_id','membership_role','canonical_key','login_alias','actor_user_id','target_user_id','owner','owner_id','migrated_user_id','responsible_user_id','created_by','actor_id','decision_by','from_user_id','to_user_id','decided_by','requested_by','requested_user_id','target_id']))
  OR EXISTS(SELECT 1 FROM unnest(t.confkey) k JOIN pg_attribute a ON a.attrelid=t.parent AND a.attnum=k WHERE NOT t.row ? a.attname)
  THEN RAISE EXCEPTION 'owned FK projection unsupported' USING ERRCODE='55000';END IF;
  SELECT string_agg(format('to_jsonb(t.%I)=$1->%L',a.attname,b.attname),' AND ' ORDER BY k.ord) INTO cols
  FROM unnest(t.conkey,t.confkey) WITH ORDINALITY k(ca,pa,ord)
  JOIN pg_attribute a ON a.attrelid=t.child AND a.attnum=k.ca JOIN pg_attribute b ON b.attrelid=t.parent AND b.attnum=k.pa;
  EXECUTE format('SELECT count(*) FROM %s t WHERE %s %s',t.child::regclass,cols,
   CASE WHEN t.child=ANY(ARRAY['public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass,'app_private.account_credential_state'::regclass,'app_private.qa_account_manifest'::regclass,'app_private.qa_run_members'::regclass]) THEN 'AND NOT EXISTS(SELECT 1 FROM app_private.qa_owned_resources r WHERE r.run_id=$2 AND r.source_id=$3 AND r.table_oid=$4 AND (r.full_row=to_jsonb(t) OR EXISTS(SELECT 1 FROM app_private.qa_owned_native_effects ne JOIN app_private.qa_owned_deletions nd ON nd.operation_id=ne.operation_id AND nd.generation=ne.generation WHERE nd.source_id=r.source_id AND ne.receipt_id=r.receipt_id AND ne.effect_old=r.full_row AND ne.effect_state=''observed'' AND ne.effect_new=to_jsonb(t))))' ELSE '' END)
  INTO n USING t.row,p_run,p_source,t.child;
  IF n<>0 THEN RAISE EXCEPTION 'owned global incoming FK blocker' USING ERRCODE='42501';END IF;
 END LOOP;
 needles:=jsonb_build_array(s.user_id::text,s.source->>'canonicalKey',s.source->>'loginAlias',s.source->>'email');
 FOR t IN SELECT c.oid,c.oid::regclass::text name FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND ns.nspname IN ('public','app_private') AND c.relname<>ALL(ARRAY['qa_owned_approved_plans','qa_owned_run_receipts','qa_owned_sources','qa_owned_operations','qa_owned_resources','qa_owned_frames','qa_owned_frame_empty','qa_owned_deletions','qa_owned_deletion_fences','qa_owned_native_anchor','qa_owned_native_frames','qa_owned_native_effects']) ORDER BY c.oid LOOP
  -- Explicit nonsecret reference fields only. Unattested foreign relations
  -- were denied globally above; no password/hash/token/vault row projection.
  SELECT string_agg(format('%L,to_jsonb(t.%I)',attname,attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped AND (atttypid='uuid'::regtype OR attname=ANY(ARRAY['canonical_key','login_alias','login_username','preferred_login','internal_email','email','login_name','legacy_username','owner','owner_id','created_by','updated_by','actor_user','target_user','payload','metadata','data','details','recipient_id','recipient_user_id']));
  IF cols IS NULL THEN CONTINUE;END IF;
  EXECUTE format('SELECT count(*) FROM %s t WHERE EXISTS(SELECT 1 FROM jsonb_path_query(jsonb_build_object(%s),''$.** ? (@.type() == "string")'') v WHERE $1 @> jsonb_build_array(v)) %s',t.name,cols,CASE WHEN t.oid=ANY(ARRAY['public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass,'app_private.account_credential_state'::regclass,'app_private.qa_account_manifest'::regclass,'app_private.qa_run_members'::regclass]) THEN 'AND NOT EXISTS(SELECT 1 FROM app_private.qa_owned_resources r WHERE r.run_id=$2 AND r.source_id=$3 AND r.table_oid=$4 AND (r.full_row=to_jsonb(t) OR EXISTS(SELECT 1 FROM app_private.qa_owned_native_effects ne JOIN app_private.qa_owned_deletions nd ON nd.operation_id=ne.operation_id AND nd.generation=ne.generation WHERE nd.source_id=r.source_id AND ne.receipt_id=r.receipt_id AND ne.effect_old=r.full_row AND ne.effect_state=''observed'' AND ne.effect_new=to_jsonb(t))))' ELSE '' END) INTO n USING needles,p_run,p_source,t.oid;
  IF n<>0 THEN RAISE EXCEPTION 'owned foreign/non-FK closure blocker on %',t.name USING ERRCODE='42501';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=s.user_id) THEN RAISE EXCEPTION 'owned session disposal required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.qa_owned_dispose_internal(p_run uuid,p_source uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;e app_private.qa_owned_resources%rowtype;t record;
BEGIN
 PERFORM app_private.qa_owned_service();SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source FOR UPDATE;
 IF s.state<>'tested' THEN RAISE EXCEPTION 'owned disposal phase' USING ERRCODE='42501';END IF;
 -- Global catalog denial precedes frame insertion/deletion. Locks are ordered
 -- by OID and protect this SQL transaction ONLY, never a later provider call.
 PERFORM app_private.qa_owned_catalog_closed();
 -- Exact target lock is transaction scoped; no HTTP is inside this function.
 PERFORM pg_advisory_xact_lock(hashtextextended(s.user_id::text,704927));
 PERFORM app_private.qa_owned_finalize_proof(p_run,p_source);
 PERFORM app_private.qa_owned_closure(p_run,p_source);
 INSERT INTO app_private.qa_owned_frames(backend_pid,sql_xid,source_oid,run_id,source_id,phase) VALUES(pg_backend_pid(),pg_current_xact_id(),'public.qa_owned_dispose_internal(uuid,uuid)'::regprocedure,p_run,p_source,'dispose');
 FOR e IN SELECT * FROM app_private.qa_owned_resources WHERE run_id=p_run AND source_id=p_source ORDER BY effect_sequence DESC LOOP
  DECLARE remaining jsonb;BEGIN
   remaining:=app_private.qa_owned_native_resource_row(e.receipt_id);
   IF remaining IS NOT NULL THEN PERFORM app_private.qa_owned_effect(e.table_oid,remaining,true);END IF;
  END;
 END LOOP;
 DELETE FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND effect_state='consumed';
 IF EXISTS(SELECT 1 FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'owned unclosed disposal' USING ERRCODE='55000';END IF;
 UPDATE app_private.qa_owned_resources SET disposed_at=clock_timestamp() WHERE run_id=p_run AND source_id=p_source;UPDATE app_private.qa_owned_sources SET state='db_disposed' WHERE run_id=p_run AND source_id=p_source;
 RETURN jsonb_build_object('ok',true,'uid',s.user_id,'source_id',p_source,'db_absent',true);
END $$;
CREATE FUNCTION public.qa_owned_absence_internal(p_run uuid,p_source uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;e app_private.qa_owned_resources%rowtype;n bigint;
BEGIN
 PERFORM app_private.qa_owned_service();SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source FOR UPDATE;
 IF s.state<>'db_disposed' OR EXISTS(SELECT 1 FROM auth.users WHERE id=s.user_id) OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=s.user_id) THEN RAISE EXCEPTION 'owned persisted native absence required' USING ERRCODE='42501';END IF;
 FOR e IN SELECT * FROM app_private.qa_owned_resources WHERE run_id=p_run AND source_id=p_source LOOP EXECUTE format('SELECT count(*) FROM %s t WHERE to_jsonb(t) @> $1',e.table_oid::regclass) INTO n USING e.pk;IF n<>0 THEN RAISE EXCEPTION 'owned full PK absence failed' USING ERRCODE='42501';END IF;END LOOP;
 PERFORM app_private.qa_owned_closure(p_run,p_source);UPDATE app_private.qa_owned_sources SET state='absent' WHERE run_id=p_run AND source_id=p_source;
 RETURN jsonb_build_object('ok',true,'uid',s.user_id,'absent',true);
END $$;
CREATE FUNCTION public.qa_owned_complete_internal(p_run uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.qa_owned_service();
 IF (SELECT count(*) FROM app_private.qa_owned_sources WHERE run_id=p_run AND state='absent')<>57
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_operations WHERE run_id=p_run AND (state<>'completed' OR actual<>'fulfilled'))
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_frames WHERE run_id=p_run)
 OR EXISTS(SELECT 1 FROM app_private.qa_account_manifest WHERE run_id=p_run)
 OR EXISTS(SELECT 1 FROM app_private.qa_run_members WHERE run_id=p_run)
 OR EXISTS(SELECT 1 FROM app_private.qa_transaction_manifest WHERE run_id=p_run) THEN RAISE EXCEPTION 'owned incomplete/unknown run' USING ERRCODE='42501';END IF;
 DELETE FROM app_private.qa_owned_resources WHERE run_id=p_run;DELETE FROM app_private.qa_owned_operations WHERE run_id=p_run;DELETE FROM app_private.qa_owned_sources WHERE run_id=p_run;DELETE FROM app_private.qa_runs WHERE run_id=p_run;
 UPDATE app_private.qa_owned_run_receipts SET completed_at=clock_timestamp() WHERE run_id=p_run AND completed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'owned completion no retry' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('ok',true,'run_id',p_run,'absent_resources',57,'ephemeral_rows',0,'pending',0,'durable_no_retry_receipt_retained',true);
END $$;
CREATE FUNCTION public.qa_owned_read_internal(p_run uuid,p_facet text,p_uid uuid DEFAULT NULL,p_sid uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM app_private.qa_owned_service();
 IF p_uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.qa_owned_sources WHERE run_id=p_run AND user_id=p_uid)
 AND NOT (p_facet='auth-status' AND EXISTS(SELECT 1 FROM app_private.qa_owned_sources s JOIN auth.users u ON u.id=p_uid AND u.email=s.source->>'email' JOIN app_private.qa_owned_operations o ON o.run_id=s.run_id AND o.operation_id=s.create_operation WHERE s.run_id=p_run AND s.state='reserved' AND s.user_id IS NULL AND u.created_at>=o.reserved_at AND u.raw_user_meta_data->>'run_id'=s.run_id::text AND u.raw_user_meta_data->>'source_id'=s.source_id::text AND u.raw_user_meta_data->>'operation_id'=s.create_operation::text AND u.raw_user_meta_data->>'receipt_id'=s.creation_receipt::text AND o.state='completed' AND o.actual='fulfilled'))
 THEN RAISE EXCEPTION 'owned read identity denied' USING ERRCODE='42501';END IF;
 CASE p_facet
 WHEN 'auth-status' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT id,email,banned_until,deleted_at FROM auth.users WHERE id=p_uid) t;
 WHEN 'auth-absence' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT id FROM auth.users WHERE id=p_uid) t;
 WHEN 'session' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT id,user_id,created_at,not_after FROM auth.sessions WHERE id=p_sid AND user_id=p_uid) t;
 WHEN 'session-absence' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT id FROM auth.sessions WHERE id=p_sid AND user_id=p_uid) t;
 WHEN 'uid-sessions' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT id FROM auth.sessions WHERE user_id=p_uid) t;
 WHEN 'refresh-absence' THEN
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('auth.refresh_tokens')) THEN EXECUTE 'SELECT coalesce(jsonb_agg(jsonb_build_object(''id'',id)),''[]''::jsonb) FROM auth.refresh_tokens WHERE session_id=$1' INTO result USING p_sid;ELSE RAISE EXCEPTION 'owned native refresh catalog absent' USING ERRCODE='55000';END IF;
 WHEN 'manifest-read' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT m.*,x.role_code,x.active AS member_active,r.phase,r.active AS run_active,r.expires_at FROM app_private.qa_account_manifest m JOIN app_private.qa_run_members x ON (x.run_id,x.user_id)=(m.run_id,m.user_id) JOIN app_private.qa_runs r ON r.run_id=m.run_id WHERE m.run_id=p_run AND m.user_id=p_uid) t;
 WHEN 'delete-native-receipts' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('operation_id',d.operation_id,'generation',d.generation,'root_receipt',d.native_root_receipt,'effects',(SELECT coalesce(jsonb_agg(jsonb_build_object('effect_slot',e.effect_slot,'receipt_id',e.receipt_id,'table_oid',e.table_oid,'pk',e.pk,'effect',e.effect_op,'state',e.effect_state,'old_digest',encode(sha256(convert_to(e.effect_old::text,'UTF8')),'hex'),'new_digest',CASE WHEN e.effect_new IS NOT NULL THEN encode(sha256(convert_to(e.effect_new::text,'UTF8')),'hex') END,'fk_oid',e.fk_oid,'ri_oid',e.ri_oid,'guard_oid',e.guard_oid,'backend_pid',e.observed_pid,'sql_xid',e.observed_xid::text) ORDER BY e.effect_slot),'[]'::jsonb) FROM app_private.qa_owned_native_effects e WHERE e.operation_id=d.operation_id AND e.generation=d.generation))),'[]'::jsonb) INTO result FROM app_private.qa_owned_deletions d WHERE d.run_id=p_run AND d.target_user_id=p_uid;
 WHEN 'pending' THEN SELECT jsonb_build_array(jsonb_build_object('count',count(*)::int)) INTO result FROM app_private.qa_owned_operations WHERE run_id=p_run AND (state IN ('reserved','dispatched','unknown') OR actual='pending');
 WHEN 'disposition' THEN
  PERFORM app_private.qa_owned_catalog_closed();
  PERFORM app_private.qa_owned_fence_catalog_closed();
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'state',state,'auth_projection',auth_projection,'source',source,'create_operation',create_operation,'creation_receipt',creation_receipt)),'[]') INTO result FROM app_private.qa_owned_sources WHERE run_id=p_run AND user_id=p_uid;
 ELSE RAISE EXCEPTION 'owned read facet denied' USING ERRCODE='42501';END CASE;
 RETURN result;
END $$;
-- Complete catalog identity, for the future F3 read-only metadata composition.
CREATE FUNCTION app_private.qa_owned_identity_snapshot() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('protected_inventory',app_private.qa_owned_protected_snapshot(),'global_incoming_fk',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY oid),'[]'::jsonb) FROM pg_constraint c WHERE contype='f'),'global_relations',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',c.oid,'schema',n.nspname,'name',c.relname,'kind',c.relkind,'partition',c.relispartition) ORDER BY c.oid),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','f','v','m')),'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'identity',format('%I.%I(%s)',(SELECT nspname FROM pg_namespace WHERE oid=p.pronamespace),p.proname,pg_get_function_identity_arguments(p.oid)),'definition',pg_get_functiondef(p.oid),'owner',p.proowner::regrole::text,'acl',p.proacl::text,'config',p.proconfig,'security_definer',p.prosecdef,'volatile',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'cost',p.procost,'rows',p.prorows,'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),'support',p.prosupport::text,'kind',p.prokind,'leakproof',p.proleakproof,'arg_types',p.proargtypes::text,'all_arg_types',to_jsonb(p.proallargtypes),'arg_modes',to_jsonb(p.proargmodes),'arg_names',to_jsonb(p.proargnames),'arg_defaults',pg_get_expr(p.proargdefaults,0),'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'app_private'::regnamespace) AND (p.proname LIKE 'qa_owned_%' OR p.oid='app_private.qa_reference_guard_before_row()'::regprocedure)),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',(SELECT format('%I.%I',n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=a.attrelid),'column',a.attname,'type',a.atttypid::regtype::text,'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=ANY(ARRAY['public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass,'app_private.account_credential_state'::regclass,'app_private.qa_account_manifest'::regclass,'app_private.qa_run_members'::regclass,to_regclass('app_private.qa_core_provision_context'),to_regclass('public.legacy_archive'),to_regclass('public.migration_gate'),to_regclass('public.migration_receipts'),to_regclass('public.workspace_edits'),to_regclass('public.workspace_versions'),'app_private.qa_owned_frames'::regclass,'app_private.qa_owned_frame_empty'::regclass,to_regclass('app_private.qa_owned_deletions'),to_regclass('app_private.qa_owned_deletion_fences'),to_regclass('app_private.qa_owned_native_anchor'),to_regclass('app_private.qa_owned_native_frames'),to_regclass('app_private.qa_owned_native_effects')]) AND a.attnum>0 AND NOT a.attisdropped),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY oid) FROM pg_trigger t WHERE t.tgrelid=ANY(ARRAY['public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass,to_regclass('app_private.qa_core_provision_context'),to_regclass('public.legacy_archive'),to_regclass('public.migration_gate'),to_regclass('public.migration_receipts'),to_regclass('public.workspace_edits'),to_regclass('public.workspace_versions'),'app_private.qa_owned_frames'::regclass,'app_private.qa_owned_frame_empty'::regclass,to_regclass('app_private.qa_owned_deletions'),to_regclass('app_private.qa_owned_deletion_fences'),to_regclass('app_private.qa_owned_native_anchor'),to_regclass('app_private.qa_owned_native_frames'),to_regclass('app_private.qa_owned_native_effects')])),
 'closure',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_constraint c WHERE c.conrelid IN (to_regclass('app_private.qa_core_provision_context'),to_regclass('public.legacy_archive'),to_regclass('public.migration_gate'),to_regclass('public.migration_receipts'),to_regclass('public.workspace_edits'),to_regclass('public.workspace_versions'),'app_private.qa_owned_frames'::regclass,'app_private.qa_owned_frame_empty'::regclass,to_regclass('app_private.qa_owned_deletions'),to_regclass('app_private.qa_owned_deletion_fences'),to_regclass('app_private.qa_owned_native_frames'),to_regclass('app_private.qa_owned_native_effects'))))
$$;
CREATE FUNCTION public.qa_owned_identity_snapshot_internal() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN PERFORM app_private.qa_owned_service();j:=app_private.qa_owned_identity_snapshot();RETURN jsonb_build_object('snapshot',j,'digest',encode(sha256(convert_to(j::text,'UTF8')),'hex'));END $$;
-- Forward-only explicit consumption branch; no old branch/body/metadata edits.
DO $compose$
DECLARE d text;needle text;
BEGIN
 d:=pg_get_functiondef('app_private.qa_reference_guard_before_row()'::regprocedure);
 needle:=' -- The predicate is private and proves only the existing trusted Core frame';
 IF (SELECT encode(sha256(convert_to(replace(prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') FROM pg_proc WHERE oid='app_private.qa_reference_guard_before_row()'::regprocedure) IS DISTINCT FROM '0b2287166f8d4182f77d47eba80fceb3c4cee01833192573c4870a90d6213522' OR position(needle IN d)=0 OR position('app_private.qa_pw_consume' IN d)=0 OR position('app_private.qa_owned_consume' IN d)>0 THEN RAISE EXCEPTION 'owned composer requires final205 uncomposed dispatcher' USING ERRCODE='55000';END IF;
 EXECUTE replace(d,needle,' IF app_private.qa_owned_consume(TG_RELID,TG_OP,CASE WHEN TG_OP IN (''UPDATE'',''DELETE'') THEN to_jsonb(OLD) ELSE NULL END,CASE WHEN TG_OP IN (''INSERT'',''UPDATE'') THEN to_jsonb(NEW) ELSE NULL END) THEN IF TG_OP=''DELETE'' THEN RETURN OLD;END IF;RETURN NEW;END IF;'||chr(10)||needle);
END $compose$;
DO $acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT oid::regclass relation FROM pg_class WHERE relnamespace='app_private'::regnamespace AND relname IN ('qa_owned_approved_plans','qa_owned_run_receipts','qa_owned_sources') LOOP EXECUTE format('ALTER TABLE %s OWNER TO postgres',r.relation);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',r.relation);END LOOP;
 FOR r IN SELECT oid::regprocedure f,pronamespace='public'::regnamespace exposed FROM pg_proc WHERE oid=ANY(ARRAY['app_private.qa_owned_service()'::regprocedure::oid,'app_private.qa_owned_catalog_closed()'::regprocedure::oid,'app_private.qa_owned_protected_snapshot()'::regprocedure::oid,'app_private.qa_owned_units(jsonb)'::regprocedure::oid,'public.qa_owned_preflight_internal(uuid,uuid)'::regprocedure::oid,'public.qa_owned_prepare_internal(uuid,uuid)'::regprocedure::oid,'public.qa_owned_operation_internal(uuid,uuid,text,text,text,text)'::regprocedure::oid,'app_private.qa_owned_revalidate()'::regprocedure::oid,'app_private.qa_owned_consume(oid,text,jsonb,jsonb)'::regprocedure::oid,'app_private.qa_owned_effect(oid,jsonb,boolean)'::regprocedure::oid,'public.qa_owned_create_preflight_internal(uuid,uuid,uuid,uuid,text)'::regprocedure::oid,'public.qa_owned_bootstrap_internal(uuid,uuid,uuid)'::regprocedure::oid,'app_private.qa_owned_verify_rows(uuid,uuid)'::regprocedure::oid,'public.qa_owned_test_internal(uuid,uuid,uuid)'::regprocedure::oid,'app_private.qa_owned_closure(uuid,uuid)'::regprocedure::oid,'public.qa_owned_dispose_internal(uuid,uuid)'::regprocedure::oid,'public.qa_owned_absence_internal(uuid,uuid)'::regprocedure::oid,'public.qa_owned_complete_internal(uuid)'::regprocedure::oid,'public.qa_owned_read_internal(uuid,text,uuid,uuid)'::regprocedure::oid,'app_private.qa_owned_identity_snapshot()'::regprocedure::oid,'public.qa_owned_identity_snapshot_internal()'::regprocedure::oid]) LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',r.f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.f);IF r.exposed THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.f);END IF;END LOOP;
END $acl$;
COMMIT;
-- No approval anchor, real authority key or actual target activation is supplied.
