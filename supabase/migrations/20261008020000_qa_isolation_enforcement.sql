-- BLOCKED PARTIAL IMPLEMENTATION: NOT READY FOR APPLICATION OR ACTIVATION.
-- Source: 2c605a0ecccdfe57203ce9ecc09028d183b3f79d; frozen catalog f15b2599877ccacc87bb01a1c33689d2689eefadd8003afcdcf4d6601fa885f6.
-- The fail-closed barrier is intentional. Local tests exercise only the marked section.
BEGIN;
DO $blocked$ BEGIN RAISE EXCEPTION 'qa_enforcement_not_ready: prerequisite/legacy8/password/REST/cascade/closure acceptance incomplete' USING ERRCODE='55000'; END $blocked$;
-- Local real-01 integration: six complete non-password leaves; next-number plus
-- workspace/import shared-resource gates; original57 Core management link only.
-- QA Core owned pre-link control, REST producer metadata/attachments/cascade and
-- separate password fragment integration remain activation blockers.
-- Separate Core transient call-frame table/predicate require focused approval.

-- Exact frozen legacy8 preflight + classification-only registration.
-- It remains behind the incomplete-enforcement barrier; not applied by local adapter.
DO $legacy$
DECLARE expected record; observed integer;
BEGIN
 IF EXISTS(SELECT 1 FROM app_private.qa_account_manifest) OR EXISTS(SELECT 1 FROM app_private.qa_run_members)
 OR EXISTS(SELECT 1 FROM app_private.qa_transaction_manifest) THEN
  RAISE EXCEPTION 'nonempty QA prereq manifests; classification rollout must be reviewed' USING ERRCODE='55000';
 END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('4ef16504-ad45-436c-9386-e5f0ae338fbc'::uuid,'test_admin_assistant','test_admin_assistant','assistant','test_admin_assistant@msajed.local','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',ARRAY[]::text[]),
 ('af6b6a8f-ac42-4608-a661-510f3488c95d'::uuid,'test_admin_manager','test_admin_manager','manager','test_admin_manager@msajed.local','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',ARRAY['إدارة الموارد البشرية','الإدارة القانونية']::text[]),
 ('44dfab74-53ec-4def-bdb6-fe6aad4f4d87'::uuid,'test_admin_employee','test_admin_employee','employee','test_admin_employee@msajed.local','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',ARRAY['إدارة الموارد البشرية','الإدارة القانونية']::text[]),
 ('4e0dd212-b877-4b05-b754-e369bc1eae3f'::uuid,'test_admin_secretary','test_admin_secretary','assistant_secretary','test_admin_secretary@msajed.local','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',ARRAY[]::text[]),
 ('fb103cc8-1fb7-46b4-b908-9a4635f98435'::uuid,'test_tech_assistant','test_tech_assistant','assistant','test_tech_assistant@msajed.local','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',ARRAY[]::text[]),
 ('1760d053-cd4c-4c6f-a823-eb8570bae431'::uuid,'test_tech_manager','test_tech_manager','manager','test_tech_manager@msajed.local','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',ARRAY['إدارة المشاريع']::text[]),
 ('8acbd986-91c3-49c3-b0a7-02392e326d05'::uuid,'test_tech_employee','test_tech_employee','employee','test_tech_employee@msajed.local','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',ARRAY['إدارة المشاريع']::text[]),
 ('ece4b585-5c8d-4de8-bc6d-d7f7685f80bc'::uuid,'test_tech_secretary','test_tech_secretary','assistant_secretary','test_tech_secretary@msajed.local','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',ARRAY[]::text[])
 ) AS frozen(user_id,canonical_key,login_username,role_code,internal_email,org_name,dept_names)
 LOOP
  SELECT count(*) INTO observed FROM public.account_migration_users a
   JOIN auth.users u ON u.id=a.migrated_user_id
   JOIN public.profiles p ON p.id=u.id
   JOIN public.user_roles r ON r.user_id=u.id AND r.is_primary
  WHERE a.canonical_key=expected.canonical_key AND a.migrated_user_id=expected.user_id
   AND a.login_username=expected.login_username AND a.preferred_login=expected.login_username
   AND p.login_name=expected.login_username AND a.role_code=expected.role_code AND r.role_code=expected.role_code
   AND a.internal_email=expected.internal_email AND u.email=expected.internal_email
   AND a.org_name=expected.org_name AND a.dept_names=expected.dept_names AND a.eligible;
  IF observed<>1 OR EXISTS(SELECT 1 FROM public.account_migration_users a
    WHERE a.migrated_user_id=expected.user_id AND a.canonical_key<>expected.canonical_key)
   OR EXISTS(SELECT 1 FROM public.account_migration_aliases a
    WHERE a.alias=expected.login_username AND a.canonical_key<>expected.canonical_key) THEN
   RAISE EXCEPTION 'stale or ambiguous exact legacy8 designation' USING ERRCODE='55000';
  END IF;
  INSERT INTO app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class)
   VALUES(expected.user_id,expected.canonical_key,expected.login_username,'legacy_protected_QA');
 END LOOP;
END $legacy$;

