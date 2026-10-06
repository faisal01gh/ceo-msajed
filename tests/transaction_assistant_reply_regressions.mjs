// Network-free real PostgreSQL (PGlite), synthetic identities only; no full-chain/deployed proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createTransactionFeedbackFixture} from './transaction_feedback_sql_fixture.mjs';
const {db,scalar,id,actors,unit,tx,claims,dir}=await createTransactionFeedbackFixture();
let passed=0;
const source=id(301),operation=id(401);
const flags=user=>scalar('select public.transaction_feedback_flags_internal($1,$2)',[user,tx]);
const reply=()=>scalar('select public.transaction_reply_raise_internal($1,$2,$3,$4,$5,$6)',[actors.assistant,id(1003),tx,source,'رد اختبار',operation]);
// Include every mutated relation, including assignment children and the entire audit log.
const snapshot=()=>scalar(`select jsonb_build_object(
 'tx',(select to_jsonb(t) from public.transactions t where id=$1),
 'routes',(select jsonb_agg(to_jsonb(x) order by id) from public.transaction_routes x where transaction_id=$1),
 'history',(select jsonb_agg(to_jsonb(x) order by id) from public.transaction_history x where transaction_id=$1),
 'audit',(select jsonb_agg(to_jsonb(x) order by id) from public.audit_log x),
 'notifications',(select jsonb_agg(to_jsonb(x) order by id) from public.notifications x where transaction_id=$1),
 'assignments',(select jsonb_agg(to_jsonb(x) order by id) from public.transaction_assignments x where transaction_id=$1),
 'targets',(select jsonb_agg(to_jsonb(x) order by id) from public.transaction_assignment_targets x where assignment_id in(select id from public.transaction_assignments where transaction_id=$1)),
 'users',(select jsonb_agg(to_jsonb(x) order by assignment_id,user_id) from public.transaction_assignment_users x where assignment_id in(select id from public.transaction_assignments where transaction_id=$1)))`,[tx]);
