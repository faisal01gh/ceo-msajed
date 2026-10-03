alter table public.transactions add column if not exists migration_status text
  not null default 'ready'
  check (migration_status in ('ready','needs_review'));

update public.transactions
set migration_status='needs_review'
where origin='legacy' and status='open'
  and (responsible_unit_id is null or responsible_login_name is null);
