-- NON-ACTIVATING. No public trigger/policy attachment, replacement of deployed
-- bodies, cohort registration or grants. Native FK/finalizer ordering and locks
-- remain an activation gate. Producer metadata/control routes are fail-closed
-- pending their separately owned closure; this is NOT rollout-ready enforcement.
BEGIN;
CREATE FUNCTION app_private.qa_reference_key(p_key text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; u uuid;
BEGIN
 SELECT count(DISTINCT v),min(v::text)::uuid INTO n,u FROM (
 SELECT user_id v FROM app_private.qa_account_manifest WHERE canonical_key=p_key OR login_alias=p_key
 UNION SELECT migrated_user_id FROM public.account_migration_users WHERE canonical_key=p_key OR login_username=p_key OR preferred_login=p_key
 UNION SELECT m.migrated_user_id FROM public.account_migration_aliases a JOIN public.account_migration_users m USING(canonical_key) WHERE a.alias=p_key
 ) x;
 IF n<>1 OR u IS NULL THEN RAISE EXCEPTION 'qa unresolved reference' USING ERRCODE='42501';END IF;
 RETURN u;
END $$;
CREATE FUNCTION app_private.qa_row_old_key(p_table oid,p_row jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE k jsonb;
BEGIN
 SELECT jsonb_object_agg(a.attname,p_row->a.attname) INTO k FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=p_table AND i.indisprimary;
 IF NOT coalesce(app_private.qa_sql_old_key_valid(p_table,k),false) THEN RAISE EXCEPTION 'qa invalid OLD key' USING ERRCODE='42501';END IF;
 RETURN k;
END $$;
-- Ordered catalog FKs resolve exact typed parents, not field-name guesses.
-- Display names, title/body/detail and legacy prose are never principal evidence.
CREATE FUNCTION app_private.qa_row_references(p_table oid,p_row jsonb,p_seen oid[] DEFAULT '{}'::oid[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE t text; fk record; m record; pred text; parent jsonb; refs jsonb;
 users uuid[]:='{}'; roots uuid[]:='{}'; keys text[]:='{}'; f text; pair text[]; uid uuid; i integer;
BEGIN
 SELECT c.relname INTO t FROM pg_class c WHERE c.oid=p_table AND c.relnamespace='public'::regnamespace;
 IF t IS NULL THEN RAISE EXCEPTION 'qa unsupported relation' USING ERRCODE='42501';END IF;
 IF p_table=ANY(p_seen) THEN RETURN jsonb_build_object('users',users,'keys',keys,'roots',roots);END IF;
 p_seen:=p_seen||p_table;
 IF t='profiles' THEN users:=users||ARRAY[(p_row->>'id')::uuid];
 ELSIF t='transactions' THEN roots:=roots||ARRAY[(p_row->>'id')::uuid];
 ELSIF t='account_migration_users' THEN
  IF p_row->>'migrated_user_id' IS NULL THEN RAISE EXCEPTION 'qa unlinked account control required' USING ERRCODE='42501';END IF;
  users:=users||ARRAY[(p_row->>'migrated_user_id')::uuid];keys:=keys||ARRAY[p_row->>'canonical_key'];
 END IF;
 -- Exact declared UID/login pairs; both are independently classified and agree.
 pair:=CASE t WHEN 'notifications' THEN ARRAY['user_id','target_login_name']
 WHEN 'transactions' THEN ARRAY['responsible_user_id','responsible_login_name']
 WHEN 'transaction_assignment_targets' THEN ARRAY['user_id','login_name']
 WHEN 'transaction_routes' THEN ARRAY['from_user_id','from_login_name','to_user_id','to_login_name']
 WHEN 'transaction_requests' THEN ARRAY['requested_by','requested_by_login_name','decided_by','decided_by_login_name']
 ELSE '{}'::text[] END;
 IF cardinality(pair)>0 THEN FOR i IN 1..cardinality(pair) BY 2 LOOP
  IF p_row->>pair[i+1] IS NOT NULL THEN
   uid:=app_private.qa_reference_key(p_row->>pair[i+1]);users:=users||ARRAY[uid];
   IF p_row->>pair[i] IS NOT NULL AND (p_row->>pair[i])::uuid<>uid THEN RAISE EXCEPTION 'qa conflicting reference' USING ERRCODE='42501';END IF;
  END IF;
 END LOOP;END IF;
 -- Audit entity schemas are producer-specific. Do not infer UUID authority from
 -- UUID-shaped canonical keys or accept unknown actionable metadata silently.
 IF t='audit_log' THEN RAISE EXCEPTION 'qa audit producer closure required' USING ERRCODE='42501';END IF;
 IF t IN ('transaction_history','transaction_requests','transaction_routes') AND coalesce(p_row->'meta','null') NOT IN ('null'::jsonb,'{}'::jsonb) THEN
  RAISE EXCEPTION 'qa metadata producer closure required' USING ERRCODE='42501';
 END IF;
 FOR fk IN SELECT * FROM pg_constraint WHERE conrelid=p_table AND contype='f' ORDER BY oid LOOP
  IF fk.confrelid='auth.users'::regclass THEN
   -- Profiles/registry identity has already been declared above.
   IF t NOT IN ('profiles','account_migration_users') THEN RAISE EXCEPTION 'qa unsupported Auth reference' USING ERRCODE='42501';END IF;
   CONTINUE;
  END IF;
  pred:='';
  FOR m IN SELECT ca.attname child,pa.attname parent FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY x(c,p,n)
   JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=x.c JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=x.p ORDER BY x.n LOOP
   IF p_row->>m.child IS NULL THEN pred:=NULL;EXIT;END IF;
   pred:=pred||CASE WHEN pred='' THEN '' ELSE ' AND ' END||format('to_jsonb(p)->%L=$1->%L',m.parent,m.child);
  END LOOP;
  IF pred IS NULL THEN CONTINUE;END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM %s p WHERE %s',fk.confrelid::regclass,pred) INTO parent USING p_row;
  IF parent IS NULL THEN RAISE EXCEPTION 'qa missing typed parent' USING ERRCODE='42501';END IF;
  refs:=app_private.qa_row_references(fk.confrelid,parent,p_seen);
  users:=users||ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(refs->'users'));
  roots:=roots||ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(refs->'roots'));
  keys:=keys||ARRAY(SELECT value FROM jsonb_array_elements_text(refs->'keys'));
 END LOOP;
 RETURN jsonb_build_object('users',ARRAY(SELECT DISTINCT x FROM unnest(users) x WHERE x IS NOT NULL ORDER BY x),
 'keys',ARRAY(SELECT DISTINCT x FROM unnest(keys) x WHERE x IS NOT NULL ORDER BY x),
 'roots',ARRAY(SELECT DISTINCT x FROM unnest(roots) x WHERE x IS NOT NULL ORDER BY x));
END $$;
CREATE FUNCTION app_private.qa_reference_validate(p_actor uuid,p_sid uuid,p_refs jsonb,p_captured_roots uuid[] DEFAULT '{}'::uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid[];r uuid[];k text[];v uuid;a record;tm record;
BEGIN
 u:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_refs->'users'));
 r:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_refs->'roots'));
 k:=ARRAY(SELECT value FROM jsonb_array_elements_text(p_refs->'keys'));
 -- Absence is permitted ONLY for exact transaction roots of a private capture.
 -- Retained manifests remain decisive; missing lifecycle/member never ordinary.
 FOREACH v IN ARRAY r LOOP
  IF NOT EXISTS(SELECT 1 FROM public.transactions WHERE id=v) THEN
   IF NOT v=ANY(p_captured_roots) THEN RAISE EXCEPTION 'qa absent root' USING ERRCODE='42501';END IF;
   SELECT * INTO tm FROM app_private.qa_transaction_manifest WHERE transaction_id=v;
   SELECT * INTO a FROM app_private.qa_scope_internal(p_actor);
   IF (tm.transaction_id IS NULL AND a.actor_class<>'ORDINARY') OR
    (tm.transaction_id IS NOT NULL AND (a.actor_class<>'QA_ACTIVE' OR a.run_id IS DISTINCT FROM tm.run_id OR tm.tombstoned_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'qa foreign captured root' USING ERRCODE='42501';END IF;
  END IF;
 END LOOP;
 PERFORM app_private.qa_mutation_validate_locked(p_actor,p_sid,k,u,ARRAY(SELECT x FROM unnest(r) x WHERE EXISTS(SELECT 1 FROM public.transactions WHERE id=x)));
END $$;
-- Recursive freezer follows ALL incoming cascade and SET NULL edges. This locks
-- existing tuples before freezing; native descendant-arrival/reparenting requires
-- the separately gated parent locking protocol, not a PGlite concurrency claim.
CREATE FUNCTION app_private.qa_capture_graph(p_table oid,p_row jsonb,p_operation uuid,p_actor uuid,p_sid uuid,p_run uuid,p_roots uuid[],p_mode text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE key jsonb;refs jsonb;fk record;m record;pred text;child record;parents jsonb:='{}';cols jsonb;
BEGIN
 key:=app_private.qa_row_old_key(p_table,p_row);
 IF EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=p_operation AND table_oid=p_table AND old_key=key) THEN RETURN;END IF;
 refs:=app_private.qa_row_references(p_table,p_row);
 PERFORM app_private.qa_reference_validate(p_actor,p_sid,refs);
 FOR fk IN SELECT * FROM pg_constraint WHERE conrelid=p_table AND contype='f' ORDER BY oid LOOP
  SELECT jsonb_object_agg(a.attname,p_row->a.attname) INTO cols FROM unnest(fk.conkey) x(n) JOIN pg_attribute a ON a.attrelid=p_table AND a.attnum=x.n;
  parents:=parents||jsonb_build_object(fk.oid::text,jsonb_build_object('table_oid',fk.confrelid,'columns',cols));
 END LOOP;
 INSERT INTO app_private.qa_sql_operation_context VALUES(pg_backend_pid(),pg_current_xact_id(),p_operation,p_table,key,p_actor,p_sid,p_run,p_mode,p_roots,parents,jsonb_build_object('row',p_row,'refs',refs,'owner_table',p_roots[1]));
 FOR fk IN SELECT * FROM pg_constraint WHERE confrelid=p_table AND contype='f' AND confdeltype IN ('c','n') AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY conrelid,oid LOOP
  pred:='';
  FOR m IN SELECT ca.attname child,pa.attname parent FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY x(c,p,n)
   JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=x.c JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=x.p ORDER BY x.n LOOP
   pred:=pred||CASE WHEN pred='' THEN '' ELSE ' AND ' END||format('to_jsonb(c)->%L=$1->%L',m.child,m.parent);
  END LOOP;
  FOR child IN EXECUTE format('SELECT to_jsonb(c) row FROM %s c WHERE %s ORDER BY to_jsonb(c)::text FOR UPDATE',fk.conrelid::regclass,pred) USING p_row LOOP
   PERFORM app_private.qa_capture_graph(fk.conrelid,child.row,p_operation,p_actor,p_sid,p_run,p_roots,p_mode);
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION app_private.qa_delete_capture() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;refs jsonb;op uuid;roots uuid[];key jsonb;ctx app_private.qa_sql_operation_context%rowtype;
BEGIN
 IF TG_OP<>'DELETE' OR TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' OR TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('transactions','transaction_assignments','transaction_actions') THEN RAISE EXCEPTION 'qa invalid capture attachment' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app_private.qa_verified_write_actor();key:=app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD));
 SELECT * INTO ctx FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=key AND actor_uid=a.actor_user AND actor_sid=a.actor_session;
 IF FOUND THEN
  IF ctx.old_references->'row' IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'qa capture changed' USING ERRCODE='42501';END IF;
  PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,ctx.old_references->'refs',ctx.root_transaction_ids);RETURN OLD;
 END IF;
 refs:=app_private.qa_row_references(TG_RELID,to_jsonb(OLD));
 PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,refs);
 roots:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(refs->'roots'));
 IF cardinality(roots)=0 THEN RAISE EXCEPTION 'qa capture without root' USING ERRCODE='42501';END IF;
 op:=gen_random_uuid();
 PERFORM app_private.qa_capture_graph(TG_RELID,to_jsonb(OLD),op,a.actor_user,a.actor_session,a.run_id,roots,CASE WHEN a.principal_class='ORDINARY' THEN 'ordinary_delete_hard' ELSE 'qa_delete_hard' END);
 -- Mark the actual owning table/key; intermediate DELETE may finalize only its own operation.
 UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('capture_owner_oid',TG_RELID,'capture_owner_key',key) WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op;
 RETURN OLD;
