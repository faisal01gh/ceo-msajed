-- Manager-controlled user name editing.
-- Password admin reset remains server-side Auth work and is not implemented by SQL.

create or replace function app_private.admin_set_account_name_current(
  p_target_key text,p_name text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_target uuid; v_name text;
begin
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

  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
  values(v_actor,'profile_name_changed','account',p_target_key,'تعديل اسم المستخدم',
    jsonb_build_object('name',v_name,'target_user_id',v_target));

  return jsonb_build_object('ok',true,'name',v_name);
end;
$$;

create or replace function public.admin_set_account_name(
  p_target_key text,p_name text
)
returns jsonb language sql security invoker set search_path=''
as $$ select app_private.admin_set_account_name_current(p_target_key,p_name); $$;

revoke all on function app_private.admin_set_account_name_current(text,text) from public,anon;
grant execute on function app_private.admin_set_account_name_current(text,text) to authenticated;
revoke all on function public.admin_set_account_name(text,text) from public,anon;
grant execute on function public.admin_set_account_name(text,text) to authenticated;
