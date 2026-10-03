create or replace function public.user_context_internal(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with profile as (
    select p.id,p.login_name,p.full_name,p.active,p.must_change_password
    from public.profiles p where p.id=p_user_id
  ),
  role_row as (
    select ur.role_code
    from public.user_roles ur
    where ur.user_id=p_user_id
    order by ur.is_primary desc, ur.created_at asc
    limit 1
  ),
  memberships as (
    select um.membership_role,um.is_primary,ou.id unit_id,ou.name,ou.unit_type,ou.parent_id
    from public.user_memberships um
    join public.organizational_units ou on ou.id=um.unit_id
    where um.user_id=p_user_id and um.active and ou.active
  ),
  migration as (
    select amu.org_name
    from public.account_migration_users amu
    where amu.migrated_user_id=p_user_id and amu.eligible
    limit 1
  )
  select case when p.id is null then null else jsonb_build_object(
    'login_name',p.login_name,
    'full_name',p.full_name,
    'active',p.active,
    'must_change_password',p.must_change_password,
    'role',coalesce((select role_code from role_row),'employee'),
    'org_name',coalesce((select org_name from migration),''),
    'dept_names',coalesce((select jsonb_agg(name order by is_primary desc,name) from memberships),'[]'::jsonb),
    'assistant_unit',coalesce((select name from memberships where membership_role='assistant' order by is_primary desc limit 1),'')
  ) end
  from profile p;
$$;

revoke all on function public.user_context_internal(uuid) from public,anon,authenticated;
grant execute on function public.user_context_internal(uuid) to service_role;