END $$;
CREATE FUNCTION app_private.qa_reference_guard_before_row() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;r jsonb;key jsonb;ctx app_private.qa_sql_operation_context%rowtype;cnt integer;
BEGIN
 IF TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' OR TG_TABLE_SCHEMA<>'public' THEN RAISE EXCEPTION 'qa invalid guard attachment' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app_private.qa_verified_write_actor();
 IF TG_OP IN ('UPDATE','DELETE') THEN
  key:=app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD));
  SELECT count(*) INTO cnt FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=key AND actor_uid=a.actor_user AND actor_sid=a.actor_session;
  IF cnt>1 THEN RAISE EXCEPTION 'qa ambiguous capture' USING ERRCODE='42501';END IF;
  SELECT * INTO ctx FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=key AND actor_uid=a.actor_user AND actor_sid=a.actor_session;
  IF TG_OP='DELETE' AND cnt>0 AND ctx.old_references->'row' IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'qa frozen OLD changed' USING ERRCODE='42501';END IF;
  IF FOUND AND TG_OP='DELETE' AND ctx.old_references->'row'=to_jsonb(OLD) THEN
   PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,ctx.old_references->'refs',ctx.root_transaction_ids);
  ELSE

   r:=app_private.qa_row_references(TG_RELID,to_jsonb(OLD));PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,r);
  END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  r:=app_private.qa_row_references(TG_RELID,to_jsonb(NEW));
  IF TG_OP='INSERT' AND TG_TABLE_NAME='transactions' THEN
   IF (a.principal_class='ORDINARY' AND EXISTS(SELECT 1 FROM app_private.qa_transaction_manifest WHERE transaction_id=NEW.id)) OR
    (a.principal_class='QA_ACTIVE' AND NOT EXISTS(SELECT 1 FROM app_private.qa_transaction_manifest WHERE transaction_id=NEW.id AND run_id=a.run_id AND tombstoned_at IS NULL)) THEN
    RAISE EXCEPTION 'qa create ownership required' USING ERRCODE='42501';END IF;
   r:=jsonb_set(r,'{roots}','[]'::jsonb);
  END IF;
  PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,r);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE FUNCTION app_private.qa_delete_finalize() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;c record;live boolean;
