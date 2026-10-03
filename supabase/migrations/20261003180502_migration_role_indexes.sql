create index if not exists idx_account_migration_users_role_code on public.account_migration_users(role_code);
create index if not exists idx_auth_migration_accounts_role_code on public.auth_migration_accounts(role_code);
