-- نظام الجمعية — أساس قاعدة البيانات الجديدة
-- Supabase project: msajed-ceo-erp
-- لا يحتوي هذا الملف أي أسرار.

create schema if not exists app_private;

create table if not exists public.roles (
  code text primary key,
  name_ar text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  code text primary key,
  name_ar text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login_name text unique,
  full_name text not null,
  job_title text,
  active boolean not null default true,
  legacy_source text,
  legacy_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_code text not null references public.roles(code) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

create table if not exists public.organizational_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_type text not null check (unit_type in ('office','sector','department','branch_group','branch','independent')),
  parent_id uuid references public.organizational_units(id) on delete restrict,
  active boolean not null default true,
  legacy_name text,
  created_at timestamptz not null default now(),
  unique (name, parent_id)
);

create table if not exists public.user_memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid not null references public.organizational_units(id) on delete cascade,
  membership_role text not null default 'member' check (membership_role in ('member','manager','assistant','office')),
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, unit_id, membership_role)
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  effect text not null default 'allow' check (effect in ('allow','deny')),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_code)
);

create table if not exists public.legacy_login_credentials (
  username text primary key,
  pass_hash text,
  source text not null check (source in ('ceo_users','portal_users')),
  display_name text not null,
  legacy_role text,
  job_title text,
  org_name text,
  dept_name text,
  dept_names text[] not null default '{}',
  active boolean not null default true,
  migrated_user_id uuid references auth.users(id) on delete set null,
  auth_email text unique,
  migrated_at timestamptz,
  imported_at timestamptz not null default now()
);

create table if not exists public.auth_login_attempts (
  ident text primary key,
  attempts integer not null default 0,
  first_at timestamptz not null default now(),
  blocked_until timestamptz
);

create table if not exists public.transaction_sequences (
  year integer primary key,
  last_value bigint not null default 0 check (last_value >= 0)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  origin text not null default 'new' check (origin in ('new','legacy')),
  legacy_source text,
  legacy_sn text,
  legacy_sid text,
  legacy_department_name text,
  legacy_channel text,
  legacy_note text,
  legacy_payload jsonb,
  legacy_synced_at timestamptz,
  title text not null,
  subject text,
  attachment_url text,
  priority text not null default 'عادي' check (priority in ('عاجل جدًا','عاجل','عادي')),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  responsible_unit_id uuid references public.organizational_units(id) on delete set null,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  current_level text check (current_level in ('employee','manager','assistant','ceo') or current_level is null),
  ceo_attention boolean not null default false,
  due_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legacy_source, legacy_sn)
);

create table if not exists public.transaction_periods (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  cycle_no integer not null check (cycle_no >= 1),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_days integer check (duration_days is null or duration_days >= 0),
  created_at timestamptz not null default now(),
  unique (transaction_id, cycle_no)
);

create table if not exists public.transaction_assignments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  unit_id uuid references public.organizational_units(id) on delete set null,
  assignment_type text not null check (assignment_type in ('responsible','supporting','direct')),
  directive text,
  attachment_url text,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.transaction_assignment_users (
  assignment_id uuid not null references public.transaction_assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (assignment_id, user_id)
);

