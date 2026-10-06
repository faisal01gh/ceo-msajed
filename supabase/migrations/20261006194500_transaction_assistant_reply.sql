-- Reply-and-return is one atomic operation, displayed as a reply, never a referral.
-- Does not modify employee records, passwords, organizational structure or prior history.
begin;
insert into public.permissions(code,name_ar) values('transactions.reply_raise','رد المساعد على الطلب')
on conflict(code) do update set name_ar=excluded.name_ar;
insert into public.role_permissions(role_code,permission_code)
values('assistant','transactions.reply_raise') on conflict do nothing;
alter table public.transaction_routes drop constraint transaction_routes_route_type_check;
alter table public.transaction_routes add constraint transaction_routes_route_type_check
check(route_type in ('directive','raise','assistant_transfer','direct_assign','ceo_view','reply'));
create unique index transaction_reply_operation_unique on public.transaction_routes((meta->>'reply_operation_id'))
where route_type='reply' and meta->>'reply_operation_id' is not null;
create unique index transaction_reply_source_unique on public.transaction_routes(transaction_id,(meta->>'reply_to_route_id'))
where route_type='reply' and meta->>'reply_to_route_id' is not null;

create function public.transaction_reply_raise_internal(
 p_actor uuid,p_session uuid,p_tx uuid,p_route uuid,p_response text,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor jsonb; flags jsonb; source public.transaction_routes%rowtype;
 latest public.transaction_routes%rowtype; previous public.transaction_routes%rowtype;
 t public.transactions%rowtype; sender public.account_migration_users%rowtype;
 reply_id uuid; response text:=btrim(coalesce(p_response,'')); now_at timestamptz;
 target_role text; target_level text; result jsonb;
begin
 if p_actor is null or p_session is null or p_tx is null or p_route is null or p_operation_id is null
  or response='' or char_length(response)>10000 then raise exception 'invalid reply input' using errcode='22023'; end if;
 if not app_private.account_session_valid(p_actor,p_session,false)
  or not app_private.account_permission_effective(p_actor,'transactions.reply_raise') then
  raise exception 'forbidden' using errcode='42501'; end if;
 actor:=public.user_context_internal(p_actor);
 if actor is null or actor->>'role'<>'assistant' or not coalesce((actor->>'active')::boolean,false)
  or coalesce((actor->>'must_change_password')::boolean,true) then raise exception 'forbidden' using errcode='42501'; end if;
 -- Serializes the operation nonce across different transactions too. The nonce is
 -- identity-bound below; observing somebody else's nonce cannot recover its receipt.
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 select * into previous from public.transaction_routes
 where route_type='reply' and meta->>'reply_operation_id'=p_operation_id::text;
 if found then
  if previous.from_user_id is distinct from p_actor then raise exception 'forbidden' using errcode='42501'; end if;
  if previous.transaction_id is distinct from p_tx or previous.meta->>'reply_to_route_id' is distinct from p_route::text
   or previous.meta->>'response' is distinct from response then
   raise exception 'reply candidate mismatch' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'replayed',true,'reply_route_id',previous.id,
   'transaction_id',previous.transaction_id,'source_route_id',(previous.meta->>'reply_to_route_id')::uuid,
   'operation_id',(previous.meta->>'reply_operation_id')::uuid,'actor_user_id',previous.from_user_id,
   'target_user_id',previous.to_user_id,'target_login_name',previous.to_login_name,'target_name',previous.to_name);
 end if;
 select * into t from public.transactions where id=p_tx for update;
 if not found or t.status<>'open' or t.current_level<>'assistant' then
  raise exception 'stale reply custody' using errcode='42501'; end if;
 select * into source from public.transaction_routes where id=p_route and transaction_id=p_tx for update;
 if not found or source.route_type<>'raise' or source.status not in ('completed','accepted')
  or (source.to_user_id=p_actor or (source.to_user_id is null and source.to_login_name=actor->>'login_name')) is not true then
  raise exception 'forbidden reply source' using errcode='42501'; end if;
 select * into latest from public.transaction_routes where transaction_id=p_tx
  and route_type<>'ceo_view' and status in ('completed','accepted') order by created_at desc,id desc limit 1;
 if latest.id is distinct from source.id then raise exception 'stale reply custody' using errcode='42501'; end if;
 flags:=app_private.transaction_feedback_flags(p_actor,p_tx);
 if not coalesce((flags->>'incoming')::boolean,false) then raise exception 'forbidden reply custody' using errcode='42501'; end if;
 if exists(select 1 from public.transaction_routes where transaction_id=p_tx and route_type='assistant_transfer' and status='pending') then
  raise exception 'stale reply custody' using errcode='42501'; end if;
 -- Resolve the exact original sender, not an arbitrary manager in the department.
 select a.* into sender from public.account_migration_users a join public.profiles p on p.id=a.migrated_user_id and p.active
 where a.eligible and ((source.from_user_id is not null and a.migrated_user_id=source.from_user_id)
  or (source.from_user_id is null and a.preferred_login=source.from_login_name));
 if not found or sender.migrated_user_id is null or sender.migrated_user_id=p_actor then
  raise exception 'reply sender unavailable' using errcode='42501'; end if;
 -- An active assistant membership in the sender's sector is mandatory. General
 -- view_all/act_all and historical participation are not custody authorization.
 if not exists(select 1 from public.user_memberships am
  join public.organizational_units root on root.id=am.unit_id and root.active
  join public.user_memberships sm on sm.user_id=sender.migrated_user_id and sm.active
  join public.organizational_units child on child.id=sm.unit_id and child.active
  where am.user_id=p_actor and am.active and am.membership_role='assistant'
   and app_private.unit_in_scope(root.id,child.id)) then
  raise exception 'forbidden reply sector' using errcode='42501'; end if;
 if exists(select 1 from public.transaction_routes where transaction_id=p_tx and route_type='reply'
  and meta->>'reply_to_route_id'=p_route::text) then raise exception 'reply already answered' using errcode='22023'; end if;
 target_role:=public.user_context_internal(sender.migrated_user_id)->>'role';
 target_level:=case when target_role in ('ceo','ceo_office_manager','ceo_secretary') then 'ceo'
  when target_role in ('employee','manager','assistant') then target_role else null end;
 if target_level is null then raise exception 'reply sender role unavailable' using errcode='42501'; end if;
 now_at:=clock_timestamp();
 -- Keep overall responsibility and the highest closing authority unchanged.
 update public.transaction_assignment_targets at set active=false,completed_at=now_at
 from public.transaction_assignments a where a.id=at.assignment_id and a.transaction_id=p_tx and a.status='active' and at.active;
 update public.transaction_assignment_users au set active=false,completed_at=now_at
 from public.transaction_assignments a where a.id=au.assignment_id and a.transaction_id=p_tx and a.status='active' and au.active;
 update public.transaction_assignments set status='completed',completed_at=now_at where transaction_id=p_tx and status='active';
 insert into public.transaction_routes(transaction_id,route_type,from_user_id,from_role,from_login_name,from_name,
  to_user_id,to_login_name,to_name,directive,status,created_at,meta)
 values(p_tx,'reply',p_actor,'assistant',actor->>'login_name',actor->>'full_name',sender.migrated_user_id,
  sender.preferred_login,sender.display_name,response,'completed',now_at,
  jsonb_build_object('reply_to_route_id',p_route,'reply_operation_id',p_operation_id,'response',response)) returning id into reply_id;
 update public.transactions set current_level=target_level,workflow_started=true,updated_at=now_at where id=p_tx;
 insert into public.transaction_history(transaction_id,event_type,actor_id,actor_name,detail,meta)
 values(p_tx,'assistant_reply',p_actor,actor->>'full_name',response,
  jsonb_build_object('reply_route_id',reply_id,'reply_to_route_id',p_route,'to_user_id',sender.migrated_user_id,'to',sender.display_name));
 insert into public.audit_log(actor_id,event_type,entity_type,entity_id,detail,meta)
 values(p_actor,'assistant_reply','transaction',p_tx,'رد المساعد وإعادة المعاملة إلى صاحب الطلب',
  jsonb_build_object('reply_route_id',reply_id,'source_route_id',p_route,'to_user_id',sender.migrated_user_id));
 insert into public.notifications(user_id,target_login_name,target_name,transaction_id,event_type,title,body)
 values(sender.migrated_user_id,sender.preferred_login,sender.display_name,p_tx,'assistant_reply','رد المساعد على: '||t.title,response);
 result:=jsonb_build_object('ok',true,'replayed',false,'reply_route_id',reply_id,
  'transaction_id',p_tx,'source_route_id',p_route,'operation_id',p_operation_id,'actor_user_id',p_actor,
  'target_user_id',sender.migrated_user_id,'target_login_name',sender.preferred_login,'target_name',sender.display_name);
 return result;
end $$;
revoke all on function public.transaction_reply_raise_internal(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.transaction_reply_raise_internal(uuid,uuid,uuid,uuid,text,uuid) to service_role;
commit;
