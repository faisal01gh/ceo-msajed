CREATE OR REPLACE FUNCTION app_private.account_permission_effective(_user uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when _user is null then false else coalesce(
  (select up.effect='allow' from public.user_permissions up
   where up.user_id=_user and up.permission_code=_permission limit 1),
  (select apo.effect='allow' from public.account_migration_users amu
   join public.account_permission_overrides apo on apo.canonical_key=amu.canonical_key
   where amu.migrated_user_id=_user and amu.eligible and apo.permission_code=_permission limit 1),
  (select exists(select 1 from public.user_roles ur
   join public.role_permissions rp on rp.role_code=ur.role_code
   where ur.user_id=_user and rp.permission_code=_permission)),false) end;
$function$
