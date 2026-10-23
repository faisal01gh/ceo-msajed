CREATE OR REPLACE FUNCTION app_private.transaction_feedback_flags_with_context(p_user uuid, p_tx uuid, p_context jsonb, p_view_all boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.transactions%rowtype; c jsonb; r public.transaction_routes%rowtype;
 v_login text; v_name text; v_role text; v_all boolean; v_creator boolean; v_responsible boolean;
 v_scope boolean:=false; v_scope_visible boolean:=false; v_ever boolean:=false;
 v_history boolean:=false; v_current boolean:=false; v_has_assignment boolean:=false;
 v_visible boolean:=false; v_incoming boolean:=false; v_shared boolean:=false;
 v_names text[]:='{}'; v_custodians uuid[]:='{}'; v_secretary boolean:=false;
begin
 c:=p_context;
 if c is null or not coalesce((c->>'active')::boolean,false)
   or coalesce((c->>'must_change_password')::boolean,true)
   or not exists(select 1 from public.account_migration_users a
     join app_private.account_credential_state s on s.user_id=a.migrated_user_id
     where a.migrated_user_id=p_user and a.eligible and not a.must_change_password)
   or exists(select 1 from app_private.account_password_operations o
     where o.target_id=p_user and o.status in ('pending','uncertain')) then
  return jsonb_build_object('visible',false,'incoming',false,'shared',false,'scope',false,
   'ceo',false,'closed',false,'current_assignees','[]'::jsonb,'secretary_queue',false);
 end if;
 select * into t from public.transactions where id=p_tx;
 if not found then return jsonb_build_object('visible',false,'incoming',false,'shared',false,'scope',false,
   'ceo',false,'closed',false,'current_assignees','[]'::jsonb,'secretary_queue',false); end if;
 v_login:=c->>'login_name'; v_name:=c->>'full_name'; v_role:=c->>'role';
 v_all:=p_view_all;
 v_creator:=coalesce(t.created_by=p_user or (t.created_by is null
   and nullif(t.created_by_name,'') in (v_login,v_name)),false);
 v_responsible:=coalesce(t.responsible_user_id=p_user or (t.responsible_user_id is null
   and (nullif(t.responsible_login_name,'')=v_login or nullif(t.responsible_name,'') in(v_login,v_name))),false);
 -- Membership UUIDs, not organizational display names, are authoritative.
 select exists(select 1 from public.user_memberships m join public.organizational_units u on u.id=m.unit_id and u.active
  where m.user_id=p_user and m.active and (
   (v_role in ('manager','employee') and (m.unit_id=t.responsible_unit_id or exists(
    select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.status='active' and a.unit_id=m.unit_id)))
   or (v_role='assistant' and m.membership_role='assistant' and (
    app_private.unit_in_scope(m.unit_id,t.responsible_unit_id) or exists(
     select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.status='active' and app_private.unit_in_scope(m.unit_id,a.unit_id)))))) into v_scope;
 -- A hidden direct assignment must not leak through its responsible unit.
 select v_scope and (not exists(select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.assignment_type='direct')
  or exists(select 1 from public.transaction_assignments a
    join public.user_memberships m on m.user_id=p_user and m.active
    join public.organizational_units u on u.id=m.unit_id and u.active
    where a.transaction_id=p_tx and (a.status='active' or a.assignment_type='direct') and (a.unit_id=m.unit_id or (v_role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,a.unit_id)))
    and (a.assignment_type<>'direct' or (v_role='manager' and a.visibility_scope in ('manager','manager_assistant'))
      or (v_role='assistant' and a.visibility_scope in ('assistant','manager_assistant'))))) into v_scope_visible;
 -- Historical explicitly permitted direct viewing remains a read relationship,
 -- but only current assignment visibility may widen operational scope.
 select v_scope_visible and (
  not exists(select 1 from public.transaction_assignments a where a.transaction_id=p_tx and a.assignment_type='direct' and a.status='active')
  or exists(select 1 from public.transaction_assignments a
   join public.user_memberships m on m.user_id=p_user and m.active
   join public.organizational_units u on u.id=m.unit_id and u.active
   where a.transaction_id=p_tx and a.status='active'
    and (a.unit_id=m.unit_id or (v_role='assistant' and m.membership_role='assistant' and app_private.unit_in_scope(m.unit_id,a.unit_id)))
    and (a.assignment_type<>'direct' or (v_role='manager' and a.visibility_scope in ('manager','manager_assistant'))
     or (v_role='assistant' and a.visibility_scope in ('assistant','manager_assistant'))))) into v_scope;
 select * into r from public.transaction_routes where transaction_id=p_tx
  and route_type<>'ceo_view' and status in ('completed','accepted')
  order by created_at desc,id desc limit 1;
 select exists(select 1 from public.transaction_assignments a where a.transaction_id=p_tx and (
  exists(select 1 from public.transaction_assignment_targets at where at.assignment_id=a.id
   and (at.user_id=p_user or (at.user_id is null and at.login_name=v_login)))
  or exists(select 1 from public.transaction_assignment_users au where au.assignment_id=a.id and au.user_id=p_user))) into v_ever;
 select exists(select 1 from public.transaction_routes x where x.transaction_id=p_tx and (
  x.from_user_id=p_user or (x.from_user_id is null and x.from_login_name=v_login)
  or ((x.to_user_id=p_user or (x.to_user_id is null and x.to_login_name=v_login))
    and x.status in ('pending','completed','accepted'))))
  or exists(select 1 from public.transaction_participants p where p.transaction_id=p_tx and p.user_id=p_user and p.active) into v_history;
 -- Only live assignments with live recipients form custody. Completed/cancelled
 -- targets remain participants, never current recipients.
 select coalesce(bool_or(true),false),coalesce(bool_or(q.mine),false),coalesce(array_agg(distinct q.name order by q.name) filter(where q.name is not null),'{}'),coalesce(array_agg(distinct q.uid) filter(where q.uid is not null),'{}')
 into v_has_assignment,v_current,v_names,v_custodians from (
  select coalesce(nullif(at.display_name,''),p.full_name) name,coalesce(at.user_id,p.id) uid,
   coalesce(at.user_id=p_user or (at.user_id is null and at.login_name=v_login),false) mine
  from public.transaction_assignments a join public.transaction_assignment_targets at on at.assignment_id=a.id and at.active and at.completed_at is null
   left join public.profiles p on p.id=at.user_id or (at.user_id is null and p.login_name=at.login_name)
  where a.transaction_id=p_tx and a.status='active' and a.completed_at is null
   and (t.current_level not in ('assistant','ceo') or r.id is null or a.created_at>=r.created_at)
  union all
  select p.full_name,au.user_id,au.user_id=p_user from public.transaction_assignments a
   join public.transaction_assignment_users au on au.assignment_id=a.id and au.active and au.completed_at is null
   join public.profiles p on p.id=au.user_id where a.transaction_id=p_tx and a.status='active' and a.completed_at is null
   and (t.current_level not in ('assistant','ceo') or r.id is null or a.created_at>=r.created_at)
 ) q;
 if not v_has_assignment then
  if r.id is not null then
   select coalesce(array_agg(distinct p.id),'{}'),coalesce(array_agg(distinct p.full_name order by p.full_name),'{}')
   into v_custodians,v_names from public.profiles p
   -- Explicit executive recipients share the workflow level, not custody.
   -- UUID wins over stale login/display text; login is legacy fallback only.
   where p.active and ((public.user_context_internal(p.id)->>'role')=t.current_level
     or (t.current_level='ceo' and (r.to_user_id is not null or nullif(r.to_login_name,'') is not null)
       and (public.user_context_internal(p.id)->>'role') in ('ceo','ceo_office_manager','ceo_secretary')))
    and (p.id=r.to_user_id or (r.to_user_id is null and nullif(r.to_login_name,'') is not null and p.login_name=r.to_login_name)
     or (r.to_user_id is null and nullif(r.to_login_name,'') is null and exists(
      select 1 from public.user_memberships m join public.organizational_units u on u.id=m.unit_id and u.active
      where m.user_id=p.id and m.active and m.unit_id=r.to_unit_id
       and m.membership_role=case t.current_level when 'assistant' then 'assistant' when 'manager' then 'manager' else 'member' end)));
   -- The existing Edge raise producer emits this exact unaddressed CEO
   -- target. Do not reinterpret an explicit identity/unit or another label.
   if t.current_level='ceo' and r.route_type='raise' and r.to_name='الرئيس التنفيذي'
     and r.to_user_id is null and nullif(r.to_login_name,'') is null and r.to_unit_id is null then
    select coalesce(array_agg(distinct p.id),'{}'),coalesce(array_agg(distinct p.full_name order by p.full_name),'{}')
    into v_custodians,v_names from public.profiles p
    where p.active and (public.user_context_internal(p.id)->>'role')='ceo';
   end if;
   v_current:=p_user=any(v_custodians);
   if cardinality(v_names)=0 then
    v_names:=array_remove(array[coalesce(nullif(r.to_name,''),nullif(r.to_login_name,''),
     (select name from public.organizational_units where id=r.to_unit_id))],null);
   end if;
  else
   v_current:=not t.workflow_started and (v_creator or v_responsible);
   if not t.workflow_started then v_custodians:=array_remove(array[t.responsible_user_id,t.created_by],null); end if;
   v_names:=array_remove(array[coalesce(nullif(t.responsible_name,''),(select full_name from public.profiles where id=t.responsible_user_id),nullif(t.created_by_name,''),(select full_name from public.profiles where id=t.created_by))],null);
  end if;
 end if;
 -- Queue is a read-only relationship, never an assistant permission/scope grant.
 if v_role='assistant_secretary' and t.status='open' and t.current_level='assistant' then
  select exists(
   select 1 from public.user_memberships office
   join public.organizational_units root on root.id=office.unit_id and root.active and root.parent_id is null
   join public.user_memberships am on am.user_id=any(v_custodians) and am.active and am.membership_role='assistant'
   join public.organizational_units au on au.id=am.unit_id and au.active
   join public.profiles ap on ap.id=am.user_id and ap.active and not ap.must_change_password
   where office.user_id=p_user and office.active and office.membership_role='office'
   and app_private.unit_in_scope(root.id,am.unit_id)
   and (public.user_context_internal(am.user_id)->>'role')='assistant'
  ) into v_secretary;
 end if;
 v_visible:=v_secretary or v_all or v_creator or v_responsible or v_ever or v_history or v_scope_visible or v_current;
 if t.status='cancelled' then v_visible:=v_all or v_creator; end if;
 v_incoming:=v_visible and t.status='open' and v_current;
 v_shared:=v_visible and t.status='open' and not v_incoming and (v_creator or v_responsible or v_ever or v_history);
 return jsonb_build_object('visible',v_visible,'incoming',v_incoming,'shared',v_shared,'scope',v_scope,
  'ceo',coalesce(t.current_level='ceo',false),'closed',t.status='closed','current_assignees',to_jsonb(v_names),'secretary_queue',v_secretary);
end $function$;
REVOKE EXECUTE ON FUNCTION app_private.transaction_feedback_flags_with_context(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

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
feedback as materialized (
 -- One evaluation per physical row, shared by filtering, counters and pagination.
 select t.id,app_private.transaction_feedback_flags_with_context((select id from actor),t.id,(select data from actor),(select view_all from params)) data
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
$function$;
