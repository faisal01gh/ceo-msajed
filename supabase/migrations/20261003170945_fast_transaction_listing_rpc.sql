CREATE OR REPLACE FUNCTION public.list_transactions_internal(p_login text, p_name text, p_role text, p_org text, p_depts text[], p_tab text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_priority text DEFAULT ''::text, p_status text DEFAULT ''::text, p_department text DEFAULT ''::text, p_employee text DEFAULT ''::text, p_origin text DEFAULT ''::text, p_late_only boolean DEFAULT false, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with recursive
params as (
  select
    coalesce(p_login,'') login,
    coalesce(p_name,'') name,
    coalesce(p_role,'') role,
    coalesce(p_org,'') org,
    coalesce(p_depts,'{}'::text[]) depts,
    greatest(1,coalesce(p_page,1)) page_no,
    least(100,greatest(10,coalesce(p_page_size,50))) page_size,
    lower(trim(coalesce(p_search,''))) search_q
),
org_root as (
  select ou.id
  from public.organizational_units ou,params p
  where p.role='assistant' and ou.parent_id is null and ou.name=p.org and ou.active
),
scope_tree as (
  select id from org_root
  union all
  select ou.id
  from public.organizational_units ou
  join scope_tree st on ou.parent_id=st.id
  where ou.active
),
scope_units as (
  select ou.id,ou.name
  from public.organizational_units ou,params p
  where ou.active and (
    p.role in ('ceo','ceo_office_manager','ceo_secretary')
    or (p.role='assistant' and ou.id in (select id from scope_tree))
    or (p.role in ('manager','employee') and ou.name=any(p.depts))
  )
),
latest_period as (
  select distinct on (tp.transaction_id)
    tp.transaction_id,tp.cycle_no,tp.started_at,tp.ended_at,tp.duration_days
  from public.transaction_periods tp
  order by tp.transaction_id,tp.cycle_no desc
),
assign_info as (
  select
    a.transaction_id,
    count(*) filter(where a.assignment_type='supporting' and a.status='active')::int supporting_count,
    coalesce(
      array_agg(distinct at.display_name) filter(where a.status='active' and at.active and at.display_name is not null),
      '{}'::text[]
    ) current_assignees,
    bool_or(at.login_name=(select login from params) or at.display_name=(select name from params)) as ever_target,
    bool_or(a.status='active' and at.active and (at.login_name=(select login from params) or at.display_name=(select name from params))) as current_target,
    bool_or(
      a.unit_id in (select id from scope_units)
      and (
        a.assignment_type<>'direct'
        or (select role from params) in ('ceo','ceo_office_manager','ceo_secretary')
        or ((select role from params)='manager' and a.visibility_scope in ('manager','manager_assistant'))
        or ((select role from params)='assistant' and a.visibility_scope in ('assistant','manager_assistant'))
      )
    ) as assignment_scope_hit,
    bool_or(at.login_name=coalesce(nullif(p_employee,''),'__none__')) as employee_target_hit
  from public.transaction_assignments a
  left join public.transaction_assignment_targets at on at.assignment_id=a.id
  cross join params
  group by a.transaction_id
),
route_info as (
  select
    r.transaction_id,
    bool_or(r.to_login_name=(select login from params) and r.status in ('pending','completed','accepted')) as route_to,
    bool_or(r.from_login_name=(select login from params)) as route_from,
    (
      select to_jsonb(x)
      from public.transaction_routes x
      where x.transaction_id=r.transaction_id
        and x.route_type='assistant_transfer'
        and x.to_login_name=(select login from params)
        and x.status='pending'
      order by x.created_at desc
      limit 1
    ) as pending_transfer
  from public.transaction_routes r
  group by r.transaction_id
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
    t.workflow_started,t.closed_reason,t.cancelled_reason,t.migration_status,
    coalesce(ou.name,t.legacy_department_name) responsible_unit_name,
    coalesce(ai.supporting_count,0) supporting_count,
    coalesce(ai.current_assignees,'{}'::text[]) current_assignees,
    coalesce(ai.ever_target,false) ever_target,
    coalesce(ai.current_target,false) current_target,
    coalesce(ai.assignment_scope_hit,false)
      or (t.origin='legacy' and t.legacy_department_name in (select name from scope_units)) scope_hit,
    coalesce(ai.employee_target_hit,false) employee_target_hit,
    coalesce(ri.route_to,false) route_to,
    coalesce(ri.route_from,false) route_from,
    ri.pending_transfer,
    coalesce(qi.pending_requests_count,0) pending_requests_count,
    case
      when lp.transaction_id is not null and lp.ended_at is not null then coalesce(lp.duration_days,0)
      when lp.transaction_id is not null then greatest(1,(current_date-lp.started_at::date)+1)
      else greatest(1,((case when t.status='closed' and t.closed_at is not null then t.closed_at::date else current_date end)-t.created_at::date)+1)
    end::int days
  from public.transactions t
  left join public.organizational_units ou on ou.id=t.responsible_unit_id
  left join latest_period lp on lp.transaction_id=t.id
  left join assign_info ai on ai.transaction_id=t.id
  left join route_info ri on ri.transaction_id=t.id
  left join request_info qi on qi.transaction_id=t.id
),
flagged as (
  select b.*,
    (
      (select role from params) in ('ceo','ceo_office_manager','ceo_secretary')
      or b.created_by_name in ((select name from params),(select login from params))
      or b.responsible_login_name=(select login from params)
      or b.responsible_name=(select name from params)
      or b.ever_target or b.route_to or b.route_from or b.scope_hit
    )
    and (
      b.status<>'cancelled'
      or (select role from params) in ('ceo','ceo_office_manager','ceo_secretary')
      or b.created_by_name in ((select name from params),(select login from params))
    ) visible,
    (
      b.status='open'
      and (b.current_target or b.route_to or b.responsible_login_name=(select login from params) or b.responsible_name=(select name from params))
    ) incoming,
    (
      b.status='open'
      and not (b.current_target or b.route_to or b.responsible_login_name=(select login from params) or b.responsible_name=(select name from params))
      and (b.ever_target or b.route_from or (b.created_by_name in ((select name from params),(select login from params)) and b.workflow_started))
    ) shared,
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
      when f.pending_transfer is not null then false
      when f.migration_status='needs_review' then
        ((select role from params) in ('ceo','ceo_office_manager','ceo_secretary')
          or ((select role from params)='assistant' and f.scope_hit))
      when (select role from params) in ('ceo','ceo_office_manager','ceo_secretary') then true
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
      when a.pending_transfer is not null then false
      when (select role from params) in ('ceo','ceo_office_manager','ceo_secretary') then true
      when a.close_authority='assistant' then (select role from params)='assistant' and a.scope_hit
      when a.close_authority='manager' then (select role from params)='manager' and a.scope_hit
      else false
    end can_close
  from authorized a
),
counters as (
  select jsonb_build_object(
    'incoming',count(*) filter(where incoming and status='open'),
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
    case when p_tab not in ('scope','closed') then created_at end desc nulls last
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

revoke all on function public.list_transactions_internal(
  text,text,text,text,text[],text,text,text,text,text,text,text,boolean,date,date,integer,integer
) from public,anon,authenticated;
grant execute on function public.list_transactions_internal(
  text,text,text,text,text[],text,text,text,text,text,text,text,boolean,date,date,integer,integer
) to service_role;
