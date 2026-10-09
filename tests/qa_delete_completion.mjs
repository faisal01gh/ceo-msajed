// Real loopback PostgreSQL only. Synthetic predecessor fixture; not source-chain replay.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
const evidence=process.env.QA_DELETE_EVIDENCE;
const {db,scalar,id,actors,tx,dir}=await createTransactionFeedbackFixture({modulePath:process.env.QA_DELETE_ADAPTER});
const results=[];let phase='setup';
const test=async(name,fn)=>{try{await fn();results.push({name,status:'Passed'})}catch(e){results.push({name,status:'Failed',code:e.code,reason:e.message});throw e}};
const snapshot=async()=>{await db.exec('reset role');const out={};for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth') order by 1,2")).rows)out[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(t) row from "${t.schemaname}"."${t.tablename}" t order by to_jsonb(t)::text`)).rows;return out};
const actor=async(u=actors.manager)=>{await db.exec('reset role');const sid=id(1000+Number(u.slice(-12)));await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:u,session_id:sid,role:'service_role'}),JSON.stringify({'x-qa-actor-user':u,'x-qa-actor-sid':sid})]);await db.exec('set role service_role')};
const tables=['transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods','notifications'];
const root=id(9201),assign=id(9202),action=id(9203),run=id(9301);
const abi=async()=> (await db.query("select oid,proname,pg_get_functiondef(oid) def,proowner,proacl::text,proconfig,provolatile,prosecdef,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result from pg_proc where pronamespace in ('public'::regnamespace,'app_private'::regnamespace) order by oid")).rows;
try{
 await db.exec(fs.readFileSync(dir+'/20261008010000_qa_isolation_prerequisites.sql','utf8'));
 await db.exec(fs.readFileSync(dir+'/20261008018000_qa_rest_provenance.sql','utf8'));
 await db.exec(fs.readFileSync(dir+'/20261008018500_qa_core_rest_admission.sql','utf8'));
 assert(db.connection.pid>0);assert.equal(db.connection.port,51771);
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role');
 await db.query("insert into app_private.qa_runs values($1,'active',true,clock_timestamp()+interval '1 hour',clock_timestamp())",[run]);
 await db.query("insert into app_private.qa_account_manifest values($1,'fixture_manager','fixture_manager','current_owned_QA',$2,$3,$4,null)",[actors.manager,run,id(9302),id(9303)]);
 await db.query("insert into app_private.qa_run_members values($1,$2,'manager',true)",[run,actors.manager]);
 await db.query('insert into app_private.qa_transaction_manifest values($1,$2,$3,null)',[root,run,id(9304)]);
 await db.query("insert into public.transactions(id,number,title,created_by) values($1,'STEP1-OWNED','synthetic',$2)",[root,actors.manager]);
 await db.query("insert into public.transaction_assignments(id,transaction_id,assignment_type,created_by) values($1,$2,'direct',$3)",[assign,root,actors.manager]);
 await db.query('insert into public.transaction_assignment_users values($1,$2)',[assign,actors.manager]);
 await db.query("insert into public.transaction_assignment_targets(id,assignment_id,user_id,login_name,display_name) values($1,$2,$3,'fixture_manager','synthetic')",[id(9204),assign,actors.manager]);
 await db.query("insert into public.transaction_actions(id,transaction_id,assignment_id,actor_id,actor_name,action_text) values($1,$2,$3,$4,'synthetic','text')",[action,root,assign,actors.manager]);
 await db.query("insert into public.transaction_action_versions(id,action_id,version_no,actor_id,body) values($1,$2,1,$3,'synthetic')",[id(9205),action,actors.manager]);
 // Additional actual-schema dependents are installed before guard attachment.
 await db.query("insert into public.transaction_action_notes(id,transaction_id,action_id,actor_name,note) values($1,$2,$3,'synthetic','synthetic')",[id(9206),root,action]);
 for(const t of tables)await db.exec(`create trigger step1_reference before insert or update or delete on public.${t} for each row execute function app_private.qa_reference_guard_before_row()`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await db.exec(`create trigger aa_step1_capture before delete on public.${t} for each row execute function app_private.qa_delete_capture()`);
 await db.exec('create trigger step1_old_finalize after delete on public.transactions for each statement execute function app_private.qa_delete_finalize()');
 const before=await snapshot();const beforeAbi=await abi();
 phase=process.env.QA_DELETE_PHASE||'red';
 if(phase==='green'){
  await db.exec('drop trigger step1_old_finalize on public.transactions');
  await db.exec(fs.readFileSync(dir+'/20261008019500_qa_delete_completion.sql','utf8'));
 }
 await test('legitimate owned populated graph single DELETE commits',async()=>{await actor();await db.exec('begin');const r=await db.query('delete from public.transactions where id=$1 returning id',[root]);assert.deepEqual(r.rows,[{id:root}]);await db.exec('reset role');assert.equal(await scalar('select count(*)::int from public.transactions where id=$1',[root]),0);assert.equal(await scalar('select count(*)::int from public.transaction_action_versions where action_id=$1',[action]),0);assert.equal(await scalar('select count(*)::int from app_private.qa_sql_operation_context'),7);await actor();await db.exec('commit')});
 await test('exact deleted graph and zero committed private context',async()=>{await db.exec('reset role');for(const [t,k,v] of [['transactions','id',root],['transaction_assignments','id',assign],['transaction_assignment_users','assignment_id',assign],['transaction_assignment_targets','assignment_id',assign],['transaction_actions','id',action],['transaction_action_versions','action_id',action],['transaction_action_notes','action_id',action]])assert.equal(await scalar(`select count(*)::int from public.${t} where ${k}=$1`,[v]),0);assert.equal(await scalar('select count(*)::int from app_private.qa_sql_operation_context'),0)});
 const after=await snapshot();
 await test('all unrelated rows across full 40-table snapshot unchanged',async()=>{assert.equal(Object.keys(before).length,40);for(const t of Object.keys(before)){const removed=new Set([root,assign,action,id(9204),id(9205),id(9206)]);const retained=before[t].filter(x=>!removed.has(x.row.id)&&!removed.has(x.row.assignment_id)&&!removed.has(x.row.action_id));assert.deepEqual(after[t],retained,t)}});
 fs.writeFileSync(evidence+'/ABI.json',JSON.stringify({before:beforeAbi,after:await abi()},null,2));
}catch(e){try{await db.exec('rollback;reset role')}catch{};if(!results.some(x=>x.status==='Failed'))results.push({name:phase,status:'Failed',code:e.code,reason:e.message});process.exitCode=1;}
finally{fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(evidence+'/TEST_RESULTS_'+phase+'.json',JSON.stringify({phase,engine:db.connection,results,counts:Object.fromEntries(['Passed','Failed','Skipped','XFail'].map(s=>[s,results.filter(x=>x.status===s).length])),activation_ready:false},null,2));console.log(JSON.stringify({phase,results}));await db.close()}
