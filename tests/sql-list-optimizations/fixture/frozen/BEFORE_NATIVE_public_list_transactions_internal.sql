CREATE OR REPLACE FUNCTION public.list_transactions_internal(p_login text, p_name text, p_role text, p_org text, p_depts text[], p_tab text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_priority text DEFAULT ''::text, p_status text DEFAULT ''::text, p_department text DEFAULT ''::text, p_employee text DEFAULT ''::text, p_origin text DEFAULT ''::text, p_late_only boolean DEFAULT false, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with
actor as materialized (
 select p.id,c.data,a.preferred_login from public.profiles p
 join public.account_migration_users a on a.migrated_user_id=p.id and a.eligible
 cross join lateral (select public.user_context_internal(p.id) data) c
 where p.login_name=p_login or a.preferred_login=p_login
 order by (p.login_name=p_login) desc,p.id limit 1
),
params as (
  select
    coalesce(p_login,'') login,
    coalesce(p_name,'') name,
    coalesce((select data->>'role' from actor),'') role,
    coalesce(p_org,'') org,
    coalesce(p_depts,'{}'::text[]) depts,
    greatest(1,coalesce(p_page,1)) page_no,
    least(100,greatest(10,coalesce(p_page_size,50))) page_size,
    lower(trim(coalesce(p_search,''))) search_q,
    app_private.account_permission_effective((select id from actor),'transactions.view_all') view_all,
    app_private.account_permission_effective((select id from actor),'transactions.act_all') act_all
),
feedback as materialized (
 -- One evaluation per physical row, shared by filtering, counters and pagination.
 select t.id,app_private.transaction_feedback_flags((select id from actor),t.id) data
 from public.transactions t
),
latest_period as (
  select distinct on (tp.transaction_id)
    tp.transaction_id,tp.cycle_no,tp.started_at,tp.ended_at,tp.duration_days
  from public.transaction_periods tp
  order by tp.transaction_id,tp.cycle_no desc
),
assign_info as (
 select a.transaction_id,
  count(distinct a.id) filter(where a.assignment_type='supporting' and a.status='active')::int supporting_count,
  bool_or(at.login_name=coalesce(nullif(p_employee,''),'__none__')) employee_target_hit
 from public.transaction_assignments a
 left join public.transaction_assignment_targets at on at.assignment_id=a.id
 group by a.transaction_id
),
route_info as (
 select distinct on (r.transaction_id) r.transaction_id,to_jsonb(r) pending_transfer
 from public.transaction_routes r
 where r.route_type='assistant_transfer' and r.status='pending'
 and (r.to_user_id=(select id from actor) or (r.to_user_id is null and r.to_login_name=(select login from params)))
 order by r.transaction_id,r.created_at desc,r.id desc
),
request_info as (
  select transaction_id,count(*) filter(where status='pending')::int pending_requests_count
  from public.transaction_requests
  group by transaction_id
),
base as (
  select
    t.id,t.number,t.origin,t.legacy_source,t.legacy_sn,t.title,t.subject,t.attachment_url,
    t.priority,t.status,t.responsible_unit_id,t.responsible_login_name,t.responsible_name,
    t.current_level,t.close_level,t.ceo_attention,t.due_at,t.created_by_name,t.created_at,
    t.closed_at,t.cancelled_at,t.last_activity_at,t.updated_at,t.legacy_department_name,
    t.workflow_started,t.closed_reason,t.cancelled_reason,t.migration_status,t.activity_revision,
    coalesce(ou.name,t.legacy_department_name) responsible_unit_name,
    coalesce(ai.supporting_count,0) supporting_count,
    array(select jsonb_array_elements_text(cf.data->'current_assignees')) current_assignees,
    (cf.data->>'scope')::boolean scope_hit,
    coalesce(ai.employee_target_hit,false) employee_target_hit,
    cf.data feedback_flags,
    case when rs.user_id is null then 'unread'
      when rs.seen_revision<t.activity_revision then 'updated' else 'read' end::text read_state,
    (rs.user_id is null or rs.seen_revision<t.activity_revision) has_unread_updates,
    ri.pending_transfer,
    coalesce(qi.pending_requests_count,0) pending_requests_count,
    case
      when lp.transaction_id is not null and lp.ended_at is not null then coalesce(lp.duration_days,0)
      when lp.transaction_id is not null then greatest(1,(current_date-lp.started_at::date)+1)
      else greatest(1,((case when t.status='closed' and t.closed_at is not null then t.closed_at::date else current_date end)-t.created_at::date)+1)
    end::int days
  from public.transactions t
  join feedback cf on cf.id=t.id
  left join app_private.transaction_read_state rs on rs.transaction_id=t.id and rs.user_id=(select id from actor)
  left join public.organizational_units ou on ou.id=t.responsible_unit_id
  left join latest_period lp on lp.transaction_id=t.id
  left join assign_info ai on ai.transaction_id=t.id
  left join route_info ri on ri.transaction_id=t.id
  left join request_info qi on qi.transaction_id=t.id
),
flagged as (
  select b.*,
    (b.feedback_flags->>'visible')::boolean visible,
    (b.feedback_flags->>'incoming')::boolean incoming,
    (b.feedback_flags->>'shared')::boolean shared,
    (b.feedback_flags->>'secretary_queue')::boolean secretary_queue,
    (
      b.status='open'
      and b.current_level<>'ceo'
      and (
        (b.due_at is not null and b.due_at<now())
        or (b.due_at is null and b.days>=6)
      )
    ) late
  from base b
),
authorized as (
  select f.*,
    case
      when f.status<>'open' then false
      when f.pending_transfer is not null then false
      when f.migration_status='needs_review' then
        ((select act_all from params)
          or ((select role from params)='assistant' and f.scope_hit))
      when (select act_all from params) then true
      when f.incoming then true
      when (select role from params)='manager' and f.scope_hit and f.current_level in ('employee','manager') then true
      when (select role from params)='assistant' and f.scope_hit and f.current_level<>'ceo' then true
      else false
    end can_act,
    coalesce(f.close_level,
      case when f.current_level='ceo' then 'ceo' when f.current_level='assistant' then 'assistant' else 'manager' end
    ) close_authority
  from flagged f
  where f.visible
),
authorized2 as (
  select a.*,
    case
      when a.status<>'open' then false
      when a.pending_transfer is not null then false
      when (select act_all from params) then true
      when a.close_authority='assistant' then (select role from params)='assistant' and a.scope_hit
      when a.close_authority='manager' then (select role from params)='manager' and a.scope_hit
      else false
    end can_close
  from authorized a
),
counters as (
  select jsonb_build_object(
    'incoming',count(*) filter(where incoming and status='open'),
    'notifications',(select count(*) from public.notifications n where n.read_at is null
      and (n.user_id=(select id from actor)
        or (n.user_id is null and n.target_login_name=(select preferred_login from actor)))),
    'late',count(*) filter(where late),
    'pending_approval',count(*) filter(where pending_requests_count>0),
    'closed_today',count(*) filter(where status='closed' and closed_at::date=current_date)
  ) data
  from authorized2
),
filtered as (
  select a.*
  from authorized2 a,params p
  where
    (case
      when coalesce(p_tab,'all')='all' then true
      when p_tab='incoming' then a.incoming
      when p_tab='shared' then a.shared
      when p_tab='secretary_queue' then a.secretary_queue
      when p_tab='scope' then a.scope_hit
      when p_tab='ceo' then a.current_level='ceo'
      when p_tab='ceo_view' then a.ceo_attention
      when p_tab='closed' then a.status='closed'
      else true end)
    and (p_tab='closed' or a.status<>'closed')
    and (coalesce(p_priority,'')='' or a.priority=p_priority)
    and (coalesce(p_status,'')='' or a.status=p_status)
    and (coalesce(p_department,'')='' or a.responsible_unit_name=p_department)
    and (coalesce(p_employee,'')='' or a.responsible_login_name=p_employee or a.employee_target_hit)
    and (coalesce(p_origin,'')='' or a.origin=p_origin)
    and (not coalesce(p_late_only,false) or a.late)
    and (p_date_from is null or a.created_at::date>=p_date_from)
    and (p_date_to is null or a.created_at::date<=p_date_to)
    and (
      p.search_q=''
      or lower(coalesce(a.number,'')) like '%'||p.search_q||'%'
      or lower(coalesce(a.title,'')) like '%'||p.search_q||'%'
      or lower(coalesce(a.responsible_name,'')) like '%'||p.search_q||'%'
      or lower(coalesce(a.responsible_unit_name,'')) like '%'||p.search_q||'%'
      or exists(select 1 from unnest(a.current_assignees) x where lower(x) like '%'||p.search_q||'%')
    )
),
tot as (select count(*)::int total from filtered),
paged as (
  select *
  from filtered,params p
  order by
    case when p_tab='scope' then created_at end asc nulls last,
    case when p_tab='closed' then closed_at end desc nulls last,
    case when p_tab not in ('scope','closed') then created_at end desc nulls last,
    id desc
  limit (select page_size from params)
  offset ((select page_no-1 from params)*(select page_size from params))
)
select jsonb_build_object(
  'ok',true,
  'total',(select total from tot),
  'page',(select page_no from params),
  'page_size',(select page_size from params),
  'counters',(select data from counters),
  'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)
);
$function$
