create or replace function app_private.list_transactions_current(
  p_tab text default 'all', p_search text default '', p_priority text default '',
  p_status text default '', p_department text default '', p_employee text default '',
  p_origin text default '', p_late_only boolean default false, p_date_from date default null,
  p_date_to date default null, p_page integer default 1, p_page_size integer default 50
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid; v_ctx jsonb; v_depts text[];
begin
  v_uid:=auth.uid();
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_ctx:=public.user_context_internal(v_uid);
  if v_ctx is null or coalesce((v_ctx->>'active')::boolean,false) is not true
     or coalesce((v_ctx->>'must_change_password')::boolean,false) is true then
    raise exception 'account unavailable' using errcode='42501';
  end if;
  select coalesce(array_agg(value),'{}'::text[]) into v_depts
  from jsonb_array_elements_text(coalesce(v_ctx->'dept_names','[]'::jsonb));
  return public.list_transactions_internal(
    v_ctx->>'login_name',v_ctx->>'full_name',v_ctx->>'role',v_ctx->>'org_name',v_depts,
    p_tab,p_search,p_priority,p_status,p_department,p_employee,p_origin,p_late_only,
    p_date_from,p_date_to,p_page,p_page_size
  );
end $$;

revoke all on function app_private.list_transactions_current(text,text,text,text,text,text,text,boolean,date,date,integer,integer) from public,anon;
grant execute on function app_private.list_transactions_current(text,text,text,text,text,text,text,boolean,date,date,integer,integer) to authenticated;

create or replace function public.list_my_transactions(
  p_tab text default 'all', p_search text default '', p_priority text default '',
  p_status text default '', p_department text default '', p_employee text default '',
  p_origin text default '', p_late_only boolean default false, p_date_from date default null,
  p_date_to date default null, p_page integer default 1, p_page_size integer default 50
)
returns jsonb language sql stable security invoker set search_path=''
as $$
 select app_private.list_transactions_current(
   p_tab,p_search,p_priority,p_status,p_department,p_employee,p_origin,p_late_only,
   p_date_from,p_date_to,p_page,p_page_size
 );
$$;

revoke all on function public.list_my_transactions(text,text,text,text,text,text,text,boolean,date,date,integer,integer) from public,anon;
grant execute on function public.list_my_transactions(text,text,text,text,text,text,text,boolean,date,date,integer,integer) to authenticated;

create or replace function app_private.transaction_directory_current()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid; v_ctx jsonb; v_role text; v_org text; v_login text; v_name text; v_depts text[]; v_result jsonb;
begin
  v_uid:=auth.uid();
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
    where amu.eligible and (
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
end $$;

revoke all on function app_private.transaction_directory_current() from public,anon;
grant execute on function app_private.transaction_directory_current() to authenticated;

create or replace function public.transaction_directory_my()
returns jsonb language sql stable security invoker set search_path=''
as $$ select app_private.transaction_directory_current(); $$;

revoke all on function public.transaction_directory_my() from public,anon;
grant execute on function public.transaction_directory_my() to authenticated;
