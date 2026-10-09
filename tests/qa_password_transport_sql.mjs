// Offline actual PostgreSQL leaves; no provider/native/network actions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createPasswordGuardFixture} from './qa_password_fixture.mjs';
const fixture=await createPasswordGuardFixture(process.env.QA_LOCAL_PG_MODULE?{modulePath:process.env.QA_LOCAL_PG_MODULE}:{});
const {db,scalar,id,actors,preserveSql}=fixture;
let assertions=0;const eq=(a,b)=>{assert.deepEqual(a,b);assertions++};
const migration=new URL('../supabase/migrations/20261008015000_qa_password_transport.sql',import.meta.url);
const user=actors.employee,sid=id(1001),op=id(9201),handle=id(9202);
const headers=async(extra={})=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({role:'service_role'}),JSON.stringify({'x-qa-actor-user':user,'x-qa-actor-sid':sid,'x-qa-candidate-handle':handle,...extra})]);await db.exec('set role service_role')};
try{
 // The shared password fixture installs the actual final guard chain and checks
 // every existing predecessor function OID/ABI/ACL/owner/config across150.
 const abi=async()=>(await db.query("select oid,proname,pg_get_function_arguments(oid) args,pg_get_function_result(oid) result,proowner,proacl::text,proconfig from pg_proc where proname in ('account_password_begin_internal','account_password_finish_internal','account_password_fail_internal','account_password_unknown_internal') order by oid")).rows;
 const before=await abi();eq(before.map(x=>({name:x.proname,args:x.args,result:x.result,owner:x.proowner,acl:x.proacl,config:x.proconfig})),fixture.passwordBaselineABI.map(x=>({name:x.proname,args:x.args,result:x.result,owner:Number(x.proowner),acl:x.proacl,config:x.proconfig})));eq(await abi(),before);
 await headers();const begin=await scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[user,sid,'fixture_employee','change',op]);eq(begin.qa_control_version,1);eq(begin.candidate_handle,handle);
 const denied=async(fn)=>{await db.exec('reset role');const before=await scalar(preserveSql);await db.exec('set role service_role');let code;try{await fn()}catch(e){code=e.code}eq(code,'42501');await db.exec('reset role');eq(await scalar(preserveSql),before);await db.exec('set role service_role')};
 const dispatch=async(h=handle,g=1)=>(await db.query('select * from public.qa_password_dispatch_internal($1,$2,$3)',[op,g,h])).rows[0];
 await denied(()=>dispatch(id(9299)));await denied(()=>dispatch(handle,2));
 eq((await dispatch()).dispatch_state,'admitted_new');eq((await dispatch()).dispatch_state,'admitted_observed');
 await db.exec('reset role');await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation','1') where id=$1",[user,op]);
 await headers();await denied(()=>scalar('select public.account_password_finish_internal($1,1)',[op]));
 const verified=id(9301);await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[verified,user]);
 const proof={operation_id:op,generation:1,candidate_handle:handle,target_user_id:user,target_email:'employee@fixture.invalid',project_ref:'movzojtnkkmdsjhmlgtq',session_id:verified,issuer:'https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1',claim_role:'authenticated',observed_at:await scalar('select clock_timestamp()::text')};
 for(const change of [{session_id:'bad'},{generation:2},{candidate_handle:id(9399)},{target_user_id:actors.manager},{target_email:'wrong@fixture.invalid'},{project_ref:'wrong'},{claim_role:'service_role'},{extra:true}]){await headers({'x-qa-candidate-proof':JSON.stringify({...proof,...change})});await denied(()=>scalar('select public.account_password_finish_internal($1,1)',[op]));}
 await headers({'x-qa-candidate-proof':JSON.stringify(proof)});eq((await scalar('select public.account_password_finish_internal($1,1)',[op])).status,'completed');
 await db.exec('reset role');eq(await scalar('select candidate_verified_session from app_private.account_password_operations where operation_id=$1',[op]),verified);eq(await scalar("select count(*)::int from public.audit_log where event_type='password_operation_completed'"),1);
 await headers();const own=async(u=user,s=verified,o=op,g=1,h=handle)=>(await db.query('select * from public.qa_owned_session_check_internal($1,$2,$3,$4,$5)',[u,s,o,g,h])).rows[0];
 eq((await own()).allowed,true);eq((await own(actors.manager)).allowed,false);eq((await own(user,sid)).allowed,false);eq((await own(user,verified,op,2)).allowed,false);eq((await own(user,verified,op,1,id(9399))).allowed,false);
 eq((await own(user,sid,null,null,null)).allowed,true);eq((await own(user,verified,null,null,null)).allowed,false);
 for(const r of ['anon','authenticated'])eq(await scalar('select has_function_privilege($1,$2,$3)',[r,'public.qa_owned_session_check_internal(uuid,uuid,uuid,bigint,uuid)','EXECUTE']),false);
 await headers({'x-qa-actor-user':actors.manager,'x-qa-actor-sid':id(1002)});await denied(()=>scalar('select public.account_password_unknown_internal($1)',[op]));await denied(()=>scalar("select public.account_password_fail_internal($1,'provider_400')",[op]));
 await headers();const observed=await scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[user,sid,'fixture_employee','change',op]);eq(observed.write_allowed,false);eq(observed.candidate_handle,handle);
 await headers({'x-qa-actor-user':actors.manager,'x-qa-actor-sid':id(1002),'x-qa-candidate-handle':'bad'});await denied(()=>scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[actors.manager,id(1002),'fixture_manager','change',id(9800)]));
 await db.exec('reset role');await db.query("insert into app_private.qa_runs values($1,'active',true,clock_timestamp()+interval '1 second',clock_timestamp())",[id(9810)]);
 await db.query("insert into app_private.qa_account_manifest values($1,'fixture_assistant','fixture_assistant','current_owned_QA',$2,$3,$4,null)",[actors.assistant,id(9810),id(9811),id(9812)]);await db.query("insert into app_private.qa_run_members values($1,$2,'assistant',true)",[id(9810),actors.assistant]);
 await headers({'x-qa-actor-user':actors.assistant,'x-qa-actor-sid':id(1003)});await denied(()=>db.query("select pg_sleep(1.1),public.account_password_begin_internal($1,$2,'fixture_assistant','change',$3)",[actors.assistant,id(1003),id(9813)]));
 const ownedMetadata=(await db.query("select pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,p.provolatile volatility,p.prosecdef security_definer,to_jsonb(p.proconfig) config,r.rolname owner,p.proacl::text acl from pg_proc p join pg_roles r on r.oid=p.proowner where p.proname='qa_owned_session_check_internal'")).rows[0];eq(ownedMetadata.volatility,'s');eq(ownedMetadata.security_definer,true);eq(ownedMetadata.config,['search_path=""']);eq(ownedMetadata.owner,'postgres');
 console.log(JSON.stringify({phase:'cleanup',assertions,offline:true,native:false,ownedMetadata,preservedLeafABI:await abi()}));
}finally{await db.close()}
