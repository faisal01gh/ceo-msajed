-- Step3 G1-G5 overlay, non-activating public surface. Four manifests unchanged.
-- Native private deferred INSERT events are distinct from actual BEFORE DELETE
-- registrations. Each validates its immutable PK; only the last exact seen event
-- reclaims the whole owner-validated operation. Missing contexts always deny.
-- SQL/queue/context changes share savepoint rollback. No business revision writes.
-- Closed catalog excludes suppression, rules, partitions, replica paths and late
-- custom deferred writers. Successful forced firing is OPERATION-LOCAL, not a
-- transaction-global tombstone. Subsequent fresh SQL must pass ordinary guards.
-- Future205 composer MUST preserve exact185 Core pre-actor predicate AND this
-- graph/SETNULL guard; password integration must not overwrite either body.
BEGIN;
CREATE OR REPLACE FUNCTION app_private.qa_sql_old_key_valid(p_table oid,p_key jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE col record;n integer:=0;v text;
BEGIN
 IF jsonb_typeof(p_key)<>'object' THEN RETURN false;END IF;
 FOR col IN SELECT a.attname,a.atttypid,format_type(a.atttypid,a.atttypmod) typename FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace WHERE i.indrelid=p_table AND i.indisprimary AND (ns.nspname='public' OR i.indrelid='app_private.transaction_read_state'::regclass) LOOP
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
-- No new authority relation: the existing private contexts and native INSERT
-- constraint-event queue are paired transactionally. Catalog checks are exact
-- structure/ABI checks, never trigger-name ordering assumptions.
CREATE FUNCTION app_private.qa_delete_graph_relations() RETURNS oid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT ARRAY(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY(ARRAY['transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods','notifications']) UNION SELECT 'app_private.transaction_read_state'::regclass ORDER BY oid)
$$;
CREATE FUNCTION app_private.qa_delete_row_references(p_table oid,p_row jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE parent jsonb;refs jsonb;
BEGIN
 IF p_table<>'app_private.transaction_read_state'::regclass THEN RETURN app_private.qa_row_references(p_table,p_row);END IF;
 SELECT to_jsonb(t) INTO parent FROM public.transactions t WHERE id=(p_row->>'transaction_id')::uuid;
 IF parent IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(p_row->>'user_id')::uuid) THEN RAISE EXCEPTION 'qa missing typed read-state parent' USING ERRCODE='42501';END IF;
 refs:=app_private.qa_row_references('public.transactions'::regclass,parent);
 RETURN jsonb_set(refs,'{users}',to_jsonb(ARRAY(SELECT DISTINCT u FROM (SELECT value::uuid u FROM jsonb_array_elements_text(refs->'users') UNION SELECT (p_row->>'user_id')::uuid) x ORDER BY u)));
END $$;
CREATE FUNCTION app_private.qa_delete_catalog_snapshot() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'kind',c.relkind,'partition',c.relispartition,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',c.relowner,'acl',c.relacl) ORDER BY c.oid) FROM pg_class c WHERE c.oid=ANY(app_private.qa_delete_graph_relations()) OR c.oid='app_private.qa_sql_operation_context'::regclass),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=ANY(app_private.qa_delete_graph_relations()) OR t.tgrelid='app_private.qa_sql_operation_context'::regclass),
 'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.conrelid=ANY(app_private.qa_delete_graph_relations()) OR c.confrelid=ANY(app_private.qa_delete_graph_relations())),
 'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'def',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl,'config',p.proconfig) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid=ANY(app_private.qa_delete_graph_relations()) OR tgrelid='app_private.qa_sql_operation_context'::regclass)))
$$;
CREATE FUNCTION app_private.qa_delete_catalog_closed() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids oid[]; expected jsonb; actual jsonb;r oid;n integer;
BEGIN
 ids:=app_private.qa_delete_graph_relations();
 IF cardinality(ids)<>15 OR current_setting('session_replication_role')<>'origin'
 OR EXISTS(SELECT 1 FROM pg_class WHERE (oid=ANY(ids) OR oid='app_private.qa_sql_operation_context'::regclass) AND (relkind<>'r' OR relispartition))
 OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=ANY(ids) OR inhparent=ANY(ids) OR inhrelid='app_private.qa_sql_operation_context'::regclass OR inhparent='app_private.qa_sql_operation_context'::regclass)
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid=ANY(ids) AND conrelid<>ALL(ids))
 OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=ANY(ids) OR ev_class='app_private.qa_sql_operation_context'::regclass)
 OR EXISTS(SELECT 1 FROM pg_trigger t WHERE tgrelid=ANY(ids) AND (tgenabled<>'O' OR (NOT tgisinternal AND (tgdeferrable OR tgqual IS NOT NULL OR tgnargs<>0 OR tgattr<>''::int2vector OR NOT (
 (tgfoid='app_private.qa_delete_capture()'::regprocedure::oid AND tgtype=11 AND tgrelid=ANY(ARRAY['public.transactions'::regclass,'public.transaction_assignments'::regclass,'public.transaction_actions'::regclass])) OR
 (tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure::oid AND tgtype=31 AND tgrelid<>'app_private.transaction_read_state'::regclass) OR
 (tgfoid='app_private.transaction_revision_before()'::regprocedure::oid AND tgtype=23 AND tgrelid='public.transactions'::regclass) OR
 (tgfoid='app_private.transaction_child_revision_after()'::regprocedure::oid AND tgtype=29 AND tgrelid<>ALL(ARRAY['public.transactions'::regclass,'public.notifications'::regclass,'app_private.transaction_read_state'::regclass])))))))
 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND NOT t.tgisinternal AND t.tgdeferrable AND (t.tgrelid<>'app_private.qa_sql_operation_context'::regclass OR t.tgfoid<>'app_private.qa_delete_complete_context()'::regprocedure::oid))
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='app_private.qa_sql_operation_context'::regclass)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='app_private.qa_sql_operation_context'::regclass AND NOT tgisinternal AND tgfoid='app_private.qa_delete_complete_context()'::regprocedure::oid AND tgtype=5 AND tgdeferrable AND tginitdeferred AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0)
 THEN RAISE EXCEPTION 'qa deletion catalog unsupported' USING ERRCODE='55000';END IF;
 FOREACH r IN ARRAY ids LOOP
  IF r<>'app_private.transaction_read_state'::regclass AND (SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure::oid)<>1 THEN RAISE EXCEPTION 'qa missing or duplicate reference attachment' USING ERRCODE='55000';END IF;
  IF r=ANY(ARRAY['public.transactions'::regclass,'public.transaction_assignments'::regclass,'public.transaction_actions'::regclass]) AND (SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND tgfoid='app_private.qa_delete_capture()'::regprocedure::oid)<>1 THEN RAISE EXCEPTION 'qa missing or duplicate capture attachment' USING ERRCODE='55000';END IF;
 END LOOP;
 expected:=app_private.qa_delete_revision_abi_expected();
 SELECT jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY oid) FROM (SELECT oid,pg_get_functiondef(oid) def,proowner,proacl::text,proconfig,provolatile,prosecdef,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result FROM pg_proc WHERE oid=ANY(ARRAY['app_private.transaction_revision_before()'::regprocedure::oid,'app_private.transaction_child_revision_after()'::regprocedure::oid])) x),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY oid) FROM pg_trigger t WHERE tgfoid=ANY(ARRAY['app_private.transaction_revision_before()'::regprocedure::oid,'app_private.transaction_child_revision_after()'::regprocedure::oid])),'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_constraint c WHERE contype='f' AND (conrelid=ANY(ids) OR confrelid=ANY(ids)))) INTO actual;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'qa revision ABI or FK catalog drift' USING ERRCODE='55000';END IF;
