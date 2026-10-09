-- NON-ACTIVATING forward fragment. No attachments, grants, readiness changes or
-- password call-frame admission. Dynamic supporting/source-origin stays closed.
BEGIN;
CREATE OR REPLACE FUNCTION app_private.qa_row_references(p_table oid,p_row jsonb,p_seen oid[] DEFAULT '{}'::oid[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE t text; fk record; m record; pred text; parent jsonb; refs jsonb;
 users uuid[]:='{}'; roots uuid[]:='{}'; keys text[]:='{}'; f text; pair text[]; uid uuid; i integer;
 meta jsonb; event text; allowed text[]; field text; value jsonb; target uuid; root uuid;
 relation oid; linked uuid; operation app_private.account_password_operations%rowtype;
BEGIN
 SELECT c.relname INTO t FROM pg_class c WHERE c.oid=p_table AND c.relnamespace='public'::regnamespace;
 IF t IS NULL THEN RAISE EXCEPTION 'qa unsupported relation' USING ERRCODE='42501';END IF;
 IF p_table=ANY(p_seen) THEN
  IF t NOT IN ('audit_log','transaction_history','transaction_requests','transaction_routes') THEN RETURN jsonb_build_object('users',users,'keys',keys,'roots',roots);END IF;
  IF (SELECT count(*) FROM unnest(p_seen) x WHERE x=p_table)>=2 THEN RAISE EXCEPTION 'qa cyclic actionable reference' USING ERRCODE='42501';END IF;
 END IF;
 p_seen:=p_seen||p_table;
 IF t='profiles' THEN users:=users||ARRAY[(p_row->>'id')::uuid];
 ELSIF t='transactions' THEN roots:=roots||ARRAY[(p_row->>'id')::uuid];
 ELSIF t='account_migration_users' THEN
  IF p_row->>'migrated_user_id' IS NULL THEN RAISE EXCEPTION 'qa unlinked account control required' USING ERRCODE='42501';END IF;
  users:=users||ARRAY[(p_row->>'migrated_user_id')::uuid];keys:=keys||ARRAY[p_row->>'canonical_key'];
 END IF;
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
 IF t IN ('audit_log','transaction_history','transaction_requests','transaction_routes') THEN
  meta:=coalesce(nullif(p_row->'meta','null'::jsonb),'{}'::jsonb);
  IF jsonb_typeof(meta)<>'object' THEN RAISE EXCEPTION 'qa invalid typed metadata' USING ERRCODE='42501';END IF;
  event:=CASE t WHEN 'transaction_routes' THEN p_row->>'route_type' WHEN 'transaction_requests' THEN p_row->>'request_type' ELSE p_row->>'event_type' END;
  root:=CASE WHEN t='audit_log' AND p_row->>'entity_type'='transaction' THEN (p_row->>'entity_id')::uuid WHEN t<>'audit_log' THEN (p_row->>'transaction_id')::uuid END;
  IF root IS NOT NULL THEN roots:=roots||ARRAY[root];END IF;
  IF t='audit_log' AND p_row->>'entity_type' IN ('account','user') THEN
   IF event='profile_name_changed' AND p_row->>'entity_type'='account' THEN
    allowed:=ARRAY['name','target_user_id'];
    -- Canonical key is a key even if it happens to be UUID-shaped.
    SELECT migrated_user_id INTO linked FROM public.account_migration_users WHERE canonical_key=p_row->>'entity_id';
    uid:=app_private.qa_reference_key(p_row->>'entity_id');keys:=keys||ARRAY[p_row->>'entity_id'];
    IF linked IS NULL OR linked<>uid OR meta->>'target_user_id' IS NULL OR (meta->>'target_user_id')::uuid<>uid THEN RAISE EXCEPTION 'qa account target mismatch' USING ERRCODE='42501';END IF;
    users:=users||ARRAY[uid];
   ELSIF event='permission_changed' THEN
    allowed:=ARRAY['permission','enabled','base_enabled','override_effect'];
    IF p_row->>'entity_type'='account' THEN
     allowed:=allowed||ARRAY['target_user_id'];
     SELECT migrated_user_id INTO linked FROM public.account_migration_users WHERE canonical_key=p_row->>'entity_id';
     uid:=app_private.qa_reference_key(p_row->>'entity_id');keys:=keys||ARRAY[p_row->>'entity_id'];
     IF linked IS NULL OR linked<>uid OR meta->>'target_user_id' IS NULL OR (meta->>'target_user_id')::uuid<>uid THEN RAISE EXCEPTION 'qa permission target mismatch' USING ERRCODE='42501';END IF;
    ELSE uid:=(p_row->>'entity_id')::uuid;END IF;
    users:=users||ARRAY[uid];
   ELSIF event IN ('password_operation_completed','password_operation_failed') AND p_row->>'entity_type'='account' THEN
    allowed:=ARRAY['operation_id','kind','outcome','source'];uid:=(p_row->>'entity_id')::uuid;
    SELECT * INTO operation FROM app_private.account_password_operations WHERE operation_id=(meta->>'operation_id')::uuid;
    IF NOT FOUND OR operation.target_id IS DISTINCT FROM uid OR operation.actor_id IS DISTINCT FROM (p_row->>'actor_id')::uuid OR operation.kind IS DISTINCT FROM meta->>'kind' OR operation.source IS DISTINCT FROM meta->>'source' OR operation.status IS DISTINCT FROM meta->>'outcome' OR meta->>'outcome' IS DISTINCT FROM (CASE event WHEN 'password_operation_completed' THEN 'completed' ELSE 'failed' END) THEN RAISE EXCEPTION 'qa password journal mismatch' USING ERRCODE='42501';END IF;
    users:=users||ARRAY[uid,operation.actor_id];
   ELSE RAISE EXCEPTION 'qa unknown account producer' USING ERRCODE='42501';END IF;
  ELSIF t='transaction_routes' THEN
   allowed:=CASE event WHEN 'directive' THEN ARRAY['targets','directive_owner','entered_by'] WHEN 'direct_assign' THEN ARRAY['targets','directive_owner','entered_by'] WHEN 'reply' THEN ARRAY['reply_to_route_id','reply_operation_id','response'] WHEN 'raise' THEN '{}'::text[] WHEN 'assistant_transfer' THEN '{}'::text[] WHEN 'ceo_view' THEN '{}'::text[] END;
  ELSIF t='transaction_requests' THEN
   allowed:=CASE event WHEN 'change_responsible' THEN ARRAY['requester_role','to_login','to_name'] WHEN 'close' THEN ARRAY['requester_role','target_role','cross_sector','forwarded_from_request'] WHEN 'reopen' THEN ARRAY['requester_role','responsible_unit_id','responsible_login_name','responsible_name'] WHEN 'cancel' THEN ARRAY['requester_role'] WHEN 'extend' THEN ARRAY['requester_role'] END;
  ELSE
   IF t='audit_log' AND p_row->>'entity_type' IS DISTINCT FROM 'transaction' THEN RAISE EXCEPTION 'qa unknown entity producer' USING ERRCODE='42501';END IF;
   allowed:=CASE event
    WHEN 'created' THEN '{}'::text[] WHEN 'action' THEN '{}'::text[] WHEN 'closed' THEN '{}'::text[] WHEN 'reopened' THEN '{}'::text[] WHEN 'cancelled' THEN '{}'::text[] WHEN 'ceo_view_marked' THEN '{}'::text[]
    WHEN 'action_note' THEN ARRAY['action_id'] WHEN 'action_revised' THEN ARRAY['action_id','version']
    WHEN 'legacy_context_resolved' THEN ARRAY['unit','responsible','title']
    WHEN 'raise_manager' THEN ARRAY['proposed_decision','to'] WHEN 'raise_assistant' THEN ARRAY['proposed_decision','to']
    WHEN 'directive_employee' THEN ARRAY['targets','unit']
    WHEN 'assistant_transfer_requested' THEN ARRAY['to','route_id'] WHEN 'assistant_transfer_accepted' THEN ARRAY['from'] WHEN 'assistant_transfer_rejected' THEN ARRAY['from']
    WHEN 'raise_ceo' THEN ARRAY['reason','requested','proposed_decision'] WHEN 'exec_to_assistant' THEN ARRAY['to']
    WHEN 'direct_assign' THEN ARRAY['targets','visibility_scope']
    WHEN 'subject_changed' THEN ARRAY['old_subject','new_subject'] WHEN 'responsible_unit_changed' THEN ARRAY['old_unit','new_unit','old_responsible','new_responsible']
    WHEN 'priority_changed' THEN ARRAY['old_priority','new_priority','reason'] WHEN 'due_date_changed' THEN ARRAY['old_due_at','new_due_at']
    WHEN 'responsible_changed' THEN ARRAY['old_responsible','new_responsible','reason'] WHEN 'extension_approved' THEN ARRAY['due_at']
    WHEN 'request_close' THEN ARRAY['request_id','target_role'] WHEN 'request_reopen' THEN ARRAY['request_id','target_role'] WHEN 'request_cancel' THEN ARRAY['request_id','target_role'] WHEN 'request_extend' THEN ARRAY['request_id','target_role'] WHEN 'request_change_responsible' THEN ARRAY['request_id','target_role']
    WHEN 'request_approved' THEN ARRAY['request_id','type'] WHEN 'request_rejected' THEN ARRAY['request_id','type']
    WHEN 'hard_delete' THEN CASE WHEN t='audit_log' THEN ARRAY['number','title'] END
    WHEN 'assistant_reply' THEN CASE WHEN t='audit_log' THEN ARRAY['reply_route_id','source_route_id','to_user_id'] ELSE ARRAY['reply_route_id','reply_to_route_id','to_user_id','to'] END END;
   IF t='audit_log' AND allowed IS NOT NULL AND event<>'assistant_reply' THEN allowed:=allowed||ARRAY['actor_login','actor_name','actor_role'];END IF;
  END IF;
  IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(meta) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'qa unsupported producer metadata' USING ERRCODE='42501';END IF;
  IF (t<>'audit_log' OR p_row->>'entity_type'='transaction') AND root IS NULL THEN RAISE EXCEPTION 'qa missing producer root' USING ERRCODE='42501';END IF;
  IF event='assistant_reply' AND (meta->>'reply_route_id' IS NULL OR coalesce(meta->>'source_route_id',meta->>'reply_to_route_id') IS NULL OR meta->>'to_user_id' IS NULL) THEN RAISE EXCEPTION 'qa incomplete reply references' USING ERRCODE='42501';END IF;
  IF t='transaction_routes' AND event='reply' AND (meta->>'reply_to_route_id' IS NULL OR meta->>'reply_operation_id' IS NULL) THEN RAISE EXCEPTION 'qa incomplete reply route' USING ERRCODE='42501';END IF;
  FOR field,value IN SELECT * FROM jsonb_each(meta) LOOP
   IF field IN ('actor_login','to_login','responsible_login_name') AND value<>'null'::jsonb THEN
    IF jsonb_typeof(value)<>'string' THEN RAISE EXCEPTION 'qa invalid alias type' USING ERRCODE='42501';END IF;
    uid:=app_private.qa_reference_key(meta->>field);users:=users||ARRAY[uid];
    IF field='actor_login' AND p_row->>'actor_id' IS NOT NULL AND uid<>(p_row->>'actor_id')::uuid THEN RAISE EXCEPTION 'qa actor alias mismatch' USING ERRCODE='42501';END IF;
   ELSIF field IN ('target_user_id','to_user_id') AND value<>'null'::jsonb THEN users:=users||ARRAY[(meta->>field)::uuid];
   ELSIF field='targets' THEN
    IF jsonb_typeof(value)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(value) v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'qa invalid target list' USING ERRCODE='42501';END IF;
    FOR f IN SELECT jsonb_array_elements_text(value) LOOP users:=users||ARRAY[app_private.qa_reference_key(f)];END LOOP;
   ELSIF field IN ('action_id','request_id','forwarded_from_request','route_id','reply_route_id','source_route_id','reply_to_route_id') AND value<>'null'::jsonb THEN
    relation:=CASE WHEN field='action_id' THEN 'public.transaction_actions'::regclass WHEN field IN ('request_id','forwarded_from_request') THEN 'public.transaction_requests'::regclass ELSE 'public.transaction_routes'::regclass END;
    EXECUTE format('SELECT to_jsonb(x) FROM %s x WHERE id=$1',relation::regclass) INTO parent USING (meta->>field)::uuid;
    IF parent IS NULL OR root IS NULL OR (parent->>'transaction_id')::uuid IS DISTINCT FROM root THEN RAISE EXCEPTION 'qa different metadata root' USING ERRCODE='42501';END IF;
    refs:=app_private.qa_row_references(relation,parent,p_seen);
    users:=users||ARRAY(SELECT v::uuid FROM jsonb_array_elements_text(refs->'users') v);keys:=keys||ARRAY(SELECT v FROM jsonb_array_elements_text(refs->'keys') v);roots:=roots||ARRAY(SELECT v::uuid FROM jsonb_array_elements_text(refs->'roots') v);
    -- Self-table references still classify every exact UID/login; recursion's OID
    -- cycle stopper cannot discard these actionable principals.
    FOREACH f IN ARRAY ARRAY['from_user_id','to_user_id','requested_by','decided_by','actor_id'] LOOP IF parent->>f IS NOT NULL THEN users:=users||ARRAY[(parent->>f)::uuid];END IF;END LOOP;
    FOREACH f IN ARRAY ARRAY['from_login_name','to_login_name','requested_by_login_name','decided_by_login_name'] LOOP IF parent->>f IS NOT NULL THEN users:=users||ARRAY[app_private.qa_reference_key(parent->>f)];END IF;END LOOP;
    IF event='assistant_reply' AND field='reply_route_id' AND (parent->>'route_type'<>'reply' OR parent->'meta'->>'reply_to_route_id' IS DISTINCT FROM coalesce(meta->>'source_route_id',meta->>'reply_to_route_id') OR parent->>'to_user_id' IS DISTINCT FROM meta->>'to_user_id' OR parent->>'from_user_id' IS DISTINCT FROM p_row->>'actor_id') THEN RAISE EXCEPTION 'qa reply target mismatch' USING ERRCODE='42501';END IF;
   ELSIF field='responsible_unit_id' AND value<>'null'::jsonb THEN
    IF NOT EXISTS(SELECT 1 FROM public.organizational_units WHERE id=(meta->>field)::uuid) THEN RAISE EXCEPTION 'qa missing unit' USING ERRCODE='42501';END IF;
   END IF;
  END LOOP;
 END IF;
 FOR fk IN SELECT * FROM pg_constraint WHERE conrelid=p_table AND contype='f' ORDER BY oid LOOP
  IF fk.confrelid='auth.users'::regclass THEN
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
  users:=users||ARRAY(SELECT j.value::uuid FROM jsonb_array_elements_text(refs->'users') AS j(value));
  roots:=roots||ARRAY(SELECT j.value::uuid FROM jsonb_array_elements_text(refs->'roots') AS j(value));
  keys:=keys||ARRAY(SELECT j.value FROM jsonb_array_elements_text(refs->'keys') AS j(value));
 END LOOP;
 RETURN jsonb_build_object('users',ARRAY(SELECT DISTINCT x FROM unnest(users) x WHERE x IS NOT NULL ORDER BY x),
 'keys',ARRAY(SELECT DISTINCT x FROM unnest(keys) x WHERE x IS NOT NULL ORDER BY x),
 'roots',ARRAY(SELECT DISTINCT x FROM unnest(roots) x WHERE x IS NOT NULL ORDER BY x));
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'qa invalid typed identity' USING ERRCODE='42501';
END $$;
COMMIT;
