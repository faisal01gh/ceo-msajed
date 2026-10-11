-- UNAPPLIED LOCAL QA protocol. Requires actual owned-control after final205.
-- No provider calls, direct Auth deletion RPC, broad locks or expiry reclamation.
BEGIN;
CREATE TABLE app_private.qa_owned_deletions(
 operation_id uuid PRIMARY KEY,run_id uuid NOT NULL,source_id uuid NOT NULL,
 target_user_id uuid NOT NULL UNIQUE,canonical_key text NOT NULL UNIQUE,
 generation bigint NOT NULL CHECK(generation>0),
 status text NOT NULL CHECK(status IN ('delete_prepared','auth_delete_in_flight','auth_delete_unknown','db_finalize_pending','completed')),
 ownership_receipt_digest text NOT NULL CHECK(ownership_receipt_digest ~ '^[0-9a-f]{64}$'),
 protected_snapshot_digest text NOT NULL CHECK(protected_snapshot_digest ~ '^[0-9a-f]{64}$'),
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 auth_readback_digest text CHECK(auth_readback_digest ~ '^[0-9a-f]{64}$'),
 absence_observed_at timestamptz,completed_receipt jsonb,native_root_receipt jsonb,
 UNIQUE(operation_id,generation,target_user_id,canonical_key)
);
CREATE TABLE app_private.qa_owned_deletion_fences(
 target_user_id uuid PRIMARY KEY,canonical_key text NOT NULL UNIQUE,run_id uuid NOT NULL,
 operation_id uuid NOT NULL UNIQUE,generation bigint NOT NULL,
 FOREIGN KEY(operation_id,generation,target_user_id,canonical_key)
 REFERENCES app_private.qa_owned_deletions(operation_id,generation,target_user_id,canonical_key)
);
ALTER TABLE app_private.qa_owned_deletions OWNER TO postgres;
ALTER TABLE app_private.qa_owned_deletion_fences OWNER TO postgres;
REVOKE ALL ON app_private.qa_owned_deletions,app_private.qa_owned_deletion_fences FROM PUBLIC,anon,authenticated,service_role;
-- Trusted installer must bind the actual native Auth gateway role separately.
-- No product RPC sets this anchor, and no JWT/GUC can create native custody.
-- gateway_metadata is populated only by the trusted installer after independent
-- native source approval: exact safe role attributes and both membership edges.
-- NULL means unactivated. Never accept an SDK/caller-provided metadata digest.
-- Role settings are hashed, not persisted as potentially sensitive GUC values.
CREATE TABLE app_private.qa_owned_native_anchor(id integer PRIMARY KEY CHECK(id=1),gateway_oid oid,catalog_digest text NOT NULL,gateway_metadata jsonb);
CREATE TABLE app_private.qa_owned_native_frames(
 backend_pid integer NOT NULL,sql_xid xid8 NOT NULL,operation_id uuid NOT NULL,
 generation bigint NOT NULL,source_oid oid NOT NULL,gateway_oid oid NOT NULL,
 root_uid uuid NOT NULL,root_state text NOT NULL CHECK(root_state IN ('admitted','consumed')),
 closure integer NOT NULL DEFAULT 1 CHECK(closure=1),PRIMARY KEY(backend_pid,sql_xid),
 FOREIGN KEY(closure) REFERENCES app_private.qa_owned_frame_empty(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app_private.qa_owned_native_effects(
 operation_id uuid NOT NULL,generation bigint NOT NULL,effect_slot integer NOT NULL,
 receipt_id uuid NOT NULL,table_oid oid NOT NULL,pk jsonb NOT NULL,
 effect_old jsonb NOT NULL,effect_new jsonb,effect_op text NOT NULL CHECK(effect_op IN ('DELETE','UPDATE')),
 parent_table oid NOT NULL,parent_pk jsonb NOT NULL,fk_oid oid NOT NULL,ri_oid oid NOT NULL,
 depth integer NOT NULL CHECK(depth IN (2,3)),effect_state text NOT NULL DEFAULT 'captured' CHECK(effect_state IN ('captured','observed')),
 guard_oid oid,observed_pid integer,observed_xid xid8,
 PRIMARY KEY(operation_id,generation,effect_slot),UNIQUE(operation_id,generation,receipt_id)
);
ALTER TABLE app_private.qa_owned_native_anchor OWNER TO postgres;
ALTER TABLE app_private.qa_owned_native_frames OWNER TO postgres;
ALTER TABLE app_private.qa_owned_native_effects OWNER TO postgres;
REVOKE ALL ON app_private.qa_owned_native_anchor,app_private.qa_owned_native_frames,app_private.qa_owned_native_effects FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION app_private.qa_owned_native_catalog_digest() RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object(
 -- Hash live role metadata, not anchor values: no self-referential digest.
 'gateway',(SELECT jsonb_build_object('role',(SELECT to_jsonb(safe_role) FROM (SELECT r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolconnlimit,r.rolvaliduntil,r.rolbypassrls,encode(sha256(convert_to(coalesce(to_jsonb(r.rolconfig),'null'::jsonb)::text,'UTF8')),'hex') AS rolconfig_digest FROM pg_roles r WHERE r.oid=a.gateway_oid) safe_role),'memberships',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m WHERE m.member=a.gateway_oid OR m.roleid=a.gateway_oid),'[]'::jsonb)) FROM app_private.qa_owned_native_anchor a WHERE a.id=1),
 'fk',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.contype='f'),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid IN (to_regclass('app_private.qa_core_provision_context'),to_regclass('public.legacy_archive'),to_regclass('public.migration_gate'),to_regclass('public.migration_receipts'),to_regclass('public.workspace_edits'),to_regclass('public.workspace_versions'),'auth.users'::regclass,'auth.sessions'::regclass,'public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass,'app_private.account_credential_state'::regclass,'app_private.qa_owned_native_frames'::regclass)),
 'callbacks',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'body',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl,'config',p.proconfig) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN (to_regclass('app_private.qa_core_provision_context'),to_regclass('public.legacy_archive'),to_regclass('public.migration_gate'),to_regclass('public.migration_receipts'),to_regclass('public.workspace_edits'),to_regclass('public.workspace_versions'),'auth.users'::regclass,'auth.sessions'::regclass,'public.profiles'::regclass,'public.user_roles'::regclass,'public.user_memberships'::regclass,'public.account_migration_users'::regclass,'app_private.account_credential_state'::regclass,'app_private.qa_owned_native_frames'::regclass)))
 )::text,'UTF8')),'hex')
