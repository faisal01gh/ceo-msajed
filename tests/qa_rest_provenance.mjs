// Native loopback synthetic PostgreSQL provenance regression; no live account calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
const {db,scalar,id,actors,tx,dir}=await createTransactionFeedbackFixture({modulePath:process.env.QA_DELETE_ADAPTER});
let assertions=0;const eq=(a,b)=>{assert.deepEqual(a,b);assertions++};
const snapshot=async()=>{await db.exec('reset role');const out={};for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth') order by 1,2")).rows)out[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(t) row from "${t.schemaname}"."${t.tablename}" t order by to_jsonb(t)::text`)).rows;return out};
const actor=async(u=actors.employee,role='service_role')=>{await db.exec('reset role');const sid=id(1000+Number(u.slice(-12)));await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:u,session_id:sid,role}),JSON.stringify({'x-qa-actor-user':u,'x-qa-actor-sid':sid})]);await db.exec('set role '+role)};
const deny=async(sql,args=[],u=actors.employee,expected='42501')=>{const before=await snapshot();await actor(u);let code;try{await db.query(sql,args)}catch(e){code=e.code}eq(code,expected);eq(await snapshot(),before)};
try{
 await db.exec(fs.readFileSync(dir+'/20261008010000_qa_isolation_prerequisites.sql','utf8'));
 const baseline=await snapshot();const funcs=(await db.query("select oid,pg_get_functiondef(oid) def,proacl::text,proowner,proconfig,provolatile from pg_proc where pronamespace in ('public'::regnamespace,'app_private'::regnamespace) order by oid")).rows;
 const triggers=(await db.query('select oid,tgfoid,tgtype,tgenabled from pg_trigger order by oid')).rows;
 const migration=dir+'/20261008018000_qa_rest_provenance.sql';if(fs.existsSync(migration))await db.exec(fs.readFileSync(migration,'utf8'));
 eq(await snapshot(),baseline);
 eq((await db.query("select oid,pg_get_functiondef(oid) def,proacl::text,proowner,proconfig,provolatile from pg_proc where oid=any($1::oid[]) order by oid",[funcs.map(f=>f.oid)])).rows,funcs);
 eq((await db.query('select oid,tgfoid,tgtype,tgenabled from pg_trigger order by oid')).rows,triggers);
 // Fixture service transport has PostgreSQL table rights as PostgREST service does.
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role;grant update on public.notifications to authenticated');
 await db.exec('update public.account_migration_users a set preferred_login=p.login_name from public.profiles p where p.id=a.migrated_user_id');
 // Native PID constraint stays unchanged; embedded PID 0 is not acceptance.
 assert(db.connection.pid>0);eq(db.connection.database,'qa_isolation_step3_graph_20261009');eq(db.connection.host,'127.0.0.1');eq(db.connection.port,51771);
 const installed=await scalar("select to_regprocedure('app_private.qa_reference_guard_before_row()') is not null");
 // RED baseline: no helper means an actual cross-cohort write succeeds, not setup failure.
 await db.query("insert into app_private.qa_runs values($1,'active',true,clock_timestamp()+interval '1 hour',clock_timestamp())",[id(3001)]);
 await db.query("insert into app_private.qa_account_manifest values($1,'fixture_manager','fixture_manager','current_owned_QA',$2,$3,$4,null)",[actors.manager,id(3001),id(4001),id(4002)]);
 await db.query("insert into app_private.qa_run_members values($1,$2,'manager',true)",[id(3001),actors.manager]);
 await db.query("insert into public.notifications(id,user_id,event_type,title,body,target_login_name) values($1,$2,'fixture','before','before','employee')",[id(5001),actors.employee]);
 if(installed)await db.exec('create trigger zz_fixture_reference before insert or update or delete on public.notifications for each row execute function app_private.qa_reference_guard_before_row()');
 await deny('update public.notifications set user_id=$1 where id=$2',[actors.manager,id(5001)]);
 await actor(actors.employee,'authenticated');await db.query("update public.notifications set title='after',body=null,event_type='updated',created_at=clock_timestamp(),read_at=clock_timestamp(),target_name=null where id=$1",[id(5001)]);assertions++;
 await db.exec('reset role');eq(await scalar('select title from public.notifications where id=$1',[id(5001)]),'after');
 await deny('update public.notifications set target_login_name=$1 where id=$2',['fixture_manager',id(5001)]);
 await deny('update public.notifications set user_id=$1,target_login_name=$2 where id=$3',[actors.manager,'fixture_manager',id(5001)]);
 await db.query("insert into app_private.qa_account_manifest values($1,'fixture_assistant','fixture_assistant','current_owned_QA',$2,$3,$4,null)",[actors.assistant,id(3001),id(4003),id(4004)]);await db.query("insert into app_private.qa_run_members values($1,$2,'assistant',true)",[id(3001),actors.assistant]);
 await db.query("insert into app_private.qa_runs values($1,'active',true,clock_timestamp()+interval '1 hour',clock_timestamp())",[id(3002)]);await db.query("insert into app_private.qa_account_manifest values($1,'fixture_ceo','fixture_ceo','current_owned_QA',$2,$3,$4,null)",[actors.ceo,id(3002),id(4005),id(4006)]);await db.query("insert into app_private.qa_run_members values($1,$2,'ceo',true)",[id(3002),actors.ceo]);
 await actor(actors.manager);await db.query("insert into public.notifications(id,user_id,event_type,title,target_login_name) values($1,$2,'fixture','QA','fixture_manager')",[id(5002),actors.manager]);await db.query("update public.notifications set user_id=$1,target_login_name='fixture_assistant',title='same run',body=null where id=$2",[actors.assistant,id(5002)]);assertions++;
 await deny("update public.notifications set user_id=$1,target_login_name='fixture_ceo' where id=$2",[actors.ceo,id(5002)],actors.manager);
 await deny("update public.notifications set title='foreign OLD' where id=$1",[id(5002)]);
 const untaggedBefore=await snapshot();await actor();await db.query("select set_config('request.headers','{}',false)");let untaggedCode;try{await db.query("update public.notifications set title='untagged' where id=$1",[id(5001)])}catch(e){untaggedCode=e.code}eq(untaggedCode,'42501');eq(await snapshot(),untaggedBefore);
 // Seed the foreign control before attaching enforcement, no disabled guards.
 await db.exec('reset role');
 await db.query("insert into public.transactions(id,number,title,created_by) values($1,'FOREIGN-GRAPH','synthetic',$2)",[id(7100),actors.employee]);
 await db.query("insert into public.transaction_assignments(id,transaction_id,assignment_type,created_by) values($1,$2,'direct',$3)",[id(7101),id(7100),actors.employee]);
 await db.query("insert into public.transaction_assignment_targets(id,assignment_id,user_id,display_name) values($1,$2,$3,'synthetic')",[id(7102),id(7101),actors.manager]);
 for(const f of ['20261008018500_qa_core_rest_admission.sql','20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql'])await db.exec(fs.readFileSync(dir+'/'+f,'utf8'));
 const tables=['transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods'];
 for(const t of tables)await db.exec(`create trigger zz_fixture_reference before insert or update or delete on public.${t} for each row execute function app_private.qa_reference_guard_before_row()`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await db.exec(`create trigger aa_fixture_capture before delete on public.${t} for each row execute function app_private.qa_delete_capture()`);
 await actor();await db.query("insert into public.transaction_assignments(id,transaction_id,assignment_type,created_by) values($1,$2,'direct',$3)",[id(6001),tx,actors.employee]);
 await db.query('insert into public.transaction_assignment_users(assignment_id,user_id) values($1,$2)',[id(6001),actors.employee]);
 await db.query("insert into public.transaction_assignment_targets(id,assignment_id,user_id,login_name,display_name) values($1,$2,$3,'employee','fixture')",[id(6002),id(6001),actors.employee]);
 await db.query("insert into public.transaction_actions(id,transaction_id,assignment_id,actor_id,actor_name,action_text) values($1,$2,$3,$4,'fixture','text')",[id(6003),tx,id(6001),actors.employee]);
 await db.query("insert into public.transaction_action_versions(id,action_id,version_no,actor_id,body) values($1,$2,1,$3,'fixture')",[id(6004),id(6003),actors.employee]);
 await deny('update public.transaction_assignment_users set user_id=$1 where assignment_id=$2',[actors.manager,id(6001)]);
 await deny('delete from public.transactions where id=$1',[id(7100)]);
 // The retained original single DELETE now has delayed native completion.
 await actor();await db.exec('begin');eq((await db.query('delete from public.transactions where id=$1 returning id',[tx])).rows,[{id:tx}]);await db.exec('reset role');eq(await scalar('select count(*)::int from public.transaction_action_versions where id=$1',[id(6004)]),0);eq(await scalar('select count(*)::int from app_private.qa_sql_operation_context'),6);await actor();await db.exec('commit');await db.exec('reset role');eq(await scalar('select count(*)::int from app_private.qa_sql_operation_context'),0);
 await actor();await db.query("insert into public.transactions(id,number,title,created_by) values($1,'FIX-LEAF','fixture leaf',$2)",[id(7000),actors.employee]);await db.query('delete from public.transactions where id=$1',[id(7000)]);await db.exec('reset role');eq(await scalar('select count(*)::int from app_private.qa_sql_operation_context'),0);
 for(const role of ['anon','authenticated','service_role'])eq(await scalar("select has_table_privilege($1,'app_private.qa_sql_operation_context','SELECT,INSERT,UPDATE,DELETE')",[role]),false);
 const abi=(await db.query("select proname,pg_get_function_identity_arguments(oid) arguments,pg_get_function_result(oid) result,provolatile,prosecdef,proconfig,proacl::text from pg_proc where pronamespace='app_private'::regnamespace and proname like 'qa_%' order by proname")).rows;
 if(process.env.QA_REST_EVIDENCE){fs.mkdirSync(process.env.QA_REST_EVIDENCE,{recursive:true});fs.writeFileSync(process.env.QA_REST_EVIDENCE+'/ABI.json',JSON.stringify({functions:abi,engine:db.connection,production_actions:0},null,2));}
 const result={status:'Passed',selected_tests:'PASS',assertions,engine:db.connection,production_actions:0,attached_fixture_tables:tables.concat('notifications'),populated_guard_tests:['transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','notifications'],not_executed:['native concurrent arrivals','owned_cleanup control route','original provisioning stored control','live target catalog parity'],graph_single_delete:'NATIVE_SINGLE_DELETE_PASSED',fixture_pid_constraint_relaxed:false,activation_ready:false};
 if(process.env.QA_REST_EVIDENCE)fs.writeFileSync(process.env.QA_REST_EVIDENCE+'/RESULT.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await db.close()}
