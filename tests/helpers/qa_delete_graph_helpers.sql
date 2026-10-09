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