$$;
CREATE FUNCTION app_private.qa_owned_native_gateway() RETURNS oid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a app_private.qa_owned_native_anchor%rowtype;
BEGIN
 SELECT * INTO STRICT a FROM app_private.qa_owned_native_anchor WHERE id=1;
 IF a.gateway_oid IS NULL OR a.catalog_digest IS DISTINCT FROM app_private.qa_owned_native_catalog_digest()
 -- Official Supabase Auth is NOINHERIT CREATEROLE LOGIN NOREPLICATION.
 -- Existing CREATEROLE is not a new grant. Compare the independently approved
 -- actual role/membership baseline rather than imposing fixture attributes.
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=a.gateway_oid AND rolcanlogin AND NOT rolsuper AND NOT rolreplication)
 OR a.gateway_metadata IS NULL OR a.gateway_metadata IS DISTINCT FROM jsonb_build_object('role',(SELECT to_jsonb(safe_role) FROM (SELECT r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolconnlimit,r.rolvaliduntil,r.rolbypassrls,encode(sha256(convert_to(coalesce(to_jsonb(r.rolconfig),'null'::jsonb)::text,'UTF8')),'hex') AS rolconfig_digest FROM pg_roles r WHERE r.oid=a.gateway_oid) safe_role),'memberships',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m WHERE m.member=a.gateway_oid OR m.roleid=a.gateway_oid),'[]'::jsonb))
 OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'app_private'::regnamespace) AND c.relkind IN ('r','p') AND has_table_privilege(a.gateway_oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 THEN RAISE EXCEPTION 'native Auth gateway/catalog not attested' USING ERRCODE='55000';END IF;
 RETURN a.gateway_oid;
END $$;
CREATE FUNCTION app_private.qa_owned_native_capture(p_operation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d app_private.qa_owned_deletions%rowtype;r record;fk record;parent record;keys jsonb;pred text;live jsonb;updated jsonb;ri oid;slot integer:=0;
BEGIN
 SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE operation_id=p_operation;
 -- Closed supported closure: original root FK -> exact bootstrap receipts,
 -- then profiles -> exact roles/memberships. All other incoming rows are denied
 -- by qa_owned_closure before either Prepare or the actual provider root.
 FOR parent IN SELECT 'auth.users'::regclass::oid table_oid,jsonb_build_object('id',d.target_user_id) row,1 depth
 UNION ALL SELECT rr.table_oid,rr.full_row,2 FROM app_private.qa_owned_resources rr WHERE rr.source_id=d.source_id AND rr.table_oid='public.profiles'::regclass LOOP
  FOR fk IN SELECT * FROM pg_constraint WHERE contype='f' AND confrelid=parent.table_oid AND confdeltype IN ('c','n') ORDER BY oid LOOP
   SELECT string_agg(format('to_jsonb(t.%I)=$1->%L',ca.attname,pa.attname),' AND ' ORDER BY k.ord)
   INTO pred FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY k(c,p,ord) JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=k.c JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=k.p;
   -- Business-only full rows; never select/persist native Auth secret material.
   IF fk.conrelid IN ('auth.users'::regclass,'auth.sessions'::regclass) THEN
    EXECUTE format('SELECT jsonb_build_object(''id'',id) FROM %s t WHERE %s LIMIT 1',fk.conrelid::regclass,pred) INTO live USING parent.row;
    IF live IS NOT NULL THEN RAISE EXCEPTION 'native SID receipt required; prepare requires disposed sessions' USING ERRCODE='42501';END IF;CONTINUE;
   END IF;
   FOR r IN SELECT * FROM app_private.qa_owned_resources WHERE source_id=d.source_id AND table_oid=fk.conrelid ORDER BY effect_sequence LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE %s AND to_jsonb(t) @> $2',fk.conrelid::regclass,pred) INTO live USING parent.row,r.pk;
    IF live IS NULL THEN CONTINUE;END IF;
    IF live IS DISTINCT FROM r.full_row OR r.row_digest IS DISTINCT FROM encode(sha256(convert_to(live::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'native full receipt drift' USING ERRCODE='42501';END IF;
    updated:=NULL;
    IF fk.confdeltype='n' THEN
     updated:=live;
     FOR keys IN SELECT to_jsonb(a.attname) FROM unnest(fk.conkey) k JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k LOOP updated:=jsonb_set(updated,ARRAY[keys#>>'{}'],'null');END LOOP;
    END IF;
    SELECT tgfoid INTO STRICT ri FROM pg_trigger WHERE tgconstraint=fk.oid AND tgrelid=fk.confrelid AND tgisinternal AND tgtype=9 AND NOT tgdeferrable AND tgenabled='O';
    IF ri IS DISTINCT FROM (CASE fk.confdeltype WHEN 'c' THEN 'pg_catalog."RI_FKey_cascade_del"()'::regprocedure::oid ELSE 'pg_catalog."RI_FKey_setnull_del"()'::regprocedure::oid END) THEN RAISE EXCEPTION 'native RI source drift' USING ERRCODE='55000';END IF;
    slot:=slot+1;
    INSERT INTO app_private.qa_owned_native_effects(operation_id,generation,effect_slot,receipt_id,table_oid,pk,effect_old,effect_new,effect_op,parent_table,parent_pk,fk_oid,ri_oid,depth)
    VALUES(d.operation_id,d.generation,slot,r.receipt_id,r.table_oid,r.pk,live,updated,CASE fk.confdeltype WHEN 'c' THEN 'DELETE' ELSE 'UPDATE' END,parent.table_oid,CASE WHEN parent.depth=1 THEN parent.row ELSE jsonb_build_object('id',d.target_user_id) END,fk.oid,ri,2);
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION app_private.qa_owned_native_valid(p_table oid,p_op text,p_old jsonb,p_new jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_owned_native_frames%rowtype;d app_private.qa_owned_deletions%rowtype;e app_private.qa_owned_native_effects%rowtype;n bigint;
BEGIN
 SELECT * INTO f FROM app_private.qa_owned_native_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id();
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE operation_id=f.operation_id;
 IF f.source_oid IS DISTINCT FROM 'app_private.qa_owned_native_root()'::regprocedure::oid OR f.gateway_oid IS DISTINCT FROM app_private.qa_owned_native_gateway()
 OR session_user::regrole::oid<>f.gateway_oid OR current_setting('role')<>'none'
 OR d.generation<>f.generation OR d.target_user_id<>f.root_uid OR d.status NOT IN ('auth_delete_in_flight','auth_delete_unknown')
 OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_deletion_fences WHERE operation_id=f.operation_id AND generation=f.generation AND target_user_id=f.root_uid)
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_frames WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid)
 OR EXISTS(SELECT 1 FROM app_private.qa_password_frames WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid)
 OR EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid)
 THEN RAISE EXCEPTION 'native exact source/operation custody denied' USING ERRCODE='42501';END IF;
 IF p_table='auth.users'::regclass THEN
  IF p_op<>'DELETE' OR p_old->>'id' IS DISTINCT FROM f.root_uid::text OR f.root_state<>'admitted' OR pg_trigger_depth()<>1 THEN RAISE EXCEPTION 'native root replay/mismatch' USING ERRCODE='42501';END IF;RETURN true;
 END IF;
 SELECT * INTO e FROM app_private.qa_owned_native_effects WHERE operation_id=f.operation_id AND generation=f.generation AND table_oid=p_table AND effect_op=p_op AND effect_old=p_old AND effect_new IS NOT DISTINCT FROM p_new AND effect_state='captured';
 IF NOT FOUND OR f.root_state<>'consumed' OR pg_trigger_depth()<>e.depth THEN RAISE EXCEPTION 'native exact full effect/phase/reentrance denied on %, depth %, captured %, match %',p_table::regclass,pg_trigger_depth(),e.depth,FOUND USING ERRCODE='42501';END IF;
 EXECUTE format('SELECT count(*) FROM %s t WHERE to_jsonb(t) @> $1',e.parent_table::regclass) INTO n USING e.parent_pk;
 IF n<>0 OR (e.parent_table='public.profiles'::regclass AND NOT EXISTS(SELECT 1 FROM app_private.qa_owned_native_effects WHERE operation_id=e.operation_id AND generation=e.generation AND table_oid=e.parent_table AND effect_op='DELETE' AND effect_state='observed')) THEN RAISE EXCEPTION 'native parent phase not proven' USING ERRCODE='42501';END IF;
 RETURN true;
END $$;
CREATE FUNCTION app_private.qa_owned_native_consume(p_table oid,p_op text,p_old jsonb,p_new jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF NOT app_private.qa_owned_native_valid(p_table,p_op,p_old,p_new) THEN RETURN false;END IF;
 IF p_table='auth.users'::regclass THEN UPDATE app_private.qa_owned_native_frames SET root_state='consumed' WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND root_state='admitted';
 ELSE UPDATE app_private.qa_owned_native_effects e SET effect_state='observed',guard_oid=CASE WHEN EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=p_table AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure) THEN 'app_private.qa_reference_guard_before_row()'::regprocedure::oid ELSE 'app_private.qa_owned_fence_before_row()'::regprocedure::oid END,observed_pid=pg_backend_pid(),observed_xid=pg_current_xact_id()
 FROM app_private.qa_owned_native_frames f WHERE f.backend_pid=pg_backend_pid() AND f.sql_xid=pg_current_xact_id() AND e.operation_id=f.operation_id AND e.generation=f.generation AND e.table_oid=p_table AND e.effect_op=p_op AND e.effect_old=p_old AND e.effect_new IS NOT DISTINCT FROM p_new AND e.effect_state='captured';END IF;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'native effect reuse/reentrance' USING ERRCODE='42501';END IF;RETURN true;
END $$;
CREATE FUNCTION app_private.qa_owned_native_root() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d app_private.qa_owned_deletions%rowtype;s app_private.qa_owned_sources%rowtype;gateway oid;u jsonb;
BEGIN
 SELECT d0.* INTO d FROM app_private.qa_owned_deletions d0 JOIN app_private.qa_owned_deletion_fences f ON f.operation_id=d0.operation_id AND f.generation=d0.generation WHERE f.target_user_id=OLD.id;
 IF NOT FOUND THEN RETURN OLD;END IF;
 IF TG_RELID<>'auth.users'::regclass OR TG_OP<>'DELETE' OR TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' OR pg_trigger_depth()<>1 OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'native root attachment/phase denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.id::text,704927));
 gateway:=app_private.qa_owned_native_gateway();
 IF session_user::regrole::oid<>gateway OR current_setting('role')<>'none' OR d.status NOT IN ('auth_delete_in_flight','auth_delete_unknown') THEN RAISE EXCEPTION 'official native Auth root source required' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE source_id=d.source_id;
 u:=jsonb_build_object('id',OLD.id,'email',OLD.email,'metadata',OLD.raw_user_meta_data,'app_metadata',OLD.raw_app_meta_data,'created_at',OLD.created_at,'confirmed_at',OLD.email_confirmed_at,'banned_until',OLD.banned_until,'deleted_at',OLD.deleted_at);
 IF u IS DISTINCT FROM s.auth_projection OR app_private.qa_owned_ownership_digest(d.run_id,d.source_id)<>d.ownership_receipt_digest OR app_private.qa_owned_protected_population_digest()<>d.protected_snapshot_digest
 THEN RAISE EXCEPTION 'native root receipt/protected snapshot drift' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_owned_verify_rows(d.run_id,d.source_id);PERFORM app_private.qa_owned_closure(d.run_id,d.source_id);
 INSERT INTO app_private.qa_owned_native_frames(backend_pid,sql_xid,operation_id,generation,source_oid,gateway_oid,root_uid,root_state) VALUES(pg_backend_pid(),pg_current_xact_id(),d.operation_id,d.generation,'app_private.qa_owned_native_root()'::regprocedure,gateway,OLD.id,'admitted');
 RETURN OLD;
END $$;
CREATE FUNCTION app_private.qa_owned_native_close() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_owned_native_frames%rowtype;e record;live jsonb;d app_private.qa_owned_deletions%rowtype;
BEGIN
 SELECT * INTO f FROM app_private.qa_owned_native_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id();IF NOT FOUND THEN RETURN NULL;END IF;
 IF TG_RELID<>'app_private.qa_owned_native_frames'::regclass OR TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_OP<>'INSERT' OR NEW.backend_pid<>f.backend_pid OR NEW.sql_xid<>f.sql_xid OR NEW.operation_id<>f.operation_id OR NEW.source_oid<>f.source_oid OR NEW.generation<>f.generation OR NEW.root_uid<>f.root_uid OR pg_trigger_depth()<>1 OR f.root_state<>'consumed' OR session_user::regrole::oid<>app_private.qa_owned_native_gateway() THEN RAISE EXCEPTION 'native root closure source/phase denied' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE operation_id=f.operation_id;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=f.root_uid) OR EXISTS(SELECT 1 FROM app_private.qa_owned_native_effects WHERE operation_id=f.operation_id AND generation=f.generation AND effect_state<>'observed') THEN RAISE EXCEPTION 'native RI closure incomplete' USING ERRCODE='42501';END IF;
 FOR e IN SELECT * FROM app_private.qa_owned_native_effects WHERE operation_id=f.operation_id AND generation=f.generation LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE to_jsonb(t) @> $1',e.table_oid::regclass) INTO live USING e.pk;
  IF live IS DISTINCT FROM e.effect_new THEN RAISE EXCEPTION 'native persisted effect mismatch' USING ERRCODE='42501';END IF;
 END LOOP;
 IF app_private.qa_owned_protected_population_digest()<>d.protected_snapshot_digest THEN RAISE EXCEPTION 'native final protected snapshot drift' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_owned_deletions SET native_root_receipt=jsonb_build_object('operation_id',f.operation_id,'generation',f.generation,'target_user_id',f.root_uid,'source_oid',f.source_oid,'gateway_oid',f.gateway_oid,'backend_pid',f.backend_pid,'sql_xid',f.sql_xid::text,'effect','DELETE','closure','all_exact_native_effects_observed','projection_digest',encode(sha256(convert_to((SELECT auth_projection::text FROM app_private.qa_owned_sources WHERE source_id=d.source_id),'UTF8')),'hex')) WHERE operation_id=f.operation_id AND generation=f.generation AND native_root_receipt IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'native root receipt replay' USING ERRCODE='42501';END IF;
 DELETE FROM app_private.qa_owned_native_frames WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid;
 RETURN NULL;
END $$;
CREATE FUNCTION app_private.qa_owned_native_resource_row(p_receipt uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE r app_private.qa_owned_resources%rowtype;e app_private.qa_owned_native_effects%rowtype;live jsonb;
BEGIN
 SELECT * INTO STRICT r FROM app_private.qa_owned_resources WHERE receipt_id=p_receipt;
 SELECT e0.* INTO e FROM app_private.qa_owned_native_effects e0 JOIN app_private.qa_owned_deletions d ON d.operation_id=e0.operation_id AND d.generation=e0.generation AND d.source_id=r.source_id WHERE e0.receipt_id=r.receipt_id AND e0.effect_state='observed';
 EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE to_jsonb(t) @> $1',r.table_oid::regclass) INTO live USING r.pk;
 IF e.receipt_id IS NOT NULL THEN
  IF e.effect_old IS DISTINCT FROM r.full_row OR e.pk IS DISTINCT FROM r.pk OR e.table_oid<>r.table_oid OR e.guard_oid IS NULL OR e.observed_xid IS NULL OR live IS DISTINCT FROM e.effect_new THEN RAISE EXCEPTION 'remaining resource native receipt drift' USING ERRCODE='42501';END IF;RETURN e.effect_new;
 END IF;
 IF live IS DISTINCT FROM r.full_row THEN RAISE EXCEPTION 'remaining original resource drift' USING ERRCODE='42501';END IF;RETURN r.full_row;
END $$;
CREATE FUNCTION app_private.qa_owned_fence_surfaces() RETURNS oid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT array_agg(c.oid ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','auth','app_private') AND c.relkind='r'
 AND c.relname<>ALL(ARRAY['qa_owned_approved_plans','qa_owned_run_receipts','qa_owned_sources','qa_owned_operations','qa_owned_resources','qa_owned_frames','qa_owned_frame_empty','qa_owned_deletions','qa_owned_deletion_fences','qa_owned_native_anchor','qa_owned_native_frames','qa_owned_native_effects'])
$$;
CREATE FUNCTION app_private.qa_owned_fence_catalog_closed() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE t oid;n integer;central boolean;
BEGIN
 PERFORM app_private.qa_owned_catalog_closed();
 IF current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'fence replication mode drift' USING ERRCODE='55000';END IF;
 IF position('PERFORM app_private.qa_owned_fence_check(TG_RELID,TG_OP' IN (SELECT prosrc FROM pg_proc WHERE oid='app_private.qa_reference_guard_before_row()'::regprocedure))=0
 THEN RAISE EXCEPTION 'missing central deletion fence composer' USING ERRCODE='55000';END IF;
 FOREACH t IN ARRAY app_private.qa_owned_fence_surfaces() LOOP
  central:=EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure AND tgtype=31 AND tgenabled='O' AND NOT tgdeferrable AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector);
  SELECT count(*) INTO n FROM pg_trigger WHERE tgrelid=t AND tgfoid='app_private.qa_owned_fence_before_row()'::regprocedure;
  IF (central AND n<>0) OR (NOT central AND (n<>1 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t AND tgfoid='app_private.qa_owned_fence_before_row()'::regprocedure AND tgtype=31 AND tgenabled='O' AND NOT tgdeferrable AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector)))
  THEN RAISE EXCEPTION 'missing/duplicate/filtered fence attachment on %',t::regclass USING ERRCODE='55000';END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['app_private.qa_owned_deletions'::regclass,'app_private.qa_owned_deletion_fences'::regclass,'app_private.qa_owned_native_anchor'::regclass,'app_private.qa_owned_native_frames'::regclass,'app_private.qa_owned_native_effects'::regclass] LOOP
  IF (SELECT relowner FROM pg_class WHERE oid=t)<>'postgres'::regrole OR has_table_privilege('service_role',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN RAISE EXCEPTION 'private fence ACL drift' USING ERRCODE='55000';END IF;
 END LOOP;
 -- Preserve original FK actions; support only native exact-receipted effects.
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'auth.sessions'::regclass,'app_private.account_credential_state'::regclass) AND NOT tgisinternal AND tgfoid NOT IN ('app_private.qa_owned_native_root()'::regprocedure,'app_private.qa_owned_native_close()'::regprocedure,'app_private.qa_owned_fence_before_row()'::regprocedure)) THEN RAISE EXCEPTION 'unattested Auth native callback' USING ERRCODE='55000';END IF;
END $$;
CREATE FUNCTION app_private.qa_owned_fence_catalog_attested() RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM app_private.qa_owned_fence_catalog_closed();PERFORM app_private.qa_owned_native_gateway();RETURN true;END $$;
CREATE FUNCTION app_private.qa_owned_ownership_digest(p_run uuid,p_source uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;o app_private.qa_owned_operations%rowtype;m app_private.qa_account_manifest%rowtype;u jsonb;p jsonb;
BEGIN
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source;
 SELECT * INTO STRICT o FROM app_private.qa_owned_operations WHERE run_id=s.run_id AND operation_id=s.create_operation;
 -- Immutable private persisted manifest receipt survives exact phase deletion.
 -- Prepare separately verifies every corresponding live full row.
 SELECT (jsonb_populate_record(NULL::app_private.qa_account_manifest,r.full_row)).* INTO STRICT m
 FROM app_private.qa_owned_resources r WHERE r.run_id=s.run_id AND r.source_id=s.source_id AND r.table_oid='app_private.qa_account_manifest'::regclass
 AND r.pk=jsonb_build_object('user_id',s.user_id) AND r.row_digest=encode(sha256(convert_to(r.full_row::text,'UTF8')),'hex');
 SELECT plan_payload INTO STRICT p FROM app_private.qa_owned_run_receipts WHERE run_id=s.run_id;
 u:=s.auth_projection;
 IF s.state<>'tested' OR s.user_id IS NULL OR s.user_id='0a1df502-9232-4ef5-af2d-df585ad7f187' OR s.source->>'canonicalKey'='faisal'
 OR s.source->>'kind' NOT IN ('owned-load-qa','owned-role-e2e')
 OR o.scope<>'create' OR o.state<>'completed' OR o.actual<>'fulfilled' OR o.resource_key<>s.source_id::text
 OR u->>'id' IS DISTINCT FROM s.user_id::text OR u->>'email' IS DISTINCT FROM s.source->>'email'
 OR u->'metadata'->>'run_id' IS DISTINCT FROM s.run_id::text OR u->'metadata'->>'source_id' IS DISTINCT FROM s.source_id::text
 OR u->'metadata'->>'operation_id' IS DISTINCT FROM s.create_operation::text OR u->'metadata'->>'receipt_id' IS DISTINCT FROM s.creation_receipt::text
 OR (u->>'created_at')::timestamptz<o.reserved_at OR u->>'confirmed_at' IS NULL OR u->>'deleted_at' IS NOT NULL
 OR m.principal_class<>'current_owned_QA' OR m.run_id<>s.run_id OR m.canonical_key<>s.source->>'canonicalKey'
 OR m.owned_creation_operation<>s.create_operation OR m.owned_creation_receipt_id<>s.creation_receipt OR m.tombstoned_at IS NOT NULL
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'protectedUIDs') j WHERE j=s.user_id::text)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'protectedCanonicalKeys') j WHERE j=s.source->>'canonicalKey')
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'resources') j WHERE j=s.source)
 OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_resources r WHERE r.run_id=s.run_id AND r.source_id=s.source_id AND r.auth_get_digest=encode(sha256(convert_to(u::text,'UTF8')),'hex'))
 THEN RAISE EXCEPTION 'exact durable created/GET/manifest ownership denied' USING ERRCODE='42501';END IF;
 RETURN encode(sha256(convert_to(jsonb_build_object('run',s.run_id,'source',s.source_id,'uid',s.user_id,'canonical',m.canonical_key,'create_operation',s.create_operation,'creation_receipt',s.creation_receipt,'get_digest',encode(sha256(convert_to(u::text,'UTF8')),'hex'))::text,'UTF8')),'hex');