END $$;
ALTER FUNCTION app_private.qa_delete_graph_relations() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_graph_relations() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_delete_row_references(oid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_row_references(oid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_delete_catalog_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_catalog_snapshot() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION app_private.qa_capture_graph(p_table oid,p_row jsonb,p_operation uuid,p_actor uuid,p_sid uuid,p_run uuid,p_roots uuid[],p_mode text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE key jsonb;refs jsonb;fk record;m record;pred text;child record;parents jsonb:='{}';cols jsonb;
BEGIN
 key:=app_private.qa_row_old_key(p_table,p_row);
 IF EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=p_table AND old_key=key AND operation_id<>p_operation) THEN RAISE EXCEPTION 'qa overlapping operations' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=p_operation AND table_oid=p_table AND old_key=key) THEN RETURN;END IF;
 refs:=app_private.qa_delete_row_references(p_table,p_row);
 PERFORM app_private.qa_reference_validate(p_actor,p_sid,refs);
 FOR fk IN SELECT * FROM pg_constraint WHERE conrelid=p_table AND contype='f' ORDER BY oid LOOP
  SELECT jsonb_object_agg(a.attname,p_row->a.attname) INTO cols FROM unnest(fk.conkey) x(n) JOIN pg_attribute a ON a.attrelid=p_table AND a.attnum=x.n;
  parents:=parents||jsonb_build_object(fk.oid::text,jsonb_build_object('table_oid',fk.confrelid,'columns',cols));
 END LOOP;
 INSERT INTO app_private.qa_sql_operation_context VALUES(pg_backend_pid(),pg_current_xact_id(),p_operation,p_table,key,p_actor,p_sid,p_run,p_mode,p_roots,parents,jsonb_build_object('row',p_row,'source_row',p_row,'refs',refs,'disposition','delete','registered',false,'seen',false));
 FOR fk IN SELECT * FROM pg_constraint WHERE confrelid=p_table AND contype='f' AND confdeltype='c' AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace UNION SELECT 'app_private.transaction_read_state'::regclass) ORDER BY conrelid,oid LOOP
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

