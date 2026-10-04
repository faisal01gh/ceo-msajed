-- Harden permissions administration RPC boundaries and index audit actor lookup.

create index if not exists idx_account_permission_overrides_created_by
  on public.account_permission_overrides(created_by);

create or replace function public.my_permissions()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select app_private.effective_permissions_json((select auth.uid()));
$$;

create or replace function public.permissions_admin_snapshot(
  p_section text default 'transactions'
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select app_private.permissions_admin_snapshot((select auth.uid()),p_section);
$$;

create or replace function public.permissions_admin_set(
  p_target_user uuid,p_permission_code text,p_enabled boolean
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select app_private.permissions_admin_set(
    (select auth.uid()),p_target_user,p_permission_code,p_enabled
  );
$$;

create or replace function public.permissions_admin_set_by_account(
  p_target_key text,p_permission_code text,p_enabled boolean
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select app_private.permissions_admin_set_account(
    (select auth.uid()),p_target_key,p_permission_code,p_enabled
  );
$$;

revoke all on function app_private.can_manage_permissions(uuid)
  from public,anon,authenticated;
revoke all on function app_private.effective_permissions_json(uuid)
  from public,anon,authenticated;
revoke all on function app_private.account_has_permission(text,text,text)
  from public,anon,authenticated;
revoke all on function app_private.permissions_admin_snapshot(uuid,text)
  from public,anon,authenticated;
revoke all on function app_private.permissions_admin_set(uuid,uuid,text,boolean)
  from public,anon,authenticated;
revoke all on function app_private.permissions_admin_set_account(uuid,text,text,boolean)
  from public,anon,authenticated;

revoke all on function public.my_permissions() from public,anon;
revoke all on function public.permissions_admin_snapshot(text) from public,anon;
revoke all on function public.permissions_admin_set(uuid,text,boolean) from public,anon;
revoke all on function public.permissions_admin_set_by_account(text,text,boolean) from public,anon;

grant execute on function public.my_permissions() to authenticated;
grant execute on function public.permissions_admin_snapshot(text) to authenticated;
grant execute on function public.permissions_admin_set(uuid,text,boolean) to authenticated;
grant execute on function public.permissions_admin_set_by_account(text,text,boolean) to authenticated;

grant execute on function app_private.account_has_permission(text,text,text) to service_role;