BEGIN
 IF TG_OP<>'DELETE' OR TG_WHEN<>'AFTER' OR TG_LEVEL<>'STATEMENT' OR TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('transactions','transaction_assignments','transaction_actions') THEN RAISE EXCEPTION 'qa invalid finalizer attachment' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app_private.qa_verified_write_actor();
 -- Descendant FK work can remain queued after owning AFTER STATEMENT. Never
 -- erase its proof early; native activation must prove an ordering mechanism.
 FOR c IN SELECT * FROM app_private.qa_sql_operation_context x WHERE x.backend_pid=pg_backend_pid() AND x.sql_xid=pg_current_xact_id() AND x.actor_uid=a.actor_user AND x.actor_sid=a.actor_session AND (x.old_references->>'capture_owner_oid')::oid=TG_RELID LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s t WHERE to_jsonb(t) @> $1)',c.table_oid::regclass) INTO live USING c.old_key;
  IF live THEN RAISE EXCEPTION 'qa cascade finalizer ordering unproved' USING ERRCODE='55000';END IF;
 END LOOP;
 DELETE FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND actor_uid=a.actor_user AND actor_sid=a.actor_session AND (old_references->>'capture_owner_oid')::oid=TG_RELID;
 RETURN NULL;
END $$;
ALTER FUNCTION app_private.qa_reference_key(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_reference_key(text) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_row_old_key(oid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_row_old_key(oid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_row_references(oid,jsonb,oid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_row_references(oid,jsonb,oid[]) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_reference_validate(uuid,uuid,jsonb,uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_reference_validate(uuid,uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_capture_graph(oid,jsonb,uuid,uuid,uuid,uuid,uuid[],text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_capture_graph(oid,jsonb,uuid,uuid,uuid,uuid,uuid[],text) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_delete_capture() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_capture() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_reference_guard_before_row() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_reference_guard_before_row() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_delete_finalize() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_finalize() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