CREATE OR REPLACE FUNCTION app_private.qa_delete_capture() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;refs jsonb;op uuid;roots uuid[];key jsonb;ctx app_private.qa_sql_operation_context%rowtype;c record;fk record;child record;parents jsonb;cols jsonb;
BEGIN
 IF TG_OP<>'DELETE' OR TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' OR TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('transactions','transaction_assignments','transaction_actions') THEN RAISE EXCEPTION 'qa invalid capture attachment' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_delete_catalog_closed();
 SELECT * INTO a FROM app_private.qa_verified_write_actor();key:=app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD));
 IF (SELECT count(*) FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=key)>1 THEN RAISE EXCEPTION 'qa overlapping operations' USING ERRCODE='42501';END IF;
 SELECT * INTO ctx FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=key;
 IF FOUND THEN
  IF ctx.actor_uid IS DISTINCT FROM a.actor_user OR ctx.actor_sid IS DISTINCT FROM a.actor_session OR ctx.run_id IS DISTINCT FROM a.run_id OR ctx.old_references->>'disposition'<>'delete' OR ctx.old_references->'row' IS DISTINCT FROM to_jsonb(OLD) OR coalesce((ctx.old_references->>'registered')::boolean,false) THEN RAISE EXCEPTION 'qa capture changed' USING ERRCODE='42501';END IF;
  PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,ctx.old_references->'refs',ctx.root_transaction_ids);
  UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('registered',true,'registered_old',to_jsonb(OLD)) WHERE backend_pid=ctx.backend_pid AND sql_xid=ctx.sql_xid AND operation_id=ctx.operation_id AND table_oid=ctx.table_oid AND old_key=ctx.old_key;RETURN OLD;
 END IF;
 refs:=app_private.qa_row_references(TG_RELID,to_jsonb(OLD));
 PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,refs);
 roots:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(refs->'roots'));
 IF cardinality(roots)=0 THEN RAISE EXCEPTION 'qa capture without root' USING ERRCODE='42501';END IF;
 op:=gen_random_uuid();
 PERFORM app_private.qa_capture_graph(TG_RELID,to_jsonb(OLD),op,a.actor_user,a.actor_session,a.run_id,roots,CASE WHEN a.principal_class='ORDINARY' THEN 'ordinary_delete_hard' ELSE 'qa_delete_hard' END);
 -- Second pass only after the complete cascade-only closure. SETNULL survivors
 -- do not recursively capture their descendants. Only exact catalog FK52 exists.
 FOR c IN SELECT * FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op ORDER BY table_oid,old_key::text LOOP
  FOR fk IN SELECT * FROM pg_constraint WHERE confrelid=c.table_oid AND contype='f' AND confdeltype<>'c' AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) LOOP
   IF fk.confdeltype<>'n' OR fk.conrelid<>'public.transaction_actions'::regclass OR fk.confrelid<>'public.transaction_assignments'::regclass OR fk.conname<>'transaction_actions_assignment_id_fkey' OR pg_get_constraintdef(fk.oid)<>'FOREIGN KEY (assignment_id) REFERENCES public.transaction_assignments(id) ON DELETE SET NULL' THEN RAISE EXCEPTION 'qa unsupported FK disposition' USING ERRCODE='42501';END IF;
   FOR child IN SELECT to_jsonb(x) row FROM public.transaction_actions x WHERE x.assignment_id=(c.old_key->>'id')::uuid ORDER BY id FOR UPDATE LOOP
    key:=app_private.qa_row_old_key(fk.conrelid,child.row);
    IF EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=fk.conrelid AND old_key=key AND operation_id<>op) THEN RAISE EXCEPTION 'qa overlapping operations' USING ERRCODE='42501';END IF;
    IF NOT EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op AND table_oid=fk.conrelid AND old_key=key) THEN
     refs:=app_private.qa_row_references(fk.conrelid,child.row);PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,refs);parents:='{}';
     FOR fk IN SELECT * FROM pg_constraint WHERE conrelid='public.transaction_actions'::regclass AND contype='f' ORDER BY oid LOOP
      SELECT jsonb_object_agg(at.attname,child.row->at.attname) INTO cols FROM unnest(fk.conkey) x(n) JOIN pg_attribute at ON at.attrelid=fk.conrelid AND at.attnum=x.n;
      parents:=parents||jsonb_build_object(fk.oid::text,jsonb_build_object('table_oid',fk.confrelid,'columns',cols));
     END LOOP;
     INSERT INTO app_private.qa_sql_operation_context VALUES(pg_backend_pid(),pg_current_xact_id(),op,'public.transaction_actions'::regclass,key,a.actor_user,a.actor_session,a.run_id,CASE WHEN a.principal_class='ORDINARY' THEN 'ordinary_delete_hard' ELSE 'qa_delete_hard' END,roots,parents,jsonb_build_object('row',child.row,'source_row',child.row,'refs',refs,'disposition','setnull','registered',false,'seen',false,'setnull_parent',c.old_key->'id'));
    ELSE
     UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('setnull_parent',c.old_key->'id') WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op AND table_oid='public.transaction_actions'::regclass AND old_key=key;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('capture_owner_oid',TG_RELID,'capture_owner_key',app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD))) WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op;
 UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('registered',true,'registered_old',to_jsonb(OLD),'owner_validated',false,'sealed_count',(SELECT count(*) FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op),'catalog',app_private.qa_delete_catalog_snapshot()) WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op AND table_oid=TG_RELID AND old_key=app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD));
 RETURN OLD;
