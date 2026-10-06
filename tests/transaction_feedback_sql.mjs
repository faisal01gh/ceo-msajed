// Network-free PostgreSQL (PGlite) integration fixture, not a cloud/full-chain replay proof.
// Run: node tests/transaction_feedback_sql.mjs [path-to-pglite-module] [--baseline]
import assert from 'node:assert/strict';
import {createTransactionFeedbackFixture,DEFAULT_PGLITE_MODULE} from './transaction_feedback_sql_fixture.mjs';
const modulePath=process.argv.slice(2).find(x=>!x.startsWith('--'))||DEFAULT_PGLITE_MODULE;
const {db,scalar,id,actors,unit,tx,claims,preserved,defaults,preserveSql}=await createTransactionFeedbackFixture({modulePath,applyFoundation:!process.argv.includes('--baseline')});
let passed=0;
async function test(name,fn){await fn();console.log(`PASS ${++passed} ${name}`);}
try{
 await test('employee can create by default without changing identity state',async()=>{
  assert.equal(await scalar("select app_private.has_permission($1,'transactions.create')",[actors.employee]),true,'employee create default absent');
  assert.deepEqual(await scalar(preserveSql),preserved);
  assert.equal(preserved.auth.length,65);assert.equal(preserved.profiles.length,65);
  const expected=defaults.filter(x=>!(x.role_code==='manager'&&x.permission_code==='transactions.ceo_view'));
  if(!expected.some(x=>x.role_code==='employee'&&x.permission_code==='transactions.create')) expected.push({role_code:'employee',permission_code:'transactions.create'});
  const sort=rows=>rows.map(x=>`${x.role_code}:${x.permission_code}`).sort();
  assert.deepEqual(sort((await db.query('select role_code,permission_code from public.role_permissions')).rows),sort(expected));
 });
 await test('manager CEO-view is not a role default and explicit overrides win',async()=>{
  await claims(actors.manager);
  assert.equal(await scalar("select app_private.has_permission($1,'transactions.ceo_view')",[actors.manager]),false,'manager CEO-view default retained');
  await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'transactions.ceo_view','allow'),($2,'transactions.create','deny')",[actors.manager,actors.employee]);
  assert.equal(await scalar("select app_private.has_permission($1,'transactions.ceo_view')",[actors.manager]),true);
  await claims(actors.employee);
  assert.equal(await scalar("select app_private.has_permission($1,'transactions.create')",[actors.employee]),false);
 });
 const list=async(user,tab='all')=>{await claims(user);await db.exec('set role authenticated');try{return await scalar('select public.list_my_transactions($1)',[tab]);}finally{await db.exec('reset role');}};
 const flags=async(user,tid=tx)=>scalar('select public.transaction_feedback_flags_internal($1,$2)',[user,tid]);
 await test('list exposes revision zero and meaningful business edits advance it monotonically',async()=>{
  const row=(await list(actors.employee)).rows.find(x=>x.id===tx);
  assert.equal(row.activity_revision,0,'activity revision is not returned by list RPC');
  await db.query('update public.transactions set title=title where id=$1',[tx]);
  assert.equal(await scalar('select activity_revision from public.transactions where id=$1',[tx]),0);
  await db.query("update public.transactions set title='changed business title',activity_revision=0 where id=$1",[tx]);
  assert.equal(await scalar('select activity_revision from public.transactions where id=$1',[tx]),1);
  await db.query("update public.transactions set subject='changed business subject',activity_revision=0 where id=$1",[tx]);
  assert.equal(await scalar('select activity_revision from public.transactions where id=$1',[tx]),2);
  await db.query('update public.transactions set updated_at=clock_timestamp(),activity_revision=0 where id=$1',[tx]);
  assert.equal(await scalar('select activity_revision from public.transactions where id=$1',[tx]),2);
 });
 await test('custody create then employee→manager→assistant is current, not historical',async()=>{
  assert.equal((await list(actors.employee,'incoming')).total,1);
  await db.query("insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_login_name,to_user_id,to_login_name,to_name) values($1,$2,'raise',$3,'employee',$4,'manager','manager display')",[id(301),tx,actors.employee,actors.manager]);
  await db.query("update public.transactions set current_level='manager',workflow_started=true where id=$1",[tx]);
  assert.equal((await list(actors.employee,'incoming')).total,0,'historical responsible user incorrectly keeps incoming custody');
  assert.equal((await list(actors.employee,'shared')).total,1);
  assert.equal((await list(actors.manager,'incoming')).total,1);
  await db.query("insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_login_name,to_user_id,to_login_name,to_name,created_at) values($1,$2,'raise',$3,'manager',$4,'assistant','assistant display',clock_timestamp()+interval '1 second')",[id(302),tx,actors.manager,actors.assistant]);
  await db.query("update public.transactions set current_level='assistant' where id=$1",[tx]);
  assert.equal((await list(actors.manager,'incoming')).total,0);
  assert.equal((await list(actors.manager,'shared')).total,1);
  assert.equal((await list(actors.assistant,'incoming')).total,1);
  const f=await flags(actors.manager);
  assert.deepEqual(Object.keys(f).sort(),['visible','incoming','shared','scope','ceo','closed','current_assignees','secretary_queue'].sort());
  assert.equal(f.shared,true);assert.equal(f.incoming,false);assert.deepEqual(f.current_assignees,['assistant display']);
  await claims(actors.assistant);await db.exec('set role authenticated');try{assert.equal(await scalar('select count(*)::int from public.transactions where id=$1',[tx]),1);}finally{await db.exec('reset role');}
 });
 await test('secretary queue reads only current assistants under an active own office root',async()=>{
  const own=await list(actors.secretary,'secretary_queue');
  assert.equal(own.total,1,'own assistant current custody is missing');
  assert.equal(own.rows[0].incoming,false);assert.equal(own.rows[0].scope_hit,false);
  assert.equal(own.rows[0].can_act,false);assert.equal(own.rows[0].can_close,false);
  assert.equal((await flags(actors.secretary)).secretary_queue,true);
  assert.equal((await list(actors.otherSecretary,'secretary_queue')).total,0);
  await db.query('update public.user_memberships set active=false where user_id=$1',[actors.secretary]);
  assert.equal((await list(actors.secretary,'secretary_queue')).total,0);
  await db.query('update public.user_memberships set active=true where user_id=$1',[actors.secretary]);
  await claims(actors.secretary);await db.exec('set role authenticated');try{assert.equal(await scalar('select count(*)::int from public.transactions where id=$1',[tx]),1);}finally{await db.exec('reset role');}
 });
 const seen=async(user,revision,tid=tx)=>{await claims(user);await db.exec('set role authenticated');try{return await scalar('select public.mark_my_transaction_seen($1,$2)',[tid,revision]);}finally{await db.exec('reset role');}};
 await test('per-user read state acknowledges the returned revision without rewriting activity',async()=>{
  const row=(await list(actors.employee)).rows.find(x=>x.id===tx);
  assert.equal(row.read_state,'unread','initial per-user unread state absent');
  assert.equal(row.has_unread_updates,true);
  const before=await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tx]);
  const history=await scalar('select count(*)::int from public.transaction_history where transaction_id=$1',[tx]);
  const ack=await seen(actors.employee,row.activity_revision);
  assert.equal(ack.seen_revision,row.activity_revision);assert.equal(ack.read_state,'read');
  assert.deepEqual(await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tx]),before);
  assert.equal(await scalar('select count(*)::int from public.transaction_history where transaction_id=$1',[tx]),history);
  assert.equal((await list(actors.employee)).rows[0].read_state,'read');
  assert.equal((await list(actors.manager)).rows[0].read_state,'unread');
  await db.query("update public.transactions set subject='later update' where id=$1",[tx]);
  const updated=(await list(actors.employee)).rows[0];
  assert.equal(updated.read_state,'updated');assert.equal(updated.has_unread_updates,true);
  const stale=await seen(actors.employee,row.activity_revision);
  assert.equal(stale.seen_revision,row.activity_revision);assert.equal(stale.read_state,'updated');
  await seen(actors.employee,updated.activity_revision);
  assert.equal((await seen(actors.employee,0)).seen_revision,updated.activity_revision);
  await assert.rejects(seen(actors.stranger,0),/forbidden/);
  await assert.rejects(seen(actors.employee,0,id(999999)),/forbidden/);
  await assert.rejects(seen(actors.employee,updated.activity_revision+1000),/invalid revision/);
  await assert.rejects(seen(actors.employee,-1),/invalid revision/);
 });
 await test('child action insert updates every viewers revision once, and no-op updates do not',async()=>{
  const start=await scalar('select activity_revision from public.transactions where id=$1',[tx]);
  await db.query("insert into public.transaction_actions(id,transaction_id,actor_id,action_text) values($1,$2,$3,'actual SQL action')",[id(401),tx,actors.employee]);
  assert.equal(await scalar('select activity_revision from public.transactions where id=$1',[tx]),start+1,'child action did not advance parent revision');
  assert.equal((await list(actors.employee)).rows[0].read_state,'updated');
  await db.query('update public.transaction_actions set action_text=action_text,updated_at=clock_timestamp() where id=$1',[id(401)]);
  assert.equal(await scalar('select activity_revision from public.transactions where id=$1',[tx]),start+1);
  await db.query("insert into public.transaction_action_versions(action_id,version_no,body) values($1,1,'version body')",[id(401)]);
  await db.query("insert into public.transaction_action_notes(action_id,transaction_id,actor_name,note) values($1,$2,'employee','note body')",[id(401),tx]);
  await db.query("insert into public.transaction_links(transaction_id,url) values($1,'https://fixture.invalid/link')",[tx]);
  await db.query("insert into public.transaction_history(transaction_id,event_type) values($1,'business_changed')",[tx]);
  await db.query("insert into public.transaction_requests(transaction_id,request_type,reason) values($1,'extension','why')",[tx]);
  assert.equal(await scalar('select activity_revision from public.transactions where id=$1',[tx]),start+6);
  await db.query('delete from public.transaction_actions where id=$1',[id(401)]);
  assert.ok(await scalar('select activity_revision from public.transactions where id=$1',[tx])>start+6);
  await db.query("insert into public.transactions(id,number,title,created_by) values($1,'FIX-DELETE','cascade',$2)",[id(299),actors.employee]);
  await db.query("insert into public.transaction_actions(transaction_id,action_text) values($1,'cascade action')",[id(299)]);
  await db.query('delete from public.transactions where id=$1',[id(299)]);
  assert.equal(await scalar('select count(*)::int from public.transaction_actions where transaction_id=$1',[id(299)]),0);
 });
 await test('CEO root custody supersedes completed assignments, then returns to current assignment',async()=>{
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,status) values($1,$2,$3,'responsible','completed')",[id(501),tx,unit.dept]);
  await db.query("insert into public.transaction_assignment_targets(assignment_id,user_id,display_name) values($1,$2,'manager display')",[id(501),actors.manager]);
  await db.query("insert into public.organizational_units(id,name,unit_type) values($1,'fixture executive office','office')",[id(105)]);
  await db.query("insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_login_name,to_unit_id,created_at) values($1,$2,'raise',$3,'assistant',$4,clock_timestamp()+interval '2 seconds')",[id(303),tx,actors.assistant,id(105)]);
  await db.query("update public.transactions set current_level='ceo',close_level='ceo' where id=$1",[tx]);
  assert.equal((await list(actors.ceo,'incoming')).total,1,'CEO root custody not recognized');
  assert.equal((await list(actors.manager,'incoming')).total,0);
  assert.equal((await list(actors.assistant,'shared')).total,1);
  assert.equal((await list(actors.secretary,'secretary_queue')).total,0);
  await db.query("insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,to_user_id,to_login_name,created_at) values($1,$2,'directive',$3,$4,'manager',clock_timestamp()+interval '3 seconds')",[id(304),tx,actors.ceo,actors.manager]);
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,created_at) values($1,$2,$3,'responsible',clock_timestamp()+interval '3 seconds')",[id(502),tx,unit.dept]);
  await db.query("insert into public.transaction_assignment_targets(id,assignment_id,user_id,display_name) values($1,$2,$3,'manager display')",[id(503),id(502),actors.manager]);
  await db.query("update public.transactions set current_level='manager' where id=$1",[tx]);
  assert.equal((await list(actors.manager,'incoming')).total,1);
  assert.equal((await list(actors.ceo,'incoming')).total,0);
  assert.equal((await list(actors.manager)).rows[0].close_authority,'ceo');
  assert.deepEqual((await flags(actors.manager)).current_assignees,['manager display']);
 });
 await test('direct authenticated listing counts UUID recipients and only NULL-UUID preferred-login legacy recipients',async()=>{
  await db.query("insert into public.notifications(id,user_id,target_login_name,event_type,title,read_at) values($1,$7,'irrelevant','fixture','uuid own',null),($2,null,'fixture_employee','fixture','legacy own',null),($3,$8,'fixture_employee','fixture','foreign uuid collision',null),($4,null,'employee','fixture','alias rejected',null),($5,null,'fixture_manager','fixture','other legacy',null),($6,$7,'fixture_employee','fixture','read own',clock_timestamp())",[id(601),id(602),id(603),id(604),id(605),id(606),actors.employee,actors.stranger]);
  const result=await list(actors.employee);
  assert.equal(result.counters.notifications,2,'direct RPC omitted or mis-scoped notification count');
  assert.equal((await list(actors.manager)).counters.notifications,1);
  await db.query('update public.notifications set read_at=clock_timestamp() where id=$1',[id(602)]);
  assert.equal((await list(actors.employee)).counters.notifications,1);
 });
 await test('terminal transactions never advertise mutation even with act_all',async()=>{
  await db.query("update public.transactions set status='closed',closed_at=clock_timestamp() where id=$1",[tx]);
  const closed=(await list(actors.ceo,'closed')).rows.find(x=>x.id===tx);
  assert.equal(closed.can_act,false,'act_all incorrectly enables mutation on a closed transaction');
  assert.equal(closed.can_close,false);assert.equal(closed.incoming,false);
  await db.query("update public.transactions set status='cancelled' where id=$1",[tx]);
  assert.equal((await list(actors.ceo)).rows.find(x=>x.id===tx).can_act,false);
  await db.query("update public.transactions set status='open',closed_at=null where id=$1",[tx]);
 });
 await test('hidden direct employee_exec assignment cannot leak via responsible unit or broaden historical scope',async()=>{
  const hidden=id(220);
  await db.query("insert into public.transactions(id,number,title,responsible_unit_id,current_level,workflow_started) values($1,'FIX-HIDDEN','direct hidden',$2,'employee',true)",[hidden,unit.dept]);
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,visibility_scope) values($1,$2,$3,'direct','employee_exec')",[id(520),hidden,unit.dept]);
  await db.query("insert into public.transaction_assignment_targets(assignment_id,user_id,display_name) values($1,$2,'employee display')",[id(520),actors.employee]);
  const f=await flags(actors.manager,hidden);
  assert.equal(f.visible,false);assert.equal(f.scope,false,'hidden direct custody widened manager action scope');
  assert.equal((await flags(actors.assistant,hidden)).visible,false);
  assert.equal((await flags(actors.employee,hidden)).incoming,true);
  await db.query("insert into public.transaction_routes(transaction_id,route_type,from_user_id,to_user_id) values($1,'direct_assign',$2,$3)",[hidden,actors.ceo,actors.employee]);
  await db.query("insert into public.transaction_participants(transaction_id,user_id) values($1,$2)",[hidden,actors.manager]);
  assert.equal((await flags(actors.manager,hidden)).visible,true);
  assert.equal((await flags(actors.manager,hidden)).scope,false);
  assert.equal((await list(actors.manager)).rows.find(x=>x.id===hidden).can_act,false);
  await claims(actors.assistant);await db.exec('set role authenticated');try{assert.equal(await scalar('select count(*)::int from public.transactions where id=$1',[hidden]),0);}finally{await db.exec('reset role');}
 });
 await test('unit-root route custody resolves active assistant membership and deterministic latest movement only',async()=>{
  const routed=id(230);
  await db.query("insert into public.transactions(id,number,title,current_level,workflow_started,responsible_unit_id) values($1,'FIX-UNIT','unit route','assistant',true,$2)",[routed,unit.dept]);
  await db.query("insert into public.transaction_routes(id,transaction_id,route_type,to_user_id,to_login_name,to_unit_id,created_at) values($1,$3,'raise',$4,'manager',null,'2026-10-06T01:00:00Z'),($2,$3,'raise',null,null,$5,'2026-10-06T01:00:00Z')",[id(701),id(702),routed,actors.manager,unit.root]);
  assert.equal((await flags(actors.assistant,routed)).incoming,true,'assistant unit-root route missing current recipient');
  assert.equal((await flags(actors.manager,routed)).incoming,false);
  assert.equal((await flags(actors.secretary,routed)).secretary_queue,true);
  assert.deepEqual((await flags(actors.assistant,routed)).current_assignees,['assistant display']);
  await db.query("insert into public.transaction_routes(transaction_id,route_type,to_user_id,to_login_name,status,created_at) values($1,'assistant_transfer',$2,'otherAssistant','pending','2026-10-06T02:00:00Z'),($1,'assistant_transfer',$2,'otherAssistant','rejected','2026-10-06T03:00:00Z'),($1,'ceo_view',$3,'ceo','completed','2026-10-06T04:00:00Z')",[routed,actors.otherAssistant,actors.ceo]);
  assert.equal((await flags(actors.assistant,routed)).incoming,true);
  assert.equal((await flags(actors.otherAssistant,routed)).incoming,false);
  assert.equal((await flags(actors.otherSecretary,routed)).secretary_queue,false);
  await db.query("update public.transaction_routes set status='accepted' where transaction_id=$1 and status='pending'",[routed]);
  assert.equal((await flags(actors.assistant,routed)).incoming,false);
  assert.equal((await flags(actors.otherAssistant,routed)).incoming,true);
  assert.equal((await flags(actors.secretary,routed)).secretary_queue,false);
  assert.equal((await flags(actors.otherSecretary,routed)).secretary_queue,true);
 });
 await test('service-only explicit actor flags cannot be called by authenticated or anon impersonators',async()=>{
  await claims(actors.stranger);await db.exec('set role authenticated');
  try{
   assert.equal(await scalar('select app_private.can_view_transaction($1,$2)',[actors.manager,tx]),false);
   await assert.rejects(db.query('select public.transaction_feedback_flags_internal($1,$2)',[actors.manager,tx]),/permission denied/);
   await assert.rejects(db.query('select app_private.transaction_feedback_flags($1,$2)',[actors.manager,tx]),/permission denied/);
   await assert.rejects(db.query("select public.list_transactions_internal('manager','ceo','ceo','',ARRAY[]::text[])"),/permission denied/);
   await assert.rejects(db.query('select * from app_private.transaction_read_state'),/permission denied/);
  }finally{await db.exec('reset role');}
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await db.exec('set role service_role');try{
   const f=await flags(actors.manager);assert.equal(f.visible,true);assert.equal(f.incoming,true);
  }finally{await db.exec('reset role');}
  await db.exec('set role anon');try{await assert.rejects(db.query('select public.mark_my_transaction_seen($1,0)',[tx]),/permission denied/);}finally{await db.exec('reset role');}
 });
 await test('forced readiness, malformed claims and a foreign-owned session deny lists RLS and read acknowledgement',async()=>{
  await db.query('update public.profiles set must_change_password=true where id=$1',[actors.manager]);
  assert.equal((await flags(actors.manager)).visible,false);
  await assert.rejects(list(actors.manager),/account unavailable/);
  await assert.rejects(seen(actors.manager,0),/forbidden/);
  await claims(actors.manager);await db.exec('set role authenticated');try{assert.equal(await scalar('select count(*)::int from public.transactions'),0);}finally{await db.exec('reset role');}
  await db.query('update public.profiles set must_change_password=false where id=$1',[actors.manager]);
  for(const session of ['not-a-session',id(1001)]){
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actors.manager,session_id:session,role:'authenticated'})]);
   await db.exec('set role authenticated');try{
    await assert.rejects(db.query('select public.list_my_transactions()'),/account unavailable/);
    await assert.rejects(db.query('select public.mark_my_transaction_seen($1,0)',[tx]),/forbidden/);
    assert.equal(await scalar('select count(*)::int from public.transactions'),0);
   }finally{await db.exec('reset role');}
  }
  await claims(actors.manager);
 });
 await test('an older active execution assignment cannot outrank a later higher-authority route',async()=>{
  const higher=id(240);
  await db.query("insert into public.transactions(id,number,title,current_level,workflow_started) values($1,'FIX-HIGHER','new higher custody','assistant',true)",[higher]);
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,created_at) values($1,$2,$3,'responsible','2026-10-06T01:00:00Z')",[id(740),higher,unit.dept]);
  await db.query("insert into public.transaction_assignment_targets(assignment_id,user_id,display_name) values($1,$2,'employee display')",[id(740),actors.employee]);
  await db.query("insert into public.transaction_routes(transaction_id,route_type,to_user_id,to_login_name,created_at) values($1,'raise',$2,'assistant','2026-10-06T02:00:00Z')",[higher,actors.assistant]);
  assert.equal((await flags(actors.assistant,higher)).incoming,true,'old execution assignment masked higher-authority custody');
  assert.equal((await flags(actors.employee,higher)).incoming,false);
  assert.equal((await flags(actors.secretary,higher)).secretary_queue,true);
  assert.deepEqual((await flags(actors.assistant,higher)).current_assignees,['assistant display']);
 });
 await test('canonical flags are nonnullable booleans including records without a current level',async()=>{
  const noLevel=id(250);
  await db.query("insert into public.transactions(id,number,title,created_by) values($1,'FIX-NULLLEVEL','null level',$2)",[noLevel,actors.employee]);
  const f=await flags(actors.employee,noLevel);
  for(const key of ['visible','incoming','shared','scope','ceo','closed','secretary_queue']) assert.equal(typeof f[key],'boolean',`${key} is not a boolean`);
  assert.equal(f.incoming,true);assert.equal(f.ceo,false);
 });
 await test('all actor lists, service flags and authenticated table RLS agree exactly',async()=>{
  const ids=(await db.query('select id from public.transactions order by id')).rows.map(x=>x.id);
  for(const user of Object.values(actors)){
   const expected=[];
   for(const tid of ids) if((await flags(user,tid)).visible) expected.push(tid);
   const all=await list(user);const closed=await list(user,'closed');
   assert.deepEqual([...new Set([...all.rows,...closed.rows].map(x=>x.id))].sort(),expected.sort());
   for(const row of [...all.rows,...closed.rows]){
    const f=await flags(user,row.id);
    for(const k of ['incoming','shared','secretary_queue']) assert.equal(row[k],f[k]);
    assert.equal(row.scope_hit,f.scope);assert.deepEqual(row.current_assignees,f.current_assignees);
   }
   await claims(user);await db.exec('set role authenticated');try{
    assert.deepEqual((await db.query('select id from public.transactions order by id')).rows.map(x=>x.id),expected.sort());
   }finally{await db.exec('reset role');}
  }
 });
 await test('period durations, filters, 11 display fields and 17-parameter internal signature remain intact',async()=>{
  const cyc=id(260);
  await db.query("insert into public.transactions(id,number,title,created_by,responsible_user_id,responsible_unit_id,current_level,created_at,status,closed_at) values($1,'FIX-CYCLE','period filter probe',$2,$2,$3,'employee',current_date-30,'closed',current_date-25)",[cyc,actors.employee,unit.dept]);
  await db.query("insert into public.transaction_periods(transaction_id,cycle_no,started_at,ended_at,duration_days) values($1,1,current_date-30,current_date-25,5)",[cyc]);
  assert.equal((await list(actors.employee,'closed')).rows.find(x=>x.id===cyc).days,5);
  await db.query("update public.transactions set status='open',closed_at=null where id=$1",[cyc]);
  await db.query('insert into public.transaction_periods(transaction_id,cycle_no,started_at) values($1,2,current_date-2)',[cyc]);
  await claims(actors.employee);await db.exec('set role authenticated');try{
   const found=await scalar("select public.list_my_transactions(p_search=>'FIX-CYCLE',p_department=>'fixture dept',p_priority=>'عادي',p_status=>'open',p_origin=>'new',p_date_from=>current_date-31,p_date_to=>current_date,p_page=>1,p_page_size=>10)");
   assert.equal(found.total,1);assert.equal(found.rows[0].days,3);
   for(const key of ['number','title','responsible_unit_name','supporting_count','responsible_name','current_assignees','priority','status','days','last_activity_at','can_act']) assert.ok(key in found.rows[0],`missing display field ${key}`);
   assert.equal((await scalar("select public.list_my_transactions(p_search=>'FIX-CYCLE',p_date_from=>current_date)")).total,0);
  }finally{await db.exec('reset role');}
  assert.equal(await scalar("select pronargs::int from pg_proc where oid='public.list_transactions_internal(text,text,text,text,text[],text,text,text,text,text,text,text,boolean,date,date,integer,integer)'::regprocedure"),17);
  assert.equal(await scalar('select duration_days from public.transaction_periods where transaction_id=$1 and cycle_no=1',[cyc]),5);
 });
 await test('terminated ordinary assignments do not override a newer hidden direct boundary',async()=>{
  const hidden=id(270);
  await db.query("insert into public.transactions(id,number,title,current_level,responsible_unit_id,workflow_started) values($1,'FIX-OLD-SCOPE','old scope hidden','employee',$2,true)",[hidden,unit.otherDept]);
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,status,visibility_scope) values($1,$3,$4,'responsible','completed',null),($2,$3,$4,'direct','active','employee_exec')",[id(770),id(771),hidden,unit.dept]);
  await db.query("insert into public.transaction_assignment_targets(assignment_id,user_id,display_name) values($1,$2,'employee display')",[id(771),actors.employee]);
  assert.equal((await flags(actors.manager,hidden)).visible,false,'terminated unit scope bypassed active hidden direct boundary');
  assert.equal((await flags(actors.manager,hidden)).scope,false);
 });
 await test('historical direct visibility does not confer new current scope authority',async()=>{
  const hidden=id(280);
  await db.query("insert into public.transactions(id,number,title,current_level,responsible_unit_id,workflow_started) values($1,'FIX-HIST-DIRECT','past view not new action','employee',$2,true)",[hidden,unit.dept]);
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,status,visibility_scope) values($1,$3,$4,'direct','completed','manager'),($2,$3,$4,'direct','active','employee_exec')",[id(780),id(781),hidden,unit.dept]);
  await db.query("insert into public.transaction_assignment_targets(assignment_id,user_id,display_name) values($1,$2,'employee display')",[id(781),actors.employee]);
  const f=await flags(actors.manager,hidden);
  assert.equal(f.visible,true,'historically explicit viewing relationship should be retained');
  assert.equal(f.scope,false,'past direct view scope escalated into current hidden custody authority');
  assert.equal((await list(actors.manager)).rows.find(x=>x.id===hidden).can_act,false);
 });
 await test('bounded 787-row listing has disjoint deterministic pagination and measured real SQL cost',async()=>{
  const physical=await scalar('select count(*)::int from public.transactions');
  await db.query("insert into public.transactions(number,title,created_at,current_level) select 'FIX-PERF-'||g,'bounded performance fixture',timestamptz '2026-10-06T10:00:00Z','employee' from generate_series(1,$1::int) g",[787-physical]);
  assert.equal(await scalar('select count(*)::int from public.transactions'),787);
  await claims(actors.ceo);await db.exec('set role authenticated');try{
   const start=performance.now();
   const first=await scalar('select public.list_my_transactions(p_page=>1,p_page_size=>50)');
   const elapsed=performance.now()-start;
   const second=await scalar('select public.list_my_transactions(p_page=>2,p_page_size=>50)');
   assert.equal(first.total,787);assert.equal(first.rows.length,50);assert.equal(second.rows.length,50);
   const firstIds=new Set(first.rows.map(x=>x.id));
   assert.equal(second.rows.filter(x=>firstIds.has(x.id)).length,0,'equal-time rows overlap pages without a stable ID tie-breaker');
   const plan=await db.query('explain (analyze,format json) select public.list_my_transactions(p_page=>1,p_page_size=>50)');
   const explain=Object.values(plan.rows[0])[0][0];
   console.log(`BENCH local PGlite: physical=787 total=${first.total} page=50 wall_ms=${elapsed.toFixed(2)} sql_execution_ms=${explain['Execution Time']}`);
  }finally{await db.exec('reset role');}
 });
 console.log(`LOCAL SQL: ${passed} passed; network-free synthetic fixture; no deployed proof.`);
}catch(e){console.error(`${e.name}: ${e.message}${e.actual!==undefined?` (actual=${e.actual}, expected=${e.expected})`:''}`);process.exitCode=1;}finally{await db.close();}
