
-- Full editable transaction permissions.
-- Target: msajed-ceo-erp only.

insert into public.permissions(code,name_ar) values
('transactions.raise_manager','رفع المعاملة للمدير'),
('transactions.assign_department','إسناد داخل إدارة المستخدم'),
('transactions.assign_sector','إسناد داخل قطاع المستخدم'),
('transactions.assign_cross_sector','إسناد إلى قطاع آخر'),
('transactions.add_supporting','إضافة إدارة مساندة'),
('transactions.raise_assistant','إحالة أو رفع المعاملة للمساعد'),
('transactions.transfer_assistant','تحويل المعاملة إلى مساعد آخر'),
('transactions.decide_assistant_transfer','قبول أو رفض تحويل مساعد وارد'),
('transactions.raise_ceo','رفع المعاملة للرئيس التنفيذي')
on conflict(code) do update set name_ar=excluded.name_ar;

insert into public.role_permissions(role_code,permission_code) values
('employee','transactions.raise_manager'),
('manager','transactions.assign_department'),
('manager','transactions.raise_assistant'),
('assistant','transactions.assign_sector'),
('assistant','transactions.add_supporting'),
('assistant','transactions.transfer_assistant'),
('assistant','transactions.decide_assistant_transfer'),
('assistant','transactions.raise_ceo'),
('ceo','transactions.raise_assistant'),
('ceo','transactions.assign_cross_sector'),
('ceo_office_manager','transactions.raise_assistant'),
('ceo_office_manager','transactions.assign_cross_sector'),
('ceo_secretary','transactions.raise_assistant'),
('ceo_secretary','transactions.assign_cross_sector')
on conflict do nothing;

create table if not exists public.account_permission_overrides (
  canonical_key text not null references public.account_migration_users(canonical_key) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(canonical_key,permission_code)
);
alter table public.account_permission_overrides enable row level security;
revoke all on table public.account_permission_overrides from public,anon,authenticated;
grant select,insert,update,delete on table public.account_permission_overrides to service_role;
create index if not exists idx_account_permission_overrides_permission
  on public.account_permission_overrides(permission_code);

