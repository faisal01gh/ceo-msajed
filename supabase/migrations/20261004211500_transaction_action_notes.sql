-- Transaction action notes + legacy review support.
-- New system only.

create table if not exists public.transaction_action_notes (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.transaction_actions(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  actor_name text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_action_notes_action
  on public.transaction_action_notes(action_id,created_at);
create index if not exists idx_action_notes_transaction
  on public.transaction_action_notes(transaction_id,created_at);

alter table public.transaction_action_notes enable row level security;
revoke all on table public.transaction_action_notes from public,anon,authenticated;
grant select,insert,update,delete on table public.transaction_action_notes to service_role;
