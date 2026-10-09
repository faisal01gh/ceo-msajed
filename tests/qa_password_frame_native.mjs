// Real loopback PostgreSQL, synthetic predecessor/Auth only. No real accounts or credentials.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
assert.ok(process.env.QA_LOCAL_PG_MODULE,'explicit owned local adapter required');
const out=process.env.QA_PW_REPORT_DIR||'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/sql-core-password';fs.mkdirSync(out,{recursive:true});
const f=await createTransactionFeedbackFixture({modulePath:process.env.QA_LOCAL_PG_MODULE});const {db,scalar,id,actors,dir}=f;
const sql=n=>fs.readFileSync(path.join(dir,n),'utf8');const report={local_postgresql:true,native_auth_acceptance:false,synthetic_identities:true,provider_actions:0,remote_actions:0,checks:[],engine:db.connection};
const check=n=>report.checks.push({name:n,pass:true});
const snapshot=async()=>{await db.exec('reset role');const o={};for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('auth','public','app_private') order by 1,2")).rows)o[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(t) row from "${t.schemaname}"."${t.tablename}" t order by to_jsonb(t)::text`)).rows;return o;};
const header=async(u=actors.employee,s=id(1001),h=id(99002),extra={})=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({role:'service_role'}),JSON.stringify({'x-qa-actor-user':u,'x-qa-actor-sid':s,'x-qa-candidate-handle':h,...extra})]);await db.exec('set role service_role');};
const deny=async(n,fn,code='42501')=>{const b=await snapshot();let e;try{await fn();}catch(x){e=x;}assert.ok(e,n+' unexpectedly allowed');assert.equal(e.code,code,n+': '+e.message);assert.deepEqual(await snapshot(),b,n+' wrote protected data');check(n);};
const begin=async(u,s,key,op,h)=>{await header(u,s,h);return scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[u,s,key,'change',op]);};
const dispatch=async(op,g,h)=>scalar('select row_to_json(t) from public.qa_password_dispatch_internal($1,$2,$3) t',[op,g,h]);
try{
 for(const n of ['20261008010000_qa_isolation_prerequisites.sql','20261008015000_qa_password_transport.sql','20261008018000_qa_rest_provenance.sql'])await db.exec(sql(n));
 const adapter=fs.readFileSync(new URL('./qa_isolation_enforcement.mjs',import.meta.url),'utf8');const setup=adapter.slice(adapter.indexOf(' // Empty dependency relations:'),adapter.indexOf(' for(const [cohort,run]'));await new (Object.getPrototypeOf(async function(){}).constructor)('db','fs',setup)(db,fs);
 const m200=sql('20261008020000_qa_isolation_enforcement.sql');await assert.rejects(db.exec(m200),e=>e.code==='55000');await db.exec('rollback');check('activation_barrier_55000');await db.exec(m200.split('-- BEGIN LOCAL VERIFIABLE SECTION\n')[1].split('-- END LOCAL VERIFIABLE SECTION')[0]);
 for(const n of ['20261008018500_qa_core_rest_admission.sql','20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql'])await db.exec(sql(n));
 const overlay='20261008020500_qa_password_frame_composition.sql';if(fs.existsSync(path.join(dir,overlay)))await db.exec(sql(overlay));
 const guardBefore=await scalar("select pg_get_functiondef('app_private.qa_reference_guard_before_row()'::regprocedure)");
 for(const t of ['profiles','user_roles','user_memberships','account_migration_users','audit_log','notifications','transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods'])await db.exec(`create trigger zz_combined_reference before insert or update or delete on public.${t} for each row execute function app_private.qa_reference_guard_before_row()`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await db.exec(`create trigger aa_combined_capture before delete on public.${t} for each row execute function app_private.qa_delete_capture()`);
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role');
 const u=actors.employee,s=id(1001),op=id(99001),h=id(99002);const b=await snapshot();
 let first;try{first=await begin(u,s,'fixture_employee',op,h);}catch(e){report.red={code:e.code,message:e.message,where:e.where,zero_table_effects:assert.deepEqual(await snapshot(),b)===undefined};throw e;}
 assert.equal(first.write_allowed,true);check('actual_begin_before_own_cutoff_through_final_guard');
 await db.exec('reset role');const o=await scalar('select to_jsonb(o) from app_private.account_password_operations o where operation_id=$1',[op]);
 assert.equal(await scalar('select session_valid_after::text from app_private.account_credential_state where user_id=$1',[u]),await scalar("select (qa_control->>'original_session_cutoff')::timestamptz::text from app_private.account_password_operations where operation_id=$1",[op]));check('own_cutoff_full_precision_stored');
 assert.equal(await scalar('select count(*)::int from app_private.qa_password_frames'),0);check('begin_zero_private_frame');
 await header(u,s,h);assert.equal((await dispatch(op,1,h)).dispatch_state,'admitted_new');assert.equal((await dispatch(op,1,h)).dispatch_state,'admitted_observed');check('one_shot_dispatch_replay_observes_only');
 await deny('no_frame_forced_normal_notification_DENY',async()=>{await header(u,s,h);await db.query("insert into public.notifications(user_id,title,event_type) values($1,'blocked','fixture')",[u]);});
 await deny('finish_missing_provider_and_candidate_proof_zero_writes',async()=>{await header(u,s,h);await scalar('select public.account_password_finish_internal($1,1)',[op]);},'P0001');
 await db.exec('reset role');await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation','1') where id=$1",[u,op]);const verified=id(99003);await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[verified,u]);
 const proof={operation_id:op,generation:1,candidate_handle:h,target_user_id:u,target_email:'employee@fixture.invalid',project_ref:'movzojtnkkmdsjhmlgtq',session_id:verified,issuer:'https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1',claim_role:'authenticated',observed_at:await scalar('select clock_timestamp()::text')};
 for(const [n,x] of Object.entries({wrong_SID:{session_id:id(1002)},wrong_generation:{generation:2},wrong_candidate:{candidate_handle:id(99999)},wrong_UID:{target_user_id:actors.manager},wrong_email:{target_email:'wrong@fixture.invalid'},wrong_project:{project_ref:'wrong'},extra:{extra:true}}))await deny('finish_'+n,async()=>{await header(u,s,h,{'x-qa-candidate-proof':JSON.stringify({...proof,...x})});await scalar('select public.account_password_finish_internal($1,1)',[op]);});
 await header(u,s,h,{'x-qa-candidate-proof':JSON.stringify(proof)});assert.equal((await scalar('select public.account_password_finish_internal($1,1)',[op])).status,'completed');check('actual_finish_exact_proof_final_guard');
 await db.exec('reset role');const audits=(await db.query("select to_jsonb(a) row from public.audit_log a where event_type='password_operation_completed'")).rows;assert.equal(audits.length,1);assert.equal(typeof audits[0].row.id,'number');assert.equal(audits[0].row.detail,null);assert.deepEqual(audits[0].row.meta,{operation_id:op,kind:'change',outcome:'completed',source:'verified_session'});check('exact_one_generated_bigint_full_default_audit');
 const replay=await snapshot();await header(u,s,h);assert.equal((await scalar('select public.account_password_finish_internal($1,1)',[op])).status,'completed');assert.deepEqual(await snapshot(),replay);check('finish_replay_zero_effects');
 for(const [name,x] of [['manager',2],['assistant',3]]){
  const user=actors[name],sid=id(1000+x),operation=id(99100+x),handle=id(99200+x);await begin(user,sid,'fixture_'+name,operation,handle);await header(user,sid,handle);await dispatch(operation,1,handle);
  if(name==='manager'){assert.equal((await scalar("select public.account_password_fail_internal($1,'provider_400')",[operation])).status,'failed');check('actual_fail_final_guard');}
  else{assert.equal((await scalar('select public.account_password_unknown_internal($1)',[operation])).status,'uncertain');check('actual_unknown_no_public_effect');await deny('uncertain_fail_DENY',async()=>{await header(user,sid,handle);await scalar("select public.account_password_fail_internal($1,'provider_400')",[operation]);},'P0001');}
 }
 // A trusted producer must not gain an arbitrary journal patch inside an
 // otherwise valid unknown frame. This test-only definer is dropped immediately.
 await db.exec('reset role');
 await db.exec(`create function public.qa_fixture_invalid_unknown() returns void language plpgsql security definer set search_path='' as $$begin perform app_private.qa_pw_open('unknown','${id(99103)}');perform app_private.qa_pw_effect('app_private.account_password_operations'::regclass,jsonb_build_object('status','uncertain','dispatch_state','uncertain','dispatch_token',gen_random_uuid()));perform app_private.qa_pw_close();end $$;`);
 await deny('unknown_cannot_replace_original_dispatch_token',async()=>{await header(actors.assistant,id(1003),id(99203));await db.exec('select public.qa_fixture_invalid_unknown()');});
 await db.exec('drop function public.qa_fixture_invalid_unknown()');
 // Original native SID is immutable even if a synthetic row is recreated with
 // the same UUID after the intentional cutoff. It is not a refreshed session.
 const driftUser=actors.otherAssistant,driftSid=id(1006),driftOp=id(99401),driftHandle=id(99402);
 await begin(driftUser,driftSid,'fixture_otherassistant',driftOp,driftHandle);
 await db.exec('reset role');const originalCreated=await scalar('select created_at::text from auth.sessions where id=$1',[driftSid]);
 await db.query('update auth.sessions set created_at=clock_timestamp() where id=$1',[driftSid]);
 await deny('dispatch_recreated_native_SID_DENY',async()=>{await header(driftUser,driftSid,driftHandle);await dispatch(driftOp,1,driftHandle);});
 await db.query('update auth.sessions set created_at=$2::timestamptz where id=$1',[driftSid,originalCreated]);
 await db.exec('reset role');assert.equal(await scalar('select count(*)::int from app_private.qa_password_frames'),0);assert.equal(await scalar('select count(*)::int from app_private.qa_core_provision_context'),0);assert.equal(await scalar('select count(*)::int from app_private.qa_sql_operation_context'),0);check('successful_returns_and_autocommit_zero_private_state');
 assert.ok(guardBefore.includes('qa_pw_consume'));assert.ok(guardBefore.includes('setnull_parent'));assert.ok(guardBefore.includes('qa_core_provision_row_allowed'));assert.ok(guardBefore.includes('qa_row_references'));check('final_guard_Core_delete_typed_reference_composition');
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure={code:e.code||null,message:e.message,where:e.where||null};process.exitCode=1;}finally{await db.close();report.passed=report.checks.length;report.failed=report.status==='PASS'?0:1;report.skipped=0;report.xfail=0;fs.writeFileSync(path.join(out,process.argv.includes('--red')?'PASSWORD_RED.json':'PASSWORD_GREEN.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