-- BEGIN LOCAL VERIFIABLE SECTION
CREATE OR REPLACE FUNCTION app_private.qa_enforcement_admit(
 p_expected_actor uuid, p_expected_session uuid, p_keys text[], p_users uuid[], p_transactions uuid[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $qa$
DECLARE a record;
BEGIN
 SELECT * INTO STRICT a FROM app_private.qa_verified_write_actor();
 IF (p_expected_actor IS NOT NULL AND p_expected_actor IS DISTINCT FROM a.actor_user)
 OR (p_expected_session IS NOT NULL AND p_expected_session IS DISTINCT FROM a.actor_session) THEN
  RAISE EXCEPTION 'QA actor tuple mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM app_private.qa_mutation_validate_locked(a.actor_user,a.actor_session,
  coalesce(p_keys,ARRAY[]::text[]),coalesce(p_users,ARRAY[]::uuid[]),
  coalesce(p_transactions,ARRAY[]::uuid[]),NULL);
END $qa$;
ALTER FUNCTION app_private.qa_enforcement_admit(uuid,uuid,text[],uuid[],uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_enforcement_admit(uuid,uuid,text[],uuid[],uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.mark_transaction_seen_current(p_transaction_id uuid, p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_revision bigint; v_seen bigint;
begin
 PERFORM app_private.qa_enforcement_admit(auth.uid(),NULL,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[p_transaction_id]);
 if not app_private.account_access_ready(v_user)
   or not app_private.can_view_transaction(v_user,p_transaction_id) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 select activity_revision into v_revision from public.transactions where id=p_transaction_id for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 if p_revision is null or p_revision<0 or p_revision>v_revision then
  raise exception 'invalid revision' using errcode='22023';
 end if;
 PERFORM app_private.qa_enforcement_admit(auth.uid(),NULL,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[p_transaction_id]);
 insert into app_private.transaction_read_state(transaction_id,user_id,seen_revision)
 values(p_transaction_id,v_user,p_revision)
 on conflict(transaction_id,user_id) do update
  set seen_revision=greatest(app_private.transaction_read_state.seen_revision,excluded.seen_revision),
      seen_at=case when excluded.seen_revision>=app_private.transaction_read_state.seen_revision
       then excluded.seen_at else app_private.transaction_read_state.seen_at end
 returning seen_revision into v_seen;
 return jsonb_build_object('ok',true,'transaction_id',p_transaction_id,'seen_revision',v_seen,
  'activity_revision',v_revision,'read_state',case when v_seen<v_revision then 'updated' else 'read' end,
  'has_unread_updates',v_seen<v_revision);
end $function$;

CREATE OR REPLACE FUNCTION app_private.my_profile_set_email_current(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid; v_email text;
begin
 PERFORM app_private.qa_enforcement_admit(auth.uid(),NULL,ARRAY[]::text[],ARRAY[auth.uid()],ARRAY[]::uuid[]);
  v_uid:=auth.uid();
  if not app_private.account_access_ready(v_uid) then raise exception 'account unavailable' using errcode='42501'; end if;
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not app_private.has_permission(v_uid,'profiles.edit_email') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  v_email:=nullif(trim(coalesce(p_email,'')),'');
  if v_email is not null and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'invalid email';
  end if;
  update public.profiles set contact_email=v_email,updated_at=now() where id=v_uid and active;
  return jsonb_build_object('ok',true,'email',v_email);
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.admin_set_account_name_current(p_target_key text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_target uuid; v_name text;
begin
 PERFORM app_private.qa_enforcement_admit(auth.uid(),NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);
  v_actor:=auth.uid();
  if v_actor is null or not app_private.can_manage_permissions(v_actor)
     or not app_private.has_permission(v_actor,'profiles.admin_edit_name') then
    raise exception 'forbidden' using errcode='42501';
  end if;

  v_name:=trim(coalesce(p_name,''));
  if length(v_name)<2 then raise exception 'invalid name'; end if;

  select migrated_user_id into v_target
  from public.account_migration_users
  where canonical_key=p_target_key and eligible;
  if not found then raise exception 'invalid account'; end if;

  update public.account_migration_users
  set display_name=v_name
  where canonical_key=p_target_key;

  if v_target is not null then
    update public.profiles
    set full_name=v_name,updated_at=now()
    where id=v_target and active;
  end if;

  PERFORM app_private.qa_enforcement_admit(auth.uid(),NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);

  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
  values(v_actor,'profile_name_changed','account',p_target_key,'تعديل اسم المستخدم',
    jsonb_build_object('name',v_name,'target_user_id',v_target));

  return jsonb_build_object('ok',true,'name',v_name);
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.permissions_admin_set(p_actor uuid, p_target_user uuid, p_permission_code text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_key text; v_base boolean; v_effect text;
begin
 PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[]::text[],ARRAY[p_target_user],ARRAY[]::uuid[]);
  if p_actor is null or not app_private.can_manage_permissions(p_actor) then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select amu.canonical_key into v_key
  from public.account_migration_users amu
  where amu.migrated_user_id=p_target_user and amu.eligible
  limit 1;

  if v_key is not null then
    return app_private.permissions_admin_set_account(
      p_actor,v_key,p_permission_code,p_enabled
    );
  end if;

  if p_target_user is null or not exists(
    select 1 from public.profiles p where p.id=p_target_user and p.active
  ) then raise exception 'invalid user'; end if;

  if not exists(
    select 1 from public.permissions p
    where p.code=p_permission_code
      and (p.code like 'transactions.%' or p.code like 'profiles.%')
  ) then raise exception 'invalid permission'; end if;

  select exists(
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_code=ur.role_code
    where ur.user_id=p_target_user and rp.permission_code=p_permission_code
  ) into v_base;

  if p_enabled=v_base then
    PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[]::text[],ARRAY[p_target_user],ARRAY[]::uuid[]);
    delete from public.user_permissions
    where user_id=p_target_user and permission_code=p_permission_code;
    v_effect:=null;
  else
    v_effect:=case when p_enabled then 'allow' else 'deny' end;
    PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[]::text[],ARRAY[p_target_user],ARRAY[]::uuid[]);
    insert into public.user_permissions(user_id,permission_code,effect)
    values(p_target_user,p_permission_code,v_effect)
    on conflict(user_id,permission_code)
    do update set effect=excluded.effect,created_at=now();
  end if;

  PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[]::text[],ARRAY[p_target_user],ARRAY[]::uuid[]);

  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
  values(p_actor,'permission_changed','user',p_target_user::text,'تعديل صلاحية مستخدم',
    jsonb_build_object(
      'permission',p_permission_code,'enabled',p_enabled,
      'base_enabled',v_base,'override_effect',v_effect
    ));

  return jsonb_build_object(
    'ok',true,'permission',p_permission_code,'enabled',p_enabled,
    'base_enabled',v_base,'override_effect',v_effect
  );
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.permissions_admin_set_account(p_actor uuid, p_target_key text, p_permission_code text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_role text; v_base boolean; v_effect text;
begin
 PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);
  if p_actor is null or not app_private.can_manage_permissions(p_actor) then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select amu.migrated_user_id,amu.role_code into v_user,v_role
  from public.account_migration_users amu
  where amu.canonical_key=p_target_key and amu.eligible;
  if not found then raise exception 'invalid account'; end if;

  if not exists(
    select 1 from public.permissions p
    where p.code=p_permission_code
      and (p.code like 'transactions.%' or p.code like 'profiles.%')
  ) then raise exception 'invalid permission'; end if;

  if v_user is not null then
    select exists(
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code=ur.role_code
      where ur.user_id=v_user and rp.permission_code=p_permission_code
    ) into v_base;
  else
    select exists(
      select 1 from public.role_permissions rp
      where rp.role_code=v_role and rp.permission_code=p_permission_code
    ) into v_base;
  end if;

  if p_enabled=v_base then
    if v_user is not null then
      PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);
      delete from public.user_permissions
      where user_id=v_user and permission_code=p_permission_code;
    end if;
    PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);
    delete from public.account_permission_overrides
    where canonical_key=p_target_key and permission_code=p_permission_code;
    v_effect:=null;
  else
    v_effect:=case when p_enabled then 'allow' else 'deny' end;
    if v_user is not null then
      PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);
      insert into public.user_permissions(user_id,permission_code,effect)
      values(v_user,p_permission_code,v_effect)
      on conflict(user_id,permission_code)
      do update set effect=excluded.effect,created_at=now();
      PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);
      delete from public.account_permission_overrides
      where canonical_key=p_target_key and permission_code=p_permission_code;
    else
      PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);
      insert into public.account_permission_overrides(
        canonical_key,permission_code,effect,created_by,created_at,updated_at
      )
      values(p_target_key,p_permission_code,v_effect,p_actor,now(),now())
      on conflict(canonical_key,permission_code)
      do update set effect=excluded.effect,created_by=excluded.created_by,updated_at=now();
    end if;
  end if;

  PERFORM app_private.qa_enforcement_admit(p_actor,NULL,ARRAY[p_target_key],ARRAY[]::uuid[],ARRAY[]::uuid[]);

  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
  values(p_actor,'permission_changed','account',p_target_key,'تعديل صلاحية مستخدم',
    jsonb_build_object(
      'permission',p_permission_code,'enabled',p_enabled,'base_enabled',v_base,
      'override_effect',v_effect,'target_user_id',v_user
    ));

  return jsonb_build_object(
    'ok',true,'permission',p_permission_code,'enabled',p_enabled,
    'base_enabled',v_base,'override_effect',v_effect,'target_user_id',v_user
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.transaction_reply_raise_internal(p_actor uuid, p_session uuid, p_tx uuid, p_route uuid, p_response text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor jsonb; flags jsonb; source public.transaction_routes%rowtype;
 latest public.transaction_routes%rowtype; previous public.transaction_routes%rowtype;
 t public.transactions%rowtype; sender public.account_migration_users%rowtype;
 reply_id uuid; response text:=btrim(coalesce(p_response,'')); now_at timestamptz;
 target_role text; target_level text; result jsonb;
begin
 PERFORM app_private.qa_enforcement_admit(p_actor,p_session,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[p_tx]);
 if p_actor is null or p_session is null or p_tx is null or p_route is null or p_operation_id is null
  or response='' or char_length(response)>10000 then raise exception 'invalid reply input' using errcode='22023'; end if;
 if not app_private.account_session_valid(p_actor,p_session,false)
  or not app_private.account_permission_effective(p_actor,'transactions.reply_raise') then
  raise exception 'forbidden' using errcode='42501'; end if;
 actor:=public.user_context_internal(p_actor);
 if actor is null or actor->>'role'<>'assistant' or not coalesce((actor->>'active')::boolean,false)
  or coalesce((actor->>'must_change_password')::boolean,true) then raise exception 'forbidden' using errcode='42501'; end if;
 -- Serializes the operation nonce across different transactions too. The nonce is
 -- identity-bound below; observing somebody else's nonce cannot recover its receipt.
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 select * into previous from public.transaction_routes
 where route_type='reply' and meta->>'reply_operation_id'=p_operation_id::text;
 if found then
  if previous.from_user_id is distinct from p_actor then raise exception 'forbidden' using errcode='42501'; end if;
  if previous.transaction_id is distinct from p_tx or previous.meta->>'reply_to_route_id' is distinct from p_route::text
   or previous.meta->>'response' is distinct from response then
   raise exception 'reply candidate mismatch' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'replayed',true,'reply_route_id',previous.id,
   'transaction_id',previous.transaction_id,'source_route_id',(previous.meta->>'reply_to_route_id')::uuid,
   'operation_id',(previous.meta->>'reply_operation_id')::uuid,'actor_user_id',previous.from_user_id,
   'target_user_id',previous.to_user_id,'target_login_name',previous.to_login_name,'target_name',previous.to_name);
 end if;
 select * into t from public.transactions where id=p_tx for update;
 if not found or t.status<>'open' or t.current_level<>'assistant' then
  raise exception 'stale reply custody' using errcode='42501'; end if;
 select * into source from public.transaction_routes where id=p_route and transaction_id=p_tx for update;
 if not found or source.route_type<>'raise' or source.status not in ('completed','accepted')
  or (source.to_user_id=p_actor or (source.to_user_id is null and source.to_login_name=actor->>'login_name')) is not true then
  raise exception 'forbidden reply source' using errcode='42501'; end if;
 select * into latest from public.transaction_routes where transaction_id=p_tx
  and route_type<>'ceo_view' and status in ('completed','accepted') order by created_at desc,id desc limit 1;
 if latest.id is distinct from source.id then raise exception 'stale reply custody' using errcode='42501'; end if;
 flags:=app_private.transaction_feedback_flags(p_actor,p_tx);
 if not coalesce((flags->>'incoming')::boolean,false) then raise exception 'forbidden reply custody' using errcode='42501'; end if;
 if exists(select 1 from public.transaction_routes where transaction_id=p_tx and route_type='assistant_transfer' and status='pending') then
  raise exception 'stale reply custody' using errcode='42501'; end if;
 -- Resolve the exact original sender, not an arbitrary manager in the department.
 select a.* into sender from public.account_migration_users a join public.profiles p on p.id=a.migrated_user_id and p.active
 where a.eligible and ((source.from_user_id is not null and a.migrated_user_id=source.from_user_id)
  or (source.from_user_id is null and a.preferred_login=source.from_login_name));
 if not found or sender.migrated_user_id is null or sender.migrated_user_id=p_actor then
  raise exception 'reply sender unavailable' using errcode='42501'; end if;
 -- An active assistant membership in the sender's sector is mandatory. General
 -- view_all/act_all and historical participation are not custody authorization.
 if not exists(select 1 from public.user_memberships am
  join public.organizational_units root on root.id=am.unit_id and root.active
  join public.user_memberships sm on sm.user_id=sender.migrated_user_id and sm.active
  join public.organizational_units child on child.id=sm.unit_id and child.active
  where am.user_id=p_actor and am.active and am.membership_role='assistant'
   and app_private.unit_in_scope(root.id,child.id)) then
  raise exception 'forbidden reply sector' using errcode='42501'; end if;
 if exists(select 1 from public.transaction_routes where transaction_id=p_tx and route_type='reply'
  and meta->>'reply_to_route_id'=p_route::text) then raise exception 'reply already answered' using errcode='22023'; end if;
 PERFORM app_private.qa_enforcement_admit(p_actor,p_session,ARRAY[sender.canonical_key],ARRAY[sender.migrated_user_id],ARRAY[p_tx]);
 target_role:=public.user_context_internal(sender.migrated_user_id)->>'role';
 target_level:=case when target_role in ('ceo','ceo_office_manager','ceo_secretary') then 'ceo'
  when target_role in ('employee','manager','assistant') then target_role else null end;
 if target_level is null then raise exception 'reply sender role unavailable' using errcode='42501'; end if;
 now_at:=clock_timestamp();
 -- Keep overall responsibility and the highest closing authority unchanged.
 update public.transaction_assignment_targets at set active=false,completed_at=now_at
 from public.transaction_assignments a where a.id=at.assignment_id and a.transaction_id=p_tx and a.status='active' and at.active;
 update public.transaction_assignment_users au set active=false,completed_at=now_at
 from public.transaction_assignments a where a.id=au.assignment_id and a.transaction_id=p_tx and a.status='active' and au.active;
 update public.transaction_assignments set status='completed',completed_at=now_at where transaction_id=p_tx and status='active';
 PERFORM app_private.qa_enforcement_admit(p_actor,p_session,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[p_tx]);
 insert into public.transaction_routes(transaction_id,route_type,from_user_id,from_role,from_login_name,from_name,
  to_user_id,to_login_name,to_name,directive,status,created_at,meta)
 values(p_tx,'reply',p_actor,'assistant',actor->>'login_name',actor->>'full_name',sender.migrated_user_id,
  sender.preferred_login,sender.display_name,response,'completed',now_at,
  jsonb_build_object('reply_to_route_id',p_route,'reply_operation_id',p_operation_id,'response',response)) returning id into reply_id;
 update public.transactions set current_level=target_level,workflow_started=true,updated_at=now_at where id=p_tx;
 PERFORM app_private.qa_enforcement_admit(p_actor,p_session,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[p_tx]);
 insert into public.transaction_history(transaction_id,event_type,actor_id,actor_name,detail,meta)
 values(p_tx,'assistant_reply',p_actor,actor->>'full_name',response,
  jsonb_build_object('reply_route_id',reply_id,'reply_to_route_id',p_route,'to_user_id',sender.migrated_user_id,'to',sender.display_name));
 PERFORM app_private.qa_enforcement_admit(p_actor,p_session,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[p_tx]);
 insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
 values(p_actor,'assistant_reply','transaction',p_tx,'رد المساعد وإعادة المعاملة إلى صاحب الطلب',
  jsonb_build_object('reply_route_id',reply_id,'source_route_id',p_route,'to_user_id',sender.migrated_user_id));
 PERFORM app_private.qa_enforcement_admit(p_actor,p_session,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[p_tx]);
 insert into public.notifications(user_id,target_login_name,target_name,transaction_id,event_type,title,body)
 values(sender.migrated_user_id,sender.preferred_login,sender.display_name,p_tx,'assistant_reply','رد المساعد على: '||t.title,response);
 result:=jsonb_build_object('ok',true,'replayed',false,'reply_route_id',reply_id,
  'transaction_id',p_tx,'source_route_id',p_route,'operation_id',p_operation_id,'actor_user_id',p_actor,
  'target_user_id',sender.migrated_user_id,'target_login_name',sender.preferred_login,'target_name',sender.display_name);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.next_transaction_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  y integer := extract(year from now())::integer;
  n bigint;
begin
 PERFORM app_private.qa_enforcement_admit(NULL,NULL,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[]::uuid[]);
  PERFORM app_private.qa_enforcement_admit(NULL,NULL,ARRAY[]::text[],ARRAY[]::uuid[],ARRAY[]::uuid[]);
  IF NOT app_private.account_permission_effective((SELECT actor_user FROM app_private.qa_verified_write_actor()),'transactions.create') THEN
   RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  insert into public.transaction_sequences(year,last_value)
  values(y,1)
  on conflict(year) do update set last_value=public.transaction_sequences.last_value+1
  returning last_value into n;
  return y::text || '-' || lpad(n::text,6,'0');
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.transaction_feedback_flags(p_user uuid, p_tx uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.transactions%rowtype; c jsonb; r public.transaction_routes%rowtype;
 v_login text; v_name text; v_role text; v_all boolean; v_creator boolean; v_responsible boolean;
 v_scope boolean:=false; v_scope_visible boolean:=false; v_ever boolean:=false;
 v_history boolean:=false; v_current boolean:=false; v_has_assignment boolean:=false;
 v_visible boolean:=false; v_incoming boolean:=false; v_shared boolean:=false;
 v_names text[]:='{}'; v_custodians uuid[]:='{}'; v_secretary boolean:=false;
begin
 IF NOT coalesce((SELECT allowed FROM app_private.qa_scope_internal(p_user,NULL,NULL,p_tx)),false) THEN RETURN jsonb_build_object('visible',false,'incoming',false,'shared',false,'scope',false,'ceo',false,'closed',false,'current_assignees','[]'::jsonb,'secretary_queue',false); END IF;
 c:=public.user_context_internal(p_user);
 if c is null or not coalesce((c->>'active')::boolean,false)
   or coalesce((c->>'must_change_password')::boolean,true)
   or not exists(select 1 from public.account_migration_users a
     join app_private.account_credential_state s on s.user_id=a.migrated_user_id
     where a.migrated_user_id=p_user and a.eligible and not a.must_change_password)
   or exists(select 1 from app_private.account_password_operations o
     where o.target_id=p_user and o.status in ('pending','uncertain')) then
  return jsonb_build_object('visible',false,'incoming',false,'shared',false,'scope',false,
   'ceo',false,'closed',false,'current_assignees','[]'::jsonb,'secretary_queue',false);
 end if;
 select * into t from public.transactions where id=p_tx;
 if not found then return jsonb_build_object('visible',false,'incoming',false,'shared',false,'scope',false,
   'ceo',false,'closed',false,'current_assignees','[]'::jsonb,'secretary_queue',false); end if;
 v_login:=c->>'login_name'; v_name:=c->>'full_name'; v_role:=c->>'role';
 v_all:=app_private.account_permission_effective(p_user,'transactions.view_all');
 v_creator:=coalesce(t.created_by=p_user or (t.created_by is null
   and nullif(t.created_by_name,'') in (v_login,v_name)),false);
 v_responsible:=coalesce(t.responsible_user_id=p_user or (t.responsible_user_id is null
   and (nullif(t.responsible_login_name,'')=v_login or nullif(t.responsible_name,'') in(v_login,v_name))),false);
 -- Membership UUIDs, not organizational display names, are authoritative.
 select exists(select 1 from public.user_memberships m join public.organizational_units u on u.id=m.unit_id and u.active
  where m.user_id=p_user and m.active and (
   (v_role in ('manager','employee') and (m.unit_id=t.responsible_unit_id or exists(
    select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.status='active' and a.unit_id=m.unit_id)))
   or (v_role='assistant' and m.membership_role='assistant' and (
    app_private.unit_in_scope(m.unit_id,t.responsible_unit_id) or exists(
     select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.status='active' and app_private.unit_in_scope(m.unit_id,a.unit_id)))))) into v_scope;
 -- A hidden direct assignment must not leak through its responsible unit.
 select v_scope and (not exists(select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.assignment_type='direct')
  or exists(select 1 from public.transaction_assignments a
    join public.user_memberships m on m.user_id=p_user and m.active
    join public.organizational_units u on u.id=m.unit_id and u.active
    where a.transaction_id=p_tx and (a.status='active' or a.assignment_type='direct') and (a.unit_id=m.unit_id or (v_role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,a.unit_id)))
    and (a.assignment_type<>'direct' or (v_role='manager' and a.visibility_scope in ('manager','manager_assistant'))
      or (v_role='assistant' and a.visibility_scope in ('assistant','manager_assistant'))))) into v_scope_visible;
 -- Historical explicitly permitted direct viewing remains a read relationship,
 -- but only current assignment visibility may widen operational scope.
 select v_scope_visible and (
  not exists(select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.assignment_type='direct' and a.status='active')
  or exists(select 1 from public.transaction_assignments a
   join public.user_memberships m on m.user_id=p_user and m.active
   join public.organizational_units u on u.id=m.unit_id and u.active
   where a.transaction_id=p_tx and a.status='active'
    and (a.unit_id=m.unit_id or (v_role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,a.unit_id)))
    and (a.assignment_type<>'direct' or (v_role='manager' and a.visibility_scope in ('manager','manager_assistant'))
     or (v_role='assistant' and a.visibility_scope in ('assistant','manager_assistant'))))) into v_scope;
 select * into r from public.transaction_routes where transaction_id=p_tx
  and route_type<>'ceo_view' and status in ('completed','accepted')
  order by created_at desc,id desc limit 1;
 select exists(select 1 from public.transaction_assignments a where a.transaction_id=p_tx and (
  exists(select 1 from public.transaction_assignment_targets at where at.assignment_id=a.id
   and (at.user_id=p_user or (at.user_id is null and at.login_name=v_login)))
  or exists(select 1 from public.transaction_assignment_users au where au.assignment_id=a.id and au.user_id=p_user))) into v_ever;
 select exists(select 1 from public.transaction_routes x where x.transaction_id=p_tx and (
  x.from_user_id=p_user or (x.from_user_id is null and x.from_login_name=v_login)
  or ((x.to_user_id=p_user or (x.to_user_id is null and x.to_login_name=v_login))
    and x.status in ('pending','completed','accepted'))))
  or exists(select 1 from public.transaction_participants p where p.transaction_id=p_tx and p.user_id=p_user and p.active) into v_history;
 -- Only live assignments with live recipients form custody. Completed/cancelled
 -- targets remain participants, never current recipients.
 select coalesce(bool_or(true),false),coalesce(bool_or(q.mine),false),coalesce(array_agg(distinct q.name order by q.name) filter(where q.name is not null),'{}'),coalesce(array_agg(distinct q.uid) filter(where q.uid is not null),'{}')
 into v_has_assignment,v_current,v_names,v_custodians from (
  select coalesce(nullif(at.display_name,''),p.full_name) name,coalesce(at.user_id,p.id) uid,
   coalesce(at.user_id=p_user or (at.user_id is null and at.login_name=v_login),false) mine
  from public.transaction_assignments a join public.transaction_assignment_targets at on at.assignment_id=a.id and at.active and at.completed_at is null
   left join public.profiles p on p.id=at.user_id or (at.user_id is null and p.login_name=at.login_name)
  where a.transaction_id=p_tx and a.status='active' and a.completed_at is null
   and (t.current_level not in ('assistant','ceo') or r.id is null or a.created_at>=r.created_at)
  union all
  select p.full_name,au.user_id,au.user_id=p_user from public.transaction_assignments a
   join public.transaction_assignment_users au on au.assignment_id=a.id and au.active and au.completed_at is null
   join public.profiles p on p.id=au.user_id where a.transaction_id=p_tx and a.status='active' and a.completed_at is null
   and (t.current_level not in ('assistant','ceo') or r.id is null or a.created_at>=r.created_at)
 ) q;
 if not v_has_assignment then
  if r.id is not null then
   select coalesce(array_agg(distinct p.id),'{}'),coalesce(array_agg(distinct p.full_name order by p.full_name),'{}')
   into v_custodians,v_names from public.profiles p
   -- Explicit executive recipients share the workflow level, not custody.
   -- UUID wins over stale login/display text; login is legacy fallback only.
   where p.active and coalesce((select allowed from app_private.qa_scope_internal(p_user,p.id,NULL,NULL)),false) and ((public.user_context_internal(p.id)->>'role')=t.current_level
     or (t.current_level='ceo' and (r.to_user_id is not null or nullif(r.to_login_name,'') is not null)
       and (public.user_context_internal(p.id)->>'role') in ('ceo','ceo_office_manager','ceo_secretary')))
    and (p.id=r.to_user_id or (r.to_user_id is null and nullif(r.to_login_name,'') is not null and p.login_name=r.to_login_name)
     or (r.to_user_id is null and nullif(r.to_login_name,'') is null and exists(
      select 1 from public.user_memberships m join public.organizational_units u on u.id=m.unit_id and u.active
      where m.user_id=p.id and m.active and m.unit_id=r.to_unit_id
       and m.membership_role=case t.current_level when 'assistant' then 'assistant' when 'manager' then 'manager' else 'member' end)));
   -- The existing Edge raise producer emits this exact unaddressed CEO
   -- target. Do not reinterpret an explicit identity/unit or another label.
   if t.current_level='ceo' and r.route_type='raise' and r.to_name='الرئيس التنفيذي'
     and r.to_user_id is null and nullif(r.to_login_name,'') is null and r.to_unit_id is null then
    select coalesce(array_agg(distinct p.id),'{}'),coalesce(array_agg(distinct p.full_name order by p.full_name),'{}')
    into v_custodians,v_names from public.profiles p
    where p.active and coalesce((select allowed from app_private.qa_scope_internal(p_user,p.id,NULL,NULL)),false) and (public.user_context_internal(p.id)->>'role')='ceo';
   end if;
   v_current:=p_user=any(v_custodians);
   if cardinality(v_names)=0 then
    v_names:=array_remove(array[coalesce(nullif(r.to_name,''),nullif(r.to_login_name,''),
     (select name from public.organizational_units where id=r.to_unit_id))],null);
   end if;
  else
   v_current:=not t.workflow_started and (v_creator or v_responsible);
   if not t.workflow_started then v_custodians:=array_remove(array[t.responsible_user_id,t.created_by],null); end if;
   v_names:=array_remove(array[coalesce(nullif(t.responsible_name,''),(select full_name from public.profiles where id=t.responsible_user_id),nullif(t.created_by_name,''),(select full_name from public.profiles where id=t.created_by))],null);
  end if;
 end if;
 -- Queue is a read-only relationship, never an assistant permission/scope grant.
 if v_role='assistant_secretary' and t.status='open' and t.current_level='assistant' then
  select exists(
   select 1 from public.user_memberships office
   join public.organizational_units root on root.id=office.unit_id and root.active and root.parent_id is null
   join public.user_memberships am on am.user_id=any(v_custodians) and am.active and am.membership_role='assistant'
   join public.organizational_units au on au.id=am.unit_id and au.active
   join public.profiles ap on ap.id=am.user_id and ap.active and not ap.must_change_password
   where office.user_id=p_user and office.active and office.membership_role='office'
   and app_private.unit_in_scope(root.id,am.unit_id)
   and (public.user_context_internal(am.user_id)->>'role')='assistant'
  ) into v_secretary;
 end if;
 v_visible:=v_secretary or v_all or v_creator or v_responsible or v_ever or v_history or v_scope_visible or v_current;
 if t.status='cancelled' then v_visible:=v_all or v_creator; end if;
 v_incoming:=v_visible and t.status='open' and v_current;
 v_shared:=v_visible and t.status='open' and not v_incoming and (v_creator or v_responsible or v_ever or v_history);
 return jsonb_build_object('visible',v_visible,'incoming',v_incoming,'shared',v_shared,'scope',v_scope,
  'ceo',coalesce(t.current_level='ceo',false),'closed',t.status='closed','current_assignees',to_jsonb(v_names),'secretary_queue',v_secretary);
