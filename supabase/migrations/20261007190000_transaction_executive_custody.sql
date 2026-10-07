-- Forward-only custody correction; no business/account/permission backfill.
-- CREATE OR REPLACE retains the existing signature, owner and EXECUTE ACL.
-- Monitoring, visibility, readiness, scope and delegated authority are unchanged.
begin;
create or replace function app_private.transaction_feedback_flags(p_user uuid,p_tx uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 t public.transactions%rowtype; c jsonb; r public.transaction_routes%rowtype;
 v_login text; v_name text; v_role text; v_all boolean; v_creator boolean; v_responsible boolean;
 v_scope boolean:=false; v_scope_visible boolean:=false; v_ever boolean:=false;
 v_history boolean:=false; v_current boolean:=false; v_has_assignment boolean:=false;
 v_visible boolean:=false; v_incoming boolean:=false; v_shared boolean:=false;
 v_names text[]:='{}'; v_custodians uuid[]:='{}'; v_secretary boolean:=false;
begin
 c:=public.user_context_internal(p_user);
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
 v_all:=app_private.account_permission_effective(p_user,'transactions.view_all');
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
end $$;
commit;
