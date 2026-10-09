-- Non-enforcing prerequisites only. No policy/trigger attachments, cohort seeds,
-- existing function replacement, provider action or permission/RBAC redesign.
BEGIN;
CREATE TABLE app_private.qa_runs (
 run_id uuid PRIMARY KEY, phase text NOT NULL CHECK(phase IN ('prepared','active','halting','halted','expired','cleaning','cleaned')),
 active boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), CHECK(NOT active OR phase='active')
);
CREATE TABLE app_private.qa_account_manifest (
 user_id uuid PRIMARY KEY, canonical_key text NOT NULL UNIQUE CHECK(canonical_key<>''),
 login_alias text NOT NULL UNIQUE CHECK(login_alias<>''),
 principal_class text NOT NULL CHECK(principal_class IN ('current_owned_QA','legacy_protected_QA')),
 run_id uuid REFERENCES app_private.qa_runs(run_id), owned_creation_operation uuid,
 owned_creation_receipt_id uuid, tombstoned_at timestamptz,
 CHECK((principal_class='current_owned_QA' AND run_id IS NOT NULL AND owned_creation_operation IS NOT NULL AND owned_creation_receipt_id IS NOT NULL)
 OR (principal_class='legacy_protected_QA' AND run_id IS NULL AND owned_creation_operation IS NULL AND owned_creation_receipt_id IS NULL)),
 UNIQUE(run_id,user_id)
);
CREATE TABLE app_private.qa_run_members (
 run_id uuid NOT NULL, user_id uuid NOT NULL, role_code text NOT NULL REFERENCES public.roles(code),
 active boolean NOT NULL DEFAULT false, PRIMARY KEY(run_id,user_id),
 FOREIGN KEY(run_id,user_id) REFERENCES app_private.qa_account_manifest(run_id,user_id)
);
CREATE TABLE app_private.qa_transaction_manifest (
 transaction_id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES app_private.qa_runs(run_id),
 owned_creation_operation uuid NOT NULL, tombstoned_at timestamptz
);
-- Transient root-operation provenance, not a fifth cohort manifest. Captures must
-- be constructed by future typed OLD-row guards; no caller insert authority.
CREATE TABLE app_private.qa_sql_operation_context (
 backend_pid integer NOT NULL CHECK(backend_pid>0), sql_xid xid8 NOT NULL,
 operation_id uuid NOT NULL, table_oid oid NOT NULL, old_key jsonb NOT NULL CHECK(jsonb_typeof(old_key)='object' AND old_key<>'{}'::jsonb),
 actor_uid uuid NOT NULL, actor_sid uuid NOT NULL, run_id uuid,
 operation_mode text NOT NULL CHECK(operation_mode IN ('ordinary_delete_hard','qa_delete_hard','owned_cleanup')),
 root_transaction_ids uuid[] NOT NULL CHECK(cardinality(root_transaction_ids)>0),
 parent_ids jsonb NOT NULL CHECK(jsonb_typeof(parent_ids)='object'), old_references jsonb NOT NULL CHECK(jsonb_typeof(old_references)='object'),
 PRIMARY KEY(backend_pid,sql_xid,operation_id,table_oid,old_key),
 CHECK((operation_mode='ordinary_delete_hard')=(run_id IS NULL))
);
REVOKE ALL ON app_private.qa_runs,app_private.qa_account_manifest,app_private.qa_run_members,app_private.qa_transaction_manifest,app_private.qa_sql_operation_context FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE app_private.qa_runs OWNER TO postgres;
ALTER TABLE app_private.qa_account_manifest OWNER TO postgres;
ALTER TABLE app_private.qa_run_members OWNER TO postgres;
ALTER TABLE app_private.qa_transaction_manifest OWNER TO postgres;
ALTER TABLE app_private.qa_sql_operation_context OWNER TO postgres;
ALTER TABLE app_private.account_password_operations
 ADD COLUMN qa_control jsonb, ADD COLUMN dispatch_state text, ADD COLUMN dispatch_token uuid,
 ADD COLUMN dispatch_admitted_at timestamptz, ADD COLUMN candidate_verified_session uuid;