create table if not exists public.transaction_participants (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  participation_type text not null default 'participant' check (participation_type in ('participant','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (transaction_id, user_id, participation_type)
);

create table if not exists public.transaction_actions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  assignment_id uuid references public.transaction_assignments(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action_text text not null,
  status text not null default 'recorded' check (status in ('recorded','pending','approved','rejected')),
  current_version integer not null default 1 check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_sid text
);

create table if not exists public.transaction_action_versions (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.transaction_actions(id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  body text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  decision_status text check (decision_status in ('approved','rejected') or decision_status is null),
  decision_by uuid references public.profiles(id) on delete set null,
  decision_reason text,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_id, version_no)
);

create table if not exists public.transaction_routes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  route_type text not null check (route_type in ('directive','raise','assistant_transfer','direct_assign','ceo_view')),
  from_user_id uuid references public.profiles(id) on delete set null,
  from_role text,
  to_user_id uuid references public.profiles(id) on delete set null,
  to_unit_id uuid references public.organizational_units(id) on delete set null,
  directive text,
  raise_reason text,
  proposed_decision text,
  transfer_reason text,
  status text not null default 'completed' check (status in ('pending','accepted','rejected','completed')),
  rejection_reason text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  request_type text not null check (request_type in ('close','reopen','cancel','extension','change_responsible')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  requested_due_at timestamptz,
  requested_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  assignment_id uuid references public.transaction_assignments(id) on delete cascade,
  link_type text not null default 'attachment',
  url text not null,
  label text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_history (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.roles(code,name_ar) values
('employee','موظف'),('manager','مدير إدارة'),('assistant','مساعد الرئيس التنفيذي'),
('ceo','الرئيس التنفيذي'),('ceo_office_manager','مدير مكتب الرئيس التنفيذي'),('ceo_secretary','سكرتير الرئيس التنفيذي')
on conflict (code) do update set name_ar=excluded.name_ar;

insert into public.permissions(code,name_ar) values
('transactions.view_all','عرض جميع المعاملات'),('transactions.act_all','التصرف على جميع المعاملات'),
('transactions.create','إنشاء معاملة'),('transactions.assign','إحالة وإسناد'),
('transactions.close','إغلاق معاملة'),('transactions.reopen','استرجاع معاملة'),
('transactions.change_responsible','تغيير مسؤول المعاملة'),('transactions.change_priority','تغيير الأولوية'),
('transactions.set_due_date','تحديد تاريخ الاستحقاق'),('transactions.delete_hard','الحذف النهائي')
on conflict (code) do update set name_ar=excluded.name_ar;

insert into public.role_permissions(role_code,permission_code)
select r,p from (values
('ceo','transactions.view_all'),('ceo','transactions.act_all'),('ceo','transactions.create'),('ceo','transactions.assign'),('ceo','transactions.close'),('ceo','transactions.reopen'),('ceo','transactions.change_responsible'),('ceo','transactions.change_priority'),('ceo','transactions.set_due_date'),
('ceo_office_manager','transactions.view_all'),('ceo_office_manager','transactions.act_all'),('ceo_office_manager','transactions.create'),('ceo_office_manager','transactions.assign'),('ceo_office_manager','transactions.close'),('ceo_office_manager','transactions.reopen'),('ceo_office_manager','transactions.change_responsible'),('ceo_office_manager','transactions.change_priority'),('ceo_office_manager','transactions.set_due_date'),('ceo_office_manager','transactions.delete_hard'),
('ceo_secretary','transactions.view_all'),('ceo_secretary','transactions.act_all'),('ceo_secretary','transactions.create'),('ceo_secretary','transactions.assign'),('ceo_secretary','transactions.close'),('ceo_secretary','transactions.reopen'),('ceo_secretary','transactions.change_responsible'),('ceo_secretary','transactions.change_priority'),('ceo_secretary','transactions.set_due_date'),
('assistant','transactions.create'),('assistant','transactions.assign'),('assistant','transactions.close'),('assistant','transactions.reopen'),('assistant','transactions.change_responsible'),('assistant','transactions.change_priority'),('assistant','transactions.set_due_date'),
('manager','transactions.create'),('manager','transactions.assign'),('manager','transactions.close'),('manager','transactions.reopen'),('manager','transactions.change_responsible'),('manager','transactions.change_priority')
) v(r,p)
on conflict do nothing;

create or replace function app_private.is_exec(_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=_user and role_code in ('ceo','ceo_office_manager','ceo_secretary'));
$$;

create or replace function app_private.unit_in_scope(_scope uuid,_target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with recursive chain as (
    select id,parent_id from public.organizational_units where id=_target
    union all
    select p.id,p.parent_id from public.organizational_units p join chain c on c.parent_id=p.id
  )
  select exists(select 1 from chain where id=_scope);
$$;

create or replace function app_private.can_view_transaction(_user uuid,_tx uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.transactions%rowtype;
begin
  if _user is null then return false; end if;
  if app_private.is_exec(_user) then return true; end if;
  select * into t from public.transactions where id=_tx;
  if not found then return false; end if;
  if t.created_by=_user or t.responsible_user_id=_user then return true; end if;
  if exists(select 1 from public.transaction_assignment_users au join public.transaction_assignments a on a.id=au.assignment_id where a.transaction_id=_tx and au.user_id=_user and au.active) then return true; end if;
  if exists(select 1 from public.transaction_participants p where p.transaction_id=_tx and p.user_id=_user and p.active) then return true; end if;
  if exists(
    select 1 from public.user_roles ur join public.user_memberships um on um.user_id=ur.user_id and um.active
    where ur.user_id=_user and ur.role_code='manager' and um.membership_role='manager'
      and (um.unit_id=t.responsible_unit_id or exists(select 1 from public.transaction_assignments a where a.transaction_id=_tx and a.unit_id=um.unit_id and a.status='active'))
  ) then return true; end if;
  if exists(
    select 1 from public.user_roles ur join public.user_memberships um on um.user_id=ur.user_id and um.active
    where ur.user_id=_user and ur.role_code='assistant' and um.membership_role='assistant'
      and (app_private.unit_in_scope(um.unit_id,t.responsible_unit_id) or exists(select 1 from public.transaction_assignments a where a.transaction_id=_tx and a.unit_id is not null and app_private.unit_in_scope(um.unit_id,a.unit_id)))
  ) then return true; end if;
  return false;
end $$;

create or replace function public.next_transaction_number()
returns text language plpgsql security definer set search_path='' as $$
declare y integer:=extract(year from now())::integer; n bigint;
begin
  insert into public.transaction_sequences(year,last_value) values(y,1)
  on conflict(year) do update set last_value=public.transaction_sequences.last_value+1
  returning last_value into n;
  return y::text||'-'||lpad(n::text,6,'0');
end $$;

revoke all on function public.next_transaction_number() from public,anon,authenticated;
grant execute on function public.next_transaction_number() to service_role;

create index if not exists idx_user_roles_user on public.user_roles(user_id);
create index if not exists idx_user_roles_role on public.user_roles(role_code);
create index if not exists idx_user_memberships_user on public.user_memberships(user_id) where active;
create index if not exists idx_user_memberships_unit on public.user_memberships(unit_id) where active;
create index if not exists idx_org_units_parent on public.organizational_units(parent_id);
create index if not exists idx_transactions_status_created on public.transactions(status,created_at desc);
create index if not exists idx_transactions_responsible_unit on public.transactions(responsible_unit_id);
create index if not exists idx_transactions_responsible_user on public.transactions(responsible_user_id);
create index if not exists idx_transactions_created_by on public.transactions(created_by);
create index if not exists idx_transactions_legacy on public.transactions(legacy_source,legacy_sn);
create index if not exists idx_assignments_tx on public.transaction_assignments(transaction_id,status);
create index if not exists idx_assignments_unit on public.transaction_assignments(unit_id,status);
create index if not exists idx_assignments_created_by on public.transaction_assignments(created_by);
create index if not exists idx_assignment_users_user on public.transaction_assignment_users(user_id,active);
create index if not exists idx_actions_tx on public.transaction_actions(transaction_id,created_at desc);
create index if not exists idx_actions_actor on public.transaction_actions(actor_id);
create index if not exists idx_actions_assignment on public.transaction_actions(assignment_id);
create unique index if not exists uq_transaction_actions_legacy_sid on public.transaction_actions(transaction_id,legacy_sid) where legacy_sid is not null;
create index if not exists idx_routes_tx on public.transaction_routes(transaction_id,created_at desc);
create index if not exists idx_routes_from_user on public.transaction_routes(from_user_id);
create index if not exists idx_routes_to_user on public.transaction_routes(to_user_id);
create index if not exists idx_routes_to_unit on public.transaction_routes(to_unit_id);
create index if not exists idx_routes_decided_by on public.transaction_routes(decided_by);
create index if not exists idx_requests_tx on public.transaction_requests(transaction_id,status);
create index if not exists idx_requests_requested_by on public.transaction_requests(requested_by);
create index if not exists idx_requests_requested_user on public.transaction_requests(requested_user_id);
create index if not exists idx_requests_decided_by on public.transaction_requests(decided_by);
create index if not exists idx_history_tx on public.transaction_history(transaction_id,created_at desc);
create index if not exists idx_history_actor on public.transaction_history(actor_id);
create index if not exists idx_notifications_user on public.notifications(user_id,read_at,created_at desc);
create index if not exists idx_notifications_transaction on public.notifications(transaction_id);
create index if not exists idx_audit_actor on public.audit_log(actor_id,created_at desc);
create index if not exists idx_links_transaction on public.transaction_links(transaction_id);
create index if not exists idx_links_assignment on public.transaction_links(assignment_id);
create index if not exists idx_links_created_by on public.transaction_links(created_by);
create index if not exists idx_participants_user on public.transaction_participants(user_id);
create index if not exists idx_action_versions_actor on public.transaction_action_versions(actor_id);
create index if not exists idx_action_versions_decision_by on public.transaction_action_versions(decision_by);
create index if not exists idx_role_permissions_permission on public.role_permissions(permission_code);
create index if not exists idx_user_permissions_permission on public.user_permissions(permission_code);
create index if not exists idx_legacy_login_migrated_user on public.legacy_login_credentials(migrated_user_id);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.organizational_units enable row level security;
alter table public.user_memberships enable row level security;
alter table public.user_permissions enable row level security;
alter table public.legacy_login_credentials enable row level security;
alter table public.auth_login_attempts enable row level security;
alter table public.transaction_sequences enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_periods enable row level security;
alter table public.transaction_assignments enable row level security;
alter table public.transaction_assignment_users enable row level security;
alter table public.transaction_participants enable row level security;
alter table public.transaction_actions enable row level security;
alter table public.transaction_action_versions enable row level security;
alter table public.transaction_routes enable row level security;
alter table public.transaction_requests enable row level security;
alter table public.transaction_links enable row level security;
alter table public.transaction_history enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (active);
drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles for select to authenticated using (true);
drop policy if exists org_units_read on public.organizational_units;
create policy org_units_read on public.organizational_units for select to authenticated using (active);
drop policy if exists memberships_read on public.user_memberships;
create policy memberships_read on public.user_memberships for select to authenticated using (active);
drop policy if exists user_permissions_read_own on public.user_permissions;
create policy user_permissions_read_own on public.user_permissions for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists transactions_read on public.transactions;
create policy transactions_read on public.transactions for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),id));

drop policy if exists transaction_periods_read on public.transaction_periods;
create policy transaction_periods_read on public.transaction_periods for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists transaction_assignments_read on public.transaction_assignments;
create policy transaction_assignments_read on public.transaction_assignments for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists transaction_assignment_users_read on public.transaction_assignment_users;
create policy transaction_assignment_users_read on public.transaction_assignment_users for select to authenticated
using (exists(select 1 from public.transaction_assignments a where a.id=assignment_id and app_private.can_view_transaction((select auth.uid()),a.transaction_id)));

drop policy if exists transaction_participants_read on public.transaction_participants;
create policy transaction_participants_read on public.transaction_participants for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists transaction_actions_read on public.transaction_actions;
create policy transaction_actions_read on public.transaction_actions for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists transaction_action_versions_read on public.transaction_action_versions;
create policy transaction_action_versions_read on public.transaction_action_versions for select to authenticated
using (exists(select 1 from public.transaction_actions a where a.id=action_id and app_private.can_view_transaction((select auth.uid()),a.transaction_id)));

drop policy if exists transaction_routes_read on public.transaction_routes;
create policy transaction_routes_read on public.transaction_routes for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists transaction_requests_read on public.transaction_requests;
create policy transaction_requests_read on public.transaction_requests for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists transaction_links_read on public.transaction_links;
create policy transaction_links_read on public.transaction_links for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists transaction_history_read on public.transaction_history;
create policy transaction_history_read on public.transaction_history for select to authenticated
using (app_private.can_view_transaction((select auth.uid()),transaction_id));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

drop policy if exists audit_read_exec on public.audit_log;
create policy audit_read_exec on public.audit_log for select to authenticated
using (app_private.is_exec((select auth.uid())));

grant select on public.roles,public.permissions,public.role_permissions,public.profiles,public.user_roles,
public.organizational_units,public.user_memberships,public.user_permissions,public.transactions,public.transaction_periods,
public.transaction_assignments,public.transaction_assignment_users,public.transaction_participants,public.transaction_actions,
public.transaction_action_versions,public.transaction_routes,public.transaction_requests,public.transaction_links,
public.transaction_history,public.notifications,public.audit_log to authenticated;
grant update(read_at) on public.notifications to authenticated;
revoke all on public.legacy_login_credentials,public.auth_login_attempts,public.transaction_sequences from anon,authenticated;
