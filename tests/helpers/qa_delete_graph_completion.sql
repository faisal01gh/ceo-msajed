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