CREATE FUNCTION app_private.qa_request_actor_read() RETURNS TABLE(actor_user uuid,actor_session uuid,request_role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb; h jsonb; u text; s text; r text; rx text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
 c:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 r:=current_setting('role',true);
 IF r NOT IN ('service_role','authenticated') OR r IS DISTINCT FROM c->>'role' THEN RETURN; END IF;
 IF r='service_role' THEN u:=h->>'x-qa-actor-user';s:=h->>'x-qa-actor-sid'; ELSE u:=c->>'sub';s:=c->>'session_id'; END IF;
 IF u IS NULL OR s IS NULL OR u !~ rx OR s !~ rx THEN RETURN; END IF;
 RETURN QUERY SELECT u::uuid,s::uuid,r;
EXCEPTION WHEN invalid_text_representation THEN RETURN;
END $$;
CREATE FUNCTION app_private.qa_session_live(p_user uuid,p_session uuid,p_now timestamptz,p_allow_forced boolean DEFAULT false,p_operation uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.sessions s JOIN public.profiles p ON p.id=s.user_id
 JOIN public.account_migration_users a ON a.migrated_user_id=p.id AND a.eligible
 JOIN app_private.account_credential_state c ON c.user_id=p.id
 WHERE s.user_id=p_user AND s.id=p_session AND p.active AND s.created_at IS NOT NULL AND s.created_at<=p_now
 AND (s.not_after IS NULL OR s.not_after>p_now)
 AND (c.session_valid_after IS NULL OR s.created_at>c.session_valid_after OR EXISTS(
 SELECT 1 FROM app_private.account_password_operations o WHERE o.operation_id=p_operation AND o.actor_id=p_user
 AND o.actor_session_id=p_session AND o.target_id=p_user AND o.kind='change' AND o.source='verified_session'
 AND o.qa_control IS NOT NULL AND (o.qa_control->>'original_session_cutoff')::timestamptz=c.session_valid_after
 AND (o.qa_control->>'original_session_not_after')::timestamptz IS NOT DISTINCT FROM s.not_after))
 AND (p_allow_forced OR (NOT p.must_change_password AND NOT a.must_change_password))
 AND NOT EXISTS(SELECT 1 FROM app_private.account_password_operations o WHERE o.target_id=p.id AND o.status IN ('pending','uncertain') AND o.operation_id IS DISTINCT FROM p_operation))
$$;
CREATE FUNCTION app_private.qa_identity_class(p_user uuid) RETURNS TABLE(class text,cohort_run uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a app_private.qa_account_manifest%rowtype; r app_private.qa_runs%rowtype;
BEGIN
 SELECT * INTO a FROM app_private.qa_account_manifest WHERE user_id=p_user;
 IF FOUND THEN
  cohort_run:=a.run_id;
  IF a.principal_class='legacy_protected_QA' THEN class:='legacy_protected_QA';
  ELSIF a.tombstoned_at IS NOT NULL THEN class:='QA_TOMBSTONED';
  ELSIF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=p_user) THEN class:='QA_TOMBSTONED';
  ELSIF NOT EXISTS(SELECT 1 FROM public.account_migration_users am WHERE am.migrated_user_id=p_user AND am.canonical_key=a.canonical_key AND am.login_username=a.login_alias AND am.eligible) THEN class:='UNRESOLVED';
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user AND p.active) THEN class:='QA_INACTIVE';
  ELSE SELECT * INTO r FROM app_private.qa_runs WHERE run_id=a.run_id;
   IF NOT FOUND THEN class:='QA_RUN_MISSING';
   ELSIF NOT EXISTS(SELECT 1 FROM app_private.qa_run_members m WHERE m.run_id=a.run_id AND m.user_id=p_user) THEN class:='QA_MEMBER_MISSING';
   ELSIF r.expires_at<=statement_timestamp() THEN class:='QA_EXPIRED';
   ELSIF r.phase IN ('halting','halted','cleaning','cleaned') THEN class:='QA_HALTED';
   ELSIF NOT r.active OR r.phase<>'active' OR NOT EXISTS(SELECT 1 FROM app_private.qa_run_members m WHERE m.run_id=a.run_id AND m.user_id=p_user AND m.active) THEN class:='QA_INACTIVE';
   ELSE class:='QA_ACTIVE'; END IF;
  END IF;
 ELSIF EXISTS(SELECT 1 FROM public.account_migration_users am JOIN public.profiles p ON p.id=am.migrated_user_id JOIN auth.users u ON u.id=p.id WHERE p.id=p_user AND am.eligible) THEN class:='ORDINARY';
 ELSE class:='UNRESOLVED'; END IF;
 RETURN NEXT;
