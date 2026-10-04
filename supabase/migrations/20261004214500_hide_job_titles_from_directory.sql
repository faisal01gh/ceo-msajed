-- Remove job-title metadata from the authenticated user-facing directory payload.

create or replace function public.transaction_directory_my()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with d as (
    select app_private.transaction_directory_current() as payload
  )
  select jsonb_set(
    payload,
    '{users}',
    coalesce(
      (
        select jsonb_agg(u.value - 'job_title')
        from jsonb_array_elements(coalesce(payload->'users','[]'::jsonb)) u
      ),
      '[]'::jsonb
    ),
    true
  )
  from d;
$$;

revoke all on function public.transaction_directory_my() from public,anon;
grant execute on function public.transaction_directory_my() to authenticated;
