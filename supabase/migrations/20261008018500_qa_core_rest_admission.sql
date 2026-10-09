-- Non-activating forward fragment: existing private REST guard body only.
-- No trigger attachment, grants, Core creator changes or rollout-barrier removal.
-- CREATE OR REPLACE retains the existing OID, ABI, owner, ACL and config.
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