END $$;
CREATE FUNCTION app_private.qa_scope_internal(p_actor uuid,p_target_user uuid DEFAULT NULL,p_target_key text DEFAULT NULL,p_target_tx uuid DEFAULT NULL)
RETURNS TABLE(allowed boolean,actor_class text,target_class text,run_id uuid,reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ar uuid; tr uuid; key_uid uuid; n integer; tc text; tt app_private.qa_transaction_manifest%rowtype;
BEGIN
 SELECT x.class,x.cohort_run INTO actor_class,ar FROM app_private.qa_identity_class(p_actor) x;
 allowed:=false;run_id:=ar;reason:='identity_unresolved';target_class:='UNRESOLVED';
 IF p_target_key IS NOT NULL THEN
 SELECT count(DISTINCT u),min(u::text)::uuid INTO n,key_uid FROM (
 SELECT user_id u FROM app_private.qa_account_manifest WHERE canonical_key=p_target_key OR login_alias=p_target_key
 UNION SELECT migrated_user_id FROM public.account_migration_users WHERE canonical_key=p_target_key OR login_username=p_target_key OR preferred_login=p_target_key) q;
 IF n<>1 OR (p_target_user IS NOT NULL AND p_target_user<>key_uid) THEN reason:='reference_conflict';RETURN NEXT;RETURN;END IF;
 p_target_user:=key_uid;
 END IF;
 IF p_target_user IS NULL AND p_target_key IS NULL AND p_target_tx IS NULL THEN target_class:=actor_class;tr:=ar;
 ELSIF p_target_user IS NOT NULL THEN SELECT x.class,x.cohort_run INTO target_class,tr FROM app_private.qa_identity_class(p_target_user) x;
 END IF;
 IF p_target_tx IS NOT NULL THEN
 SELECT * INTO tt FROM app_private.qa_transaction_manifest WHERE transaction_id=p_target_tx;
 IF FOUND THEN
 tc:=CASE WHEN tt.tombstoned_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.transactions t WHERE t.id=p_target_tx) THEN 'QA_TOMBSTONED'
 WHEN EXISTS(SELECT 1 FROM app_private.qa_runs r WHERE r.run_id=tt.run_id AND r.phase='active' AND r.active AND r.expires_at>statement_timestamp()) THEN 'QA_ACTIVE' ELSE 'QA_INACTIVE' END;
 IF p_target_user IS NOT NULL AND (tc IS DISTINCT FROM target_class OR tt.run_id IS DISTINCT FROM tr) THEN reason:='reference_conflict';RETURN NEXT;RETURN;END IF;
 target_class:=tc;tr:=tt.run_id;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.transactions t WHERE t.id=p_target_tx) THEN reason:='identity_unresolved';RETURN NEXT;RETURN;END IF;
 IF p_target_user IS NOT NULL AND target_class<>'ORDINARY' THEN reason:='reference_conflict';RETURN NEXT;RETURN;END IF;
 target_class:='ORDINARY';tr:=NULL;
 END IF;
 END IF;
 IF actor_class='ORDINARY' AND target_class='ORDINARY' THEN allowed:=true;reason:='same_cohort';
 ELSIF actor_class='QA_ACTIVE' AND target_class='QA_ACTIVE' THEN
 IF ar=tr THEN allowed:=true;reason:='same_cohort'; ELSE reason:='cross_run'; END IF;
 ELSIF actor_class IN ('ORDINARY','QA_ACTIVE') AND target_class IN ('ORDINARY','QA_ACTIVE','legacy_protected_QA') THEN reason:='cross_cohort';
 ELSE reason:=CASE WHEN actor_class='UNRESOLVED' OR target_class='UNRESOLVED' THEN 'identity_unresolved'
 WHEN actor_class='QA_TOMBSTONED' OR target_class='QA_TOMBSTONED' THEN 'tombstoned'
 WHEN actor_class='QA_MEMBER_MISSING' OR target_class='QA_MEMBER_MISSING' THEN 'member_missing'
 WHEN actor_class='QA_RUN_MISSING' OR target_class='QA_RUN_MISSING' THEN 'run_missing'
 WHEN actor_class='QA_EXPIRED' OR target_class='QA_EXPIRED' THEN 'expired'
 WHEN actor_class='QA_HALTED' OR target_class='QA_HALTED' THEN 'halted' ELSE 'inactive' END; END IF;
 RETURN NEXT;
