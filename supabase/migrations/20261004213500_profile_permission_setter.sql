-- Allow permission administration for implemented permission sections.

create or replace function app_private.permissions_admin_set_account(
  p_actor uuid,p_target_key text,p_permission_code text,p_enabled boolean
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid; v_role text; v_base boolean; v_effect text;
begin
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
      delete from public.user_permissions
      where user_id=v_user and permission_code=p_permission_code;
    end if;
    delete from public.account_permission_overrides
    where canonical_key=p_target_key and permission_code=p_permission_code;
    v_effect:=null;
  else
    v_effect:=case when p_enabled then 'allow' else 'deny' end;
    if v_user is not null then
      insert into public.user_permissions(user_id,permission_code,effect)
      values(v_user,p_permission_code,v_effect)
      on conflict(user_id,permission_code)
      do update set effect=excluded.effect,created_at=now();
      delete from public.account_permission_overrides
      where canonical_key=p_target_key and permission_code=p_permission_code;
    else
      insert into public.account_permission_overrides(
        canonical_key,permission_code,effect,created_by,created_at,updated_at
      )
      values(p_target_key,p_permission_code,v_effect,p_actor,now(),now())
      on conflict(canonical_key,permission_code)
      do update set effect=excluded.effect,created_by=excluded.created_by,updated_at=now();
    end if;
  end if;

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
$$;

create or replace function app_private.permissions_admin_set(
  p_actor uuid,p_target_user uuid,p_permission_code text,p_enabled boolean
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_key text; v_base boolean; v_effect text;
begin
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
    delete from public.user_permissions
    where user_id=p_target_user and permission_code=p_permission_code;
    v_effect:=null;
  else
    v_effect:=case when p_enabled then 'allow' else 'deny' end;
    insert into public.user_permissions(user_id,permission_code,effect)
    values(p_target_user,p_permission_code,v_effect)
    on conflict(user_id,permission_code)
    do update set effect=excluded.effect,created_at=now();
  end if;

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
$$;
