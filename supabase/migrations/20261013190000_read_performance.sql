-- PROPOSED_NOT_APPLIED. New-system source proposal; no live DDL authorized.
-- Current transaction_feedback_flags reads the latest completed/accepted movement
-- ordered by created_at DESC, id DESC, excluding ceo_view. idx_routes_tx covers
-- only (transaction_id,created_at DESC), so tied timestamps require a sort.
-- Local synthetic EXPLAIN (ANALYZE,BUFFERS) proves this additional query pattern.
-- No helper, policy, permission, pagination or payload definition is changed.
begin;
create index if not exists idx_routes_latest_custody_read
  on public.transaction_routes(transaction_id,created_at desc,id desc)
  where route_type<>'ceo_view' and status in ('completed','accepted');
commit;