END $$;
CREATE OR REPLACE FUNCTION app_private.qa_reference_guard_before_row() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;r jsonb;key jsonb;ctx app_private.qa_sql_operation_context%rowtype;cnt integer;core_allowed boolean:=false;
BEGIN
 IF TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' OR TG_TABLE_SCHEMA<>'public' THEN RAISE EXCEPTION 'qa invalid guard attachment' USING ERRCODE='42501';END IF;
 -- The predicate is private and proves only the existing trusted Core frame
 -- and its exact four allowed row shapes. Missing bounded200 denies Core.
 IF TG_OP IN ('INSERT','UPDATE') AND
    to_regprocedure('app_private.qa_core_provision_row_allowed(oid,text,jsonb,jsonb)') IS NOT NULL THEN
  BEGIN
   EXECUTE 'SELECT coalesce(app_private.qa_core_provision_row_allowed($1,$2,$3,$4),false)'
    INTO core_allowed USING TG_RELID,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW);
  EXCEPTION WHEN undefined_function THEN core_allowed:=false;END;
  IF core_allowed IS TRUE THEN RETURN NEW;END IF;
 END IF;
 IF TG_RELID=ANY(app_private.qa_delete_graph_relations()) THEN PERFORM app_private.qa_delete_catalog_closed();END IF;
 SELECT * INTO a FROM app_private.qa_verified_write_actor();
 IF TG_OP IN ('UPDATE','DELETE') THEN
  key:=app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD));
  SELECT count(*) INTO cnt FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=key AND actor_uid=a.actor_user AND actor_sid=a.actor_session;
  IF cnt>1 THEN RAISE EXCEPTION 'qa ambiguous capture' USING ERRCODE='42501';END IF;
  SELECT * INTO ctx FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=key AND actor_uid=a.actor_user AND actor_sid=a.actor_session;
  IF cnt>0 THEN
   IF ctx.run_id IS DISTINCT FROM a.run_id OR ctx.old_references->'row' IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'qa frozen OLD changed' USING ERRCODE='42501';END IF;
   PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,ctx.old_references->'refs',ctx.root_transaction_ids);
   IF TG_OP='UPDATE' THEN
    IF TG_RELID<>'public.transaction_actions'::regclass OR NOT ctx.old_references?'setnull_parent' OR ctx.old_references->'setnull_parent' IS DISTINCT FROM to_jsonb(OLD)->'assignment_id' OR to_jsonb(NEW) IS DISTINCT FROM jsonb_set(to_jsonb(OLD),'{assignment_id}','null') OR EXISTS(SELECT 1 FROM public.transaction_assignments WHERE id=OLD.assignment_id) THEN RAISE EXCEPTION 'qa unsupported captured update' USING ERRCODE='42501';END IF;
    UPDATE app_private.qa_sql_operation_context SET old_references=jsonb_set(old_references,'{row}',to_jsonb(NEW)) WHERE backend_pid=ctx.backend_pid AND sql_xid=ctx.sql_xid AND operation_id=ctx.operation_id AND table_oid=ctx.table_oid AND old_key=ctx.old_key;
    RETURN NEW;
   END IF;
  ELSE
   r:=app_private.qa_row_references(TG_RELID,to_jsonb(OLD));PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,r);
  END IF;
 END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=app_private.qa_row_old_key(TG_RELID,to_jsonb(NEW))) THEN RAISE EXCEPTION 'qa pending key recreation' USING ERRCODE='42501';END IF;
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