END $$;
CREATE FUNCTION app_private.qa_owned_protected_population_digest() RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE t oid;d text;rows jsonb;inventory jsonb:='{}';cols text;pred text;
BEGIN
 FOREACH t IN ARRAY app_private.qa_owned_fence_surfaces() LOOP
  -- Never materialize password/token/hash fields. Only nonsecret references and
  -- native structural fields enter the protected inventory digest.
  SELECT string_agg(format('%L,to_jsonb(x.%I)',a.attname,a.attname),',' ORDER BY a.attnum) INTO cols FROM pg_attribute a
  WHERE a.attrelid=t AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>ALL(ARRAY['token_hash','pass_hash','encrypted_password','token','refresh_token','access_token','secret','recovery_token','confirmation_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token']);
  pred:='NOT EXISTS(SELECT 1 FROM app_private.qa_owned_resources r WHERE r.table_oid=$1 AND to_jsonb(x) @> r.pk)';
  IF t='auth.users'::regclass THEN pred:='NOT EXISTS(SELECT 1 FROM app_private.qa_owned_sources s JOIN app_private.qa_owned_operations o ON o.run_id=s.run_id AND o.operation_id=s.create_operation WHERE s.user_id=x.id AND s.auth_projection->>''id''=s.user_id::text AND o.scope=''create'' AND o.state=''completed'' AND o.actual=''fulfilled'')';END IF;
  IF t='app_private.qa_runs'::regclass THEN pred:='NOT EXISTS(SELECT 1 FROM app_private.qa_owned_run_receipts r WHERE r.run_id=x.run_id)';END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(v ORDER BY v::text),''[]''::jsonb) FROM (SELECT jsonb_build_object(%s) v FROM %s x WHERE %s) q',cols,t::regclass,pred) INTO rows USING t;
  inventory:=inventory||jsonb_build_object(t::regclass::text,encode(sha256(convert_to(rows::text,'UTF8')),'hex'));
 END LOOP;
 RETURN encode(sha256(convert_to(inventory::text,'UTF8')),'hex');
