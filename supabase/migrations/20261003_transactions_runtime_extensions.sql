-- Runtime extensions for the transactions module.
-- Applied to msajed-ceo-erp. No secrets are stored here.

alter table public.transaction_history add column if not exists legacy_key text;
create unique index if not exists uq_transaction_history_legacy_key
on public.transaction_history(transaction_id,event_type,legacy_key)
where legacy_key is not null;

alter table public.transactions add column if not exists close_level text
  check (close_level in ('manager','assistant','ceo') or close_level is null);
alter table public.transactions add column if not exists responsible_login_name text;
alter table public.transactions add column if not exists responsible_name text;
alter table public.transactions add column if not exists workflow_started boolean not null default false;
alter table public.transactions add column if not exists closed_reason text;
alter table public.transactions add column if not exists cancelled_reason text;

alter table public.transaction_routes add column if not exists from_login_name text;
alter table public.transaction_routes add column if not exists from_name text;
alter table public.transaction_routes add column if not exists to_login_name text;
alter table public.transaction_routes add column if not exists to_name text;
alter table public.transaction_routes add column if not exists visibility_scope text;
alter table public.transaction_routes add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.transaction_requests alter column requested_by drop not null;
alter table public.transaction_requests add column if not exists requested_by_login_name text;
alter table public.transaction_requests add column if not exists requested_by_name text;
alter table public.transaction_requests add column if not exists decided_by_login_name text;
alter table public.transaction_requests add column if not exists decided_by_name text;
alter table public.transaction_requests add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.notifications alter column user_id drop not null;
alter table public.notifications add column if not exists target_login_name text;
alter table public.notifications add column if not exists target_name text;

alter table public.transaction_assignments add column if not exists visibility_scope text;

create table if not exists public.transaction_assignment_targets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.transaction_assignments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  login_name text,
  display_name text not null,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  check (user_id is not null or login_name is not null)
);

create index if not exists idx_assignment_targets_assignment on public.transaction_assignment_targets(assignment_id,active);
create index if not exists idx_assignment_targets_user on public.transaction_assignment_targets(user_id,active);
create index if not exists idx_assignment_targets_login on public.transaction_assignment_targets(login_name,active);
create index if not exists idx_routes_to_login on public.transaction_routes(to_login_name,status);
create index if not exists idx_routes_from_login on public.transaction_routes(from_login_name);
create index if not exists idx_requests_requested_login on public.transaction_requests(requested_by_login_name,status);
create index if not exists idx_notifications_target_login on public.notifications(target_login_name,read_at,created_at desc);
create index if not exists idx_assignments_visibility on public.transaction_assignments(visibility_scope)
where assignment_type='direct';

alter table public.transaction_assignment_targets enable row level security;
drop policy if exists transaction_assignment_targets_read on public.transaction_assignment_targets;
create policy transaction_assignment_targets_read on public.transaction_assignment_targets
for select to authenticated
using (
  exists(
    select 1
    from public.transaction_assignments a
    where a.id=assignment_id
      and app_private.can_view_transaction((select auth.uid()),a.transaction_id)
  )
);
grant select on public.transaction_assignment_targets to authenticated;

do $$
declare
  admin_sector uuid;
  technical_sector uuid;
  branches_group uuid;
  office_unit uuid;
  finance_unit uuid;
begin
  select id into office_unit from public.organizational_units where name='مكتب الرئيس التنفيذي' and parent_id is null limit 1;
  if office_unit is null then
    insert into public.organizational_units(name,unit_type,parent_id,legacy_name)
    values('مكتب الرئيس التنفيذي','office',null,'مكتب الرئيس التنفيذي') returning id into office_unit;
  end if;

  select id into admin_sector from public.organizational_units where name='مساعد الرئيس التنفيذي للشؤون الإدارية والمالية' and parent_id is null limit 1;
  if admin_sector is null then
    insert into public.organizational_units(name,unit_type,parent_id,legacy_name)
    values('مساعد الرئيس التنفيذي للشؤون الإدارية والمالية','sector',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية')
    returning id into admin_sector;
  end if;

  select id into technical_sector from public.organizational_units where name='مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية' and parent_id is null limit 1;
  if technical_sector is null then
    insert into public.organizational_units(name,unit_type,parent_id,legacy_name)
    values('مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية','sector',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية')
    returning id into technical_sector;
  end if;

  select id into finance_unit from public.organizational_units where name='الإدارة المالية' and parent_id is null limit 1;
  if finance_unit is null then
    insert into public.organizational_units(name,unit_type,parent_id,legacy_name)
    values('الإدارة المالية','independent',null,'الإدارة المالية') returning id into finance_unit;
  end if;

  insert into public.organizational_units(name,unit_type,parent_id,legacy_name)
  values
    ('إدارة تنمية الموارد المالية','department',admin_sector,'إدارة تنمية الموارد المالية'),
    ('إدارة العلاقات العامة والإعلام','department',admin_sector,'علاقات عامة وإعلام'),
    ('إدارة الموارد البشرية','department',admin_sector,'الموارد البشرية'),
    ('الإدارة القانونية','department',admin_sector,'الإدارة القانونية'),
    ('إدارة الحوكمة','department',admin_sector,'إدارة الحوكمة'),
    ('إدارة الاستراتيجية','department',admin_sector,'الاستراتيجية'),
    ('إدارة التقنية','department',admin_sector,'إدارة التقنية'),
    ('إدارة الاتصالات الإدارية','department',admin_sector,'الاتصالات الإدارية'),
    ('إدارة التطوع','department',admin_sector,'التطوع'),
    ('إدارة المشاريع','department',technical_sector,'إدرة المشاريع'),
    ('إدارة المشتريات','department',technical_sector,'إدارة المشتريات'),
    ('إدارة الأوقاف والاستثمار','department',technical_sector,'إدارة الأوقاف والاستثمار'),
    ('إدارة الخدمات','department',technical_sector,'إدارة الخدمات'),
    ('إدارة المتابعة','department',technical_sector,'إدارة المتابعة')
  on conflict do nothing;

  select id into branches_group from public.organizational_units
  where name='الفروع' and parent_id=admin_sector limit 1;
  if branches_group is null then
    insert into public.organizational_units(name,unit_type,parent_id,legacy_name)
    values('الفروع','branch_group',admin_sector,'الفروع') returning id into branches_group;
  end if;

  insert into public.organizational_units(name,unit_type,parent_id,legacy_name)
  values
    ('حائل','branch',branches_group,'حائل'),
    ('جازان','branch',branches_group,'جازان'),
    ('المدينة المنورة','branch',branches_group,'المدينة المنورة'),
    ('مكة المكرمة','branch',branches_group,'مكة المكرمة'),
    ('القصيم','branch',branches_group,'القصيم'),
    ('الرياض','branch',branches_group,'الرياض'),
    ('الأحساء','branch',branches_group,'الأحساء'),
    ('الدمام','branch',branches_group,'الدمام'),
    ('الطائف','branch',branches_group,'الطائف'),
    ('تبوك','branch',branches_group,'تبوك')
  on conflict do nothing;
end $$;
