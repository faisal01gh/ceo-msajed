-- Server-only candidate transport. Offline review required; activation barrier retained.
BEGIN;
-- Private transactional password execution frame. Not classification authority.
CREATE TABLE app_private.qa_password_frames(
 backend_pid integer NOT NULL,sql_xid xid8 NOT NULL,entry_oid oid NOT NULL,
 operation_id uuid NOT NULL,phase text NOT NULL CHECK(phase IN ('begin','finish','fail','unknown','observe','dispatch')),
 actor_uid uuid NOT NULL,actor_sid uuid NOT NULL,target_uid uuid NOT NULL,canonical_key text NOT NULL,
 generation bigint NOT NULL,kind text NOT NULL CHECK(kind IN ('change','reset')),control jsonb NOT NULL,
 native_created_at timestamptz NOT NULL,native_not_after timestamptz,
 actor_cutoff timestamptz,target_cutoff timestamptz,
 sequence integer NOT NULL DEFAULT 0,state text NOT NULL DEFAULT 'admitted' CHECK(state IN ('admitted','armed','consumed')),
 effect_table oid,effect_op text,effect_old jsonb,effect_new jsonb,
 PRIMARY KEY(backend_pid,sql_xid));
ALTER TABLE app_private.qa_password_frames OWNER TO postgres;
REVOKE ALL ON app_private.qa_password_frames FROM PUBLIC,anon,authenticated,service_role;

-- Native INSERT-event closure: no private frame can commit, including a future
-- producer regression omitting close. Forced IMMEDIATE while active fails55000.
CREATE FUNCTION app_private.qa_pw_commit_closed() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_RELID<>'app_private.qa_password_frames'::regclass OR TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_OP<>'INSERT'
 OR NEW.backend_pid<>pg_backend_pid() OR NEW.sql_xid<>pg_current_xact_id()
 OR EXISTS(SELECT 1 FROM app_private.qa_password_frames WHERE backend_pid=NEW.backend_pid AND sql_xid=NEW.sql_xid)
 THEN RAISE EXCEPTION 'qa password unclosed frame at native callback' USING ERRCODE='55000';END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app_private.qa_pw_commit_closed() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_pw_commit_closed() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER qa_password_frame_completion AFTER INSERT ON app_private.qa_password_frames DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.qa_pw_commit_closed();
CREATE FUNCTION app_private.qa_pw_frame_catalog_closed() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('session_replication_role')<>'origin'
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='app_private.qa_password_frames'::regclass AND relkind='r' AND NOT relispartition AND relowner='postgres'::regrole)
 OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='app_private.qa_password_frames'::regclass OR inhparent='app_private.qa_password_frames'::regclass)
 OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='app_private.qa_password_frames'::regclass)
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='app_private.qa_password_frames'::regclass)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='app_private.qa_password_frames'::regclass AND NOT tgisinternal AND tgfoid='app_private.qa_pw_commit_closed()'::regprocedure AND tgtype=5 AND tgdeferrable AND tginitdeferred AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector)
 THEN RAISE EXCEPTION 'qa password frame callback catalog unsupported' USING ERRCODE='55000';END IF;
END $$;
ALTER FUNCTION app_private.qa_pw_frame_catalog_closed() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_pw_frame_catalog_closed() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.qa_pw_revalidate() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_password_frames%rowtype;a record;o app_private.account_password_operations%rowtype;
 target public.account_migration_users%rowtype;sr record;now_at timestamptz;uid uuid;m app_private.qa_account_manifest%rowtype;run app_private.qa_runs%rowtype;
BEGIN
 PERFORM app_private.qa_pw_frame_catalog_closed();
 SELECT * INTO STRICT f FROM app_private.qa_password_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id();
 SELECT * INTO a FROM app_private.qa_request_actor_read();
 IF NOT FOUND OR a.request_role<>'service_role' OR a.actor_user IS DISTINCT FROM f.actor_uid OR a.actor_session IS DISTINCT FROM f.actor_sid
 OR f.control->>'candidate_handle' IS DISTINCT FROM (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-qa-candidate-handle'
 OR f.entry_oid IS DISTINCT FROM (CASE f.phase WHEN 'begin' THEN 'public.account_password_begin_internal(uuid,uuid,text,text,uuid)'::regprocedure::oid WHEN 'finish' THEN 'public.account_password_finish_internal(uuid,bigint)'::regprocedure::oid WHEN 'fail' THEN 'public.account_password_fail_internal(uuid,text)'::regprocedure::oid WHEN 'unknown' THEN 'public.account_password_unknown_internal(uuid)'::regprocedure::oid WHEN 'observe' THEN 'public.account_password_begin_internal(uuid,uuid,text,text,uuid)'::regprocedure::oid WHEN 'dispatch' THEN 'public.qa_password_dispatch_internal(uuid,bigint,uuid)'::regprocedure::oid END)
 THEN RAISE EXCEPTION 'qa password frame identity' USING ERRCODE='42501';END IF;
 PERFORM r.run_id FROM app_private.qa_runs r WHERE r.run_id IN (SELECT x.run_id FROM app_private.qa_account_manifest x WHERE x.user_id IN(f.actor_uid,f.target_uid)) ORDER BY r.run_id FOR SHARE;
 PERFORM x.user_id FROM app_private.qa_run_members x WHERE x.run_id IN (SELECT m0.run_id FROM app_private.qa_account_manifest m0 WHERE m0.user_id IN(f.actor_uid,f.target_uid)) ORDER BY x.run_id,x.user_id FOR SHARE;
 now_at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s JOIN public.profiles p ON p.id=s.user_id JOIN public.account_migration_users am ON am.migrated_user_id=p.id AND am.eligible
 JOIN app_private.account_credential_state c ON c.user_id=p.id
 WHERE s.id=f.actor_sid AND s.user_id=f.actor_uid AND s.created_at IS NOT DISTINCT FROM f.native_created_at AND s.not_after IS NOT DISTINCT FROM f.native_not_after
 AND s.created_at<=now_at AND (s.not_after IS NULL OR s.not_after>now_at) AND p.active AND c.session_valid_after IS NOT DISTINCT FROM f.actor_cutoff)
 THEN RAISE EXCEPTION 'qa password native session/cutoff drift' USING ERRCODE='42501';END IF;
 SELECT * INTO target FROM public.account_migration_users WHERE canonical_key=f.canonical_key AND eligible AND migrated_user_id=f.target_uid;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id JOIN app_private.account_credential_state c ON c.user_id=p.id
 WHERE u.id=f.target_uid AND p.active AND u.email=target.internal_email AND u.email=f.control->>'provider_exact_email' AND c.session_valid_after IS NOT DISTINCT FROM f.target_cutoff)
 THEN RAISE EXCEPTION 'qa password target drift' USING ERRCODE='42501';END IF;
 FOREACH uid IN ARRAY ARRAY[f.actor_uid,f.target_uid] LOOP
  SELECT * INTO m FROM app_private.qa_account_manifest WHERE user_id=uid;
  IF f.control->>'principal_class'='ORDINARY' THEN
   IF FOUND THEN RAISE EXCEPTION 'qa password cohort drift' USING ERRCODE='42501';END IF;
  ELSE
   IF NOT FOUND OR m.principal_class<>'current_owned_QA' OR m.run_id IS DISTINCT FROM (f.control->>'run_id')::uuid OR m.tombstoned_at IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM public.account_migration_users am WHERE am.migrated_user_id=uid AND am.eligible AND am.canonical_key=m.canonical_key AND am.login_username=m.login_alias)
    OR (uid=f.target_uid AND m.owned_creation_receipt_id IS DISTINCT FROM (f.control->>'owned_creation_receipt_id')::uuid)
    OR NOT EXISTS(SELECT 1 FROM app_private.qa_run_members x JOIN public.user_roles ur ON ur.user_id=x.user_id AND ur.role_code=x.role_code WHERE x.run_id=m.run_id AND x.user_id=uid)
   THEN RAISE EXCEPTION 'qa password ownership drift' USING ERRCODE='42501';END IF;
   SELECT * INTO run FROM app_private.qa_runs WHERE run_id=m.run_id;
   IF NOT FOUND OR run.phase IN ('prepared','cleaning','cleaned') OR
    ( (f.phase='begin' OR (f.phase='dispatch' AND EXISTS(SELECT 1 FROM app_private.account_password_operations x WHERE x.operation_id=f.operation_id AND x.dispatch_state='prepared'))) AND (NOT run.active OR run.phase<>'active' OR run.expires_at<=now_at OR NOT EXISTS(SELECT 1 FROM app_private.qa_run_members x WHERE x.run_id=m.run_id AND x.user_id=uid AND x.active)))
    OR ((NOT run.active OR run.phase<>'active' OR run.expires_at<=now_at) AND NOT EXISTS(SELECT 1 FROM app_private.account_password_operations x WHERE x.operation_id=f.operation_id AND x.dispatch_token IS NOT NULL AND x.dispatch_admitted_at IS NOT NULL AND x.dispatch_state IN ('admitted','uncertain','completed','failed_definitive_no_write')))
   THEN RAISE EXCEPTION 'qa password lifecycle deny' USING ERRCODE='42501';END IF;
  END IF;
 END LOOP;
 IF f.kind='change' THEN
  IF f.actor_uid<>f.target_uid THEN RAISE EXCEPTION 'qa password change identity' USING ERRCODE='42501';END IF;
 ELSIF f.kind='reset' THEN
  IF f.canonical_key='faisal' OR f.target_uid='0a1df502-9232-4ef5-af2d-df585ad7f187'
   OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=f.actor_uid AND role_code='ceo_office_manager')
   OR NOT app_private.account_permission_effective(f.actor_uid,'profiles.admin_reset_password')
   THEN RAISE EXCEPTION 'qa password reset authority' USING ERRCODE='42501';END IF;
  IF f.actor_uid=f.target_uid AND (f.phase<>'begin' OR f.sequence>0) THEN
   -- Only this already-admitted own reset may continue its exact forced/cutoff
   -- effects. Initial sequence0 still requires ordinary ready office authority.
   -- No change to qa_session_live, business admission, or actor!=target reset.
   SELECT * INTO o FROM app_private.account_password_operations WHERE operation_id=f.operation_id;
   IF f.actor_cutoff IS DISTINCT FROM (CASE
      WHEN f.phase='begin' OR (f.phase='finish' AND f.sequence=1) OR (f.phase='fail' AND f.sequence BETWEEN 1 AND 3)
      THEN (f.control->>'target_session_cutoff')::timestamptz
      ELSE coalesce((o.qa_control->>'terminal_session_cutoff')::timestamptz,(f.control->>'target_session_cutoff')::timestamptz) END)
    OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.account_migration_users am ON am.migrated_user_id=p.id AND am.eligible
      WHERE p.id=f.actor_uid
      AND p.must_change_password IS NOT DISTINCT FROM (f.phase<>'begin' OR f.sequence>=2)
      AND am.must_change_password IS NOT DISTINCT FROM (f.phase<>'begin' OR f.sequence>=3))
   THEN RAISE EXCEPTION 'qa password own reset continuation drift' USING ERRCODE='42501';END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.account_migration_users am ON am.migrated_user_id=p.id AND am.eligible WHERE p.id=f.actor_uid AND NOT p.must_change_password AND NOT am.must_change_password)
    OR f.native_created_at<=f.actor_cutoff THEN RAISE EXCEPTION 'qa password reset authority' USING ERRCODE='42501';END IF;
  END IF;
 END IF;
 SELECT * INTO o FROM app_private.account_password_operations WHERE operation_id=f.operation_id;
 IF f.phase='begin' AND f.sequence<4 THEN
  IF FOUND THEN RAISE EXCEPTION 'qa password unexpected journal' USING ERRCODE='42501';END IF;
 ELSE
  IF NOT FOUND OR o.actor_id IS DISTINCT FROM f.actor_uid OR o.actor_session_id IS DISTINCT FROM f.actor_sid OR o.target_id IS DISTINCT FROM f.target_uid
   OR o.generation IS DISTINCT FROM f.generation OR o.kind IS DISTINCT FROM f.kind OR o.source<>'verified_session'
   OR (o.qa_control-ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at','terminal_session_cutoff']) IS DISTINCT FROM f.control
   OR (f.phase NOT IN ('begin','observe','dispatch') AND (o.dispatch_token IS NULL OR o.dispatch_admitted_at IS NULL OR o.dispatch_state NOT IN ('admitted','uncertain','completed','failed_definitive_no_write')))
  THEN RAISE EXCEPTION 'qa password original journal proof' USING ERRCODE='42501';END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app_private.account_credential_state c WHERE c.user_id=f.target_uid AND c.generation=CASE WHEN f.phase='begin' AND f.sequence=0 THEN f.generation-1 ELSE f.generation END)
 THEN RAISE EXCEPTION 'qa password generation drift' USING ERRCODE='42501';END IF;
