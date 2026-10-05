-- Target: msajed-ceo-erp (refmovzojtnkkmdsjhmlgtq) ONLY. No Auth writes.
-- Edge must verify Auth getUser + JWT session_id before supplying actor/session.
-- Password + trusted app_metadata operation/generation must be ONE Auth Admin update.
-- An uncertain outcome never expires; reconcile the SAME operation by provider proof.
begin;

create table app_private.account_credential_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation bigint not null default 0 check(generation>=0),
  session_valid_after timestamptz
);
create table app_private.account_password_operations (
  operation_id uuid primary key,
  actor_id uuid references auth.users(id),
  actor_session_id uuid,
  target_id uuid not null references auth.users(id),
  kind text not null check(kind in ('change','reset')),
  status text not null check(status in ('pending','completed','uncertain','failed')),
  generation bigint not null check(generation>0),
  source text not null check(source in ('verified_session','authorized_maintenance')),
  check(source<>'authorized_maintenance' or (actor_id is null and actor_session_id is null and kind='reset')),
  check(source<>'verified_session' or (actor_id is not null and actor_session_id is not null)),
  check(kind<>'change' or (actor_id is not null and actor_id=target_id and actor_session_id is not null)),
  unique(target_id,generation)
);
create unique index account_password_one_unresolved
  on app_private.account_password_operations(target_id) where status in ('pending','uncertain');
-- Non-destructive backfill: never changes identities, flags, roles, or memberships.
insert into app_private.account_credential_state(user_id)
select id from auth.users;
alter table app_private.account_credential_state enable row level security;
alter table app_private.account_password_operations enable row level security;
revoke all on app_private.account_credential_state,app_private.account_password_operations from public,anon,authenticated,service_role;

create function app_private.account_session_valid(p_user uuid,p_session uuid,p_allow_forced boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from auth.sessions s
  join public.profiles p on p.id=s.user_id
  join public.account_migration_users a on a.migrated_user_id=p.id and a.eligible
  join app_private.account_credential_state c on c.user_id=p.id
  where p.id=p_user and s.id=p_session and p.active
   and s.created_at is not null and s.created_at<=statement_timestamp()
   and (s.not_after is null or s.not_after>statement_timestamp())
   and (c.session_valid_after is null or s.created_at>c.session_valid_after)
   and (coalesce(p_allow_forced,false) or (not p.must_change_password and not a.must_change_password))
   and not exists(select 1 from app_private.account_password_operations o
     where o.target_id=p.id and o.status in ('pending','uncertain'))
 );
