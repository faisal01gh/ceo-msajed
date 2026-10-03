alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create table if not exists public.account_migration_users (
  canonical_key text primary key,
  preferred_login text not null unique,
  display_name text not null,
  role_code text not null references public.roles(code) on delete restrict,
  job_title text,
  org_name text,
  dept_names text[] not null default '{}',
  internal_email text not null unique,
  eligible boolean not null default true,
  migrated_user_id uuid references auth.users(id) on delete set null,
  must_change_password boolean not null default true,
  migrated_at timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.account_migration_aliases (
  alias text primary key,
  canonical_key text not null references public.account_migration_users(canonical_key) on delete cascade,
  source text not null check (source in ('ceo_users','portal_users','legacy_auth')),
  source_login text not null,
  active boolean not null default true,
  last_activity_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.account_migration_users enable row level security;
alter table public.account_migration_aliases enable row level security;
revoke all on public.account_migration_users,public.account_migration_aliases from anon,authenticated;

create index if not exists idx_account_migration_users_user on public.account_migration_users(migrated_user_id);
create index if not exists idx_account_migration_aliases_key on public.account_migration_aliases(canonical_key);

insert into public.account_migration_users
(canonical_key,preferred_login,display_name,role_code,job_title,org_name,dept_names,internal_email,eligible)
values
('ceo','abdullatif','عبداللطيف سليمان عبدالله السريع','ceo','الرئيس التنفيذي','مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي'],'u-ceo@msajed.local',true),
('faisal','فيصل','فيصل بن محمد الغامدي','ceo_office_manager','مدير مكتب الرئيس التنفيذي','مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي'],'u-faisal@msajed.local',true),
('fahad_ceo','فهد','فهد عمر أحمد بامقدم','ceo_secretary','سكرتير الرئيس التنفيذي','مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي'],'u-fahad-ceo@msajed.local',true),
('haif','هايف','هايف نايف مطلق الدويش','assistant','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية','{}','u-haif@msajed.local',true),
('bazai','محمد البازعي','عبدالله محمد عبدالله البازعي','assistant','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية','{}','u-bazai@msajed.local',true),
('rashid','فهد الرشيد','فهد وليد الرشيد','assistant','مدير مكتب المساعد','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية','{}','u-rashid@msajed.local',true),
('zakri','فيصل الزكري','فيصل فهد الزكري','assistant','مدير مكتب المساعد','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية','{}','u-zakri@msajed.local',true),
('ahmad','أحمد','أحمد عبدالوهاب عبدالغني الغامدي','manager','مدير الإدارة','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة تنمية الموارد المالية','إدارة العلاقات العامة والإعلام'],'u-ahmad@msajed.local',true),
('abdulrahman','عبدالرحمن','عبدالرحمن صالح عمر الخراشي','manager','مدير الإدارة','مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة الموارد البشرية','الإدارة القانونية'],'u-abdulrahman@msajed.local',true),
('omar_awqaf','عمر الحسين','عمر عبدالعزيز الحسين','employee','موظف','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة الأوقاف والاستثمار'],'u-omar-awqaf@msajed.local',true),
('majed_projects','ماجد الغامدي','ماجد علي الغامدي','manager','مدير إدارة المشاريع','مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع'],'u-majed@msajed.local',true),
('finance_manager','مالي','المدير المالي','manager','المدير المالي','المدير المالي',array['الإدارة المالية'],'u-finance@msajed.local',true)
on conflict (canonical_key) do update set
  preferred_login=excluded.preferred_login,
  display_name=excluded.display_name,
  role_code=excluded.role_code,
  job_title=excluded.job_title,
  org_name=excluded.org_name,
  dept_names=excluded.dept_names,
  internal_email=excluded.internal_email,
  eligible=excluded.eligible;

insert into public.account_migration_aliases(alias,canonical_key,source,source_login,last_activity_at)
values
('abdullatif@msajed.local','ceo','legacy_auth','abdullatif@msajed.local','2026-07-18T13:07:01Z'),
('فيصل','faisal','ceo_users','فيصل','2026-10-03T16:45:22Z'),
('faisal@msajed.local','faisal','legacy_auth','faisal@msajed.local','2026-07-18T21:52:11Z'),
('فهد','fahad_ceo','ceo_users','فهد','2026-08-30T09:20:17Z'),
('fahad@msajed.local','fahad_ceo','legacy_auth','fahad@msajed.local',null),
('هايف','haif','portal_users','هايف','2026-10-01T09:15:17Z'),
('m-idari@msajed.local','haif','legacy_auth','m-idari@msajed.local','2026-07-18T21:14:59Z'),
('محمد البازعي','bazai','portal_users','محمد البازعي','2026-09-08T09:43:21Z'),
('m-fanni@msajed.local','bazai','legacy_auth','m-fanni@msajed.local',null),
('فهد الرشيد','rashid','portal_users','فهد الرشيد','2026-10-01T07:46:17Z'),
('فيصل الزكري','zakri','portal_users','فيصل الزكري','2026-09-30T11:23:00Z'),
('أحمد','ahmad','portal_users','أحمد','2026-10-01T07:31:18Z'),
('عبدالرحمن','abdulrahman','portal_users','عبدالرحمن','2026-09-03T05:38:25Z'),
('عمر الحسين','omar_awqaf','portal_users','عمر الحسين','2026-09-15T09:37:21Z'),
('ماجد الغامدي','majed_projects','portal_users','ماجد الغامدي',null),
('مالي','finance_manager','portal_users','مالي','2026-07-24T18:39:42Z'),
('finance','finance_manager','portal_users','finance',null),
('m-mali@msajed.local','finance_manager','legacy_auth','m-mali@msajed.local',null),
('maliya@msajed.local','finance_manager','legacy_auth','maliya@msajed.local',null)
on conflict (alias) do update set
  canonical_key=excluded.canonical_key,
  source=excluded.source,
  source_login=excluded.source_login,
  last_activity_at=excluded.last_activity_at,
  active=true;
