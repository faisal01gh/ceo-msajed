create table if not exists public.legacy_auth_directory(
  legacy_user_id uuid primary key,
  login_name text not null unique,
  display_name text not null,
  legacy_role text,
  job_title text,
  sectors text[] not null default '{}',
  dept_names text[] not null default '{}',
  active boolean not null default true,
  imported_at timestamptz not null default now()
);
alter table public.legacy_auth_directory enable row level security;
revoke all on public.legacy_auth_directory from anon,authenticated;
create index if not exists idx_legacy_auth_directory_login on public.legacy_auth_directory(login_name);