end $function$;

CREATE OR REPLACE FUNCTION app_private.transaction_directory_current()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid; v_ctx jsonb; v_role text; v_org text; v_login text; v_name text; v_depts text[]; v_result jsonb;
begin
  v_uid:=auth.uid();
  if not app_private.account_access_ready(v_uid) then raise exception 'account unavailable' using errcode='42501'; end if;
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_ctx:=public.user_context_internal(v_uid);
  if v_ctx is null or coalesce((v_ctx->>'active')::boolean,false) is not true
     or coalesce((v_ctx->>'must_change_password')::boolean,false) is true then
    raise exception 'account unavailable' using errcode='42501';
  end if;

  v_role:=coalesce(v_ctx->>'role','employee');
  v_org:=coalesce(v_ctx->>'org_name','');
  v_login:=coalesce(v_ctx->>'login_name','');
  v_name:=coalesce(v_ctx->>'full_name','');

  select coalesce(array_agg(value),'{}'::text[]) into v_depts
  from jsonb_array_elements_text(coalesce(v_ctx->'dept_names','[]'::jsonb));

  with recursive org_root as (
    select ou.id
    from public.organizational_units ou
    where v_role='assistant' and ou.parent_id is null and ou.name=v_org and ou.active
  ),
  scope_tree as (
    select id from org_root
    union all
    select ou.id
    from public.organizational_units ou
    join scope_tree s on ou.parent_id=s.id
    where ou.active
  ),
  scoped_units as (
    select ou.id,ou.name,ou.unit_type,ou.parent_id
    from public.organizational_units ou
    where ou.active and (
      v_role in ('ceo','ceo_office_manager','ceo_secretary')
      or (v_role='assistant' and ou.id in (select id from scope_tree))
      or (v_role in ('manager','employee') and ou.name=any(v_depts))
    )
  ),
  scoped_users as (
    select
      amu.preferred_login login_name,
      amu.display_name,
      amu.role_code role,
      coalesce(amu.job_title,'') job_title,
      coalesce(amu.org_name,'') org_name,
      coalesce(amu.dept_names,'{}'::text[]) dept_names,
      amu.migrated_user_id user_id
    from public.account_migration_users amu
    where amu.eligible and coalesce((select allowed from app_private.qa_scope_internal(v_uid,amu.migrated_user_id,amu.canonical_key,NULL)),false) and (
      v_role in ('ceo','ceo_office_manager','ceo_secretary')
      or (v_role='assistant' and (amu.org_name=v_org or amu.role_code='assistant' or amu.preferred_login=v_login))
      or (v_role='manager' and (
        amu.preferred_login=v_login
        or (amu.role_code='assistant' and amu.org_name=v_org)
        or (amu.org_name=v_org and amu.dept_names && v_depts)
      ))
      or (v_role='employee' and (
        amu.preferred_login=v_login
        or (amu.role_code='manager' and amu.org_name=v_org and amu.dept_names && v_depts)
      ))
    )
  )
  select jsonb_build_object(
    'ok',true,
    'me',jsonb_build_object(
      'app','new','login_name',v_login,'display_name',v_name,'role',v_role,'org_name',v_org,
      'dept_name',coalesce(v_depts[1],''),'dept_names',to_jsonb(v_depts)
    ),
    'users',coalesce((
      select jsonb_agg(jsonb_build_object(
        'login_name',u.login_name,'display_name',u.display_name,'role',u.role,'job_title',u.job_title,
        'org_name',u.org_name,'dept_name',coalesce(u.dept_names[1],''),'dept_names',to_jsonb(u.dept_names),
        'user_id',u.user_id
      ) order by u.display_name)
      from scoped_users u
    ),'[]'::jsonb),
    'units',coalesce((
      select jsonb_agg(to_jsonb(su) order by su.name)
      from scoped_units su
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION app_private.qa_enforcement_account_visible(p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $qa$
 SELECT app_private.account_access_ready(auth.uid()) AND coalesce(
  (SELECT allowed FROM app_private.qa_scope_internal(auth.uid(),p_target,NULL,NULL)),false);
$qa$;
ALTER FUNCTION app_private.qa_enforcement_account_visible(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_enforcement_account_visible(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.qa_enforcement_account_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS qa_enforcement_cohort_read ON public.profiles;
CREATE POLICY qa_enforcement_cohort_read ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated USING (app_private.qa_enforcement_account_visible(id));

DROP POLICY IF EXISTS qa_enforcement_cohort_read ON public.user_roles;
CREATE POLICY qa_enforcement_cohort_read ON public.user_roles AS RESTRICTIVE FOR SELECT TO authenticated USING (app_private.qa_enforcement_account_visible(user_id));

DROP POLICY IF EXISTS qa_enforcement_cohort_read ON public.user_memberships;
CREATE POLICY qa_enforcement_cohort_read ON public.user_memberships AS RESTRICTIVE FOR SELECT TO authenticated USING (app_private.qa_enforcement_account_visible(user_id));
-- Shared CEO journal and import archive are not per-run QA resources.
-- Preserve original invoker/ACL metadata. Never grant authenticated/service access
-- to private helpers: security-definer triggers perform locked live admission.
CREATE OR REPLACE FUNCTION app_private.qa_enforcement_shared_write_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $qa$
DECLARE a record;
BEGIN
 SELECT * INTO STRICT a FROM app_private.qa_verified_write_actor();
 IF a.principal_class IS DISTINCT FROM 'ORDINARY' THEN
  RAISE EXCEPTION 'QA principal cannot write shared workspace/import resources' USING ERRCODE='42501';
 END IF;
 RETURN NULL;
END $qa$;
ALTER FUNCTION app_private.qa_enforcement_shared_write_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_enforcement_shared_write_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.commit_workspace_edit(p_scope text, p_revision bigint, p_request_id uuid, p_actor text, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v bigint; existing public.workspace_edits%ROWTYPE;
BEGIN
 IF NOT coalesce((SELECT allowed AND actor_class='ORDINARY' FROM public.qa_scope_probe_internal()),false) THEN RAISE EXCEPTION 'verified ordinary session required' USING ERRCODE='42501'; END IF;
 IF p_scope <> 'ceo:state' OR length(p_actor) NOT BETWEEN 1 AND 200 OR jsonb_typeof(p_operations) <> 'array' OR jsonb_array_length(p_operations) NOT BETWEEN 1 AND 50 OR octet_length(p_operations::text)>250000 THEN RAISE EXCEPTION 'invalid request'; END IF;
 SELECT revision INTO v FROM public.workspace_versions WHERE scope=p_scope FOR UPDATE;
 SELECT * INTO existing FROM public.workspace_edits WHERE scope=p_scope AND request_id=p_request_id;
 IF FOUND THEN
  IF existing.actor<>p_actor OR existing.operations<>p_operations THEN RAISE EXCEPTION 'idempotency key reused with different content'; END IF;
  RETURN jsonb_build_object('ok',true,'committed',true,'revision',existing.revision,'duplicate',true);
 END IF;
 IF v IS NULL OR v<>p_revision THEN RETURN jsonb_build_object('ok',false,'conflict',true,'revision',v); END IF;
 INSERT INTO public.workspace_edits(scope,revision,request_id,actor,operations) VALUES(p_scope,v+1,p_request_id,p_actor,p_operations);
 UPDATE public.workspace_versions SET revision=v+1 WHERE scope=p_scope;
 RETURN jsonb_build_object('ok',true,'committed',true,'revision',v+1);
END;$function$;
CREATE OR REPLACE FUNCTION public.ingest_legacy_batch(p_token_hash text, p_source_table text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_count integer; r jsonb;
BEGIN
 IF NOT coalesce((SELECT allowed AND actor_class='ORDINARY' FROM public.qa_scope_probe_internal()),false) THEN RAISE EXCEPTION 'verified ordinary session required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.migration_gate WHERE id=1 AND enabled AND expires_at>now() AND token_hash=p_token_hash) THEN RAISE EXCEPTION 'import disabled or unauthorized' USING ERRCODE='42501'; END IF;
 IF p_source_table NOT IN ('app_state','app_state_history','departments','profiles','user_departments','items','updates','mailer_config','mail_log','_pub','html_files','reports','user_state','portal_users','portal_pending','portal_log','portal_trx','ceo_users','portal_items','portal_task_updates','portal_dept_trx','portal_reports','portal_routes','portal_team_tasks','portal_audit','portal_prefs') THEN RAISE EXCEPTION 'table not permitted'; END IF;
 IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'invalid batch'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
 IF r->>'hash' IS DISTINCT FROM md5((r->'payload')::text) THEN RAISE EXCEPTION 'source digest mismatch'; END IF;
 INSERT INTO public.legacy_archive(source_table,source_key,payload) VALUES(p_source_table,r->>'key',r->'payload') ON CONFLICT(source_table,source_key) DO UPDATE SET payload=excluded.payload,imported_at=now();
 END LOOP;
 v_count:=jsonb_array_length(p_rows);
 INSERT INTO public.migration_receipts(source_table,batch_count) VALUES(p_source_table,v_count);
 RETURN jsonb_build_object('ok',true,'table',p_source_table,'count',v_count);
END;$function$;
DROP TRIGGER IF EXISTS qa_enforcement_shared_write ON public.workspace_versions;
CREATE TRIGGER qa_enforcement_shared_write BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_versions
FOR EACH STATEMENT EXECUTE FUNCTION app_private.qa_enforcement_shared_write_guard();
DROP TRIGGER IF EXISTS qa_enforcement_shared_write ON public.workspace_edits;
CREATE TRIGGER qa_enforcement_shared_write BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_edits
FOR EACH STATEMENT EXECUTE FUNCTION app_private.qa_enforcement_shared_write_guard();
DROP TRIGGER IF EXISTS qa_enforcement_shared_write ON public.legacy_archive;
CREATE TRIGGER qa_enforcement_shared_write BEFORE INSERT OR UPDATE OR DELETE ON public.legacy_archive
FOR EACH STATEMENT EXECUTE FUNCTION app_private.qa_enforcement_shared_write_guard();
DROP TRIGGER IF EXISTS qa_enforcement_shared_write ON public.migration_receipts;
CREATE TRIGGER qa_enforcement_shared_write BEFORE INSERT OR UPDATE OR DELETE ON public.migration_receipts
FOR EACH STATEMENT EXECUTE FUNCTION app_private.qa_enforcement_shared_write_guard();
DROP TRIGGER IF EXISTS qa_enforcement_shared_write ON public.migration_gate;
CREATE TRIGGER qa_enforcement_shared_write BEFORE INSERT OR UPDATE OR DELETE ON public.migration_gate
FOR EACH STATEMENT EXECUTE FUNCTION app_private.qa_enforcement_shared_write_guard();
-- Separate transient Core call frame; NOT a cohort manifest or delete context.
-- Requires focused review before activation; no caller CRUD, flags or GUC authority.
CREATE TABLE IF NOT EXISTS app_private.qa_core_provision_context(
 backend_pid integer NOT NULL, sql_xid xid8 NOT NULL, source_function oid NOT NULL,
 canonical_key text NOT NULL, target_user uuid NOT NULL, login_name text NOT NULL,
 display_name text NOT NULL, role_code text NOT NULL, expected_memberships jsonb NOT NULL,
 PRIMARY KEY(backend_pid,sql_xid,source_function,canonical_key,target_user));
ALTER TABLE app_private.qa_core_provision_context OWNER TO postgres;
REVOKE ALL ON app_private.qa_core_provision_context FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION app_private.qa_core_provision_row_allowed(p_table oid,p_op text,p_old jsonb,p_new jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $qa$
 SELECT p_op IN ('INSERT','UPDATE') AND EXISTS(
 SELECT 1 FROM app_private.qa_core_provision_context c WHERE c.backend_pid=pg_backend_pid()
 AND c.sql_xid=pg_current_xact_id() AND c.source_function='public.account_provision_link_internal(text,uuid,jsonb)'::regprocedure
 AND CASE
 WHEN p_table='public.profiles'::regclass THEN
  p_new->>'id'=c.target_user::text AND p_new->>'login_name'=c.login_name AND p_new->>'full_name'=c.display_name
  AND p_new->'active'='true'::jsonb AND p_new->'must_change_password'='true'::jsonb
  AND ((p_op='INSERT' AND p_new=jsonb_build_object('id',c.target_user,'login_name',c.login_name,'full_name',c.display_name,'job_title',NULL,'active',true,'legacy_source',NULL,'legacy_username',NULL,'created_at',now(),'updated_at',now(),'must_change_password',true,'contact_email',NULL)) OR p_op='UPDATE' AND p_old->>'id'=c.target_user::text AND
   (p_old-'login_name'-'full_name'-'must_change_password'-'updated_at')=(p_new-'login_name'-'full_name'-'must_change_password'-'updated_at'))
 WHEN p_table='public.user_roles'::regclass THEN p_op='INSERT' AND p_new->>'user_id'=c.target_user::text
  AND p_new=jsonb_build_object('user_id',c.target_user,'role_code',c.role_code,'is_primary',true,'created_at',now())
 WHEN p_table='public.user_memberships'::regclass THEN p_op='INSERT' AND p_new->>'user_id'=c.target_user::text
  AND p_new->'active'='true'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.expected_memberships) m
   WHERE p_new=jsonb_build_object('user_id',c.target_user,'unit_id',(m->>'unit_id')::uuid,'membership_role',m->>'membership_role','is_primary',(m->>'is_primary')::boolean,'active',true,'created_at',now()))
 WHEN p_table='public.account_migration_users'::regclass THEN p_op='UPDATE' AND p_old->>'canonical_key'=c.canonical_key
  AND p_new->>'canonical_key'=c.canonical_key AND p_old->'migrated_user_id'='null'::jsonb
  AND p_new->>'migrated_user_id'=c.target_user::text AND p_new->'must_change_password'='true'::jsonb
  AND (p_old-'migrated_user_id'-'must_change_password'-'migrated_at')=(p_new-'migrated_user_id'-'must_change_password'-'migrated_at')
 ELSE false END);
$qa$;
ALTER FUNCTION app_private.qa_core_provision_row_allowed(oid,text,jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.qa_core_provision_row_allowed(oid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.account_provision_link_internal(p_key text, p_auth_user uuid, p_memberships jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.account_migration_users%rowtype; p public.profiles%rowtype;
 v_expected jsonb; v_email text; v_found boolean; v_written public.profiles%rowtype; v_actual public.profiles%rowtype; v_rows integer;
begin
 -- Exact named service management source. No app actor/SID fallback.
 IF current_setting('role',true) IS DISTINCT FROM 'service_role'
 OR auth.jwt()->>'role' IS DISTINCT FROM 'service_role'
 OR coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb ?| ARRAY['x-qa-actor-user','x-qa-actor-sid']
 OR p_key IS NULL OR p_key<>ALL(ARRAY['ceo','haif','bazai','faisal','fahad_ceo','staff_006','staff_007','rashid','staff_009','staff_010','staff_011','staff_012','ahmad','staff_014','staff_015','staff_016','zakri','majed_projects','staff_019','staff_020','staff_021','staff_022','staff_023','staff_024','staff_025','staff_026','staff_027','omar_awqaf','staff_029','staff_030','staff_031','staff_032','staff_033','staff_034','staff_035','abdulrahman','staff_037','staff_038','staff_039','staff_040','staff_041','staff_042','staff_043','staff_044','staff_045','staff_046','staff_047','staff_048','staff_049','staff_050','staff_051','staff_052','staff_053','staff_054','staff_055','staff_056','staff_057']::text[])
 OR EXISTS(SELECT 1 FROM app_private.qa_account_manifest q WHERE q.user_id=p_auth_user OR q.canonical_key=p_key OR q.login_alias=p_key) THEN
  RAISE EXCEPTION 'Core source management denied; QA provisioning requires separately reviewed owned control' USING ERRCODE='42501';
 END IF;
 select * into a from public.account_migration_users where canonical_key=p_key for update;
 if not found or not a.eligible or p_auth_user is null then raise exception 'invalid account'; end if;
 -- Serializes the absent-profile case too. Unique link/email indexes remain authoritative.
 perform pg_advisory_xact_lock(hashtextextended(p_auth_user::text,0));
 select * into p from public.profiles where id=p_auth_user for update;
 v_found:=found;
 select email into v_email from auth.users where id=p_auth_user for share;
 if not found or v_email is distinct from a.internal_email then raise exception 'identity conflict'; end if;
 if a.migrated_user_id is not null then
  if a.migrated_user_id<>p_auth_user then raise exception 'identity conflict'; end if;
  -- Existing ten links, their flags/roles/memberships (especially Faisal), are untouched.
  return jsonb_build_object('ok',true,'status','already_linked','target_user_id',p_auth_user,
   'canonical_key',a.canonical_key,'login_username',a.login_username);
 end if;
 if a.canonical_key='faisal' or p_auth_user='0a1df502-9232-4ef5-af2d-df585ad7f187'
   or exists(select 1 from public.account_migration_users where migrated_user_id=p_auth_user)
   or exists(select 1 from public.profiles where login_name=a.preferred_login and id<>p_auth_user) then
  raise exception 'identity conflict';
 end if;
 if v_found and (not p.active or (p.login_name is not null and p.login_name<>a.preferred_login)) then
  raise exception 'profile conflict';
 end if;
 if jsonb_typeof(p_memberships) is distinct from 'array' then raise exception 'invalid memberships'; end if;
 if exists(select 1 from jsonb_array_elements(p_memberships) j where
  jsonb_typeof(j) is distinct from 'object' or
  jsonb_typeof(j->'unit_id') is distinct from 'string' or
  jsonb_typeof(j->'membership_role') is distinct from 'string' or
  jsonb_typeof(j->'is_primary') is distinct from 'boolean' or
  (j-'unit_id'-'membership_role'-'is_primary')<>'{}'::jsonb) then
  raise exception 'invalid memberships';
 end if;
 v_expected:=app_private.account_expected_memberships(p_key);
 if jsonb_array_length(p_memberships)<>jsonb_array_length(v_expected) or exists(
  (select unit_id,membership_role,is_primary from jsonb_to_recordset(p_memberships) as m(unit_id uuid,membership_role text,is_primary boolean)
   except select unit_id,membership_role,is_primary from jsonb_to_recordset(v_expected) as m(unit_id uuid,membership_role text,is_primary boolean))
  union all
  (select unit_id,membership_role,is_primary from jsonb_to_recordset(v_expected) as m(unit_id uuid,membership_role text,is_primary boolean)
   except select unit_id,membership_role,is_primary from jsonb_to_recordset(p_memberships) as m(unit_id uuid,membership_role text,is_primary boolean))
 ) then raise exception 'membership hierarchy conflict'; end if;
 if exists(select 1 from public.user_roles where user_id=p_auth_user and (role_code<>a.role_code or not is_primary)) then
  raise exception 'existing role conflict';
 end if;
 if exists(select 1 from public.user_memberships um where um.user_id=p_auth_user and
  (not um.active or not exists(select 1 from jsonb_to_recordset(v_expected) as m(unit_id uuid,membership_role text,is_primary boolean)
   where m.unit_id=um.unit_id and m.membership_role=um.membership_role and m.is_primary=um.is_primary))) then
  raise exception 'existing membership conflict';
 end if;
 if exists(select 1 from app_private.account_password_operations where target_id=p_auth_user)
   or exists(select 1 from app_private.account_credential_state where user_id=p_auth_user and generation<>0) then
  raise exception 'credential state conflict';
 end if;
 insert into app_private.qa_core_provision_context(backend_pid,sql_xid,source_function,canonical_key,target_user,login_name,display_name,role_code,expected_memberships)
 values(pg_backend_pid(),pg_current_xact_id(),'public.account_provision_link_internal(text,uuid,jsonb)'::regprocedure,p_key,p_auth_user,a.preferred_login,a.display_name,a.role_code,v_expected);
 insert into public.profiles(id,login_name,full_name,active,must_change_password)
 values(p_auth_user,a.preferred_login,a.display_name,true,true)
 on conflict(id) do update set login_name=excluded.login_name,full_name=excluded.full_name,
  must_change_password=true,updated_at=clock_timestamp() returning * into v_written;
 if not found then raise exception 'Core profile effect suppressed' using errcode='42501';end if;
 select * into v_actual from public.profiles where id=p_auth_user;
 if to_jsonb(v_actual) is distinct from to_jsonb(v_written) or not coalesce(app_private.qa_core_provision_row_allowed('public.profiles'::regclass,case when v_found then 'UPDATE' else 'INSERT' end,case when v_found then to_jsonb(p) else null end,to_jsonb(v_actual)),false) then raise exception 'Core profile effect mismatch' using errcode='42501';end if;
 insert into public.user_roles(user_id,role_code,is_primary) values(p_auth_user,a.role_code,true) on conflict do nothing;
 if not exists(select 1 from public.user_roles where user_id=p_auth_user and role_code=a.role_code and is_primary) then raise exception 'Core role effect missing' using errcode='42501';end if;
 insert into public.user_memberships(user_id,unit_id,membership_role,is_primary,active)
 select p_auth_user,unit_id,membership_role,is_primary,true
 from jsonb_to_recordset(v_expected) as m(unit_id uuid,membership_role text,is_primary boolean) on conflict do nothing;
 if exists(select 1 from jsonb_to_recordset(v_expected) as m(unit_id uuid,membership_role text,is_primary boolean) where not exists(select 1 from public.user_memberships um where um.user_id=p_auth_user and um.unit_id=m.unit_id and um.membership_role=m.membership_role and um.is_primary=m.is_primary and um.active)) then raise exception 'Core membership effect missing' using errcode='42501';end if;
 -- Keep canonical override fallback as-is. Never delete/copy overrides or reseed defaults.
 update public.account_migration_users set migrated_user_id=p_auth_user,must_change_password=true,
  migrated_at=clock_timestamp() where canonical_key=p_key and migrated_user_id is null;
 get diagnostics v_rows=ROW_COUNT;if v_rows<>1 or not exists(select 1 from public.account_migration_users where canonical_key=p_key and migrated_user_id=p_auth_user and must_change_password) then raise exception 'Core registry effect missing' using errcode='42501';end if;
 insert into app_private.account_credential_state(user_id,session_valid_after) values(p_auth_user,clock_timestamp())
 on conflict(user_id) do update set session_valid_after=excluded.session_valid_after;
 delete from app_private.qa_core_provision_context where backend_pid=pg_backend_pid() and sql_xid=pg_current_xact_id() and canonical_key=p_key and target_user=p_auth_user;
 return jsonb_build_object('ok',true,'status','linked','target_user_id',p_auth_user,
  'canonical_key',a.canonical_key,'login_username',a.login_username);
end;
$function$;
-- END LOCAL VERIFIABLE SECTION
COMMIT;