END $$;

CREATE FUNCTION app_private.qa_pw_open(p_phase text,p_operation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.account_password_operations%rowtype;s auth.sessions%rowtype;ac timestamptz;tc timestamptz;entry oid;
BEGIN
 IF p_phase NOT IN ('finish','fail','unknown','observe','dispatch') THEN RAISE EXCEPTION 'qa invalid phase' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM app_private.account_password_operations WHERE operation_id=p_operation;
 IF NOT FOUND OR o.qa_control IS NULL OR o.source<>'verified_session' OR o.qa_control->>'original_session_created_at' IS NULL
 THEN RAISE EXCEPTION 'qa original evidence required' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_private_control_context(o.operation_id,(o.qa_control->>'run_id')::uuid,o.actor_id,o.actor_session_id,o.target_id,o.qa_control->>'canonical_key',NULL,o.generation);
 SELECT * INTO o FROM app_private.account_password_operations WHERE operation_id=p_operation;
 SELECT * INTO s FROM auth.sessions WHERE id=o.actor_session_id AND user_id=o.actor_id;
 IF NOT FOUND OR s.created_at IS DISTINCT FROM (o.qa_control->>'original_session_created_at')::timestamptz OR s.not_after IS DISTINCT FROM (o.qa_control->>'original_session_not_after')::timestamptz THEN RAISE EXCEPTION 'qa original SID changed' USING ERRCODE='42501';END IF;
 tc:=coalesce((o.qa_control->>'terminal_session_cutoff')::timestamptz,(o.qa_control->>'target_session_cutoff')::timestamptz);
 ac:=CASE WHEN o.actor_id=o.target_id THEN tc ELSE (o.qa_control->>'original_session_cutoff')::timestamptz END;
 entry:=CASE p_phase WHEN 'finish' THEN 'public.account_password_finish_internal(uuid,bigint)'::regprocedure::oid WHEN 'fail' THEN 'public.account_password_fail_internal(uuid,text)'::regprocedure::oid WHEN 'unknown' THEN 'public.account_password_unknown_internal(uuid)'::regprocedure::oid WHEN 'dispatch' THEN 'public.qa_password_dispatch_internal(uuid,bigint,uuid)'::regprocedure::oid ELSE 'public.account_password_begin_internal(uuid,uuid,text,text,uuid)'::regprocedure::oid END;
 INSERT INTO app_private.qa_password_frames(backend_pid,sql_xid,entry_oid,operation_id,phase,actor_uid,actor_sid,target_uid,canonical_key,generation,kind,control,native_created_at,native_not_after,actor_cutoff,target_cutoff)
 VALUES(pg_backend_pid(),pg_current_xact_id(),entry,o.operation_id,p_phase,o.actor_id,o.actor_session_id,o.target_id,o.qa_control->>'canonical_key',o.generation,o.kind,
 o.qa_control-ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at','terminal_session_cutoff'],s.created_at,s.not_after,ac,tc);
 PERFORM app_private.qa_pw_revalidate();
END $$;

CREATE FUNCTION app_private.qa_pw_consume(p_table oid,p_op text,p_old jsonb,p_new jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_password_frames%rowtype;n integer;
BEGIN
 SELECT * INTO f FROM app_private.qa_password_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF f.state<>'armed' OR f.effect_table IS DISTINCT FROM p_table OR f.effect_op IS DISTINCT FROM p_op OR f.effect_old IS DISTINCT FROM p_old OR f.effect_new IS DISTINCT FROM p_new
 THEN RAISE EXCEPTION 'qa password exact effect mismatch' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_pw_revalidate();
 UPDATE app_private.qa_password_frames SET state='consumed' WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid AND state='armed' AND sequence=f.sequence;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'qa password permit already consumed' USING ERRCODE='42501';END IF;
 RETURN true;
END $$;

CREATE FUNCTION app_private.qa_pw_audit_catalog_closed() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE observed jsonb;expected jsonb;seq oid;
BEGIN
 SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.attnotnull,a.attidentity::text,a.attgenerated::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) INTO observed
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.audit_log'::regclass AND a.attnum>0 AND NOT a.attisdropped;
 expected:=jsonb_build_array(jsonb_build_array('id','bigint',true,'a','',NULL),jsonb_build_array('actor_id','uuid',false,'','',NULL),jsonb_build_array('event_type','text',true,'','',NULL),jsonb_build_array('entity_type','text',true,'','',NULL),jsonb_build_array('entity_id','text',false,'','',NULL),jsonb_build_array('detail','text',false,'','',NULL),jsonb_build_array('meta','jsonb',true,'','','''{}''::jsonb'),jsonb_build_array('created_at','timestamp with time zone',true,'','','now()'));
 seq:=pg_get_serial_sequence('public.audit_log','id')::regclass;
 IF observed IS DISTINCT FROM expected OR seq IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid WHERE s.seqrelid=seq AND s.seqtypid='bigint'::regtype AND s.seqstart=1 AND s.seqincrement=1 AND s.seqmin=1 AND s.seqmax=9223372036854775807 AND s.seqcache=1 AND NOT s.seqcycle AND c.relowner='postgres'::regrole)
 OR NOT EXISTS(SELECT 1 FROM pg_depend d JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid WHERE d.classid='pg_class'::regclass AND d.objid=seq AND d.refclassid='pg_class'::regclass AND d.refobjid='public.audit_log'::regclass AND d.deptype='i' AND a.attname='id')
 THEN RAISE EXCEPTION 'qa password exact audit/identity catalog drift' USING ERRCODE='42501';END IF;
END $$;
ALTER FUNCTION app_private.qa_pw_audit_catalog_closed() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_pw_audit_catalog_closed() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.qa_pw_effect(p_table oid,p_patch jsonb,p_insert boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_password_frames%rowtype;oldrow jsonb;newrow jsonb;result jsonb;cols text;vals text;assigns text;pk text;pkval text;n integer;expected oid;expectedop text;changed text[];auditid bigint;
BEGIN
 SELECT * INTO STRICT f FROM app_private.qa_password_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() FOR UPDATE;
 IF f.state NOT IN ('admitted','consumed') THEN RAISE EXCEPTION 'qa password effect state' USING ERRCODE='42501';END IF;
 expected:=CASE f.phase
 WHEN 'begin' THEN (ARRAY['app_private.account_credential_state'::regclass::oid,'public.profiles'::regclass::oid,'public.account_migration_users'::regclass::oid,'app_private.account_password_operations'::regclass::oid])[f.sequence+1]
 WHEN 'finish' THEN (ARRAY['app_private.account_password_operations'::regclass::oid,'app_private.account_credential_state'::regclass::oid,'public.profiles'::regclass::oid,'public.account_migration_users'::regclass::oid,'app_private.account_password_operations'::regclass::oid,'public.audit_log'::regclass::oid])[f.sequence+1]
 WHEN 'fail' THEN (ARRAY['app_private.account_password_operations'::regclass::oid,'public.profiles'::regclass::oid,'public.account_migration_users'::regclass::oid,'app_private.account_credential_state'::regclass::oid,'public.audit_log'::regclass::oid])[f.sequence+1]
 WHEN 'unknown' THEN CASE WHEN f.sequence=0 THEN 'app_private.account_password_operations'::regclass::oid END WHEN 'dispatch' THEN CASE WHEN f.sequence=0 THEN 'app_private.account_password_operations'::regclass::oid END END;
 expectedop:=CASE WHEN (f.phase='begin' AND f.sequence=3) OR p_table='public.audit_log'::regclass THEN 'INSERT' ELSE 'UPDATE' END;
 IF expected IS NULL OR p_table<>expected OR p_insert IS DISTINCT FROM (expectedop='INSERT') OR jsonb_typeof(p_patch)<>'object'
 THEN RAISE EXCEPTION 'qa password phase effect sequence' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_pw_revalidate();
 -- Plain, non-partitioned, rule-free surfaces; no later row writer/suppressor.
 IF current_setting('session_replication_role')<>'origin' OR EXISTS(SELECT 1 FROM pg_class WHERE oid=p_table AND (relkind<>'r' OR relispartition))
 OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=p_table) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=p_table OR inhparent=p_table)
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=p_table AND (tgenabled<>'O' OR (NOT tgisinternal AND tgfoid<>coalesce(to_regprocedure('app_private.qa_reference_guard_before_row()')::oid,0))))
 THEN RAISE EXCEPTION 'qa password effect catalog unsupported' USING ERRCODE='55000';END IF;
 IF p_table IN ('public.profiles'::regclass,'public.account_migration_users'::regclass,'public.audit_log'::regclass) AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=p_table AND NOT tgisinternal AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure AND tgtype=31 AND tgenabled='O' AND tgqual IS NULL)
 THEN RAISE EXCEPTION 'qa password final guard absent' USING ERRCODE='55000';END IF;
 pk:=CASE p_table WHEN 'public.profiles'::regclass THEN 'id' WHEN 'public.account_migration_users'::regclass THEN 'canonical_key' WHEN 'app_private.account_credential_state'::regclass THEN 'user_id' WHEN 'app_private.account_password_operations'::regclass THEN 'operation_id' ELSE 'id' END;
 pkval:=CASE WHEN pk='canonical_key' THEN f.canonical_key WHEN pk='operation_id' THEN f.operation_id::text ELSE f.target_uid::text END;
 IF NOT p_insert THEN
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE %I::text=$1 FOR UPDATE',p_table::regclass,pk) INTO STRICT oldrow USING pkval;
  newrow:=oldrow||p_patch;
 ELSE
  newrow:=p_patch;
 END IF;
 -- Closed producer schemas, not arbitrary patches even inside a trusted frame.
 changed:=CASE
 WHEN p_table='app_private.account_credential_state'::regclass THEN CASE WHEN f.phase='begin' THEN ARRAY['generation','session_valid_after'] ELSE ARRAY['session_valid_after'] END
 WHEN p_table='public.profiles'::regclass THEN ARRAY['must_change_password','updated_at']
 WHEN p_table='public.account_migration_users'::regclass THEN CASE WHEN f.phase='finish' THEN ARRAY['must_change_password','password_changed_at'] ELSE ARRAY['must_change_password'] END
 WHEN p_table='public.audit_log'::regclass THEN ARRAY['actor_id','event_type','entity_type','entity_id','meta']
 WHEN f.phase='begin' THEN ARRAY['operation_id','actor_id','actor_session_id','target_id','kind','status','generation','source','qa_control','dispatch_state','dispatch_token','dispatch_admitted_at','candidate_verified_session']
 WHEN f.phase='dispatch' THEN ARRAY['dispatch_state','dispatch_token','dispatch_admitted_at']
 WHEN f.phase='finish' AND f.sequence=0 THEN ARRAY['dispatch_state','candidate_verified_session','qa_control']
 WHEN f.phase='finish' THEN ARRAY['status']
 WHEN f.phase='fail' THEN ARRAY['dispatch_state','status','qa_control']
 WHEN f.phase='unknown' THEN ARRAY['status','dispatch_state'] END;
 IF changed IS NULL OR NOT p_patch?&changed OR (SELECT count(*) FROM jsonb_object_keys(p_patch))<>cardinality(changed)
 THEN RAISE EXCEPTION 'qa password producer patch shape' USING ERRCODE='42501';END IF;
 IF p_table='app_private.account_credential_state'::regclass THEN
  IF (f.phase='begin' AND p_patch->'generation' IS DISTINCT FROM to_jsonb(f.generation))
   OR jsonb_typeof(p_patch->'session_valid_after') IS DISTINCT FROM 'string'
   OR (p_patch->>'session_valid_after')::timestamptz IS DISTINCT FROM (CASE WHEN f.phase='begin' THEN (f.control->>'target_session_cutoff')::timestamptz ELSE (SELECT (x.qa_control->>'terminal_session_cutoff')::timestamptz FROM app_private.account_password_operations x WHERE x.operation_id=f.operation_id) END)
  THEN RAISE EXCEPTION 'qa password intentional cutoff shape' USING ERRCODE='42501';END IF;
 ELSIF p_table IN ('public.profiles'::regclass,'public.account_migration_users'::regclass) THEN
  IF p_patch->'must_change_password' IS DISTINCT FROM to_jsonb(NOT (f.phase='finish' AND f.kind='change')) THEN RAISE EXCEPTION 'qa password forced flag shape' USING ERRCODE='42501';END IF;
  IF p_table='public.profiles'::regclass AND (jsonb_typeof(p_patch->'updated_at') IS DISTINCT FROM 'string' OR NOT isfinite((p_patch->>'updated_at')::timestamptz)) THEN RAISE EXCEPTION 'qa password profile timestamp' USING ERRCODE='42501';END IF;
  IF p_table='public.account_migration_users'::regclass AND f.phase='finish' AND (jsonb_typeof(p_patch->'password_changed_at') IS DISTINCT FROM 'string' OR NOT isfinite((p_patch->>'password_changed_at')::timestamptz)) THEN RAISE EXCEPTION 'qa password registry timestamp' USING ERRCODE='42501';END IF;
 ELSIF p_table='app_private.account_password_operations'::regclass THEN
  IF f.phase='begin' THEN
   IF newrow IS DISTINCT FROM jsonb_build_object('operation_id',f.operation_id,'actor_id',f.actor_uid,'actor_session_id',f.actor_sid,'target_id',f.target_uid,'kind',f.kind,'status','pending','generation',f.generation,'source','verified_session','qa_control',f.control,'dispatch_state','prepared','dispatch_token',NULL,'dispatch_admitted_at',NULL,'candidate_verified_session',NULL) THEN RAISE EXCEPTION 'qa password begin journal shape' USING ERRCODE='42501';END IF;
  ELSIF f.phase='dispatch' THEN
   IF oldrow->>'status'<>'pending' OR oldrow->>'dispatch_state'<>'prepared' OR oldrow->'dispatch_token'<>'null'::jsonb OR oldrow->'dispatch_admitted_at'<>'null'::jsonb OR p_patch->>'dispatch_state'<>'admitted' OR p_patch->'dispatch_token'='null'::jsonb OR p_patch->'dispatch_admitted_at'='null'::jsonb THEN RAISE EXCEPTION 'qa password dispatch shape' USING ERRCODE='42501';END IF;
  ELSIF f.phase='unknown' THEN
   IF oldrow->>'status'<>'pending' OR p_patch->>'status'<>'uncertain' OR p_patch->>'dispatch_state' IS DISTINCT FROM (CASE WHEN oldrow->>'dispatch_state'='admitted' THEN 'uncertain' ELSE oldrow->>'dispatch_state' END) THEN RAISE EXCEPTION 'qa password unknown shape' USING ERRCODE='42501';END IF;
  ELSIF f.phase='fail' THEN
   IF oldrow->>'status'<>'pending' OR oldrow->>'dispatch_state'<>'admitted' OR p_patch->>'status'<>'failed' OR p_patch->>'dispatch_state'<>'failed_definitive_no_write' OR ((p_patch->'qa_control')-ARRAY['terminal_recorded_at','terminal_session_cutoff']) IS DISTINCT FROM oldrow->'qa_control' THEN RAISE EXCEPTION 'qa password fail shape' USING ERRCODE='42501';END IF;
  ELSIF f.phase='finish' THEN
   IF oldrow->>'status' NOT IN ('pending','uncertain') THEN RAISE EXCEPTION 'qa password finish shape' USING ERRCODE='42501';END IF;
   IF f.sequence=0 THEN
    IF oldrow->>'dispatch_state' NOT IN ('admitted','uncertain') OR p_patch->>'dispatch_state'<>'completed' OR p_patch->'candidate_verified_session'='null'::jsonb OR ((p_patch->'qa_control')-ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at','terminal_session_cutoff']) IS DISTINCT FROM oldrow->'qa_control' THEN RAISE EXCEPTION 'qa password completion proof shape' USING ERRCODE='42501';END IF;
   ELSIF p_patch->>'status'<>'completed' OR oldrow->>'dispatch_state'<>'completed' THEN RAISE EXCEPTION 'qa password terminal status shape' USING ERRCODE='42501';END IF;
  END IF;
 END IF;
 -- Every column must be present and native-typed. No wildcard/default allowance.
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(newrow) k WHERE NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND NOT attisdropped AND attname=k))
 THEN RAISE EXCEPTION 'qa password extra row fields' USING ERRCODE='42501';END IF;
 IF p_table='public.audit_log'::regclass THEN
   PERFORM app_private.qa_pw_audit_catalog_closed();
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND NOT attisdropped)<>8
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=p_table AND attname='id' AND atttypid='bigint'::regtype AND attidentity='a')
   OR NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=p_table AND a.attname='created_at' AND a.atttypid='timestamptz'::regtype AND pg_get_expr(d.adbin,d.adrelid)='now()')
   OR newrow IS DISTINCT FROM jsonb_build_object('actor_id',f.actor_uid,'event_type',CASE f.phase WHEN 'finish' THEN 'password_operation_completed' ELSE 'password_operation_failed' END,'entity_type','account','entity_id',f.target_uid::text,'meta',jsonb_build_object('operation_id',f.operation_id,'kind',f.kind,'outcome',CASE f.phase WHEN 'finish' THEN 'completed' ELSE 'failed' END,'source','verified_session'))
  THEN RAISE EXCEPTION 'qa password audit shape drift' USING ERRCODE='42501';END IF;
  EXECUTE format('SELECT nextval(%L::regclass)',pg_get_serial_sequence('public.audit_log','id')) INTO auditid;
  newrow:=newrow||jsonb_build_object('id',auditid,'detail',NULL,'created_at',now());
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(newrow))<>(SELECT count(*) FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND NOT attisdropped) THEN RAISE EXCEPTION 'qa password incomplete full row' USING ERRCODE='42501';END IF;
 EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::%s,$1))',p_table::regclass) INTO result USING newrow;
 IF result IS DISTINCT FROM newrow THEN RAISE EXCEPTION 'qa password row native type mismatch' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_password_frames SET state='armed',effect_table=p_table,effect_op=expectedop,effect_old=oldrow,effect_new=newrow WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid;
 IF p_table IN ('app_private.account_credential_state'::regclass,'app_private.account_password_operations'::regclass) THEN PERFORM app_private.qa_pw_consume(p_table,expectedop,oldrow,newrow);END IF;
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum),string_agg(format('r.%I',attname),',' ORDER BY attnum),string_agg(format('%I=r.%I',attname,attname),',' ORDER BY attnum) INTO cols,vals,assigns FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND NOT attisdropped;
 IF p_insert THEN
  EXECUTE format('INSERT INTO %s AS t(%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_record(NULL::%s,$1) r RETURNING to_jsonb(t)',p_table::regclass,cols,vals,p_table::regclass) INTO STRICT result USING newrow;
 ELSE
  EXECUTE format('UPDATE %s AS t SET %s FROM jsonb_populate_record(NULL::%s,$1) r WHERE t.%I::text=$2 RETURNING to_jsonb(t)',p_table::regclass,assigns,p_table::regclass,pk) INTO STRICT result USING newrow,pkval;
 END IF;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 OR result IS DISTINCT FROM newrow OR NOT EXISTS(SELECT 1 FROM app_private.qa_password_frames WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid AND state='consumed' AND effect_new=newrow) THEN RAISE EXCEPTION 'qa password effect result mismatch' USING ERRCODE='42501';END IF;
 UPDATE app_private.qa_password_frames SET sequence=sequence+1,actor_cutoff=CASE WHEN p_table='app_private.account_credential_state'::regclass AND actor_uid=target_uid THEN (result->>'session_valid_after')::timestamptz ELSE actor_cutoff END,target_cutoff=CASE WHEN p_table='app_private.account_credential_state'::regclass THEN (result->>'session_valid_after')::timestamptz ELSE target_cutoff END WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid;
 RETURN result;
END $$;

CREATE FUNCTION app_private.qa_pw_close(p_observe boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f app_private.qa_password_frames%rowtype;
BEGIN
 SELECT * INTO STRICT f FROM app_private.qa_password_frames WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() FOR UPDATE;
 IF f.state='armed' OR f.sequence<>(CASE WHEN p_observe THEN 0 ELSE CASE f.phase WHEN 'begin' THEN 4 WHEN 'finish' THEN 6 WHEN 'fail' THEN 5 WHEN 'unknown' THEN 1 WHEN 'dispatch' THEN 1 ELSE 0 END END) THEN RAISE EXCEPTION 'qa password incomplete phase' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_pw_revalidate();
 DELETE FROM app_private.qa_password_frames WHERE backend_pid=f.backend_pid AND sql_xid=f.sql_xid;
 IF NOT FOUND THEN RAISE EXCEPTION 'qa password frame reclaim' USING ERRCODE='42501';END IF;
END $$;
-- Private helpers are not callable by maintenance/service actors. Each creator is
-- a verified native endpoint; producer OIDs bind identity, not call-stack authority.
DO $acl$ DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='app_private'::regnamespace AND proname IN ('qa_pw_revalidate','qa_pw_open','qa_pw_consume','qa_pw_effect','qa_pw_close') LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO postgres;REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature,r.signature);END LOOP;END $acl$;

CREATE OR REPLACE FUNCTION app_private.qa_password_control_shape(p_control jsonb,p_actor uuid,p_sid uuid,p_target uuid,p_kind text,p_source text,p_state text,p_token uuid,p_admitted timestamptz,p_verified uuid)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE required text[]:=ARRAY['version','principal_class','run_id','canonical_key','original_actor_user','original_actor_session','original_session_cutoff','original_session_not_after','original_session_created_at','target_session_cutoff','candidate_handle','provider_project_ref','provider_user_id','provider_exact_email','admission_permission','owned_creation_receipt_id']; k text; rx text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
 IF p_control IS NULL THEN RETURN p_state IS NULL AND p_token IS NULL AND p_admitted IS NULL AND p_verified IS NULL;END IF;
 IF jsonb_typeof(p_control)<>'object' OR NOT p_control?&required OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_control) x WHERE x<>ALL(required||ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at','terminal_session_cutoff'])) THEN RETURN false;END IF;
 IF p_control->'version'<>'1'::jsonb OR p_source IS DISTINCT FROM 'verified_session' OR p_kind NOT IN ('change','reset') OR p_actor IS NULL OR p_sid IS NULL OR p_target IS NULL THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['original_actor_user','original_actor_session','candidate_handle','provider_user_id'] LOOP
 IF jsonb_typeof(p_control->k)<>'string' OR (p_control->>k)!~rx THEN RETURN false;END IF;END LOOP;
 IF (p_control->>'original_actor_user')::uuid<>p_actor OR (p_control->>'original_actor_session')::uuid<>p_sid OR (p_control->>'provider_user_id')::uuid<>p_target THEN RETURN false;END IF;
 IF p_control->>'provider_project_ref' IS DISTINCT FROM 'movzojtnkkmdsjhmlgtq' OR jsonb_typeof(p_control->'canonical_key')<>'string' OR p_control->>'canonical_key'='' OR jsonb_typeof(p_control->'provider_exact_email')<>'string' OR p_control->>'provider_exact_email'='' THEN RETURN false;END IF;
 IF p_control->>'admission_permission' IS DISTINCT FROM (CASE WHEN p_kind='change' THEN 'self_change' ELSE 'profiles.admin_reset_password' END) THEN RETURN false;END IF;
 IF p_control->>'principal_class'='current_owned_QA' THEN
 IF jsonb_typeof(p_control->'run_id')<>'string' OR p_control->>'run_id'!~rx OR jsonb_typeof(p_control->'owned_creation_receipt_id')<>'string' OR p_control->>'owned_creation_receipt_id'!~rx THEN RETURN false;END IF;
 ELSIF p_control->>'principal_class'='ORDINARY' THEN
 IF p_control->'run_id'<>'null'::jsonb OR p_control->'owned_creation_receipt_id'<>'null'::jsonb THEN RETURN false;END IF;
 ELSE RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['original_session_cutoff','original_session_not_after','original_session_created_at','target_session_cutoff','terminal_session_cutoff'] LOOP
 IF p_control?k AND p_control->k<>'null'::jsonb THEN IF jsonb_typeof(p_control->k)<>'string' THEN RETURN false;END IF;PERFORM (p_control->>k)::timestamptz;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at','terminal_session_cutoff'] LOOP
 IF p_control?k THEN IF jsonb_typeof(p_control->k)<>'string' THEN RETURN false;END IF;PERFORM (p_control->>k)::timestamptz;END IF;END LOOP;
 IF p_state IS NULL OR p_state NOT IN ('prepared','admitted','completed','failed_definitive_no_write','uncertain','cancelled_before_admission') THEN RETURN false;END IF;
 IF p_state IN ('prepared','cancelled_before_admission') THEN IF p_token IS NOT NULL OR p_admitted IS NOT NULL OR p_verified IS NOT NULL THEN RETURN false;END IF;
 ELSIF p_token IS NULL OR p_admitted IS NULL THEN RETURN false;END IF;
 IF p_state='completed' THEN
 IF p_verified IS NULL OR NOT p_control?&ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at','terminal_session_cutoff'] THEN RETURN false;END IF;
 IF (p_control->>'provider_observed_at')::timestamptz<p_admitted OR (p_control->>'candidate_verified_at')::timestamptz<(p_control->>'provider_observed_at')::timestamptz OR (p_control->>'terminal_recorded_at')::timestamptz<(p_control->>'candidate_verified_at')::timestamptz THEN RETURN false;END IF;
 ELSIF p_verified IS NOT NULL THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END $$;

create or replace function app_private.account_password_start(p_actor uuid,p_target_key text,p_kind text,p_operation_id uuid,p_source text,p_session uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare a public.account_migration_users%rowtype; p public.profiles%rowtype;
 c app_private.account_credential_state%rowtype; o app_private.account_password_operations%rowtype;
begin
 if p_source='verified_session' and not exists(select 1 from app_private.qa_password_frames where backend_pid=pg_backend_pid() and sql_xid=pg_current_xact_id() and operation_id=p_operation_id and phase='begin' and sequence=0) then raise exception 'qa verified frame required' using errcode='42501';end if;
 if p_operation_id is null or p_kind not in ('change','reset') or p_kind is null then
  raise exception 'invalid operation';
 end if;
 select * into a from public.account_migration_users where canonical_key=p_target_key for update;
 if not found or not a.eligible or a.migrated_user_id is null then raise exception 'invalid account'; end if;
 if p_kind='reset' and (a.canonical_key='faisal' or a.migrated_user_id='0a1df502-9232-4ef5-af2d-df585ad7f187') then
  raise exception 'protected account';
 end if;
 select * into p from public.profiles where id=a.migrated_user_id for update;
 if not found or not p.active then raise exception 'inactive account'; end if;
 -- Require the exact official Auth identity, not a case-folded/guessed email.
 if not exists(select 1 from auth.users u where u.id=p.id and u.email=a.internal_email) then
  raise exception 'identity conflict';
 end if;
 insert into app_private.account_credential_state(user_id) values(p.id) on conflict do nothing;
 select * into c from app_private.account_credential_state where user_id=p.id for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if found then
  if o.target_id<>p.id or o.kind<>p_kind or o.actor_id is distinct from p_actor or o.actor_session_id is distinct from p_session or o.source<>p_source then
   raise exception 'operation identity conflict';
  end if;
  -- A replay of begin is only an observation, NOT permission to repeat an Auth write.
  return app_private.account_password_result(o.operation_id);
 end if;
 if exists(select 1 from app_private.account_password_operations where target_id=p.id and status in ('pending','uncertain')) then
  raise exception 'unresolved password operation';
 end if;
 if p_source='authorized_maintenance' and (not a.must_change_password or not p.must_change_password) then
  raise exception 'maintenance requires forced account';
 end if;
 if p_source='verified_session' then
  perform app_private.qa_pw_effect('app_private.account_credential_state'::regclass,jsonb_build_object('generation',c.generation+1,'session_valid_after',(select (control->>'target_session_cutoff')::timestamptz from app_private.qa_password_frames where backend_pid=pg_backend_pid() and sql_xid=pg_current_xact_id())));
  select * into c from app_private.account_credential_state where user_id=p.id;
  perform app_private.qa_pw_effect('public.profiles'::regclass,jsonb_build_object('must_change_password',true,'updated_at',clock_timestamp()));
  perform app_private.qa_pw_effect('public.account_migration_users'::regclass,jsonb_build_object('must_change_password',true));
  perform app_private.qa_pw_effect('app_private.account_password_operations'::regclass,jsonb_build_object('operation_id',p_operation_id,'actor_id',p_actor,'actor_session_id',p_session,'target_id',p.id,'kind',p_kind,'status','pending','generation',c.generation,'source',p_source,'qa_control',(select control from app_private.qa_password_frames where backend_pid=pg_backend_pid() and sql_xid=pg_current_xact_id()),'dispatch_state','prepared','dispatch_token',null,'dispatch_admitted_at',null,'candidate_verified_session',null),true);
 else
 update app_private.account_credential_state set generation=generation+1,session_valid_after=clock_timestamp()
 where user_id=p.id returning * into c;
 update public.profiles set must_change_password=true,updated_at=clock_timestamp() where id=p.id;
 update public.account_migration_users set must_change_password=true where canonical_key=a.canonical_key;
 insert into app_private.account_password_operations(operation_id,actor_id,actor_session_id,target_id,kind,status,generation,source)
 values(p_operation_id,p_actor,p_session,p.id,p_kind,'pending',c.generation,p_source);
 end if;
 return app_private.account_password_result(p_operation_id)||jsonb_build_object('write_allowed',true);
end;
$$;


CREATE OR REPLACE FUNCTION public.qa_password_dispatch_internal(p_operation_id uuid,p_generation bigint,p_candidate_handle uuid)
RETURNS TABLE(operation_id uuid,generation bigint,dispatch_token uuid,admitted_at timestamptz,dispatch_state text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.account_password_operations%rowtype;a record;sc record;now_at timestamptz; m app_private.qa_account_manifest%rowtype;
BEGIN
 SELECT * INTO a FROM app_private.qa_request_actor_read();IF NOT FOUND OR a.request_role<>'service_role' THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 IF NOT FOUND OR o.qa_control IS NULL OR o.generation IS DISTINCT FROM p_generation OR (o.qa_control->>'candidate_handle')::uuid IS DISTINCT FROM p_candidate_handle OR o.actor_id IS DISTINCT FROM a.actor_user OR o.actor_session_id IS DISTINCT FROM a.actor_session THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_private_control_context(p_operation_id,(o.qa_control->>'run_id')::uuid,a.actor_user,a.actor_session,o.target_id,o.qa_control->>'canonical_key',NULL,p_generation);
 PERFORM app_private.qa_pw_open('dispatch',p_operation_id);
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 IF (o.qa_control->>'candidate_handle')::uuid IS DISTINCT FROM p_candidate_handle THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 IF o.dispatch_state<>'prepared' THEN
 PERFORM app_private.qa_pw_close(true);
 RETURN QUERY SELECT o.operation_id,o.generation,o.dispatch_token,o.dispatch_admitted_at,CASE WHEN o.dispatch_state='admitted' THEN 'admitted_observed' ELSE o.dispatch_state END;RETURN;
 END IF;
 now_at:=clock_timestamp();
 IF o.status<>'pending' OR o.source<>'verified_session' THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 IF o.kind='reset' AND o.actor_id=o.target_id THEN
  -- Exact original private dispatch frame was opened above; its full SID,
  -- cutoff, forced effects, office/permission and journal are revalidated here.
  PERFORM app_private.qa_pw_revalidate();
 ELSE
  IF NOT app_private.qa_session_live(a.actor_user,a.actor_session,now_at,o.kind='change',o.operation_id) THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=a.actor_session AND s.user_id=a.actor_user AND s.not_after IS NOT DISTINCT FROM (o.qa_control->>'original_session_not_after')::timestamptz) THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO sc FROM app_private.qa_scope_internal(a.actor_user,o.target_id,o.qa_control->>'canonical_key');
 IF NOT sc.allowed OR EXISTS(SELECT 1 FROM app_private.qa_runs r WHERE r.run_id=(o.qa_control->>'run_id')::uuid AND (NOT r.active OR r.phase<>'active' OR r.expires_at<=now_at)) THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM app_private.qa_account_manifest x WHERE x.user_id=o.target_id;
 IF o.qa_control->>'principal_class'='current_owned_QA' THEN
 IF m.user_id IS NULL OR m.principal_class<>'current_owned_QA' OR m.tombstoned_at IS NOT NULL OR m.run_id IS DISTINCT FROM (o.qa_control->>'run_id')::uuid OR m.owned_creation_receipt_id IS DISTINCT FROM (o.qa_control->>'owned_creation_receipt_id')::uuid THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 ELSIF sc.target_class<>'ORDINARY' THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_migration_users am JOIN auth.users u ON u.id=am.migrated_user_id JOIN public.profiles p ON p.id=u.id JOIN app_private.account_credential_state c ON c.user_id=p.id WHERE am.canonical_key=o.qa_control->>'canonical_key' AND am.migrated_user_id=o.target_id AND am.eligible AND p.active AND u.email=am.internal_email AND u.email=o.qa_control->>'provider_exact_email' AND c.generation=o.generation) THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 IF o.kind='change' THEN IF o.actor_id<>o.target_id THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 ELSIF o.kind='reset' THEN
 IF o.qa_control->>'canonical_key'='faisal' OR o.target_id='0a1df502-9232-4ef5-af2d-df585ad7f187' OR NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=a.actor_user AND ur.role_code='ceo_office_manager') OR NOT app_private.account_permission_effective(a.actor_user,'profiles.admin_reset_password') THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 ELSE RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_pw_effect('app_private.account_password_operations'::regclass,jsonb_build_object('dispatch_state','admitted','dispatch_token',gen_random_uuid(),'dispatch_admitted_at',clock_timestamp()));
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 PERFORM app_private.qa_pw_close();
 RETURN QUERY SELECT o.operation_id,o.generation,o.dispatch_token,o.dispatch_admitted_at,'admitted_new'::text;
END $$;

create or replace function public.account_password_begin_internal(p_actor uuid,p_session uuid,p_target_key text,p_kind text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_key text; o app_private.account_password_operations%rowtype; actor record; scope record; h jsonb; candidate uuid; result jsonb; manifest app_private.qa_account_manifest%rowtype; target public.account_migration_users%rowtype; st app_private.account_credential_state%rowtype; native auth.sessions%rowtype; before_actor timestamptz; cutoff timestamptz; control jsonb;
begin
 select * into actor from app_private.qa_request_actor_read();
 if not found or actor.request_role<>'service_role' or actor.actor_user is distinct from p_actor or actor.actor_session is distinct from p_session then raise exception 'qa forbidden' using errcode='42501';end if;
 -- Recovery is an observation of the SAME original verified-session operation.
 -- It bypasses only the cutoff/open-op check, never expiry, identity, or normal access.
 select * into o from app_private.account_password_operations where operation_id=p_operation_id;
 if found then
  if o.actor_id is distinct from p_actor or o.actor_session_id is distinct from p_session
    or o.kind is distinct from p_kind or o.source<>'verified_session'
    or not exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
     join public.account_migration_users a on a.migrated_user_id=p.id and a.eligible
     where s.id=p_session and s.user_id=p_actor and p.active and s.created_at is not null
       and s.created_at<=statement_timestamp() and (s.not_after is null or s.not_after>statement_timestamp())) then
   raise exception 'forbidden' using errcode='42501';
  end if;
  select canonical_key into v_key from public.account_migration_users where migrated_user_id=o.target_id and eligible;
  if v_key is null or (p_target_key is not null and p_target_key<>v_key) then
   raise exception 'operation identity conflict';
  end if;
  perform app_private.qa_pw_open('observe',p_operation_id);
  result:=app_private.account_password_result(p_operation_id)||jsonb_build_object('qa_control_version',1,'candidate_handle',o.qa_control->>'candidate_handle');
  perform app_private.qa_pw_close(true);
  return result;
 end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if coalesce(h->>'x-qa-candidate-handle','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'qa forbidden' using errcode='42501';end if;
 candidate:=(h->>'x-qa-candidate-handle')::uuid;
 perform r.run_id from app_private.qa_runs r where r.run_id in (select m.run_id from app_private.qa_account_manifest m where m.user_id=p_actor or m.canonical_key=p_target_key) order by r.run_id for share;
 perform m.user_id from app_private.qa_run_members m where m.run_id in (select x.run_id from app_private.qa_account_manifest x where x.user_id=p_actor or x.canonical_key=p_target_key) order by m.run_id,m.user_id for share;
 select * into scope from app_private.qa_scope_internal(p_actor,case when p_kind='change' then p_actor else null end,p_target_key);
 if not scope.allowed or not app_private.qa_session_live(p_actor,p_session,clock_timestamp(),p_kind='change',p_operation_id) or exists(select 1 from app_private.qa_runs r where r.run_id=scope.run_id and (not r.active or r.phase<>'active' or r.expires_at<=clock_timestamp())) then raise exception 'qa forbidden' using errcode='42501';end if;
 if p_kind='change' then
  if not app_private.account_session_valid(p_actor,p_session,true) then
   raise exception 'forbidden' using errcode='42501';
  end if;
  select canonical_key into v_key from public.account_migration_users where migrated_user_id=p_actor and eligible;
  if v_key is null or (p_target_key is not null and p_target_key<>v_key) then
   raise exception 'forbidden' using errcode='42501';
  end if;
 elsif p_kind='reset' then
  if not app_private.account_session_valid(p_actor,p_session,false)
    or not exists(select 1 from public.user_roles ur join public.profiles p on p.id=ur.user_id
     where ur.user_id=p_actor and ur.role_code='ceo_office_manager' and p.active and not p.must_change_password)
    or not app_private.account_permission_effective(p_actor,'profiles.admin_reset_password') then
   raise exception 'forbidden' using errcode='42501';
  end if;
  v_key:=p_target_key;
 else
  raise exception 'forbidden' using errcode='42501';
 end if;
 -- Maintain lifecycle SHARE -> registry -> profile -> state -> journal suffix.
 select * into target from public.account_migration_users where canonical_key=v_key and eligible for update;
 if not found or target.migrated_user_id is null then raise exception 'invalid account';end if;
 perform 1 from public.profiles where id=target.migrated_user_id and active for update;
 select * into st from app_private.account_credential_state where user_id=target.migrated_user_id for update;
 if not found then raise exception 'qa credential state missing' using errcode='42501';end if;
 perform 1 from app_private.account_password_operations where operation_id=p_operation_id for update;
 if found then raise exception 'operation identity conflict';end if;
 if exists(select 1 from app_private.account_password_operations where target_id=target.migrated_user_id and status in ('pending','uncertain')) then raise exception 'unresolved password operation';end if;
 select * into native from auth.sessions where id=p_session and user_id=p_actor;
 select session_valid_after into before_actor from app_private.account_credential_state where user_id=p_actor;
 cutoff:=clock_timestamp();
 if not app_private.qa_session_live(p_actor,p_session,cutoff,p_kind='change') then raise exception 'qa forbidden' using errcode='42501';end if;
 select * into manifest from app_private.qa_account_manifest where user_id=target.migrated_user_id;
 control:=jsonb_build_object('version',1,'principal_class',case when scope.target_class='QA_ACTIVE' then 'current_owned_QA' else 'ORDINARY' end,'run_id',scope.run_id,
 'canonical_key',v_key,'original_actor_user',p_actor,'original_actor_session',p_session,
 'original_session_cutoff',case when p_actor=target.migrated_user_id then cutoff else before_actor end,
 'original_session_not_after',native.not_after,'original_session_created_at',native.created_at,'target_session_cutoff',cutoff,
 'candidate_handle',candidate,'provider_project_ref','movzojtnkkmdsjhmlgtq','provider_user_id',target.migrated_user_id,
 'provider_exact_email',target.internal_email,'admission_permission',case when p_kind='change' then 'self_change' else 'profiles.admin_reset_password' end,
 'owned_creation_receipt_id',manifest.owned_creation_receipt_id);
 insert into app_private.qa_password_frames(backend_pid,sql_xid,entry_oid,operation_id,phase,actor_uid,actor_sid,target_uid,canonical_key,generation,kind,control,native_created_at,native_not_after,actor_cutoff,target_cutoff)
 values(pg_backend_pid(),pg_current_xact_id(),'public.account_password_begin_internal(uuid,uuid,text,text,uuid)'::regprocedure,p_operation_id,'begin',p_actor,p_session,target.migrated_user_id,v_key,st.generation+1,p_kind,control,native.created_at,native.not_after,before_actor,st.session_valid_after);
 perform app_private.qa_pw_revalidate();
 result:=app_private.account_password_start(p_actor,v_key,p_kind,p_operation_id,'verified_session',p_session);
 perform app_private.qa_pw_close();
 return result||jsonb_build_object('qa_control_version',1,'candidate_handle',candidate);
end;
$$;
create or replace function public.account_password_finish_internal(p_operation_id uuid,p_generation bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare o app_private.account_password_operations%rowtype; c app_private.account_credential_state%rowtype;
 a public.account_migration_users%rowtype; v_target uuid; v_proof jsonb; actor record; proof jsonb; observed timestamptz; verified uuid; now_at timestamptz; cutoff timestamptz; k text; required text[]:=ARRAY['operation_id','generation','candidate_handle','target_user_id','target_email','project_ref','session_id','issuer','claim_role','observed_at'];
begin
 select target_id into v_target from app_private.account_password_operations where operation_id=p_operation_id;
 if not found then raise exception 'invalid operation'; end if;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id;
 select * into actor from app_private.qa_request_actor_read();
 if not found or actor.request_role<>'service_role' or o.actor_id is distinct from actor.actor_user or o.actor_session_id is distinct from actor.actor_session then raise exception 'qa forbidden' using errcode='42501';end if;
 if o.qa_control is null then
  if o.status='completed' and o.generation=p_generation then return app_private.account_password_result(o.operation_id);end if;
  raise exception 'qa proof required' using errcode='42501';
 end if;
 perform app_private.qa_pw_open('finish',p_operation_id);
 if o.qa_control->>'candidate_handle' is distinct from (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-qa-candidate-handle' then raise exception 'qa forbidden' using errcode='42501';end if;
 -- Same lock order as begin/provision: registry -> profile -> state -> journal.
 select * into a from public.account_migration_users where migrated_user_id=v_target for update;
 if not found or not a.eligible then raise exception 'invalid account'; end if;
 perform 1 from public.profiles where id=v_target and active for update;
 if not found then raise exception 'inactive account'; end if;
 select * into c from app_private.account_credential_state where user_id=v_target for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if p_generation is null or o.generation<>p_generation or o.target_id<>v_target then
  raise exception 'stale operation generation';
 end if;
 if o.status='completed' then perform app_private.qa_pw_close(true);return app_private.account_password_result(o.operation_id); end if;
 if c.generation<>p_generation or o.status not in ('pending','uncertain') then
  raise exception 'stale operation generation';
 end if;
 select u.raw_app_meta_data into v_proof from auth.users u
 where u.id=v_target and u.email=a.internal_email for share;
 if not found or v_proof->>'msajed_password_operation' is distinct from o.operation_id::text
   or v_proof->>'msajed_password_generation' is distinct from o.generation::text then
  raise exception 'provider proof missing or mismatched';
 end if;
 begin
 proof:=((coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-qa-candidate-proof')::jsonb;
 if proof is null or jsonb_typeof(proof)<>'object' or not proof?&required or exists(select 1 from jsonb_object_keys(proof) x where x<>all(required)) then raise exception 'qa proof missing' using errcode='42501';end if;
 foreach k in array array['operation_id','candidate_handle','target_user_id','session_id'] loop
  if jsonb_typeof(proof->k) is distinct from 'string' or coalesce(proof->>k,'')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'qa proof invalid' using errcode='42501';end if;
 end loop;
 if jsonb_typeof(proof->'generation') is distinct from 'number' or proof->>'generation'!~'^[1-9][0-9]*$' or jsonb_typeof(proof->'observed_at') is distinct from 'string' then raise exception 'qa proof invalid' using errcode='42501';end if;
 observed:=(proof->>'observed_at')::timestamptz;verified:=(proof->>'session_id')::uuid;now_at:=clock_timestamp();
 if not isfinite(observed) or observed<o.dispatch_admitted_at or observed>now_at+interval '5 seconds' or
 (proof->>'operation_id')::uuid<>o.operation_id or (proof->>'generation')::bigint<>o.generation or
 (proof->>'candidate_handle')::uuid<>(o.qa_control->>'candidate_handle')::uuid or (proof->>'target_user_id')::uuid<>o.target_id or
 proof->>'target_email' is distinct from o.qa_control->>'provider_exact_email' or proof->>'project_ref' is distinct from 'movzojtnkkmdsjhmlgtq' or
 proof->>'issuer' is distinct from 'https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1' or proof->>'claim_role' is distinct from 'authenticated' or
 o.dispatch_state not in ('admitted','uncertain') or o.dispatch_token is null or o.dispatch_admitted_at is null or
 not exists(select 1 from auth.sessions s where s.id=verified and s.user_id=o.target_id and s.created_at>=o.dispatch_admitted_at and s.created_at<=observed+interval '5 seconds' and s.created_at<=now_at and (s.not_after is null or s.not_after>now_at)) then raise exception 'qa proof invalid' using errcode='42501';end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception 'qa proof invalid' using errcode='42501';end;
 cutoff:=clock_timestamp();
 perform app_private.qa_pw_effect('app_private.account_password_operations'::regclass,jsonb_build_object('dispatch_state','completed','candidate_verified_session',verified,'qa_control',o.qa_control||jsonb_build_object('provider_observed_at',observed,'candidate_verified_at',observed,'terminal_recorded_at',greatest(cutoff,observed),'terminal_session_cutoff',cutoff)));
 perform app_private.qa_pw_effect('app_private.account_credential_state'::regclass,jsonb_build_object('session_valid_after',cutoff));
 perform app_private.qa_pw_effect('public.profiles'::regclass,jsonb_build_object('must_change_password',o.kind='reset','updated_at',clock_timestamp()));
 perform app_private.qa_pw_effect('public.account_migration_users'::regclass,jsonb_build_object('must_change_password',o.kind='reset','password_changed_at',clock_timestamp()));
 perform app_private.qa_pw_effect('app_private.account_password_operations'::regclass,jsonb_build_object('status','completed'));
 perform app_private.qa_pw_effect('public.audit_log'::regclass,jsonb_build_object('actor_id',o.actor_id,'event_type','password_operation_completed','entity_type','account','entity_id',v_target::text,'meta',jsonb_build_object('operation_id',o.operation_id,'kind',o.kind,'outcome','completed','source',o.source)),true);
 perform app_private.qa_pw_close();
 return app_private.account_password_result(o.operation_id);
end;
$$;
create function public.qa_owned_session_check_internal(p_user uuid,p_session uuid,p_operation_id uuid DEFAULT NULL,p_generation bigint DEFAULT NULL,p_candidate_handle uuid DEFAULT NULL)
returns table(allowed boolean,reason text) language plpgsql stable security definer set search_path='' as $$
declare actor record; o app_private.account_password_operations%rowtype;
begin
 select * into actor from app_private.qa_request_actor_read();
 allowed:=false;reason:='ownership_unproved';
 if not found or actor.request_role<>'service_role' or not exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user and s.created_at is not null and s.created_at<=statement_timestamp() and (s.not_after is null or s.not_after>statement_timestamp())) then return next;return;end if;
 if p_operation_id is null then
  allowed:=p_generation is null and p_candidate_handle is null and actor.actor_user=p_user and actor.actor_session=p_session;
 else
  select * into o from app_private.account_password_operations where operation_id=p_operation_id;
  allowed:=found and o.qa_control is not null and o.source='verified_session' and o.actor_id=actor.actor_user and o.actor_session_id=actor.actor_session and o.target_id=p_user and o.generation=p_generation and (o.qa_control->>'candidate_handle')::uuid=p_candidate_handle and o.candidate_verified_session=p_session and o.dispatch_state='completed' and o.status='completed';
 end if;
 allowed:=coalesce(allowed,false);if allowed then reason:='owned_session';end if;return next;
end $$;
alter function public.qa_owned_session_check_internal(uuid,uuid,uuid,bigint,uuid) owner to postgres;
revoke all on function public.qa_owned_session_check_internal(uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.qa_owned_session_check_internal(uuid,uuid,uuid,bigint,uuid) to service_role;

create or replace function public.account_password_unknown_internal(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_target uuid; v_generation bigint; o app_private.account_password_operations%rowtype; actor record;
begin
 select target_id into v_target from app_private.account_password_operations where operation_id=p_operation_id;
 if not found then raise exception 'invalid operation'; end if;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id;
 select * into actor from app_private.qa_request_actor_read();
 if not found or actor.request_role<>'service_role' or o.actor_id is distinct from actor.actor_user or o.actor_session_id is distinct from actor.actor_session then raise exception 'qa forbidden' using errcode='42501';end if;
 if o.qa_control is not null then
  perform app_private.qa_pw_open('unknown',p_operation_id);
  if o.qa_control->>'candidate_handle' is distinct from (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-qa-candidate-handle' then raise exception 'qa forbidden' using errcode='42501';end if;
 elsif o.status not in ('completed','failed') then raise exception 'qa proof required' using errcode='42501';
 end if;
 perform 1 from public.account_migration_users where migrated_user_id=v_target for update;
 perform 1 from public.profiles where id=v_target for update;
 select generation into v_generation from app_private.account_credential_state where user_id=v_target for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if o.status in ('pending','uncertain') and v_generation is distinct from o.generation then raise exception 'stale operation generation'; end if;
 -- No release, rollback of flags, expiry, or unproven failed transition is exposed.
 if o.status='pending' then
  perform app_private.qa_pw_effect('app_private.account_password_operations'::regclass,jsonb_build_object('status','uncertain','dispatch_state',case when o.dispatch_state='admitted' then 'uncertain' else o.dispatch_state end));
  perform app_private.qa_pw_close();
 else if o.qa_control is not null then perform app_private.qa_pw_close(true);end if;end if;
 return app_private.account_password_result(p_operation_id);
end;
$$;
create or replace function public.account_password_fail_internal(p_operation_id uuid,p_error_code text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare o app_private.account_password_operations%rowtype; actor record; v_target uuid; v_proof jsonb; v_generation bigint;cutoff timestamptz;
begin
 if p_error_code is null or p_error_code not in ('provider_400','provider_422') then
  raise exception 'invalid error code';
 end if;
 select target_id into v_target from app_private.account_password_operations where operation_id=p_operation_id;
 if not found then raise exception 'invalid operation'; end if;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id;
 select * into actor from app_private.qa_request_actor_read();
 if not found or actor.request_role<>'service_role' or o.actor_id is distinct from actor.actor_user or o.actor_session_id is distinct from actor.actor_session then raise exception 'qa forbidden' using errcode='42501';end if;
 if o.qa_control is not null then
  perform app_private.qa_pw_open('fail',p_operation_id);
  if o.qa_control->>'candidate_handle' is distinct from (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-qa-candidate-handle' then raise exception 'qa forbidden' using errcode='42501';end if;
 elsif o.status not in ('completed','failed') then raise exception 'qa proof required' using errcode='42501';
 end if;
 perform 1 from public.account_migration_users where migrated_user_id=v_target for update;
 perform 1 from public.profiles where id=v_target for update;
 select generation into v_generation from app_private.account_credential_state where user_id=v_target for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if o.status in ('pending','uncertain') and v_generation is distinct from o.generation then raise exception 'stale operation generation'; end if;
 if o.status='uncertain' then raise exception 'uncertain outcome cannot be released'; end if;
 if o.status in ('completed','failed') then if o.qa_control is not null then perform app_private.qa_pw_close(true);end if;return app_private.account_password_result(p_operation_id); end if;
 select raw_app_meta_data into v_proof from auth.users where id=v_target for share;
 if v_proof->>'msajed_password_operation'=o.operation_id::text then
  raise exception 'provider proof present; finish instead';
 end if;
 if o.qa_control is not null and o.dispatch_state<>'admitted' then raise exception 'qa forbidden' using errcode='42501';end if;
 cutoff:=clock_timestamp();
 perform app_private.qa_pw_effect('app_private.account_password_operations'::regclass,jsonb_build_object('dispatch_state','failed_definitive_no_write','status','failed','qa_control',o.qa_control||jsonb_build_object('terminal_recorded_at',cutoff,'terminal_session_cutoff',cutoff)));
 perform app_private.qa_pw_effect('public.profiles'::regclass,jsonb_build_object('must_change_password',true,'updated_at',clock_timestamp()));
 perform app_private.qa_pw_effect('public.account_migration_users'::regclass,jsonb_build_object('must_change_password',true));
 perform app_private.qa_pw_effect('app_private.account_credential_state'::regclass,jsonb_build_object('session_valid_after',cutoff));
 perform app_private.qa_pw_effect('public.audit_log'::regclass,jsonb_build_object('actor_id',o.actor_id,'event_type','password_operation_failed','entity_type','account','entity_id',v_target::text,'meta',jsonb_build_object('operation_id',o.operation_id,'kind',o.kind,'outcome','failed','source',o.source)),true);
 perform app_private.qa_pw_close();
 return app_private.account_password_result(p_operation_id);
end;
$$;
COMMIT;