END $$;
CREATE FUNCTION app_private.qa_owned_fence_row_touches(p_table oid,p_row jsonb,p_source uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;a record;fk record;r record;matched boolean;pred text;ref jsonb;field text;val text;
BEGIN
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE source_id=p_source;
 FOR a IN SELECT attname,atttypid FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND NOT attisdropped LOOP
  IF a.atttypid='uuid'::regtype AND p_row->>a.attname IN (s.user_id::text,s.run_id::text) THEN RETURN true;END IF;
  IF a.attname=ANY(ARRAY['canonical_key','alias','login_alias','login_username','preferred_login','internal_email','email','login_name','target_login_name','responsible_login_name','from_login_name','to_login_name','requested_by_login_name','decided_by_login_name','legacy_username'])
  AND p_row->>a.attname IN (s.source->>'canonicalKey',s.source->>'loginAlias',s.source->>'email') THEN RETURN true;END IF;
 END LOOP;

 -- Only exact declared canonical workspace/import columns carry references.
 -- Display text, arbitrary metadata and gate hashes are never projected.
 IF (p_table=to_regclass('public.workspace_edits') AND p_row->>'actor' IN (s.user_id::text,s.source->>'canonicalKey',s.source->>'loginAlias'))
 OR (p_table=to_regclass('public.legacy_archive') AND p_row->>'source_key' IN (s.user_id::text,s.source->>'canonicalKey',s.source->>'loginAlias')) THEN RETURN true;END IF;
 FOR ref IN SELECT e.value FROM jsonb_path_query(coalesce(CASE WHEN p_table=to_regclass('public.workspace_edits') THEN p_row->'operations' WHEN p_table=to_regclass('public.legacy_archive') THEN p_row->'payload' ELSE NULL END,'null'::jsonb),'$.** ? (@.type() == "object")') o
 CROSS JOIN LATERAL jsonb_each(o) e WHERE e.key=ANY(ARRAY['id','user_id','target_user','actor_user','target_user_id','actor_user_id','owner_id','run_id','source_id','canonical_key','login_alias','login_username','preferred_login','internal_email','email','login_name','actor_login','target_login_name','transaction_id','session_id','notification_id','audit_id','assignment_id','action_id','request_id','route_id','operation_id']) LOOP
  IF ref IN (to_jsonb(s.user_id::text),to_jsonb(s.run_id::text),to_jsonb(s.source_id::text),to_jsonb(s.source->>'canonicalKey'),to_jsonb(s.source->>'loginAlias'),to_jsonb(s.source->>'email'))
  OR EXISTS(SELECT 1 FROM app_private.qa_owned_deletions d WHERE d.source_id=s.source_id AND ref=to_jsonb(d.operation_id::text))
  THEN RETURN true;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM app_private.qa_owned_resources r CROSS JOIN LATERAL jsonb_path_query(coalesce(CASE WHEN p_table=to_regclass('public.workspace_edits') THEN p_row->'operations' WHEN p_table=to_regclass('public.legacy_archive') THEN p_row->'payload' ELSE NULL END,'null'::jsonb),'$.** ? (@.type() == "object")') o WHERE r.source_id=s.source_id AND o @> r.pk) THEN RETURN true;END IF;
 -- Exact declared typed JSON references only; free text/secret fields are not authority.
 FOREACH field IN ARRAY ARRAY['target_user_id','to_user_id','actor_login','to_login','responsible_login_name','targets','action_id','request_id','forwarded_from_request','route_id','reply_route_id','source_route_id','reply_to_route_id','operation_id'] LOOP
  ref:=p_row->'meta'->field;
  IF ref IN (to_jsonb(s.user_id::text),to_jsonb(s.run_id::text),to_jsonb(s.source->>'canonicalKey'),to_jsonb(s.source->>'loginAlias')) OR (field='targets' AND jsonb_typeof(ref)='array' AND (ref @> jsonb_build_array(s.source->>'loginAlias') OR ref @> jsonb_build_array(s.user_id))) THEN RETURN true;END IF;
 END LOOP;
 IF p_row->>'entity_type' IN ('user','account') AND p_row->>'entity_id' IN (s.user_id::text,s.source->>'canonicalKey') THEN RETURN true;END IF;
 FOR fk IN SELECT conrelid,confrelid,conkey,confkey FROM pg_constraint WHERE contype='f' AND conrelid=p_table LOOP
  FOR r IN SELECT table_oid,full_row FROM app_private.qa_owned_resources WHERE source_id=s.source_id AND table_oid=fk.confrelid LOOP
   SELECT bool_and(p_row->ca.attname IS NOT NULL AND p_row->ca.attname<>'null'::jsonb AND p_row->ca.attname=r.full_row->pa.attname) INTO matched
   FROM unnest(fk.conkey,fk.confkey) k(c,p) JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=k.c JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=k.p;
   IF matched THEN RETURN true;END IF;
  END LOOP;
 END LOOP;
 FOR r IN SELECT table_oid,pk FROM app_private.qa_owned_resources WHERE source_id=s.source_id LOOP
  FOREACH field IN ARRAY ARRAY['transaction_id','session_id','notification_id','audit_id','assignment_id','action_id','request_id','route_id','operation_id'] LOOP
   IF p_row->>field IS NOT NULL AND r.pk->>'id'=p_row->>field THEN RETURN true;END IF;
   IF p_row->'meta'->>field IS NOT NULL AND r.pk->>'id'=p_row->'meta'->>field THEN RETURN true;END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM app_private.qa_owned_deletions d WHERE d.source_id=s.source_id AND (p_row->>'operation_id'=d.operation_id::text OR p_row->'meta'->>'operation_id'=d.operation_id::text)) THEN RETURN true;END IF;
 RETURN false;
