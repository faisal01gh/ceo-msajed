-- Permissions section foundation + correction of Fahad Al-Rashid role.
-- Applied to msajed-ceo-erp on 2026-10-04.

insert into public.roles(code,name_ar)
values ('assistant_secretary','سكرتير المساعد')
on conflict(code) do update set name_ar=excluded.name_ar;

insert into public.permissions(code,name_ar)
values ('transactions.ceo_view','إطلاع الرئيس التنفيذي')
on conflict(code) do update set name_ar=excluded.name_ar;

insert into public.role_permissions(role_code,permission_code)
values
  ('manager','transactions.ceo_view'),
  ('assistant','transactions.ceo_view'),
  ('ceo','transactions.ceo_view'),
  ('ceo_office_manager','transactions.ceo_view'),
  ('ceo_secretary','transactions.ceo_view')
on conflict do nothing;

update public.account_migration_users
set role_code='assistant_secretary',
    job_title='سكرتير مساعد الرئيس التنفيذي للشؤون الإدارية والمالية'
where preferred_login='فهد الرشيد';

update public.profiles
set job_title='سكرتير مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',
    updated_at=now()
where id='7d8d861c-7736-45d2-b1cf-5e0d9e2f71d2';

delete from public.user_roles
where user_id='7d8d861c-7736-45d2-b1cf-5e0d9e2f71d2'
  and role_code='assistant';

insert into public.user_roles(user_id,role_code,is_primary)
values ('7d8d861c-7736-45d2-b1cf-5e0d9e2f71d2','assistant_secretary',true)
on conflict(user_id,role_code) do update set is_primary=true;

delete from public.user_memberships
where user_id='7d8d861c-7736-45d2-b1cf-5e0d9e2f71d2'
  and membership_role='assistant';

insert into public.user_memberships(user_id,unit_id,membership_role,is_primary,active)
select '7d8d861c-7736-45d2-b1cf-5e0d9e2f71d2',ou.id,'office',true,true
from public.organizational_units ou
where ou.name='مساعد الرئيس التنفيذي للشؤون الإدارية والمالية'
  and ou.parent_id is null
limit 1
on conflict(user_id,unit_id,membership_role)
do update set is_primary=true,active=true;

create or replace function app_private.can_manage_permissions(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=p_user_id
      and ur.role_code='ceo_office_manager'
      and p.active
  );
$$;

create or replace function app_private.effective_permissions_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(
    jsonb_agg(p.code order by p.code)
      filter(where app_private.has_permission(p_user_id,p.code)),
    '[]'::jsonb
  )
  from public.permissions p;
$$;

create or replace function public.my_permissions()
returns jsonb language sql stable set search_path=''
as $$
  select app_private.effective_permissions_json((select auth.uid()));
$$;

create or replace function app_private.permissions_admin_snapshot(
  p_actor uuid,p_section text default 'transactions'
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_prefix text; v_result jsonb;
begin
  if p_actor is null or not app_private.can_manage_permissions(p_actor) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_section <> 'transactions' then raise exception 'unsupported permission section'; end if;
  v_prefix:=p_section||'.';

  with permission_rows as (
    select p.code,p.name_ar,
      case when p.code in ('transactions.view_all','transactions.act_all','transactions.delete_hard')
        then false else true end editable
    from public.permissions p
    where p.code like v_prefix||'%'
  ),
  accounts as (
    select amu.canonical_key,amu.preferred_login,amu.display_name,amu.role_code,
           r.name_ar role_name,amu.migrated_user_id user_id
    from public.account_migration_users amu
    left join public.roles r on r.code=amu.role_code
    where amu.eligible
  ),
  user_matrix as (
    select a.*,pr.code permission_code,pr.name_ar permission_name,pr.editable,
      exists(select 1 from public.role_permissions rp
             where rp.role_code=a.role_code and rp.permission_code=pr.code) base_enabled,
      case when a.user_id is null then null else (
        select up.effect from public.user_permissions up
        where up.user_id=a.user_id and up.permission_code=pr.code limit 1
      ) end override_effect
    from accounts a cross join permission_rows pr
  ),
  users_json as (
    select canonical_key,preferred_login,display_name,role_code,role_name,user_id,
      jsonb_agg(jsonb_build_object(
        'code',permission_code,'name_ar',permission_name,'editable',editable,
        'base_enabled',base_enabled,'override_effect',override_effect,
        'effective_enabled',case when override_effect='allow' then true
                                 when override_effect='deny' then false
                                 else base_enabled end
      ) order by permission_name) permissions
    from user_matrix
    group by canonical_key,preferred_login,display_name,role_code,role_name,user_id
  )
  select jsonb_build_object(
    'ok',true,'section',p_section,
    'tabs',jsonb_build_array(jsonb_build_object('code','transactions','name_ar','المعاملات')),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object(
      'code',code,'name_ar',name_ar,'editable',editable) order by name_ar) from permission_rows),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object(
      'canonical_key',canonical_key,'login_name',preferred_login,'display_name',display_name,
      'role_code',role_code,'role_name',role_name,'user_id',user_id,'permissions',permissions
    ) order by display_name) from users_json),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function app_private.permissions_admin_set(
  p_actor uuid,p_target_user uuid,p_permission_code text,p_enabled boolean
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_editable boolean; v_base boolean; v_effect text;
begin
  if p_actor is null or not app_private.can_manage_permissions(p_actor) then
    raise exception 'forbidden' using errcode='42501';
  end if;

  if p_target_user is null or not exists(
    select 1 from public.profiles p where p.id=p_target_user and p.active
  ) then raise exception 'invalid user'; end if;

  select case when p.code in ('transactions.view_all','transactions.act_all','transactions.delete_hard')
              then false else true end
  into v_editable
  from public.permissions p
  where p.code=p_permission_code and p.code like 'transactions.%';

  if v_editable is distinct from true then raise exception 'permission is fixed by role'; end if;

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
    jsonb_build_object('permission',p_permission_code,'enabled',p_enabled,
                       'base_enabled',v_base,'override_effect',v_effect));

  return jsonb_build_object('ok',true,'permission',p_permission_code,'enabled',p_enabled,
                            'base_enabled',v_base,'override_effect',v_effect);
end;
$$;

create or replace function public.permissions_admin_snapshot(p_section text default 'transactions')
returns jsonb language sql stable set search_path=''
as $$
  select app_private.permissions_admin_snapshot((select auth.uid()),p_section);
$$;

create or replace function public.permissions_admin_set(
  p_target_user uuid,p_permission_code text,p_enabled boolean
)
returns jsonb language sql set search_path=''
as $$
  select app_private.permissions_admin_set((select auth.uid()),p_target_user,p_permission_code,p_enabled);
$$;

revoke all on function public.my_permissions() from public,anon;
revoke all on function public.permissions_admin_snapshot(text) from public,anon;
revoke all on function public.permissions_admin_set(uuid,text,boolean) from public,anon;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.permissions_admin_snapshot(text) to authenticated;
grant execute on function public.permissions_admin_set(uuid,text,boolean) to authenticated;

grant usage on schema app_private to authenticated;
revoke all on function app_private.effective_permissions_json(uuid) from public,anon;
revoke all on function app_private.permissions_admin_snapshot(uuid,text) from public,anon;
revoke all on function app_private.permissions_admin_set(uuid,uuid,text,boolean) from public,anon;
grant execute on function app_private.effective_permissions_json(uuid) to authenticated;
grant execute on function app_private.permissions_admin_snapshot(uuid,text) to authenticated;
grant execute on function app_private.permissions_admin_set(uuid,uuid,text,boolean) to authenticated;