$$;
revoke all on function app_private.account_session_valid(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function public.account_session_check_internal(p_user uuid,p_session uuid,p_allow_forced boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$ select app_private.account_session_valid(p_user,p_session,p_allow_forced); $$;
revoke all on function public.account_session_check_internal(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.account_session_check_internal(uuid,uuid,boolean) to service_role;

-- Private transaction primitives. No password/fingerprint/payload is accepted or stored.
create function app_private.account_password_result(p_operation uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('operation_id',o.operation_id,'target_user_id',o.target_id,
  'canonical_key',a.canonical_key,'login_username',a.login_username,
  'generation',o.generation,'status',o.status,'write_allowed',false)
 from app_private.account_password_operations o
 join public.account_migration_users a on a.migrated_user_id=o.target_id
 where o.operation_id=p_operation;
$$;
revoke all on function app_private.account_password_result(uuid) from public,anon,authenticated,service_role;

create function app_private.account_password_start(p_actor uuid,p_target_key text,p_kind text,p_operation_id uuid,p_source text,p_session uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare a public.account_migration_users%rowtype; p public.profiles%rowtype;
 c app_private.account_credential_state%rowtype; o app_private.account_password_operations%rowtype;
begin
 if p_operation_id is null or p_kind not in ('change','reset') or p_kind is null then
  raise exception 'invalid operation';
 end if;
 select * into a from public.account_migration_users where canonical_key=p_target_key for update;
 if not found or not a.eligible or a.migrated_user_id is null then raise exception 'invalid account'; end if;
 if p_kind='reset' and (a.canonical_key='faisal' or a.migrated_user_id='0a1df502-9232-4ef5-af2d-df585ad7f187') then
  raise exception 'protected account';
 end if;
 select * into p from public.profiles where id=a.migrated_user_id for update;
 if not found or not p.active then raise exception 'inactive account'; end if;
 -- Require the exact official Auth identity, not a case-folded/guessed email.
 if not exists(select 1 from auth.users u where u.id=p.id and u.email=a.internal_email) then
  raise exception 'identity conflict';
 end if;
 insert into app_private.account_credential_state(user_id) values(p.id) on conflict do nothing;
 select * into c from app_private.account_credential_state where user_id=p.id for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if found then
  if o.target_id<>p.id or o.kind<>p_kind or o.actor_id is distinct from p_actor or o.actor_session_id is distinct from p_session or o.source<>p_source then
   raise exception 'operation identity conflict';
  end if;
  -- A replay of begin is only an observation, NOT permission to repeat an Auth write.
  return app_private.account_password_result(o.operation_id);
 end if;
 if exists(select 1 from app_private.account_password_operations where target_id=p.id and status in ('pending','uncertain')) then
  raise exception 'unresolved password operation';
 end if;
 if p_source='authorized_maintenance' and (not a.must_change_password or not p.must_change_password) then
  raise exception 'maintenance requires forced account';
 end if;
 update app_private.account_credential_state set generation=generation+1,session_valid_after=clock_timestamp()
 where user_id=p.id returning * into c;
 update public.profiles set must_change_password=true,updated_at=clock_timestamp() where id=p.id;
 update public.account_migration_users set must_change_password=true where canonical_key=a.canonical_key;
 insert into app_private.account_password_operations(operation_id,actor_id,actor_session_id,target_id,kind,status,generation,source)
 values(p_operation_id,p_actor,p_session,p.id,p_kind,'pending',c.generation,p_source);
 return app_private.account_password_result(p_operation_id)||jsonb_build_object('write_allowed',true);
end;
$$;
revoke all on function app_private.account_password_start(uuid,text,text,uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.account_password_maintenance_begin_internal(p_target_key text,p_operation_id uuid)
returns jsonb language sql security definer set search_path=''
as $$ select app_private.account_password_start(null,p_target_key,'reset',p_operation_id,'authorized_maintenance'); $$;
revoke all on function public.account_password_maintenance_begin_internal(text,uuid) from public,anon,authenticated;
grant execute on function public.account_password_maintenance_begin_internal(text,uuid) to service_role;

create function public.account_password_finish_internal(p_operation_id uuid,p_generation bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare o app_private.account_password_operations%rowtype; c app_private.account_credential_state%rowtype;
 a public.account_migration_users%rowtype; v_target uuid; v_proof jsonb;
begin
 select target_id into v_target from app_private.account_password_operations where operation_id=p_operation_id;
 if not found then raise exception 'invalid operation'; end if;
 -- Same lock order as begin/provision: registry -> profile -> state -> journal.
 select * into a from public.account_migration_users where migrated_user_id=v_target for update;
 if not found or not a.eligible then raise exception 'invalid account'; end if;
 perform 1 from public.profiles where id=v_target and active for update;
 if not found then raise exception 'inactive account'; end if;
 select * into c from app_private.account_credential_state where user_id=v_target for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if p_generation is null or o.generation<>p_generation or o.target_id<>v_target then
  raise exception 'stale operation generation';
 end if;
 if o.status='completed' then return app_private.account_password_result(o.operation_id); end if;
 if c.generation<>p_generation or o.status not in ('pending','uncertain') then
  raise exception 'stale operation generation';
 end if;
 select u.raw_app_meta_data into v_proof from auth.users u
 where u.id=v_target and u.email=a.internal_email for share;
 if not found or v_proof->>'msajed_password_operation' is distinct from o.operation_id::text
   or v_proof->>'msajed_password_generation' is distinct from o.generation::text then
  raise exception 'provider proof missing or mismatched';
 end if;
 -- Sessions created even while a provider write was in flight must reauthenticate.
 update app_private.account_credential_state set session_valid_after=clock_timestamp() where user_id=v_target;
 update public.profiles set must_change_password=(o.kind='reset'),updated_at=clock_timestamp() where id=v_target;
 update public.account_migration_users set must_change_password=(o.kind='reset'),
  password_changed_at=clock_timestamp() where canonical_key=a.canonical_key and migrated_user_id=v_target;
 update app_private.account_password_operations set status='completed' where operation_id=o.operation_id;
 insert into public.audit_log(actor_id,event_type,entity_type,entity_id,meta)
 values(o.actor_id,'password_operation_completed','account',v_target::text,
  jsonb_build_object('operation_id',o.operation_id,'kind',o.kind,'outcome','completed','source',o.source));
 return app_private.account_password_result(o.operation_id);
end;
$$;
revoke all on function public.account_password_finish_internal(uuid,bigint) from public,anon,authenticated;
grant execute on function public.account_password_finish_internal(uuid,bigint) to service_role;

create function public.account_password_unknown_internal(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_target uuid; v_generation bigint; o app_private.account_password_operations%rowtype;
begin
 select target_id into v_target from app_private.account_password_operations where operation_id=p_operation_id;
 if not found then raise exception 'invalid operation'; end if;
 perform 1 from public.account_migration_users where migrated_user_id=v_target for update;
 perform 1 from public.profiles where id=v_target for update;
 select generation into v_generation from app_private.account_credential_state where user_id=v_target for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if o.status in ('pending','uncertain') and v_generation is distinct from o.generation then raise exception 'stale operation generation'; end if;
 -- No release, rollback of flags, expiry, or unproven failed transition is exposed.
 update app_private.account_password_operations set status='uncertain'
 where operation_id=p_operation_id and status='pending';
 return app_private.account_password_result(p_operation_id);
end;
$$;
revoke all on function public.account_password_unknown_internal(uuid) from public,anon,authenticated;
grant execute on function public.account_password_unknown_internal(uuid) to service_role;

create function public.account_password_status_internal(p_operation_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select app_private.account_password_result(p_operation_id); $$;
revoke all on function public.account_password_status_internal(uuid) from public,anon,authenticated;
grant execute on function public.account_password_status_internal(uuid) to service_role;

-- Identity-bound readiness guard for authenticated RLS/helpers. A service-role
-- call must use account_session_check_internal with independently verified claims.
create function app_private.account_access_ready(p_user uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_sid text;
begin
 if p_user is null or p_user is distinct from auth.uid() then return false; end if;
 v_sid:=auth.jwt()->>'session_id';
 if v_sid is null or v_sid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  return false;
 end if;
 return app_private.account_session_valid(p_user,v_sid::uuid,false);
end;
$$;
revoke all on function app_private.account_access_ready(uuid) from public,anon,service_role;
grant execute on function app_private.account_access_ready(uuid) to authenticated;

-- Preserve source precedence: explicit user override -> canonical override ->
-- actual assigned role defaults. Only trusted service transaction code uses raw evaluation.
create function app_private.account_permission_effective(_user uuid,_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
 select case when _user is null then false else coalesce(
  (select up.effect='allow' from public.user_permissions up
   where up.user_id=_user and up.permission_code=_permission limit 1),
  (select apo.effect='allow' from public.account_migration_users amu
   join public.account_permission_overrides apo on apo.canonical_key=amu.canonical_key
   where amu.migrated_user_id=_user and amu.eligible and apo.permission_code=_permission limit 1),
  (select exists(select 1 from public.user_roles ur
   join public.role_permissions rp on rp.role_code=ur.role_code
   where ur.user_id=_user and rp.permission_code=_permission)),false) end;
$$;
revoke all on function app_private.account_permission_effective(uuid,text) from public,anon,authenticated,service_role;

create function public.account_password_begin_internal(p_actor uuid,p_session uuid,p_target_key text,p_kind text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_key text; o app_private.account_password_operations%rowtype;
begin
 -- Recovery is an observation of the SAME original verified-session operation.
 -- It bypasses only the cutoff/open-op check, never expiry, identity, or normal access.
 select * into o from app_private.account_password_operations where operation_id=p_operation_id;
 if found then
  if o.actor_id is distinct from p_actor or o.actor_session_id is distinct from p_session
    or o.kind is distinct from p_kind or o.source<>'verified_session'
    or not exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
     join public.account_migration_users a on a.migrated_user_id=p.id and a.eligible
     where s.id=p_session and s.user_id=p_actor and p.active and s.created_at is not null
       and s.created_at<=statement_timestamp() and (s.not_after is null or s.not_after>statement_timestamp())) then
   raise exception 'forbidden' using errcode='42501';
  end if;
  select canonical_key into v_key from public.account_migration_users where migrated_user_id=o.target_id and eligible;
  if v_key is null or (p_target_key is not null and p_target_key<>v_key) then
   raise exception 'operation identity conflict';
  end if;
  return app_private.account_password_start(p_actor,v_key,p_kind,p_operation_id,'verified_session',p_session);
 end if;
 if p_kind='change' then
  if not app_private.account_session_valid(p_actor,p_session,true) then
   raise exception 'forbidden' using errcode='42501';
  end if;
  select canonical_key into v_key from public.account_migration_users where migrated_user_id=p_actor and eligible;
  if v_key is null or (p_target_key is not null and p_target_key<>v_key) then
   raise exception 'forbidden' using errcode='42501';
  end if;
 elsif p_kind='reset' then
  if not app_private.account_session_valid(p_actor,p_session,false)
    or not exists(select 1 from public.user_roles ur join public.profiles p on p.id=ur.user_id
     where ur.user_id=p_actor and ur.role_code='ceo_office_manager' and p.active and not p.must_change_password)
    or not app_private.account_permission_effective(p_actor,'profiles.admin_reset_password') then
   raise exception 'forbidden' using errcode='42501';
  end if;
  v_key:=p_target_key;
 else
  raise exception 'forbidden' using errcode='42501';
 end if;
 return app_private.account_password_start(p_actor,v_key,p_kind,p_operation_id,'verified_session',p_session);
end;
$$;
revoke all on function public.account_password_begin_internal(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.account_password_begin_internal(uuid,uuid,text,text,uuid) to service_role;

-- Preserve original business predicates; readiness is an additional AND, never an OR.
create or replace function app_private.has_permission(_user uuid,_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select app_private.account_access_ready(_user) and app_private.account_permission_effective(_user,_permission); $$;


create or replace function app_private.can_manage_permissions(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select app_private.account_access_ready(p_user_id) and exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=p_user_id
      and ur.role_code='ceo_office_manager'
      and p.active
  );
$$;

create or replace function app_private.can_view_transaction(_user uuid,_tx uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare t public.transactions%rowtype;
begin
  if not app_private.account_access_ready(_user) then return false; end if;
  if app_private.has_permission(_user,'transactions.view_all') then return true; end if;
  select * into t from public.transactions where id=_tx;
  if not found then return false; end if;
  if t.created_by=_user or t.responsible_user_id=_user then return true; end if;
  if exists(select 1 from public.transaction_assignment_users au
    join public.transaction_assignments a on a.id=au.assignment_id
    where a.transaction_id=_tx and au.user_id=_user and au.active) then return true; end if;
  if exists(select 1 from public.transaction_participants p
    where p.transaction_id=_tx and p.user_id=_user and p.active) then return true; end if;
  if exists(select 1 from public.user_roles ur
    join public.user_memberships um on um.user_id=ur.user_id and um.active
    where ur.user_id=_user and ur.role_code='manager' and um.membership_role='manager'
      and (um.unit_id=t.responsible_unit_id or exists(
        select 1 from public.transaction_assignments a
        where a.transaction_id=_tx and a.unit_id=um.unit_id and a.status='active'
      ))) then return true; end if;
  if exists(select 1 from public.user_roles ur
    join public.user_memberships um on um.user_id=ur.user_id and um.active
    where ur.user_id=_user and ur.role_code='assistant' and um.membership_role='assistant'
      and (app_private.unit_in_scope(um.unit_id,t.responsible_unit_id) or exists(
        select 1 from public.transaction_assignments a
        where a.transaction_id=_tx and a.unit_id is not null
          and app_private.unit_in_scope(um.unit_id,a.unit_id)
      ))) then return true; end if;
  return false;
end;
$$;

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
  if not app_private.account_access_ready(v_uid) then raise exception 'account unavailable' using errcode='42501'; end if;
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

create or replace function app_private.transaction_directory_current()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
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

create or replace function app_private.my_profile_set_email_current(p_email text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid; v_email text;
begin
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
$$;

create or replace function app_private.my_profile_current()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid; v_result jsonb; v_sid text;
begin
  v_uid:=auth.uid();
  if not app_private.account_access_ready(v_uid) then
    v_sid:=auth.jwt()->>'session_id';
    if v_sid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
     if app_private.account_session_valid(v_uid,v_sid::uuid,true)
       and exists(select 1 from public.profiles p join public.account_migration_users a on a.migrated_user_id=p.id
                  where p.id=v_uid and a.eligible and (p.must_change_password or a.must_change_password)) then
      -- Recovery state only: no profile/contact data and no business permission.
      return jsonb_build_object('ok',true,'user_id',v_uid,'must_change_password',true,'can_edit_email',false);
     end if;
    end if;
    raise exception 'account unavailable' using errcode='42501';
  end if;
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_build_object(
    'ok',true,
    'user_id',p.id,
    'name',p.full_name,
    'email',p.contact_email,
    'can_edit_email',app_private.has_permission(p.id,'profiles.edit_email'),
    'must_change_password',p.must_change_password
  )
  into v_result
  from public.profiles p
  where p.id=v_uid and p.active;
  if v_result is null then raise exception 'profile unavailable' using errcode='42501'; end if;
  return v_result;
end;
$$;

-- Add a restrictive gate to all CURRENT public RLS tables. Existing permissive
-- scope/ownership policies are retained verbatim. Future tables need this gate too.
do $rls$
declare t record;
begin
 for t in select c.relname from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relrowsecurity and c.relkind in ('r','p')
 loop
  execute format('create policy account_password_ready on public.%I as restrictive for all to authenticated using (app_private.account_access_ready((select auth.uid()))) with check (app_private.account_access_ready((select auth.uid())))',t.relname);
 end loop;
end;
$rls$;

-- Only definite official Auth Admin 400/422 rejection is terminal failure.
-- Edge maps status codes to these constants; raw provider messages are never accepted.
create function public.account_password_fail_internal(p_operation_id uuid,p_error_code text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare o app_private.account_password_operations%rowtype; v_target uuid; v_proof jsonb; v_generation bigint;
begin
 if p_error_code is null or p_error_code not in ('provider_400','provider_422') then
  raise exception 'invalid error code';
 end if;
 select target_id into v_target from app_private.account_password_operations where operation_id=p_operation_id;
 if not found then raise exception 'invalid operation'; end if;
 perform 1 from public.account_migration_users where migrated_user_id=v_target for update;
 perform 1 from public.profiles where id=v_target for update;
 select generation into v_generation from app_private.account_credential_state where user_id=v_target for update;
 select * into o from app_private.account_password_operations where operation_id=p_operation_id for update;
 if o.status in ('pending','uncertain') and v_generation is distinct from o.generation then raise exception 'stale operation generation'; end if;
 if o.status='uncertain' then raise exception 'uncertain outcome cannot be released'; end if;
 if o.status in ('completed','failed') then return app_private.account_password_result(p_operation_id); end if;
 select raw_app_meta_data into v_proof from auth.users where id=v_target for share;
 if v_proof->>'msajed_password_operation'=o.operation_id::text then
  raise exception 'provider proof present; finish instead';
 end if;
 update app_private.account_password_operations set status='failed' where operation_id=p_operation_id;
 update public.profiles set must_change_password=true,updated_at=clock_timestamp() where id=v_target;
 update public.account_migration_users set must_change_password=true where migrated_user_id=v_target;
 update app_private.account_credential_state set session_valid_after=clock_timestamp() where user_id=v_target;
 insert into public.audit_log(actor_id,event_type,entity_type,entity_id,meta)
 values(o.actor_id,'password_operation_failed','account',v_target::text,
  jsonb_build_object('operation_id',o.operation_id,'kind',o.kind,'outcome','failed','source',o.source));
 return app_private.account_password_result(p_operation_id);
end;
$$;
revoke all on function public.account_password_fail_internal(uuid,text) from public,anon,authenticated;
grant execute on function public.account_password_fail_internal(uuid,text) to service_role;

-- Fail installation on conflicting existing links; do not silently repair identities.
create unique index account_migration_one_auth_identity
 on public.account_migration_users(migrated_user_id) where migrated_user_id is not null;

-- Resolve only real units under the hierarchy approved in STRUCTURE_DECISIONS
-- and the runtime organizational seed. Names alone are never a membership key.
create function app_private.account_expected_memberships(p_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare a public.account_migration_users%rowtype; v_root uuid; v_unit uuid;
 v_type text; v_role text; v_n integer; d record; v_result jsonb:='[]'::jsonb;
begin
 select * into a from public.account_migration_users where canonical_key=p_key and eligible;
 if not found then raise exception 'invalid account'; end if;
 if a.org_name='مكتب الرئيس التنفيذي' then v_type:='office';
 elsif a.org_name in ('مساعد الرئيس التنفيذي للشؤون الإدارية والمالية','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية') then v_type:='sector';
 elsif a.org_name='الإدارة المالية' then v_type:='independent';
 else raise exception 'unapproved organizational root'; end if;
 -- Protect the checked parent/name/type/active facts through the link transaction.
 perform 1 from public.organizational_units where active for share;
 select count(*),(array_agg(id))[1] into v_n,v_root from public.organizational_units
 where name=a.org_name and parent_id is null and active and unit_type=v_type;
 if v_n<>1 then raise exception 'missing or ambiguous organizational root'; end if;
 if a.role_code in ('ceo','ceo_office_manager','ceo_secretary','assistant','assistant_secretary') then
  if (a.role_code in ('ceo','ceo_office_manager','ceo_secretary') and
      (v_type<>'office' or a.dept_names<>array[a.org_name])) or
     (a.role_code in ('assistant','assistant_secretary') and
      (v_type<>'sector' or cardinality(a.dept_names)<>0)) then
   raise exception 'registry hierarchy conflict';
  end if;
  v_role:=case when a.role_code='assistant' then 'assistant' else 'office' end;
  return jsonb_build_array(jsonb_build_object('unit_id',v_root,'membership_role',v_role,'is_primary',true));
 end if;
 if a.role_code not in ('manager','employee') or cardinality(a.dept_names)=0
   or cardinality(a.dept_names)<>(select count(distinct x) from unnest(a.dept_names) x) then
  raise exception 'registry hierarchy conflict';
 end if;
 v_role:=case when a.role_code='manager' then 'manager' else 'member' end;
 for d in select name,ord from unnest(a.dept_names) with ordinality as x(name,ord) loop
  if v_type in ('independent','office') then
   -- Snapshot includes executive-office employees as members of the existing
   -- office root, not an invented child department (e.g. staff_006).
   if d.name<>a.org_name or cardinality(a.dept_names)<>1 then raise exception 'registry hierarchy conflict'; end if;
   v_unit:=v_root;
  else
   select count(*),(array_agg(u.id))[1] into v_n,v_unit
   from public.organizational_units u
   where u.name=d.name and u.active and (
    (u.unit_type='department' and u.parent_id=v_root)
    or (u.unit_type='branch' and exists(select 1 from public.organizational_units g
     where g.id=u.parent_id and g.name='الفروع' and g.unit_type='branch_group' and g.parent_id=v_root and g.active))
   );
   if v_n<>1 then raise exception 'missing or ambiguous department in approved hierarchy'; end if;
  end if;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('unit_id',v_unit,'membership_role',v_role,'is_primary',d.ord=1));
 end loop;
 return v_result;
end;
$$;
revoke all on function app_private.account_expected_memberships(text) from public,anon,authenticated,service_role;

create function public.account_provision_link_internal(p_key text,p_auth_user uuid,p_memberships jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare a public.account_migration_users%rowtype; p public.profiles%rowtype;
 v_expected jsonb; v_email text; v_found boolean;
begin
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
 insert into public.profiles(id,login_name,full_name,active,must_change_password)
 values(p_auth_user,a.preferred_login,a.display_name,true,true)
 on conflict(id) do update set login_name=excluded.login_name,full_name=excluded.full_name,
  must_change_password=true,updated_at=clock_timestamp();
 insert into public.user_roles(user_id,role_code,is_primary) values(p_auth_user,a.role_code,true) on conflict do nothing;
 insert into public.user_memberships(user_id,unit_id,membership_role,is_primary,active)
 select p_auth_user,unit_id,membership_role,is_primary,true
 from jsonb_to_recordset(v_expected) as m(unit_id uuid,membership_role text,is_primary boolean) on conflict do nothing;
 -- Keep canonical override fallback as-is. Never delete/copy overrides or reseed defaults.
 update public.account_migration_users set migrated_user_id=p_auth_user,must_change_password=true,
  migrated_at=clock_timestamp() where canonical_key=p_key and migrated_user_id is null;
 insert into app_private.account_credential_state(user_id,session_valid_after) values(p_auth_user,clock_timestamp())
 on conflict(user_id) do update set session_valid_after=excluded.session_valid_after;
 return jsonb_build_object('ok',true,'status','linked','target_user_id',p_auth_user,
  'canonical_key',a.canonical_key,'login_username',a.login_username);
end;
$$;
revoke all on function public.account_provision_link_internal(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.account_provision_link_internal(text,uuid,jsonb) to service_role;

-- Keep only the identity-bound guards required by authenticated policies.
revoke all on function app_private.has_permission(uuid,text),app_private.can_view_transaction(uuid,uuid),app_private.can_manage_permissions(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.has_permission(uuid,text),app_private.can_view_transaction(uuid,uuid) to authenticated;

commit;
