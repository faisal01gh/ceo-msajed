CREATE OR REPLACE FUNCTION public.list_transactions_internal(p_login text, p_name text, p_role text, p_org text, p_depts text[], p_tab text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_priority text DEFAULT ''::text, p_status text DEFAULT ''::text, p_department text DEFAULT ''::text, p_employee text DEFAULT ''::text, p_origin text DEFAULT ''::text, p_late_only boolean DEFAULT false, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN (
with
actor as materialized (
 select p.id,c.data,a.preferred_login from public.profiles p
 join public.account_migration_users a on a.migrated_user_id=p.id and a.eligible
 cross join lateral (select public.user_context_internal(p.id) data) c
 where p.login_name=p_login or a.preferred_login=p_login
 order by (p.login_name=p_login) desc,p.id limit 1
),
params as materialized (
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
feedback_actor as materialized (
 select (select id from actor) uid,(select data from actor) c,
 (select data->>'login_name' from actor) login,(select data->>'full_name' from actor) name,
 (select data->>'role' from actor) role,(select view_all from params) view_all,
 not ((select data from actor) is null
 or not coalesce(((select data from actor)->>'active')::boolean,false)
 or coalesce(((select data from actor)->>'must_change_password')::boolean,true)
 or not exists(select 1 from public.account_migration_users a
 join app_private.account_credential_state s on s.user_id=a.migrated_user_id
 where a.migrated_user_id=(select id from actor) and a.eligible and not a.must_change_password)
 or exists(select 1 from app_private.account_password_operations o
 where o.target_id=(select id from actor) and o.status in ('pending','uncertain'))) ready
),
feedback_members as materialized (
 select m.* from public.user_memberships m
 join public.organizational_units u on u.id=m.unit_id and u.active
 where m.user_id=(select uid from feedback_actor) and m.active
),
feedback_assignments as materialized (
 select a.* from public.transaction_assignments a
),
feedback_assignment_scope as (
 select a.transaction_id,
 bool_or(a.assignment_type='direct') has_direct,
 bool_or(a.assignment_type='direct' and a.status='active') has_active_direct,
 bool_or(a.status='active' and
 ((f.role in ('manager','employee') and m.unit_id=a.unit_id)
 or (f.role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,a.unit_id)))) initial_hit,
 bool_or((a.status='active' or a.assignment_type='direct')
 and (a.unit_id=m.unit_id or (f.role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,a.unit_id)))
 and (a.assignment_type<>'direct' or (f.role='manager' and a.visibility_scope in ('manager','manager_assistant'))
 or (f.role='assistant' and a.visibility_scope in ('assistant','manager_assistant')))) visible_hit,
 bool_or(a.status='active'
 and (a.unit_id=m.unit_id or (f.role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,a.unit_id)))
 and (a.assignment_type<>'direct' or (f.role='manager' and a.visibility_scope in ('manager','manager_assistant'))
 or (f.role='assistant' and a.visibility_scope in ('assistant','manager_assistant')))) scope_hit
 from feedback_assignments a cross join feedback_actor f left join feedback_members m on true
 group by a.transaction_id
),
feedback_initial as (
 select t.id,coalesce(bool_or(
 (f.role in ('manager','employee') and m.unit_id=t.responsible_unit_id)
 or (f.role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,t.responsible_unit_id))),false) hit
 from public.transactions t cross join feedback_actor f left join feedback_members m on true group by t.id
),
feedback_latest_route as materialized (
 select distinct on (transaction_id) * from public.transaction_routes
 where route_type<>'ceo_view' and status in ('completed','accepted')
 order by transaction_id,created_at desc,id desc
),
feedback_ever as (
 select distinct a.transaction_id from feedback_assignments a
 join public.transaction_assignment_targets at on at.assignment_id=a.id
 cross join feedback_actor f where at.user_id=f.uid or (at.user_id is null and at.login_name=f.login)
 union
 select a.transaction_id from feedback_assignments a
 join public.transaction_assignment_users au on au.assignment_id=a.id
 cross join feedback_actor f where au.user_id=f.uid
),
feedback_history as (
 select x.transaction_id from public.transaction_routes x cross join feedback_actor f
 where x.from_user_id=f.uid or (x.from_user_id is null and x.from_login_name=f.login)
 or ((x.to_user_id=f.uid or (x.to_user_id is null and x.to_login_name=f.login)) and x.status in ('pending','completed','accepted'))
 union
 select p.transaction_id from public.transaction_participants p cross join feedback_actor f where p.user_id=f.uid and p.active
),
feedback_live_recipients as materialized (
 select a.transaction_id,coalesce(nullif(at.display_name,''),p.full_name) name,coalesce(at.user_id,p.id) uid,
 coalesce(at.user_id=f.uid or (at.user_id is null and at.login_name=f.login),false) mine
 from feedback_assignments a join public.transactions t on t.id=a.transaction_id
 left join feedback_latest_route r on r.transaction_id=t.id
 join public.transaction_assignment_targets at on at.assignment_id=a.id and at.active and at.completed_at is null
 left join public.profiles p on p.id=at.user_id or (at.user_id is null and p.login_name=at.login_name)
 cross join feedback_actor f
 where a.status='active' and a.completed_at is null
 and (t.current_level not in ('assistant','ceo') or r.id is null or a.created_at>=r.created_at)
 union all
 select a.transaction_id,p.full_name,au.user_id,au.user_id=f.uid
 from feedback_assignments a join public.transactions t on t.id=a.transaction_id
 left join feedback_latest_route r on r.transaction_id=t.id
 join public.transaction_assignment_users au on au.assignment_id=a.id and au.active and au.completed_at is null
 join public.profiles p on p.id=au.user_id cross join feedback_actor f
 where a.status='active' and a.completed_at is null
 and (t.current_level not in ('assistant','ceo') or r.id is null or a.created_at>=r.created_at)
),
feedback_live as materialized (
 select transaction_id,coalesce(bool_or(mine),false) current,
 coalesce(array_agg(distinct name order by name) filter(where name is not null),'{}') names,
 coalesce(array_agg(distinct uid) filter(where uid is not null),'{}') custodians
 from feedback_live_recipients group by transaction_id
),
feedback_route_needs as materialized (
 select r.*,t.current_level,
 coalesce(t.current_level='ceo' and r.route_type='raise' and r.to_name='الرئيس التنفيذي'
 and r.to_user_id is null and nullif(r.to_login_name,'') is null and r.to_unit_id is null,false) generic_ceo
 from feedback_latest_route r join public.transactions t on t.id=r.transaction_id
 where not exists(select 1 from feedback_live l where l.transaction_id=t.id)
),
feedback_route_candidates as materialized (
 select distinct r.transaction_id,p.id,p.full_name,r.current_level,r.generic_ceo,
 (r.to_user_id is not null or nullif(r.to_login_name,'') is not null) explicit_identity
 from feedback_route_needs r join public.profiles p on p.active and
 (r.generic_ceo or p.id=r.to_user_id
 or (r.to_user_id is null and nullif(r.to_login_name,'') is not null and p.login_name=r.to_login_name)
 or (r.to_user_id is null and nullif(r.to_login_name,'') is null and exists(
 select 1 from public.user_memberships m join public.organizational_units u on u.id=m.unit_id and u.active
 where m.user_id=p.id and m.active and m.unit_id=r.to_unit_id
 and m.membership_role=case r.current_level when 'assistant' then 'assistant' when 'manager' then 'manager' else 'member' end)))
),
feedback_context_ids as (
 select id from feedback_route_candidates
 union
 select q.uid from feedback_live_recipients q join public.transactions t on t.id=q.transaction_id
 cross join feedback_actor f where f.role='assistant_secretary' and t.status='open' and t.current_level='assistant' and q.uid is not null
 union
 select x.uid from public.transactions t cross join lateral unnest(array[t.responsible_user_id,t.created_by]) x(uid)
 cross join feedback_actor f where f.role='assistant_secretary' and t.status='open' and t.current_level='assistant'
 and not t.workflow_started and x.uid is not null
 and not exists(select 1 from feedback_live l where l.transaction_id=t.id)
 and not exists(select 1 from feedback_latest_route r where r.transaction_id=t.id)
),
feedback_recipient_contexts as materialized (
 select id,public.user_context_internal(id)->>'role' role from feedback_context_ids
),
feedback_route_custody as (
 select q.transaction_id,array_agg(distinct q.id) custodians,array_agg(distinct q.full_name order by q.full_name) names
 from feedback_route_candidates q join feedback_recipient_contexts c on c.id=q.id
 where case when q.generic_ceo then c.role='ceo' else
 c.role=q.current_level or (q.current_level='ceo' and q.explicit_identity and c.role in ('ceo','ceo_office_manager','ceo_secretary')) end
 group by q.transaction_id
),
feedback_relationships as (
 select t.*,f.uid,f.role,f.ready,f.view_all,
 coalesce(t.created_by=f.uid or (t.created_by is null and nullif(t.created_by_name,'') in(f.login,f.name)),false) creator,
 coalesce(t.responsible_user_id=f.uid or (t.responsible_user_id is null and
 (nullif(t.responsible_login_name,'')=f.login or nullif(t.responsible_name,'') in(f.login,f.name))),false) responsible,
 (i.hit or coalesce(s.initial_hit,false)) and (not coalesce(s.has_direct,false) or coalesce(s.visible_hit,false)) scope_visible,
 (i.hit or coalesce(s.initial_hit,false)) and (not coalesce(s.has_direct,false) or coalesce(s.visible_hit,false))
 and (not coalesce(s.has_active_direct,false) or coalesce(s.scope_hit,false)) scope,
 e.transaction_id is not null ever,h.transaction_id is not null history,
 l.transaction_id is not null has_assignment,l.current assignment_current,r.id route_id,
 case when l.transaction_id is not null then l.custodians when r.id is not null then coalesce(rc.custodians,'{}')
 when not t.workflow_started then array_remove(array[t.responsible_user_id,t.created_by],null) else '{}'::uuid[] end custodians,
 case when l.transaction_id is not null then l.names
 when r.id is not null then case when cardinality(coalesce(rc.names,'{}'))=0 then
 array_remove(array[coalesce(nullif(r.to_name,''),nullif(r.to_login_name,''),ru.name)],null) else rc.names end
 else array_remove(array[coalesce(nullif(t.responsible_name,''),rp.full_name,nullif(t.created_by_name,''),cp.full_name)],null) end names
 from public.transactions t cross join feedback_actor f
 join feedback_initial i on i.id=t.id left join feedback_assignment_scope s on s.transaction_id=t.id
 left join feedback_ever e on e.transaction_id=t.id left join feedback_history h on h.transaction_id=t.id
 left join feedback_live l on l.transaction_id=t.id left join feedback_latest_route r on r.transaction_id=t.id
 left join feedback_route_custody rc on rc.transaction_id=t.id
 left join public.organizational_units ru on ru.id=r.to_unit_id
 left join public.profiles rp on rp.id=t.responsible_user_id left join public.profiles cp on cp.id=t.created_by
),
feedback_custody as materialized (
 select b.*,case when has_assignment then assignment_current when route_id is not null then uid=any(custodians)
 else not workflow_started and (creator or responsible) end current from feedback_relationships b
),
feedback_secretary as (
 select distinct b.id from feedback_custody b
 join public.user_memberships office on office.user_id=b.uid and office.active and office.membership_role='office'
 join public.organizational_units root on root.id=office.unit_id and root.active and root.parent_id is null
 join public.user_memberships am on am.user_id=any(b.custodians) and am.active and am.membership_role='assistant'
 join public.organizational_units au on au.id=am.unit_id and au.active
 join public.profiles ap on ap.id=am.user_id and ap.active and not ap.must_change_password
 join feedback_recipient_contexts c on c.id=am.user_id and c.role='assistant'
 where b.role='assistant_secretary' and b.status='open' and b.current_level='assistant'
 and app_private.unit_in_scope(root.id,am.unit_id)
),
feedback_visibility as (
 select b.*,s.id is not null secretary,
 case when b.status='cancelled' then b.view_all or b.creator else
 s.id is not null or b.view_all or b.creator or b.responsible or b.ever or b.history or b.scope_visible or b.current end visible
 from feedback_custody b left join feedback_secretary s on s.id=b.id
),
feedback_incoming as (
 select b.*,visible and status='open' and current incoming from feedback_visibility b
),
feedback as materialized (
 select id,case when not ready then jsonb_build_object('visible',false,'incoming',false,'shared',false,'scope',false,
 'ceo',false,'closed',false,'current_assignees','[]'::jsonb,'secretary_queue',false)
 else jsonb_build_object('visible',visible,'incoming',incoming,
 'shared',visible and status='open' and not incoming and (creator or responsible or ever or history),
 'scope',scope,'ceo',coalesce(current_level='ceo',false),'closed',status='closed',
 'current_assignees',to_jsonb(names),'secretary_queue',secretary) end data from feedback_incoming
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
));
END;
$function$;