-- One exact native private INSERT event per context PK; actual BEFORE DELETE
-- registrations on transactions/assignments/actions are distinct from predictions.
-- No row is reclaimed until every event is seen and the exact owner validates.
CREATE FUNCTION app_private.qa_delete_validate_operation(p_operation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.qa_sql_operation_context%rowtype;owner app_private.qa_sql_operation_context%rowtype;a record;live jsonb;source jsonb;expected jsonb;count_rows bigint;retained jsonb;child jsonb;
BEGIN
 PERFORM app_private.qa_delete_catalog_closed();
 SELECT * INTO a FROM app_private.qa_verified_write_actor();
 SELECT count(*) INTO count_rows FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=p_operation;
 SELECT * INTO owner FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=p_operation AND table_oid=(old_references->>'capture_owner_oid')::oid AND old_key=old_references->'capture_owner_key';
 IF NOT FOUND OR owner.old_references->>'sealed_count' IS NULL OR count_rows<>(owner.old_references->>'sealed_count')::bigint OR owner.old_references->'catalog' IS DISTINCT FROM app_private.qa_delete_catalog_snapshot() THEN RAISE EXCEPTION 'qa unsealed or changed operation' USING ERRCODE='55000';END IF;
 FOR c IN SELECT * FROM app_private.qa_sql_operation_context WHERE backend_pid=owner.backend_pid AND sql_xid=owner.sql_xid AND operation_id=p_operation ORDER BY table_oid,old_key::text FOR UPDATE LOOP
  IF c.actor_uid IS DISTINCT FROM a.actor_user OR c.actor_sid IS DISTINCT FROM a.actor_session OR c.run_id IS DISTINCT FROM a.run_id OR c.operation_mode IS DISTINCT FROM (CASE WHEN a.principal_class='ORDINARY' THEN 'ordinary_delete_hard' ELSE 'qa_delete_hard' END) OR c.root_transaction_ids IS DISTINCT FROM owner.root_transaction_ids OR c.old_references->'capture_owner_oid' IS DISTINCT FROM owner.old_references->'capture_owner_oid' OR c.old_references->'capture_owner_key' IS DISTINCT FROM owner.old_references->'capture_owner_key' THEN RAISE EXCEPTION 'qa completion owner or actor mismatch' USING ERRCODE='42501';END IF;
  IF c.table_oid<>ALL(app_private.qa_delete_graph_relations()) THEN RAISE EXCEPTION 'qa unsupported captured relation' USING ERRCODE='42501';END IF;
  source:=c.old_references->'source_row';expected:=source;
  IF source IS NULL OR app_private.qa_row_old_key(c.table_oid,source) IS DISTINCT FROM c.old_key THEN RAISE EXCEPTION 'qa invalid source identity' USING ERRCODE='42501';END IF;
  IF c.old_references?'setnull_parent' THEN
   IF c.table_oid<>'public.transaction_actions'::regclass OR c.old_references->'setnull_parent' IS DISTINCT FROM source->'assignment_id' OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='transaction_actions_assignment_id_fkey' AND conrelid=c.table_oid AND confrelid='public.transaction_assignments'::regclass AND confdeltype='n' AND pg_get_constraintdef(oid)='FOREIGN KEY (assignment_id) REFERENCES public.transaction_assignments(id) ON DELETE SET NULL') OR EXISTS(SELECT 1 FROM public.transaction_assignments WHERE id=(source->>'assignment_id')::uuid) THEN RAISE EXCEPTION 'qa changed FK source' USING ERRCODE='42501';END IF;
   expected:=jsonb_set(source,'{assignment_id}','null');
  END IF;
  IF c.old_references->'row' IS DISTINCT FROM source AND c.old_references->'row' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'qa changed capture source' USING ERRCODE='42501';END IF;
  IF c.table_oid=ANY(ARRAY['public.transactions'::regclass,'public.transaction_assignments'::regclass,'public.transaction_actions'::regclass]) AND c.old_references->>'disposition'='delete' AND (c.old_references->'registered' IS DISTINCT FROM 'true'::jsonb OR c.old_references->'registered_old' IS DISTINCT FROM c.old_references->'row') THEN RAISE EXCEPTION 'qa actual DELETE registration incomplete' USING ERRCODE='55000';END IF;
  IF c.old_references->>'disposition'='setnull' AND c.old_references->'registered' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'qa survivor registered for DELETE' USING ERRCODE='42501';END IF;
  PERFORM app_private.qa_reference_validate(c.actor_uid,c.actor_sid,c.old_references->'refs',c.root_transaction_ids);
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE to_jsonb(t) @> $1',c.table_oid::regclass) INTO live USING c.old_key;
  IF c.old_references->>'disposition'='delete' THEN
   IF live IS NOT NULL THEN RAISE EXCEPTION 'qa graph incomplete' USING ERRCODE='55000';END IF;
  ELSIF c.old_references->>'disposition'='setnull' THEN
   IF live IS DISTINCT FROM expected OR c.old_references->'row' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'qa survivor mismatch' USING ERRCODE='55000';END IF;
  ELSE RAISE EXCEPTION 'qa invalid disposition' USING ERRCODE='42501';END IF;
 END LOOP;