END $$;
CREATE FUNCTION app_private.qa_owned_fence_check(p_table oid,p_op text,p_old jsonb,p_new jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s record;active boolean;f app_private.qa_owned_frames%rowtype;refs jsonb;row jsonb;
BEGIN
 row:=CASE WHEN p_op='DELETE' THEN p_old ELSE p_new END;
 -- Candidate index projection is explicit/nonsecret and never a permission grant.
 SELECT coalesce(jsonb_agg(v),'[]'::jsonb) INTO refs FROM (
  SELECT row->a.attname AS v FROM pg_attribute a WHERE a.attrelid=p_table AND a.attnum>0 AND NOT a.attisdropped AND (a.atttypid='uuid'::regtype OR a.attname=ANY(ARRAY['canonical_key','alias','login_alias','login_username','preferred_login','internal_email','email','login_name','target_login_name','responsible_login_name','from_login_name','to_login_name','requested_by_login_name','decided_by_login_name','entity_id','legacy_username']))
  UNION ALL SELECT v FROM jsonb_path_query(coalesce(row->'meta','{}'::jsonb)-ARRAY['name','response','reason','old_subject','new_subject','detail'],'$.** ? (@.type() == "string")') v
  UNION ALL SELECT z.r->a.attname FROM (VALUES (row),(CASE WHEN p_op='UPDATE' THEN p_old END)) z(r) JOIN pg_attribute a ON a.attrelid=p_table AND a.attnum>0 AND NOT a.attisdropped AND (a.atttypid='uuid'::regtype OR a.attname=ANY(ARRAY['canonical_key','login_alias','login_username','preferred_login','internal_email','email','login_name']))
  UNION ALL SELECT z.r->'actor' FROM (VALUES (row),(CASE WHEN p_op='UPDATE' THEN p_old END)) z(r) WHERE p_table=to_regclass('public.workspace_edits')
  UNION ALL SELECT z.r->'source_key' FROM (VALUES (row),(CASE WHEN p_op='UPDATE' THEN p_old END)) z(r) WHERE p_table=to_regclass('public.legacy_archive')
  UNION ALL SELECT e.value FROM (VALUES (row),(CASE WHEN p_op='UPDATE' THEN p_old END)) z(r)
  CROSS JOIN LATERAL jsonb_path_query(coalesce(CASE WHEN p_table=to_regclass('public.workspace_edits') THEN z.r->'operations' WHEN p_table=to_regclass('public.legacy_archive') THEN z.r->'payload' END,'null'::jsonb),'$.** ? (@.type() == "object")') o
  CROSS JOIN LATERAL jsonb_each(o) e WHERE e.key=ANY(ARRAY['id','user_id','target_user','actor_user','target_user_id','actor_user_id','owner_id','run_id','source_id','canonical_key','login_alias','login_username','preferred_login','internal_email','email','login_name','actor_login','target_login_name','transaction_id','session_id','notification_id','audit_id','assignment_id','action_id','request_id','route_id','operation_id'])
 ) q;
 FOR s IN SELECT x.source_id,x.user_id FROM app_private.qa_owned_sources x WHERE x.user_id IS NOT NULL AND (refs ? x.user_id::text OR refs ? x.run_id::text OR refs ? (x.source->>'canonicalKey') OR refs ? (x.source->>'loginAlias') OR refs ? (x.source->>'email')
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_resources r WHERE r.source_id=x.source_id AND refs ? (r.pk->>'id'))
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_deletions d WHERE d.source_id=x.source_id AND refs ? d.operation_id::text)
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_resources rr CROSS JOIN LATERAL jsonb_path_query(coalesce(CASE WHEN p_table=to_regclass('public.workspace_edits') THEN jsonb_build_array(row->'operations',p_old->'operations') WHEN p_table=to_regclass('public.legacy_archive') THEN jsonb_build_array(row->'payload',p_old->'payload') END,'null'::jsonb),'$.** ? (@.type() == "object")') ob WHERE rr.source_id=x.source_id AND ob @> rr.pk)) ORDER BY x.user_id LOOP
  IF NOT app_private.qa_owned_fence_row_touches(p_table,CASE WHEN p_op='DELETE' THEN p_old ELSE p_new END,s.source_id) AND (p_op<>'UPDATE' OR NOT app_private.qa_owned_fence_row_touches(p_table,p_old,s.source_id)) THEN CONTINUE;END IF;
  -- A stale MVCC snapshot must never bypass an unseen fence. Reject only owned
  -- dependencies at stronger isolation; unrelated ordinary producers are unchanged.
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'owned fence stale snapshot isolation denied' USING ERRCODE='40001';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(s.user_id::text,704927));
  -- VOLATILE SQL after lock wait obtains a current READ COMMITTED snapshot.
  SELECT EXISTS(SELECT 1 FROM app_private.qa_owned_deletion_fences WHERE target_user_id=s.user_id) INTO active;
  IF NOT active THEN CONTINUE;END IF;
  IF app_private.qa_owned_native_valid(p_table,p_op,p_old,p_new) THEN CONTINUE;END IF;
  IF p_op='DELETE' THEN
   SELECT * INTO f FROM app_private.qa_owned_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id();
   IF FOUND AND f.phase='dispose' AND f.source_id=s.source_id AND f.source_oid='public.qa_owned_dispose_internal(uuid,uuid)'::regprocedure
   AND f.effect_state='armed' AND f.effect_table=p_table AND f.effect_op='DELETE' AND f.effect_old=p_old AND f.effect_new IS NULL THEN
    PERFORM app_private.qa_owned_finalize_proof(f.run_id,f.source_id);CONTINUE;
   END IF;
  END IF;
  RAISE EXCEPTION 'durable owned deletion fence rejects dependency on %',s.user_id USING ERRCODE='42501';
 END LOOP;