END $$;
CREATE FUNCTION public.qa_scope_probe_internal(p_target_user uuid DEFAULT NULL,p_target_key text DEFAULT NULL,p_target_tx uuid DEFAULT NULL)
RETURNS TABLE(allowed boolean,actor_class text,target_class text,run_id uuid,reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;
BEGIN
 SELECT * INTO a FROM app_private.qa_request_actor_read();
 IF NOT FOUND OR NOT app_private.qa_session_live(a.actor_user,a.actor_session,statement_timestamp(),true) THEN
 RETURN QUERY SELECT false,'UNRESOLVED'::text,'UNRESOLVED'::text,NULL::uuid,'identity_unresolved'::text;RETURN;
 END IF;
 RETURN QUERY SELECT * FROM app_private.qa_scope_internal(a.actor_user,p_target_user,p_target_key,p_target_tx);
END $$;
CREATE FUNCTION public.qa_transport_probe_internal(p_nonce uuid)
RETURNS TABLE(nonce uuid,native_role text,claim_role text,actor_header_present boolean,session_header_present boolean,actor_header_matches_claim boolean,session_header_matches_claim boolean,parse_valid boolean,schema_revision text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;h jsonb;a record;
BEGIN
 BEGIN c:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 EXCEPTION WHEN invalid_text_representation THEN c:='{}';h:='{}';END;
 SELECT * INTO a FROM app_private.qa_request_actor_read();
 RETURN QUERY SELECT p_nonce,current_setting('role',true),c->>'role',h?'x-qa-actor-user',h?'x-qa-actor-sid',
 coalesce(h->>'x-qa-actor-user'=c->>'sub',false),coalesce(h->>'x-qa-actor-sid'=c->>'session_id',false),a.actor_user IS NOT NULL,'20261008010000'::text;
END $$;
CREATE FUNCTION app_private.qa_mutation_validate_locked(p_actor uuid,p_session uuid,p_target_keys text[],p_target_users uuid[],p_transaction_ids uuid[],p_operation_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record; v uuid;k text; s record; now_at timestamptz;
BEGIN
 SELECT * INTO a FROM app_private.qa_request_actor_read();
 IF NOT FOUND OR a.actor_user IS DISTINCT FROM p_actor OR a.actor_session IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 -- Lifecycle prefix only. No global RBAC/pre-executor locks.
 PERFORM r.run_id FROM app_private.qa_runs r WHERE r.run_id IN (
 SELECT m.run_id FROM app_private.qa_account_manifest m WHERE m.user_id=p_actor OR m.user_id=ANY(p_target_users) OR m.canonical_key=ANY(p_target_keys) OR m.login_alias=ANY(p_target_keys)
 UNION SELECT t.run_id FROM app_private.qa_transaction_manifest t WHERE t.transaction_id=ANY(p_transaction_ids)) ORDER BY r.run_id FOR SHARE;
 PERFORM m.user_id FROM app_private.qa_run_members m WHERE m.run_id IN (
 SELECT x.run_id FROM app_private.qa_account_manifest x WHERE x.user_id=p_actor OR x.user_id=ANY(p_target_users) OR x.canonical_key=ANY(p_target_keys) OR x.login_alias=ANY(p_target_keys)) ORDER BY m.run_id,m.user_id FOR SHARE;
 now_at:=clock_timestamp();
 IF NOT app_private.qa_session_live(p_actor,p_session,now_at,false,p_operation_id) THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM app_private.qa_runs r WHERE r.expires_at<=now_at AND r.run_id IN (SELECT m.run_id FROM app_private.qa_account_manifest m WHERE m.user_id=p_actor OR m.user_id=ANY(p_target_users) OR m.canonical_key=ANY(p_target_keys) OR m.login_alias=ANY(p_target_keys) UNION SELECT t.run_id FROM app_private.qa_transaction_manifest t WHERE t.transaction_id=ANY(p_transaction_ids))) THEN RAISE EXCEPTION 'qa expired' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM app_private.qa_scope_internal(p_actor);IF NOT s.allowed THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 FOREACH v IN ARRAY coalesce(p_target_users,'{}'::uuid[]) LOOP SELECT * INTO s FROM app_private.qa_scope_internal(p_actor,v);IF NOT s.allowed THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;END LOOP;
 FOREACH k IN ARRAY coalesce(p_target_keys,'{}'::text[]) LOOP SELECT * INTO s FROM app_private.qa_scope_internal(p_actor,NULL,k);IF NOT s.allowed THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;END LOOP;
 FOREACH v IN ARRAY coalesce(p_transaction_ids,'{}'::uuid[]) LOOP SELECT * INTO s FROM app_private.qa_scope_internal(p_actor,NULL,NULL,v);IF NOT s.allowed THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;END LOOP;
END $$;
CREATE FUNCTION app_private.qa_verified_write_actor()
RETURNS TABLE(actor_user uuid,actor_session uuid,request_role text,principal_class text,run_id uuid,verified_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;s record;
BEGIN
 SELECT * INTO a FROM app_private.qa_request_actor_read();IF NOT FOUND THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_mutation_validate_locked(a.actor_user,a.actor_session,'{}','{}','{}');
 SELECT * INTO s FROM app_private.qa_scope_internal(a.actor_user);
 RETURN QUERY SELECT a.actor_user,a.actor_session,a.request_role,s.actor_class,s.run_id,clock_timestamp();
END $$;
ALTER FUNCTION app_private.qa_request_actor_read() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_request_actor_read() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_session_live(uuid,uuid,timestamptz,boolean,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_session_live(uuid,uuid,timestamptz,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_identity_class(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_identity_class(uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_scope_internal(uuid,uuid,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_scope_internal(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.qa_scope_probe_internal(uuid,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.qa_scope_probe_internal(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.qa_scope_probe_internal(uuid,text,uuid) TO service_role;
ALTER FUNCTION public.qa_transport_probe_internal(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.qa_transport_probe_internal(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.qa_transport_probe_internal(uuid) TO service_role;
ALTER FUNCTION app_private.qa_mutation_validate_locked(uuid,uuid,text[],uuid[],uuid[],uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_mutation_validate_locked(uuid,uuid,text[],uuid[],uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_verified_write_actor() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_verified_write_actor() FROM PUBLIC,anon,authenticated,service_role;


-- Constraint is conditional: NULL-control historical journals retain old ABI and
-- ordinary semantics until separately reviewed producers attach complete control.
CREATE FUNCTION app_private.qa_password_control_shape(p_control jsonb,p_actor uuid,p_sid uuid,p_target uuid,p_kind text,p_source text,p_state text,p_token uuid,p_admitted timestamptz,p_verified uuid)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE required text[]:=ARRAY['version','principal_class','run_id','canonical_key','original_actor_user','original_actor_session','original_session_cutoff','original_session_not_after','candidate_handle','provider_project_ref','provider_user_id','provider_exact_email','admission_permission','owned_creation_receipt_id']; k text; rx text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
 IF p_control IS NULL THEN RETURN p_state IS NULL AND p_token IS NULL AND p_admitted IS NULL AND p_verified IS NULL;END IF;
 IF jsonb_typeof(p_control)<>'object' OR NOT p_control?&required OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_control) x WHERE x<>ALL(required||ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at'])) THEN RETURN false;END IF;
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
 FOREACH k IN ARRAY ARRAY['original_session_cutoff','original_session_not_after'] LOOP
 IF p_control->k<>'null'::jsonb THEN IF jsonb_typeof(p_control->k)<>'string' THEN RETURN false;END IF;PERFORM (p_control->>k)::timestamptz;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at'] LOOP
 IF p_control?k THEN IF jsonb_typeof(p_control->k)<>'string' THEN RETURN false;END IF;PERFORM (p_control->>k)::timestamptz;END IF;END LOOP;
 IF p_state IS NULL OR p_state NOT IN ('prepared','admitted','completed','failed_definitive_no_write','uncertain','cancelled_before_admission') THEN RETURN false;END IF;
 IF p_state IN ('prepared','cancelled_before_admission') THEN IF p_token IS NOT NULL OR p_admitted IS NOT NULL OR p_verified IS NOT NULL THEN RETURN false;END IF;
 ELSIF p_token IS NULL OR p_admitted IS NULL THEN RETURN false;END IF;
 IF p_state='completed' THEN
 IF p_verified IS NULL OR NOT p_control?&ARRAY['provider_observed_at','candidate_verified_at','terminal_recorded_at'] THEN RETURN false;END IF;
 IF (p_control->>'provider_observed_at')::timestamptz<p_admitted OR (p_control->>'candidate_verified_at')::timestamptz<(p_control->>'provider_observed_at')::timestamptz OR (p_control->>'terminal_recorded_at')::timestamptz<(p_control->>'candidate_verified_at')::timestamptz THEN RETURN false;END IF;
 ELSIF p_verified IS NOT NULL THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END $$;
ALTER TABLE app_private.account_password_operations ADD CONSTRAINT qa_password_control_shape CHECK(app_private.qa_password_control_shape(qa_control,actor_id,actor_session_id,target_id,kind,source,dispatch_state,dispatch_token,dispatch_admitted_at,candidate_verified_session));
CREATE UNIQUE INDEX qa_password_dispatch_token_unique ON app_private.account_password_operations(dispatch_token) WHERE dispatch_token IS NOT NULL;
CREATE FUNCTION app_private.qa_private_control_context(p_operation_id uuid,p_run_id uuid,p_actor uuid,p_session uuid,p_target_user uuid,p_target_key text,p_target_tx uuid,p_generation bigint)
RETURNS TABLE(operation_id uuid,run_id uuid,operation_kind text,actor_user uuid,actor_session uuid,target_user uuid,target_key text,target_tx uuid,generation bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.account_password_operations%rowtype; a record;
BEGIN
 SELECT * INTO a FROM app_private.qa_request_actor_read();
 IF NOT FOUND OR a.request_role<>'service_role' OR a.actor_user IS DISTINCT FROM p_actor OR a.actor_session IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 IF NOT FOUND OR o.qa_control IS NULL OR o.generation IS DISTINCT FROM p_generation OR o.actor_id IS DISTINCT FROM p_actor OR o.actor_session_id IS DISTINCT FROM p_session OR o.target_id IS DISTINCT FROM p_target_user OR (o.qa_control->>'canonical_key') IS DISTINCT FROM p_target_key OR (o.qa_control->>'run_id')::uuid IS DISTINCT FROM p_run_id OR p_target_tx IS NOT NULL THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 PERFORM r.run_id FROM app_private.qa_runs r WHERE r.run_id IN (p_run_id,(SELECT m.run_id FROM app_private.qa_account_manifest m WHERE m.user_id=p_actor)) ORDER BY r.run_id FOR SHARE;
 PERFORM m.user_id FROM app_private.qa_run_members m WHERE m.run_id IN (p_run_id,(SELECT x.run_id FROM app_private.qa_account_manifest x WHERE x.user_id=p_actor)) ORDER BY m.run_id,m.user_id FOR SHARE;
 -- Preserve registry -> profile -> credential state -> journal suffix.
 PERFORM am.canonical_key FROM public.account_migration_users am WHERE am.canonical_key=p_target_key FOR UPDATE;
 PERFORM p.id FROM public.profiles p WHERE p.id=p_target_user FOR UPDATE;
 PERFORM c.user_id FROM app_private.account_credential_state c WHERE c.user_id=p_target_user FOR UPDATE;
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id FOR UPDATE;
 IF o.qa_control IS NULL OR o.generation IS DISTINCT FROM p_generation OR o.actor_id IS DISTINCT FROM p_actor OR o.actor_session_id IS DISTINCT FROM p_session OR o.target_id IS DISTINCT FROM p_target_user OR (o.qa_control->>'canonical_key') IS DISTINCT FROM p_target_key OR (o.qa_control->>'run_id')::uuid IS DISTINCT FROM p_run_id OR p_target_tx IS NOT NULL THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT o.operation_id,p_run_id,o.kind,o.actor_id,o.actor_session_id,o.target_id,p_target_key,NULL::uuid,o.generation;
END $$;
CREATE FUNCTION public.qa_password_dispatch_internal(p_operation_id uuid,p_generation bigint,p_candidate_handle uuid)
RETURNS TABLE(operation_id uuid,generation bigint,dispatch_token uuid,admitted_at timestamptz,dispatch_state text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.account_password_operations%rowtype;a record;sc record;now_at timestamptz; m app_private.qa_account_manifest%rowtype;
BEGIN
 SELECT * INTO a FROM app_private.qa_request_actor_read();IF NOT FOUND OR a.request_role<>'service_role' THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 IF NOT FOUND OR o.qa_control IS NULL OR o.generation IS DISTINCT FROM p_generation OR (o.qa_control->>'candidate_handle')::uuid IS DISTINCT FROM p_candidate_handle OR o.actor_id IS DISTINCT FROM a.actor_user OR o.actor_session_id IS DISTINCT FROM a.actor_session THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_private_control_context(p_operation_id,(o.qa_control->>'run_id')::uuid,a.actor_user,a.actor_session,o.target_id,o.qa_control->>'canonical_key',NULL,p_generation);
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 IF (o.qa_control->>'candidate_handle')::uuid IS DISTINCT FROM p_candidate_handle THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 IF o.dispatch_state<>'prepared' THEN
 RETURN QUERY SELECT o.operation_id,o.generation,o.dispatch_token,o.dispatch_admitted_at,CASE WHEN o.dispatch_state='admitted' THEN 'admitted_observed' ELSE o.dispatch_state END;RETURN;
 END IF;
 now_at:=clock_timestamp();
 IF o.status<>'pending' OR o.source<>'verified_session' OR NOT app_private.qa_session_live(a.actor_user,a.actor_session,now_at,o.kind='change',o.operation_id) THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
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
 UPDATE app_private.account_password_operations x SET dispatch_state='admitted',dispatch_token=gen_random_uuid(),dispatch_admitted_at=clock_timestamp() WHERE x.operation_id=p_operation_id RETURNING x.* INTO o;
 RETURN QUERY SELECT o.operation_id,o.generation,o.dispatch_token,o.dispatch_admitted_at,'admitted_new'::text;
END $$;
CREATE FUNCTION app_private.qa_operation_reconcile_locked(p_operation_id uuid,p_generation bigint)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE o app_private.account_password_operations%rowtype;a record;
BEGIN
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 SELECT * INTO a FROM app_private.qa_request_actor_read();
 IF o.qa_control IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_private_control_context(p_operation_id,(o.qa_control->>'run_id')::uuid,a.actor_user,a.actor_session,o.target_id,o.qa_control->>'canonical_key',NULL,p_generation);
 SELECT * INTO o FROM app_private.account_password_operations x WHERE x.operation_id=p_operation_id;
 IF o.dispatch_token IS NULL OR o.dispatch_admitted_at IS NULL OR o.dispatch_state NOT IN ('admitted','uncertain','completed','failed_definitive_no_write') THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 IF o.dispatch_state='completed' AND NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=o.candidate_verified_session AND s.user_id=o.target_id AND s.created_at>=o.dispatch_admitted_at) THEN RAISE EXCEPTION 'qa forbidden' USING ERRCODE='42501';END IF;
 -- Advisory exact-evidence validation only, never dispatch or a replacement for
 -- reviewed provider/candidate proof and native original finish/fail semantics.
END $$;
ALTER FUNCTION app_private.qa_password_control_shape(jsonb,uuid,uuid,uuid,text,text,text,uuid,timestamptz,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_password_control_shape(jsonb,uuid,uuid,uuid,text,text,text,uuid,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_private_control_context(uuid,uuid,uuid,uuid,uuid,text,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_private_control_context(uuid,uuid,uuid,uuid,uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.qa_password_dispatch_internal(uuid,bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.qa_password_dispatch_internal(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.qa_password_dispatch_internal(uuid,bigint,uuid) TO service_role;
ALTER FUNCTION app_private.qa_operation_reconcile_locked(uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_operation_reconcile_locked(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;



CREATE FUNCTION app_private.qa_sql_old_key_valid(p_table oid,p_key jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE col record;n integer:=0;v text;
BEGIN
 IF jsonb_typeof(p_key)<>'object' THEN RETURN false;END IF;
 FOR col IN SELECT a.attname,a.atttypid,format_type(a.atttypid,a.atttypmod) typename FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace WHERE i.indrelid=p_table AND i.indisprimary AND ns.nspname='public' LOOP
 n:=n+1; IF NOT p_key?col.attname OR p_key->col.attname='null'::jsonb THEN RETURN false;END IF;
 v:=p_key->>col.attname;
 IF col.atttypid='uuid'::regtype THEN
 IF jsonb_typeof(p_key->col.attname)<>'string' OR v!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false;END IF;
 ELSIF col.atttypid IN ('text'::regtype,'varchar'::regtype) THEN IF jsonb_typeof(p_key->col.attname)<>'string' THEN RETURN false;END IF;
 ELSIF col.atttypid IN ('integer'::regtype,'bigint'::regtype,'smallint'::regtype) THEN IF jsonb_typeof(p_key->col.attname)<>'number' OR v!~'^-?[0-9]+$' THEN RETURN false;END IF;
 ELSE RETURN false;END IF;
 EXECUTE format('SELECT $1::%s',col.typename) USING v;
 END LOOP;
 RETURN n>0 AND n=(SELECT count(*) FROM jsonb_object_keys(p_key));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
ALTER TABLE app_private.qa_sql_operation_context ADD CONSTRAINT qa_typed_old_key CHECK(app_private.qa_sql_old_key_valid(table_oid,old_key));
ALTER FUNCTION app_private.qa_sql_old_key_valid(oid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_sql_old_key_valid(oid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
