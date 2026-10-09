-- Final non-activating composer:200 unconditional55000 remains.
-- Preserve current195 Core/deletion/SETNULL +190 typed refs exactly.
-- Closed catalog additionally recognizes ONLY the exact attested private password
-- frame native closure callback. No generic deferred-writer allowance.
BEGIN;
CREATE OR REPLACE FUNCTION app_private.qa_delete_catalog_closed() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids oid[]; expected jsonb; actual jsonb;r oid;n integer;
BEGIN
 PERFORM app_private.qa_pw_frame_catalog_closed();
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
 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND NOT t.tgisinternal AND t.tgdeferrable AND NOT ((t.tgrelid='app_private.qa_sql_operation_context'::regclass AND t.tgfoid='app_private.qa_delete_complete_context()'::regprocedure::oid) OR (t.tgrelid='app_private.qa_password_frames'::regclass AND t.tgfoid='app_private.qa_pw_commit_closed()'::regprocedure::oid)))
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
CREATE OR REPLACE FUNCTION app_private.qa_reference_guard_before_row() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a record;r jsonb;key jsonb;ctx app_private.qa_sql_operation_context%rowtype;cnt integer;core_allowed boolean:=false;
BEGIN
 IF TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' OR TG_TABLE_SCHEMA<>'public' THEN RAISE EXCEPTION 'qa invalid guard attachment' USING ERRCODE='42501';END IF;
 -- One exact password effect: missing frame follows every normal guard.
 -- Existing mismatched frame DENIES; no generic OR(permission/frame) bypass.
 IF app_private.qa_pw_consume(TG_RELID,TG_OP,CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END) THEN RETURN NEW;END IF;
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
COMMIT;