async function setup(toUser,toLogin,{assignment=false,toUnit=null}={}){
 await db.query(`update public.transactions set created_by=$2,responsible_user_id=$2,responsible_login_name='manager',responsible_name='manager display',created_by_name='manager display',current_level='assistant',close_level='assistant',workflow_started=true where id=$1`,[tx,actors.manager]);
 await db.query(`insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_role,from_login_name,from_name,to_user_id,to_login_name,to_unit_id,to_name,status,created_at) values($1,$2,'raise',$3,'manager','manager','manager display',$4,$5,$6,'assistant display','completed',clock_timestamp()-interval '1 second')`,[source,tx,actors.manager,toUser,toLogin,toUnit]);
 if(assignment){
  await db.query(`insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,status,created_at) values($1,$2,$3,'responsible','active',clock_timestamp())`,[id(501),tx,unit.root]);
  await db.query(`insert into public.transaction_assignment_targets(id,assignment_id,user_id,login_name,display_name) values($1,$2,$3,'assistant','assistant display')`,[id(502),id(501),actors.assistant]);
  await db.query('insert into public.transaction_assignment_users(assignment_id,user_id) values($1,$2)',[id(501),actors.assistant]);
 }
 assert.equal((await flags(actors.assistant)).incoming,true,'repro prerequisite: actual canonical helper incoming');
}
async function rejectWithoutMutation(probe='exact-source-recipient'){
 const before=await snapshot();
 await db.exec('savepoint rejected_reply');
 let error,result;
 try{result=await reply();}catch(e){error=e;}
 // Recover the expected PostgreSQL aborted statement BEFORE any snapshot query.
 if(error)await db.exec('rollback to savepoint rejected_reply');
 await db.exec('release savepoint rejected_reply');
 console.log(JSON.stringify({probe,incomingBefore:true,errorCode:error?.code??null,unexpectedSuccess:result??null}));
 assert.equal(error?.code,'42501',`${probe} must reject, not succeed or fail with harness 25P02`);
 assert.deepEqual(await snapshot(),before,'rejected reply mutated business/assignment/audit state');
}
async function test(name,fn){
 await db.exec('begin');
 try{await fn();console.log(`PASS ${++passed} ${name}`);}finally{await db.exec('rollback');}
}
try{
 await db.exec(fs.readFileSync(path.join(dir,'20261006194500_transaction_assistant_reply.sql'),'utf8'));
 await test('NULL UUID and NULL login with incoming unit custody rejects atomically',async()=>{
  await setup(null,null,{toUnit:unit.root});
  await rejectWithoutMutation();
 });
 await test('NULL UUID and wrong login rejects despite independent newer active assistant assignment',async()=>{
  await setup(null,'wrong_login',{assignment:true});
  await rejectWithoutMutation();
 });
 for(const login of [null,'stale_login'])await test(`matching UUID remains authoritative with ${login===null?'NULL':'stale'} login`,async()=>{
  await setup(actors.assistant,login);
  const result=await reply();assert.equal(result.ok,true);assert.equal(result.target_user_id,actors.manager);
 });
 await test('NULL UUID with exact real profile login supports legacy identity',async()=>{
  assert.equal(await scalar("select public.user_context_internal($1)->>'login_name'",[actors.assistant]),'assistant');
  assert.equal(await scalar('select preferred_login from public.account_migration_users where migrated_user_id=$1',[actors.assistant]),'fixture_assistant');
  await setup(null,'assistant');
  assert.equal((await reply()).ok,true);
 });
 await test('wrong nonNULL UUID rejects even when login matches and current assignment is incoming',async()=>{
  await setup(actors.otherAssistant,'assistant',{assignment:true});
  await rejectWithoutMutation();
 });
 await test('unrepresentable live sender role rejects atomically before return mutations',async()=>{
  await setup(actors.assistant,'assistant',{assignment:true});
  await db.query("update public.user_roles set role_code='assistant_secretary' where user_id=$1 and is_primary",[actors.manager]);
  await rejectWithoutMutation('unrepresentable-live-sender-role');
 });
 await test('live sender role drift returns exact sender to employee incoming without authority changes',async()=>{
  await setup(actors.assistant,'assistant',{assignment:true});
  assert.equal(await scalar("select public.user_context_internal($1)->>'role'",[actors.manager]),'manager');
  // The original route was raised as manager; ONLY the synthetic live primary role drifts.
  await db.query("update public.user_roles set role_code='employee' where user_id=$1 and is_primary",[actors.manager]);
  assert.equal(await scalar('select role_code from public.account_migration_users where migrated_user_id=$1',[actors.manager]),'manager');
  assert.equal(await scalar("select public.user_context_internal($1)->>'role'",[actors.manager]),'employee');
  const before=await snapshot();const result=await reply();const after=await snapshot();const senderFlags=await flags(actors.manager);
  console.log(JSON.stringify({probe:'live-sender-role-drift',ok:result.ok,target:result.target_user_id,registryRole:'manager',liveRole:'employee',currentLevel:after.tx.current_level,senderIncoming:senderFlags.incoming}));
  assert.equal(result.ok,true);assert.equal(result.target_user_id,actors.manager);assert.equal(result.target_login_name,'fixture_manager');
  assert.equal(after.tx.current_level,'employee','return level must use authoritative live role, not migration registry');
  assert.equal(senderFlags.incoming,true);assert.equal((await flags(actors.assistant)).incoming,false);
  for(const key of ['responsible_user_id','responsible_login_name','responsible_name','responsible_unit_id','close_level','created_by','created_by_name'])assert.deepEqual(after.tx[key],before.tx[key],`reply changed ${key}`);
  const route=after.routes.find(x=>x.id===result.reply_route_id);assert.equal(route.route_type,'reply');assert.equal(route.to_user_id,actors.manager);assert.equal(route.to_login_name,'fixture_manager');
  assert.equal(after.assignments[0].status,'completed');assert.equal(after.targets[0].active,false);assert.equal(after.users[0].active,false);
  assert.equal(after.history.length,1);assert.equal(after.audit.length,1);assert.equal(after.notifications.length,1);
  assert.equal(after.notifications[0].user_id,actors.manager);assert.equal(after.notifications[0].target_login_name,'fixture_manager');
  await claims(actors.manager);await db.exec('set local role authenticated');
  const incoming=await scalar("select public.list_my_transactions('incoming')");await db.exec('reset role');
  assert.ok(incoming.rows.some(x=>x.id===tx),'actual authenticated incoming list must contain returned transaction');
 });
 await test('fresh and replay receipts bind the immutable verified candidate',async()=>{
  await setup(actors.assistant,'assistant');
  const fresh=await reply();
  const expected={transaction_id:tx,source_route_id:source,operation_id:operation,actor_user_id:actors.assistant};
  console.log(JSON.stringify({probe:'receipt-candidate-bindings',fresh}));
  for(const [key,value] of Object.entries(expected))assert.equal(fresh[key],value,`fresh receipt missing/mismatched ${key}`);
  const before=await snapshot();const replay=await reply();
  assert.equal(replay.replayed,true);assert.equal(replay.reply_route_id,fresh.reply_route_id);
  for(const [key,value] of Object.entries(expected))assert.equal(replay[key],value,`replay receipt missing/mismatched ${key}`);
  for(const key of ['target_user_id','target_login_name','target_name'])assert.equal(replay[key],fresh[key]);
  assert.deepEqual(await snapshot(),before);
 });
 await test('malformed receipt candidates cannot recover or mutate the persisted receipt',async()=>{
  await setup(actors.assistant,'assistant');await reply();const before=await snapshot();
  for(const [actor,session,route,op,code] of [
   [actors.otherAssistant,id(1006),source,operation,'42501'],
   [actors.assistant,id(1003),id(999),operation,'22023'],
   [actors.assistant,id(1003),source,null,'22023'],
   [actors.assistant,id(1003),source,'not-a-uuid','22P02'],
   [actors.assistant,id(1003),source,id(402),'42501']
  ]){
   await db.exec('savepoint malformed_candidate');let error;
   try{await scalar('select public.transaction_reply_raise_internal($1,$2,$3,$4,$5,$6)',[actor,session,tx,route,'رد اختبار',op]);}catch(e){error=e;}
   if(error)await db.exec('rollback to savepoint malformed_candidate');await db.exec('release savepoint malformed_candidate');
   assert.equal(error?.code,code,'malformed owner/source/operation must not obtain a receipt');assert.deepEqual(await snapshot(),before);
  }
 });
 console.log(JSON.stringify({passed,network:'none',engine:'actual PostgreSQL via PGlite'}));
}catch(e){console.error(`${e.name}: ${e.message}`);process.exitCode=1;}finally{await db.close();}
