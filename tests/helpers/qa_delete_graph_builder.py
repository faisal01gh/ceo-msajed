"""Deterministic overlay of the accepted Step1 generator, graph closure only."""
from pathlib import Path

def close_graph(sql):
    helpers=Path(__file__).with_name('qa_delete_graph_helpers.sql').read_text()
    root=Path(__file__).resolve().parents[2]
    prerequisites=(root/'supabase/migrations/20261008010000_qa_isolation_prerequisites.sql').read_text()
    typed=prerequisites[prerequisites.index('CREATE FUNCTION app_private.qa_sql_old_key_valid('):prerequisites.index('ALTER TABLE app_private.qa_sql_operation_context ADD CONSTRAINT qa_typed_old_key')]
    typed=typed.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace("ns.nspname='public'", "(ns.nspname='public' OR i.indrelid='app_private.transaction_read_state'::regclass)")
    helpers=typed+helpers
    # Keep the accepted FK52 adapter, final Core pre-actor predicate and all native
    # revision functions. Replace only graph completion/capture state transitions.
    start=sql.index('CREATE FUNCTION app_private.qa_delete_catalog_closed()')
    end=sql.index('CREATE OR REPLACE FUNCTION app_private.qa_capture_graph(',start)
    sql=sql[:start]+helpers+sql[end:]
    sql=sql.replace("key:=app_private.qa_row_old_key(p_table,p_row);", "key:=app_private.qa_row_old_key(p_table,p_row);\n IF EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=p_table AND old_key=key AND operation_id<>p_operation) THEN RAISE EXCEPTION 'qa overlapping operations' USING ERRCODE='42501';END IF;")
    sql=sql.replace('refs:=app_private.qa_row_references(p_table,p_row);','refs:=app_private.qa_delete_row_references(p_table,p_row);')
    sql=sql.replace("AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY conrelid,oid", "AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace UNION SELECT 'app_private.transaction_read_state'::regclass) ORDER BY conrelid,oid")
    sql=sql.replace("'refs',refs,'disposition','delete')", "'refs',refs,'disposition','delete','registered',false,'seen',false)")
    sql=sql.replace("'disposition','setnull','setnull_parent'", "'disposition','setnull','registered',false,'seen',false,'setnull_parent'")
    sql=sql.replace("ctx.old_references->'row' IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'qa capture changed'", "ctx.old_references->'row' IS DISTINCT FROM to_jsonb(OLD) OR coalesce((ctx.old_references->>'registered')::boolean,false) THEN RAISE EXCEPTION 'qa capture changed'")
    sql=sql.replace("PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,ctx.old_references->'refs',ctx.root_transaction_ids);RETURN OLD;", "PERFORM app_private.qa_reference_validate(a.actor_user,a.actor_session,ctx.old_references->'refs',ctx.root_transaction_ids);\n  UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('registered',true,'registered_old',to_jsonb(OLD)) WHERE backend_pid=ctx.backend_pid AND sql_xid=ctx.sql_xid AND operation_id=ctx.operation_id AND table_oid=ctx.table_oid AND old_key=ctx.old_key;RETURN OLD;")
    # Preserve the owning key, not the loop's temporary child key.
    sql=sql.replace('END LOOP;\n RETURN OLD;\nEND $$;','''END LOOP;
 UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('capture_owner_oid',TG_RELID,'capture_owner_key',app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD))) WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op;
 UPDATE app_private.qa_sql_operation_context SET old_references=old_references||jsonb_build_object('registered',true,'registered_old',to_jsonb(OLD),'owner_validated',false,'sealed_count',(SELECT count(*) FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op),'catalog',app_private.qa_delete_catalog_snapshot()) WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND operation_id=op AND table_oid=TG_RELID AND old_key=app_private.qa_row_old_key(TG_RELID,to_jsonb(OLD));
 RETURN OLD;
END $$;''',1)
    # Closed catalog is also checked from the effective final reference guard,
    # so removed/suppressed capture triggers never make absence authoritative.
    needle=" SELECT * INTO a FROM app_private.qa_verified_write_actor();\n IF TG_OP IN ('UPDATE','DELETE') THEN"
    sql=sql.replace(needle," IF TG_RELID=ANY(app_private.qa_delete_graph_relations()) THEN PERFORM app_private.qa_delete_catalog_closed();END IF;\n"+needle)
    # Pending captured-key INSERT is never admitted by ordinary root creation.
    sql=sql.replace(" IF TG_OP IN ('INSERT','UPDATE') THEN\n  r:=", " IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app_private.qa_sql_operation_context WHERE backend_pid=pg_backend_pid() AND sql_xid=pg_current_xact_id() AND table_oid=TG_RELID AND old_key=app_private.qa_row_old_key(TG_RELID,to_jsonb(NEW))) THEN RAISE EXCEPTION 'qa pending key recreation' USING ERRCODE='42501';END IF;\n IF TG_OP IN ('INSERT','UPDATE') THEN\n  r:=")
    start=sql.index('CREATE FUNCTION app_private.qa_delete_complete_context()')
    end=sql.index('ALTER FUNCTION app_private.qa_delete_catalog_closed()',start)
    completion=Path(__file__).with_name('qa_delete_graph_completion.sql').read_text()
    sql=sql[:start]+completion+sql[end:]
    # Capture the original revision ABI/OIDs and exact original trigger definitions
    # at install, before any future activation/public attachments are installed.
    footer="""
DO $freeze$
DECLARE expected jsonb;
BEGIN
 SELECT jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY oid) FROM (SELECT oid,pg_get_functiondef(oid) def,proowner,proacl::text,proconfig,provolatile,prosecdef,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result FROM pg_proc WHERE oid=ANY(ARRAY['app_private.transaction_revision_before()'::regprocedure::oid,'app_private.transaction_child_revision_after()'::regprocedure::oid])) x),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY oid) FROM pg_trigger t WHERE tgfoid=ANY(ARRAY['app_private.transaction_revision_before()'::regprocedure::oid,'app_private.transaction_child_revision_after()'::regprocedure::oid])),'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_constraint c WHERE contype='f' AND (conrelid=ANY(app_private.qa_delete_graph_relations()) OR confrelid=ANY(app_private.qa_delete_graph_relations())))) INTO expected;
 EXECUTE format('CREATE FUNCTION app_private.qa_delete_revision_abi_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='''' AS %L',format('SELECT %L::jsonb',expected::text));
END $freeze$;
ALTER FUNCTION app_private.qa_delete_revision_abi_expected() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_delete_revision_abi_expected() FROM PUBLIC,anon,authenticated,service_role;
"""
    sql=sql.replace('COMMIT;',footer+'COMMIT;')
    return sql