create or replace function app_private.has_permission(_user uuid,_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
  select case when _user is null then false else coalesce(
    (select up.effect='allow' from public.user_permissions up
      where up.user_id=_user and up.permission_code=_permission limit 1),
    (select apo.effect='allow'
      from public.account_migration_users amu
      join public.account_permission_overrides apo on apo.canonical_key=amu.canonical_key
      where amu.migrated_user_id=_user and amu.eligible and apo.permission_code=_permission limit 1),
    (select exists(select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code=ur.role_code
      where ur.user_id=_user and rp.permission_code=_permission)),
    false
  ) end;
$$;

create or replace function app_private.account_has_permission(p_login text,p_role text,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
  with a as (
    select amu.canonical_key,amu.migrated_user_id,amu.role_code
    from public.account_migration_users amu
    where amu.preferred_login=p_login and amu.eligible limit 1
  )
  select coalesce(
    (select up.effect='allow' from a
      join public.user_permissions up on up.user_id=a.migrated_user_id
      where up.permission_code=p_permission limit 1),
    (select apo.effect='allow' from a
      join public.account_permission_overrides apo on apo.canonical_key=a.canonical_key
      where apo.permission_code=p_permission limit 1),
    (select exists(select 1 from public.role_permissions rp
      where rp.role_code=coalesce((select role_code from a),p_role)
        and rp.permission_code=p_permission)),
    false
  );
$$;

create or replace function app_private.effective_permissions_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(
    jsonb_agg(p.code order by p.code) filter(where app_private.has_permission(p_user_id,p.code)),
    '[]'::jsonb
  ) from public.permissions p;
$$;

create or replace function app_private.permissions_admin_snapshot(p_actor uuid,p_section text default 'transactions')
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
    select p.code,p.name_ar,true editable
    from public.permissions p where p.code like v_prefix||'%'
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
      case when a.user_id is not null then exists(
        select 1 from public.user_roles ur join public.role_permissions rp on rp.role_code=ur.role_code
        where ur.user_id=a.user_id and rp.permission_code=pr.code
      ) else exists(
        select 1 from public.role_permissions rp where rp.role_code=a.role_code and rp.permission_code=pr.code
      ) end base_enabled,
      coalesce(
        case when a.user_id is null then null else (
          select up.effect from public.user_permissions up
          where up.user_id=a.user_id and up.permission_code=pr.code limit 1
        ) end,
        (select apo.effect from public.account_permission_overrides apo
          where apo.canonical_key=a.canonical_key and apo.permission_code=pr.code limit 1)
      ) override_effect
    from accounts a cross join permission_rows pr
  ),
  users_json as (
    select canonical_key,preferred_login,display_name,role_code,role_name,user_id,
      jsonb_agg(jsonb_build_object(
        'code',permission_code,'name_ar',permission_name,'editable',editable,
        'base_enabled',base_enabled,'override_effect',override_effect,
        'effective_enabled',case when override_effect='allow' then true
                                 when override_effect='deny' then false else base_enabled end
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
  if not exists(select 1 from public.permissions p where p.code=p_permission_code and p.code like 'transactions.%')
    then raise exception 'invalid permission'; end if;

  if v_user is not null then
    select exists(select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code=ur.role_code
      where ur.user_id=v_user and rp.permission_code=p_permission_code) into v_base;
  else
    select exists(select 1 from public.role_permissions rp
      where rp.role_code=v_role and rp.permission_code=p_permission_code) into v_base;
  end if;

  if p_enabled=v_base then
    if v_user is not null then
      delete from public.user_permissions where user_id=v_user and permission_code=p_permission_code;
    end if;
    delete from public.account_permission_overrides
      where canonical_key=p_target_key and permission_code=p_permission_code;
    v_effect:=null;
  else
    v_effect:=case when p_enabled then 'allow' else 'deny' end;
    if v_user is not null then
      insert into public.user_permissions(user_id,permission_code,effect)
      values(v_user,p_permission_code,v_effect)
      on conflict(user_id,permission_code) do update set effect=excluded.effect,created_at=now();
      delete from public.account_permission_overrides
        where canonical_key=p_target_key and permission_code=p_permission_code;
    else
      insert into public.account_permission_overrides(
        canonical_key,permission_code,effect,created_by,created_at,updated_at
      ) values(p_target_key,p_permission_code,v_effect,p_actor,now(),now())
      on conflict(canonical_key,permission_code)
      do update set effect=excluded.effect,created_by=excluded.created_by,updated_at=now();
    end if;
  end if;

  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
  values(p_actor,'permission_changed','account',p_target_key,'تعديل صلاحية مستخدم',
    jsonb_build_object('permission',p_permission_code,'enabled',p_enabled,'base_enabled',v_base,
      'override_effect',v_effect,'target_user_id',v_user));

  return jsonb_build_object('ok',true,'permission',p_permission_code,'enabled',p_enabled,
    'base_enabled',v_base,'override_effect',v_effect,'target_user_id',v_user);
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
  where amu.migrated_user_id=p_target_user and amu.eligible limit 1;
  if v_key is not null then
    return app_private.permissions_admin_set_account(p_actor,v_key,p_permission_code,p_enabled);
  end if;
  if p_target_user is null or not exists(select 1 from public.profiles p where p.id=p_target_user and p.active)
    then raise exception 'invalid user'; end if;
  if not exists(select 1 from public.permissions p where p.code=p_permission_code and p.code like 'transactions.%')
    then raise exception 'invalid permission'; end if;
  select exists(select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_code=ur.role_code
    where ur.user_id=p_target_user and rp.permission_code=p_permission_code) into v_base;
  if p_enabled=v_base then
    delete from public.user_permissions where user_id=p_target_user and permission_code=p_permission_code;
    v_effect:=null;
  else
    v_effect:=case when p_enabled then 'allow' else 'deny' end;
    insert into public.user_permissions(user_id,permission_code,effect)
    values(p_target_user,p_permission_code,v_effect)
    on conflict(user_id,permission_code) do update set effect=excluded.effect,created_at=now();
  end if;
  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
  values(p_actor,'permission_changed','user',p_target_user::text,'تعديل صلاحية مستخدم',
    jsonb_build_object('permission',p_permission_code,'enabled',p_enabled,
      'base_enabled',v_base,'override_effect',v_effect));
  return jsonb_build_object('ok',true,'permission',p_permission_code,'enabled',p_enabled,
    'base_enabled',v_base,'override_effect',v_effect);
end;
$$;

create or replace function public.permissions_admin_set_by_account(
  p_target_key text,p_permission_code text,p_enabled boolean
)
returns jsonb language sql security invoker set search_path=''
as $$
  select app_private.permissions_admin_set_account(
    (select auth.uid()),p_target_key,p_permission_code,p_enabled
  );
$$;

revoke all on function app_private.account_has_permission(text,text,text) from public,anon;
revoke all on function app_private.permissions_admin_set_account(uuid,text,text,boolean) from public,anon;
revoke all on function public.permissions_admin_set_by_account(text,text,boolean) from public,anon;
grant execute on function app_private.account_has_permission(text,text,text) to authenticated,service_role;
grant execute on function app_private.permissions_admin_set_account(uuid,text,text,boolean) to authenticated;
grant execute on function public.permissions_admin_set_by_account(text,text,boolean) to authenticated;

create or replace function app_private.can_view_transaction(_user uuid,_tx uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare t public.transactions%rowtype;
begin
  if _user is null then return false; end if;
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

CREATE OR REPLACE FUNCTION public.list_transactions_internal(p_login text, p_name text, p_role text, p_org text, p_depts text[], p_tab text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_priority text DEFAULT ''::text, p_status text DEFAULT ''::text, p_department text DEFAULT ''::text, p_employee text DEFAULT ''::text, p_origin text DEFAULT ''::text, p_late_only boolean DEFAULT false, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with recursive
params as (
  select
    coalesce(p_login,'') login,
    coalesce(p_name,'') name,
    coalesce(p_role,'') role,
    coalesce(p_org,'') org,
    coalesce(p_depts,'{}'::text[]) depts,
    greatest(1,coalesce(p_page,1)) page_no,
    least(100,greatest(10,coalesce(p_page_size,50))) page_size,
    lower(trim(coalesce(p_search,''))) search_q,
    app_private.account_has_permission(p_login,p_role,'transactions.view_all') view_all,
    app_private.account_has_permission(p_login,p_role,'transactions.act_all') act_all
),
org_root as (
  select ou.id
  from public.organizational_units ou,params p
  where p.role='assistant' and ou.parent_id is null and ou.name=p.org and ou.active
),
scope_tree as (
  select id from org_root
  union all
  select ou.id
  from public.organizational_units ou
  join scope_tree st on ou.parent_id=st.id
  where ou.active
),
scope_units as (
  select ou.id,ou.name
  from public.organizational_units ou,params p
  where ou.active and (
    p.view_all
    or (p.role='assistant' and ou.id in (select id from scope_tree))
    or (p.role in ('manager','employee') and ou.name=any(p.depts))
  )
),
latest_period as (
  select distinct on (tp.transaction_id)
    tp.transaction_id,tp.cycle_no,tp.started_at,tp.ended_at,tp.duration_days
  from public.transaction_periods tp
  order by tp.transaction_id,tp.cycle_no desc
),
assign_info as (
  select
    a.transaction_id,
    count(*) filter(where a.assignment_type='supporting' and a.status='active')::int supporting_count,
    coalesce(
      array_agg(distinct at.display_name) filter(where a.status='active' and at.active and at.display_name is not null),
      '{}'::text[]
    ) current_assignees,
    bool_or(at.login_name=(select login from params) or at.display_name=(select name from params)) as ever_target,
    bool_or(a.status='active' and at.active and (at.login_name=(select login from params) or at.display_name=(select name from params))) as current_target,
    bool_or(
      a.unit_id in (select id from scope_units)
      and (
        a.assignment_type<>'direct'
        or (select view_all from params)
        or ((select role from params)='manager' and a.visibility_scope in ('manager','manager_assistant'))
        or ((select role from params)='assistant' and a.visibility_scope in ('assistant','manager_assistant'))
      )
    ) as assignment_scope_hit,
    bool_or(at.login_name=coalesce(nullif(p_employee,''),'__none__')) as employee_target_hit
  from public.transaction_assignments a
  left join public.transaction_assignment_targets at on at.assignment_id=a.id
  cross join params
  group by a.transaction_id
),
route_info as (
  select
    r.transaction_id,
    bool_or(r.to_login_name=(select login from params) and r.status in ('pending','completed','accepted')) as route_to,
    bool_or(r.from_login_name=(select login from params)) as route_from,
    (
      select to_jsonb(x)
      from public.transaction_routes x
      where x.transaction_id=r.transaction_id
        and x.route_type='assistant_transfer'
        and x.to_login_name=(select login from params)
        and x.status='pending'
      order by x.created_at desc
      limit 1
    ) as pending_transfer
  from public.transaction_routes r
  group by r.transaction_id
),
request_info as (
  select transaction_id,count(*) filter(where status='pending')::int pending_requests_count
  from public.transaction_requests
  group by transaction_id
),
base as (
  select
    t.id,t.number,t.origin,t.legacy_source,t.legacy_sn,t.title,t.subject,t.attachment_url,
    t.priority,t.status,t.responsible_unit_id,t.responsible_login_name,t.responsible_name,
    t.current_level,t.close_level,t.ceo_attention,t.due_at,t.created_by_name,t.created_at,
    t.closed_at,t.cancelled_at,t.last_activity_at,t.updated_at,t.legacy_department_name,
    t.workflow_started,t.closed_reason,t.cancelled_reason,t.migration_status,
    coalesce(ou.name,t.legacy_department_name) responsible_unit_name,
    coalesce(ai.supporting_count,0) supporting_count,
    coalesce(ai.current_assignees,'{}'::text[]) current_assignees,
    coalesce(ai.ever_target,false) ever_target,
    coalesce(ai.current_target,false) current_target,
    coalesce(ai.assignment_scope_hit,false)
      or (t.origin='legacy' and t.legacy_department_name in (select name from scope_units)) scope_hit,
    coalesce(ai.employee_target_hit,false) employee_target_hit,
    coalesce(ri.route_to,false) route_to,
    coalesce(ri.route_from,false) route_from,
    ri.pending_transfer,
    coalesce(qi.pending_requests_count,0) pending_requests_count,
    case
      when lp.transaction_id is not null and lp.ended_at is not null then coalesce(lp.duration_days,0)
      when lp.transaction_id is not null then greatest(1,(current_date-lp.started_at::date)+1)
      else greatest(1,((case when t.status='closed' and t.closed_at is not null then t.closed_at::date else current_date end)-t.created_at::date)+1)
    end::int days
  from public.transactions t
  left join public.organizational_units ou on ou.id=t.responsible_unit_id
  left join latest_period lp on lp.transaction_id=t.id
  left join assign_info ai on ai.transaction_id=t.id
  left join route_info ri on ri.transaction_id=t.id
  left join request_info qi on qi.transaction_id=t.id
),
flagged as (
  select b.*,
    (
      (select view_all from params)
      or b.created_by_name in ((select name from params),(select login from params))
      or b.responsible_login_name=(select login from params)
      or b.responsible_name=(select name from params)
      or b.ever_target or b.route_to or b.route_from or b.scope_hit
    )
    and (
      b.status<>'cancelled'
      or (select view_all from params)
      or b.created_by_name in ((select name from params),(select login from params))
    ) visible,
    (
      b.status='open'
      and (b.current_target or b.route_to or b.responsible_login_name=(select login from params) or b.responsible_name=(select name from params))
    ) incoming,
    (
      b.status='open'
      and not (b.current_target or b.route_to or b.responsible_login_name=(select login from params) or b.responsible_name=(select name from params))
      and (b.ever_target or b.route_from or (b.created_by_name in ((select name from params),(select login from params)) and b.workflow_started))
    ) shared,
    (
      b.status='open'
      and b.current_level<>'ceo'
      and (
        (b.due_at is not null and b.due_at<now())
        or (b.due_at is null and b.days>=6)
      )
    ) late
  from base b
),
authorized as (
  select f.*,
    case
      when f.pending_transfer is not null then false
      when f.migration_status='needs_review' then
        ((select act_all from params)
          or ((select role from params)='assistant' and f.scope_hit))
      when (select act_all from params) then true
      when f.incoming then true
      when (select role from params)='manager' and f.scope_hit and f.current_level in ('employee','manager') then true
      when (select role from params)='assistant' and f.scope_hit and f.current_level<>'ceo' then true
      else false
    end can_act,
    coalesce(f.close_level,
      case when f.current_level='ceo' then 'ceo' when f.current_level='assistant' then 'assistant' else 'manager' end
    ) close_authority
  from flagged f
  where f.visible
),
authorized2 as (
  select a.*,
    case
      when a.pending_transfer is not null then false
      when (select act_all from params) then true
      when a.close_authority='assistant' then (select role from params)='assistant' and a.scope_hit
      when a.close_authority='manager' then (select role from params)='manager' and a.scope_hit
      else false
    end can_close
  from authorized a
),
counters as (
  select jsonb_build_object(
    'incoming',count(*) filter(where incoming and status='open'),
    'late',count(*) filter(where late),
    'pending_approval',count(*) filter(where pending_requests_count>0),
    'closed_today',count(*) filter(where status='closed' and closed_at::date=current_date)
  ) data
  from authorized2
),
filtered as (
  select a.*
  from authorized2 a,params p
  where
    (case
      when coalesce(p_tab,'all')='all' then true
      when p_tab='incoming' then a.incoming
      when p_tab='shared' then a.shared
      when p_tab='scope' then a.scope_hit
      when p_tab='ceo' then a.current_level='ceo'
      when p_tab='ceo_view' then a.ceo_attention
      when p_tab='closed' then a.status='closed'
      else true end)
    and (p_tab='closed' or a.status<>'closed')
    and (coalesce(p_priority,'')='' or a.priority=p_priority)
    and (coalesce(p_status,'')='' or a.status=p_status)
    and (coalesce(p_department,'')='' or a.responsible_unit_name=p_department)
    and (coalesce(p_employee,'')='' or a.responsible_login_name=p_employee or a.employee_target_hit)
    and (coalesce(p_origin,'')='' or a.origin=p_origin)
    and (not coalesce(p_late_only,false) or a.late)
    and (p_date_from is null or a.created_at::date>=p_date_from)
    and (p_date_to is null or a.created_at::date<=p_date_to)
    and (
      p.search_q=''
      or lower(coalesce(a.number,'')) like '%'||p.search_q||'%'
      or lower(coalesce(a.title,'')) like '%'||p.search_q||'%'
      or lower(coalesce(a.responsible_name,'')) like '%'||p.search_q||'%'
      or lower(coalesce(a.responsible_unit_name,'')) like '%'||p.search_q||'%'
      or exists(select 1 from unnest(a.current_assignees) x where lower(x) like '%'||p.search_q||'%')
    )
),
tot as (select count(*)::int total from filtered),
paged as (
  select *
  from filtered,params p
  order by
    case when p_tab='scope' then created_at end asc nulls last,
    case when p_tab='closed' then closed_at end desc nulls last,
    case when p_tab not in ('scope','closed') then created_at end desc nulls last
  limit (select page_size from params)
  offset ((select page_no-1 from params)*(select page_size from params))
)
select jsonb_build_object(
  'ok',true,
  'total',(select total from tot),
  'page',(select page_no from params),
  'page_size',(select page_size from params),
  'counters',(select data from counters),
  'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)
);
$function$;

revoke all on function public.list_transactions_internal(
  text,text,text,text,text[],text,text,text,text,text,text,text,boolean,date,date,integer,integer
) from public,anon,authenticated;
grant execute on function public.list_transactions_internal(
  text,text,text,text,text[],text,text,text,text,text,text,text,boolean,date,date,integer,integer
) to service_role;

