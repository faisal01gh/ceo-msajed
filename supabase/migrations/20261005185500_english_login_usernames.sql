
alter table public.account_migration_users
  add column if not exists login_username text;

update public.account_migration_users
set login_username = case canonical_key
  when 'ceo' then 'abdullatif'
  when 'faisal' then 'faisal'
  when 'fahad_ceo' then 'fahad'
  when 'haif' then 'haif'
  when 'bazai' then 'bazai'
  when 'rashid' then 'rashid'
  when 'zakri' then 'zakri'
  when 'ahmad' then 'ahmad'
  when 'abdulrahman' then 'abdulrahman'
  when 'omar_awqaf' then 'omar'
  when 'majed_projects' then 'majed'
  when 'finance_manager' then 'finance'
  else replace(canonical_key,'_','')
end
where login_username is null
   or login_username !~ '^[a-z0-9._-]{3,40}$';

alter table public.account_migration_users
  alter column login_username set not null;

alter table public.account_migration_users
  drop constraint if exists account_migration_users_login_username_check;

alter table public.account_migration_users
  add constraint account_migration_users_login_username_check
  check (login_username ~ '^[a-z0-9._-]{3,40}$');

create unique index if not exists uq_account_migration_users_login_username
  on public.account_migration_users(login_username);

insert into public.account_migration_aliases(alias,canonical_key,source,source_login,active)
select login_username,canonical_key,'new_system',login_username,true
from public.account_migration_users
where eligible
on conflict(alias) do update set
  canonical_key=excluded.canonical_key,
  source='new_system',
  source_login=excluded.source_login,
  active=true;