END $$;
CREATE FUNCTION app_private.qa_owned_fence_before_row() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE oldj jsonb;newj jsonb;
BEGIN
 IF TG_RELID='auth.users'::regclass THEN
  IF TG_OP IN ('UPDATE','DELETE') THEN oldj:=jsonb_build_object('id',OLD.id,'email',OLD.email);END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN newj:=jsonb_build_object('id',NEW.id,'email',NEW.email);END IF;
 ELSIF TG_RELID='auth.sessions'::regclass THEN
  IF TG_OP IN ('UPDATE','DELETE') THEN oldj:=jsonb_build_object('id',OLD.id,'user_id',OLD.user_id,'created_at',OLD.created_at,'not_after',OLD.not_after);END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN newj:=jsonb_build_object('id',NEW.id,'user_id',NEW.user_id,'created_at',NEW.created_at,'not_after',NEW.not_after);END IF;
 ELSE
  IF TG_OP IN ('UPDATE','DELETE') THEN oldj:=to_jsonb(OLD);END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN newj:=to_jsonb(NEW);END IF;
 END IF;
 PERFORM app_private.qa_owned_fence_check(TG_RELID,TG_OP,oldj,newj);
 IF app_private.qa_owned_native_consume(TG_RELID,TG_OP,oldj,newj) THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE FUNCTION app_private.qa_owned_delete_receipt(p_operation uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN status='completed' THEN completed_receipt ELSE jsonb_build_object('operation_id',operation_id,'run_id',run_id,'target_user_id',target_user_id,'canonical_key',canonical_key,'generation',generation,'status',status,'ownership_receipt_digest',ownership_receipt_digest,'protected_snapshot_digest',protected_snapshot_digest,'prepared_at',prepared_at,'auth_readback_digest',auth_readback_digest) END
 FROM app_private.qa_owned_deletions WHERE operation_id=p_operation
$$;
CREATE FUNCTION public.qa_owned_delete_prepare_internal(p_run uuid,p_source uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.qa_owned_sources%rowtype;d app_private.qa_owned_deletions%rowtype;digest text;u jsonb;
BEGIN
 PERFORM app_private.qa_owned_service();PERFORM app_private.qa_owned_fence_catalog_closed();
 SELECT * INTO STRICT s FROM app_private.qa_owned_sources WHERE run_id=p_run AND source_id=p_source;
 IF current_setting('transaction_isolation')<>'read committed' OR s.user_id IS NULL THEN RAISE EXCEPTION 'prepare target/isolation denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.user_id::text,704927));
 SELECT * INTO d FROM app_private.qa_owned_deletions WHERE target_user_id=s.user_id OR canonical_key=s.source->>'canonicalKey' OR operation_id=p_operation;
 IF FOUND THEN
  IF d.operation_id<>p_operation OR d.source_id<>p_source OR d.run_id<>p_run OR d.target_user_id<>s.user_id OR d.canonical_key<>s.source->>'canonicalKey' THEN RAISE EXCEPTION 'frozen operation/generation cannot be replaced' USING ERRCODE='42501';END IF;
  RETURN app_private.qa_owned_delete_receipt(p_operation);
 END IF;
 PERFORM app_private.qa_owned_native_gateway();
 digest:=app_private.qa_owned_ownership_digest(p_run,p_source);
 SELECT jsonb_build_object('id',id,'email',email,'metadata',raw_user_meta_data,'app_metadata',raw_app_meta_data,'created_at',created_at,'confirmed_at',email_confirmed_at,'banned_until',banned_until,'deleted_at',deleted_at) INTO u FROM auth.users WHERE id=s.user_id;
 IF u IS DISTINCT FROM s.auth_projection THEN RAISE EXCEPTION 'prepare persisted Auth GET drift' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_owned_verify_rows(p_run,p_source);PERFORM app_private.qa_owned_closure(p_run,p_source);
 INSERT INTO app_private.qa_owned_deletions(operation_id,run_id,source_id,target_user_id,canonical_key,generation,status,ownership_receipt_digest,protected_snapshot_digest)
 VALUES(p_operation,p_run,p_source,s.user_id,s.source->>'canonicalKey',1,'delete_prepared',digest,app_private.qa_owned_protected_population_digest());
 INSERT INTO app_private.qa_owned_deletion_fences VALUES(s.user_id,s.source->>'canonicalKey',p_run,p_operation,1);
 PERFORM app_private.qa_owned_native_capture(p_operation);
 RETURN app_private.qa_owned_delete_receipt(p_operation);
END $$;
CREATE FUNCTION public.qa_owned_delete_read_internal(p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN PERFORM app_private.qa_owned_service();j:=app_private.qa_owned_delete_receipt(p_operation);IF j IS NULL THEN RAISE EXCEPTION 'unknown owned delete operation' USING ERRCODE='42501';END IF;RETURN j;END $$;
CREATE FUNCTION public.qa_owned_delete_transition_internal(p_operation uuid,p_generation bigint,p_status text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d app_private.qa_owned_deletions%rowtype;
BEGIN
 PERFORM app_private.qa_owned_service();SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE operation_id=p_operation FOR UPDATE;
 IF d.generation<>p_generation OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_deletion_fences WHERE operation_id=p_operation AND generation=p_generation)
 OR NOT ((d.status='delete_prepared' AND p_status='auth_delete_in_flight') OR (d.status='auth_delete_in_flight' AND p_status='auth_delete_unknown'))
 THEN RAISE EXCEPTION 'delete dispatch no retry/transition denied' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_owned_deletions SET status=p_status WHERE operation_id=p_operation;
 RETURN app_private.qa_owned_delete_receipt(p_operation);
END $$;
CREATE FUNCTION public.qa_owned_delete_absence_internal(p_operation uuid,p_generation bigint,p_uid uuid,p_readback_digest text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d app_private.qa_owned_deletions%rowtype;
BEGIN
 PERFORM app_private.qa_owned_service();SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE operation_id=p_operation FOR UPDATE;
 IF d.generation<>p_generation OR d.target_user_id<>p_uid OR p_readback_digest IS NULL OR p_readback_digest!~'^[0-9a-f]{64}$'
 OR d.status NOT IN ('auth_delete_in_flight','auth_delete_unknown','db_finalize_pending')
 OR EXISTS(SELECT 1 FROM auth.users WHERE id=p_uid) OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=p_uid)
 OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_deletion_fences WHERE operation_id=p_operation AND generation=p_generation AND target_user_id=p_uid)
 THEN RAISE EXCEPTION 'trusted readback and independent native absence required' USING ERRCODE='42501';END IF;
 IF d.status='db_finalize_pending' AND d.auth_readback_digest IS DISTINCT FROM p_readback_digest THEN RAISE EXCEPTION 'frozen absence readback drift' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_owned_deletions SET status='db_finalize_pending',auth_readback_digest=p_readback_digest,absence_observed_at=coalesce(absence_observed_at,clock_timestamp()) WHERE operation_id=p_operation;
 RETURN app_private.qa_owned_delete_receipt(p_operation);
END $$;
CREATE FUNCTION app_private.qa_owned_finalize_proof(p_run uuid,p_source uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d app_private.qa_owned_deletions%rowtype;
BEGIN
 SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE run_id=p_run AND source_id=p_source;
 IF d.status<>'db_finalize_pending' OR d.auth_readback_digest IS NULL OR d.absence_observed_at IS NULL
 OR d.native_root_receipt IS NULL OR d.native_root_receipt->>'operation_id' IS DISTINCT FROM d.operation_id::text OR d.native_root_receipt->>'generation' IS DISTINCT FROM d.generation::text OR d.native_root_receipt->>'target_user_id' IS DISTINCT FROM d.target_user_id::text
 OR d.native_root_receipt->>'source_oid' IS DISTINCT FROM ('app_private.qa_owned_native_root()'::regprocedure::oid)::text OR d.native_root_receipt->>'closure' IS DISTINCT FROM 'all_exact_native_effects_observed'
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_native_effects WHERE operation_id=d.operation_id AND generation=d.generation AND (effect_state<>'observed' OR observed_xid IS NULL OR guard_oid IS NULL))
 OR EXISTS(SELECT 1 FROM app_private.qa_owned_native_frames WHERE operation_id=d.operation_id AND generation=d.generation)
 OR NOT EXISTS(SELECT 1 FROM app_private.qa_owned_deletion_fences f WHERE (f.operation_id,f.generation,f.target_user_id,f.canonical_key,f.run_id)=(d.operation_id,d.generation,d.target_user_id,d.canonical_key,d.run_id))
 OR EXISTS(SELECT 1 FROM auth.users WHERE id=d.target_user_id) OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=d.target_user_id)
 OR app_private.qa_owned_ownership_digest(p_run,p_source)<>d.ownership_receipt_digest
 OR app_private.qa_owned_protected_population_digest()<>d.protected_snapshot_digest
 THEN RAISE EXCEPTION 'exact finalize fence/absence/ownership/protected proof denied' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION public.qa_owned_delete_finalize_internal(p_operation uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE d app_private.qa_owned_deletions%rowtype;j jsonb;
BEGIN
 PERFORM app_private.qa_owned_service();PERFORM app_private.qa_owned_fence_catalog_closed();
 SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE operation_id=p_operation;
 IF d.generation<>p_generation OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'finalize generation/isolation denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(d.target_user_id::text,704927));
 SELECT * INTO STRICT d FROM app_private.qa_owned_deletions WHERE operation_id=p_operation FOR UPDATE;
 IF d.status='completed' THEN RETURN d.completed_receipt;END IF;
 PERFORM app_private.qa_owned_finalize_proof(d.run_id,d.source_id);
 PERFORM public.qa_owned_dispose_internal(d.run_id,d.source_id);
 PERFORM public.qa_owned_absence_internal(d.run_id,d.source_id);
 IF app_private.qa_owned_protected_population_digest()<>d.protected_snapshot_digest THEN RAISE EXCEPTION 'final full protected readback drift' USING ERRCODE='42501';END IF;
 j:=app_private.qa_owned_delete_receipt(p_operation)||jsonb_build_object('status','completed','db_absent',true,'auth_absent',true);
 UPDATE app_private.qa_owned_deletions SET status='completed',completed_receipt=j WHERE operation_id=p_operation;
 -- Last mutation of finalization, atomically visible with completed receipt at COMMIT.
 DELETE FROM app_private.qa_owned_deletion_fences WHERE operation_id=p_operation AND generation=p_generation;
 RETURN j;
END $$;
DO $compose$
DECLARE d text;needle text;r oid;
BEGIN
 d:=pg_get_functiondef('app_private.qa_reference_guard_before_row()'::regprocedure);
 needle:=' -- One exact password effect: missing frame follows every normal guard.';
 IF position(needle IN d)=0 OR position('app_private.qa_owned_consume' IN d)=0 OR position('app_private.qa_owned_fence_check' IN d)>0 THEN RAISE EXCEPTION 'fence requires exact owned final205 predecessor' USING ERRCODE='55000';END IF;
 EXECUTE replace(d,needle,' PERFORM app_private.qa_owned_fence_check(TG_RELID,TG_OP,CASE WHEN TG_OP IN (''UPDATE'',''DELETE'') THEN to_jsonb(OLD) END,CASE WHEN TG_OP IN (''INSERT'',''UPDATE'') THEN to_jsonb(NEW) END);'||chr(10)||' IF app_private.qa_owned_native_consume(TG_RELID,TG_OP,CASE WHEN TG_OP IN (''UPDATE'',''DELETE'') THEN to_jsonb(OLD) END,CASE WHEN TG_OP IN (''INSERT'',''UPDATE'') THEN to_jsonb(NEW) END) THEN IF TG_OP=''DELETE'' THEN RETURN OLD;END IF;RETURN NEW;END IF;'||chr(10)||needle);
 -- Exact forward catalog composition for the three newly guarded private
 -- surfaces. No generic callback exception; the actual guard attachment shape
 -- is independently checked by qa_owned_fence_catalog_closed before admission.
 d:=pg_get_functiondef('app_private.qa_pw_frame_catalog_closed()'::regprocedure);
 needle:='WHERE tgrelid=''app_private.qa_password_frames''::regclass)<>1';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'password catalog composer predecessor drift' USING ERRCODE='55000';END IF;
 EXECUTE replace(d,needle,'WHERE tgrelid=''app_private.qa_password_frames''::regclass AND tgfoid<>''app_private.qa_owned_fence_before_row()''::regprocedure)<>1');
 d:=pg_get_functiondef('app_private.qa_delete_catalog_closed()'::regprocedure);
 needle:='WHERE tgrelid=''app_private.qa_sql_operation_context''::regclass)<>1';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'context catalog composer predecessor drift' USING ERRCODE='55000';END IF;
 d:=replace(d,needle,'WHERE tgrelid=''app_private.qa_sql_operation_context''::regclass AND tgfoid<>''app_private.qa_owned_fence_before_row()''::regprocedure)<>1');
 needle:='(tgfoid=''app_private.transaction_revision_before()''::regprocedure::oid';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'graph catalog composer predecessor drift' USING ERRCODE='55000';END IF;
 d:=replace(d,needle,'(tgfoid=''app_private.qa_owned_fence_before_row()''::regprocedure::oid AND tgtype=31 AND tgrelid=''app_private.transaction_read_state''::regclass) OR'||chr(10)||needle);
 needle:='(t.tgrelid=''app_private.qa_password_frames''::regclass AND t.tgfoid=''app_private.qa_pw_commit_closed()''::regprocedure::oid)';
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'native closure catalog composer predecessor drift' USING ERRCODE='55000';END IF;
 d:=replace(d,needle,needle||' OR (t.tgrelid=''app_private.qa_owned_native_frames''::regclass AND t.tgfoid=''app_private.qa_owned_native_close()''::regprocedure::oid AND t.tgtype=5 AND t.tginitdeferred AND t.tgenabled=''O'' AND t.tgqual IS NULL AND t.tgnargs=0 AND t.tgattr=''''::int2vector AND t.tgname=''00_qa_owned_native_close'')');
 EXECUTE d;
 FOREACH r IN ARRAY app_private.qa_owned_fence_surfaces() LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=r AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure) THEN
   EXECUTE format('CREATE TRIGGER qa_owned_deletion_fence BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.qa_owned_fence_before_row()',r::regclass);
  END IF;
 END LOOP;
END $compose$;
DO $acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT oid::regprocedure f,pronamespace='public'::regnamespace exposed FROM pg_proc WHERE proname IN ('qa_owned_fence_surfaces','qa_owned_fence_catalog_closed','qa_owned_fence_catalog_attested','qa_owned_ownership_digest','qa_owned_protected_population_digest','qa_owned_fence_row_touches','qa_owned_fence_check','qa_owned_fence_before_row','qa_owned_delete_receipt','qa_owned_delete_prepare_internal','qa_owned_delete_read_internal','qa_owned_delete_transition_internal','qa_owned_delete_absence_internal','qa_owned_finalize_proof','qa_owned_delete_finalize_internal','qa_owned_native_catalog_digest','qa_owned_native_gateway','qa_owned_native_capture','qa_owned_native_valid','qa_owned_native_consume','qa_owned_native_root','qa_owned_native_close','qa_owned_native_resource_row') AND pronamespace IN ('public'::regnamespace,'app_private'::regnamespace) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',r.f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.f);IF r.exposed THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.f);END IF;
 END LOOP;
END $acl$;
CREATE TRIGGER qa_owned_auth_root BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION app_private.qa_owned_native_root();
CREATE CONSTRAINT TRIGGER "00_qa_owned_native_close" AFTER INSERT ON app_private.qa_owned_native_frames DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.qa_owned_native_close();
INSERT INTO app_private.qa_owned_native_anchor(id,gateway_oid,catalog_digest,gateway_metadata) VALUES(1,NULL,app_private.qa_owned_native_catalog_digest(),NULL);
SELECT app_private.qa_owned_fence_catalog_closed();
COMMIT;