END $$;
CREATE FUNCTION app_private.qa_delete_consume_context(p_event app_private.qa_sql_operation_context) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c app_private.qa_sql_operation_context%rowtype;pending bigint;owner_valid boolean;n bigint;
BEGIN
 SELECT * INTO c FROM app_private.qa_sql_operation_context WHERE backend_pid=p_event.backend_pid AND sql_xid=p_event.sql_xid AND operation_id=p_event.operation_id AND table_oid=p_event.table_oid AND old_key=p_event.old_key FOR UPDATE;
 IF NOT FOUND OR c.backend_pid<>pg_backend_pid() OR c.sql_xid<>pg_current_xact_id() OR (to_jsonb(c)-'old_references') IS DISTINCT FROM (to_jsonb(p_event)-'old_references') OR (c.old_references-ARRAY['row','setnull_parent','registered','registered_old','seen','capture_owner_oid','capture_owner_key','owner_validated','sealed_count','catalog']) IS DISTINCT FROM (p_event.old_references-ARRAY['row','setnull_parent','registered','registered_old','seen','capture_owner_oid','capture_owner_key','owner_validated','sealed_count','catalog']) OR c.old_references->'seen' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'qa missing, duplicate or changed completion binding' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_delete_validate_operation(c.operation_id);
 UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('seen',true) WHERE backend_pid=c.backend_pid AND sql_xid=c.sql_xid AND operation_id=c.operation_id AND table_oid=c.table_oid AND old_key=c.old_key AND old_references->'seen'='false'::jsonb;
 IF NOT FOUND THEN RAISE EXCEPTION 'qa seen transition failed' USING ERRCODE='42501';END IF;
 IF c.table_oid=(c.old_references->>'capture_owner_oid')::oid AND c.old_key=c.old_references->'capture_owner_key' THEN
  UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('owner_validated',true) WHERE backend_pid=c.backend_pid AND sql_xid=c.sql_xid AND operation_id=c.operation_id AND table_oid=c.table_oid AND old_key=c.old_key AND old_references->'owner_validated'='false'::jsonb;
  IF NOT FOUND THEN RAISE EXCEPTION 'qa owner transition failed' USING ERRCODE='42501';END IF;
 END IF;
 SELECT count(*) FILTER(WHERE old_references->'seen' IS DISTINCT FROM 'true'::jsonb),bool_or(table_oid=(old_references->>'capture_owner_oid')::oid AND old_key=old_references->'capture_owner_key' AND old_references->'owner_validated'='true'::jsonb),count(*) INTO pending,owner_valid,n FROM app_private.qa_sql_operation_context WHERE backend_pid=c.backend_pid AND sql_xid=c.sql_xid AND operation_id=c.operation_id;
 IF pending=0 THEN
  IF owner_valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'qa no validated owner' USING ERRCODE='42501';END IF;
  PERFORM app_private.qa_delete_validate_operation(c.operation_id);
  DELETE FROM app_private.qa_sql_operation_context WHERE backend_pid=c.backend_pid AND sql_xid=c.sql_xid AND operation_id=c.operation_id;
  GET DIAGNOSTICS pending=ROW_COUNT;
  IF pending<>n THEN RAISE EXCEPTION 'qa terminal reclaim failed' USING ERRCODE='42501';END IF;
 END IF;
END $$;
CREATE FUNCTION app_private.qa_delete_complete_context() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_RELID<>'app_private.qa_sql_operation_context'::regclass OR TG_OP<>'INSERT' OR TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' THEN RAISE EXCEPTION 'qa invalid completion attachment' USING ERRCODE='42501';END IF;
 PERFORM app_private.qa_delete_consume_context(NEW);
 RETURN NULL;
END $$;
ALTER FUNCTION app_private.qa_delete_validate_operation(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_validate_operation(uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_delete_consume_context(app_private.qa_sql_operation_context) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_consume_context(app_private.qa_sql_operation_context) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_delete_catalog_closed() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_catalog_closed() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION app_private.qa_delete_complete_context() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_complete_context() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER qa_delete_context_completion AFTER INSERT ON app_private.qa_sql_operation_context DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.qa_delete_complete_context();
-- Deliberately no public attachment changes; future activation must replace old
-- finalizers, not coexist with them.200's55000 barrier remains untouched.

DO $freeze$
DECLARE expected jsonb;
BEGIN
 SELECT jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY oid) FROM (SELECT oid,pg_get_functiondef(oid) def,proowner,proacl::text,proconfig,provolatile,prosecdef,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result FROM pg_proc WHERE oid=ANY(ARRAY['app_private.transaction_revision_before()'::regprocedure::oid,'app_private.transaction_child_revision_after()'::regprocedure::oid])) x),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY oid) FROM pg_trigger t WHERE tgfoid=ANY(ARRAY['app_private.transaction_revision_before()'::regprocedure::oid,'app_private.transaction_child_revision_after()'::regprocedure::oid])),'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_constraint c WHERE contype='f' AND (conrelid=ANY(app_private.qa_delete_graph_relations()) OR confrelid=ANY(app_private.qa_delete_graph_relations())))) INTO expected;
 EXECUTE format('CREATE FUNCTION app_private.qa_delete_revision_abi_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='''' AS %L',format('SELECT %L::jsonb',expected::text));
END $freeze$;
ALTER FUNCTION app_private.qa_delete_revision_abi_expected() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_revision_abi_expected() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
