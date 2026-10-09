// Offline synthetic combined 01 + 150 + actual REST180 + bounded200 + forward185.
// No provider/native calls; guards are attached only to this disposable PGlite DB.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
const red=process.argv.includes('--red');
const root=path.resolve(import.meta.dirname,'..');
const out='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-core-rest-admission-evidence';
fs.mkdirSync(out,{recursive:true});
const report={fixture_only:true,native_acceptance:false,network_actions:0,provider_actions:0,native_actions:0,checks:[],phase:red?'RED':'GREEN'};
const nativeModule=process.env.QA_LOCAL_PG_MODULE;
const f=await createTransactionFeedbackFixture(nativeModule?{modulePath:nativeModule}:{});const {db,scalar,id,actors,dir}=f;
if(nativeModule){report.local_postgresql=true;report.engine=db.connection;report.native_acceptance=false;}
const sql=n=>fs.readFileSync(path.join(dir,n),'utf8');
const reset=()=>db.exec('reset role');
const snap=async()=>{await reset();const result={};for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('auth','public','app_private') order by 1,2")).rows)result[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(t) row from "${t.schemaname}"."${t.tablename}" t order by to_jsonb(t)::text`)).rows;return result;};
const metadata=()=>db.query("select p.oid::text,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_arguments(p.oid) defaults,pg_get_function_result(p.oid) result,p.proowner::text,p.proacl::text,p.prosecdef,p.provolatile,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') order by p.oid");
const definitions=()=>db.query("select oid::text,pg_get_functiondef(oid) definition from pg_proc where pronamespace in ('public'::regnamespace,'app_private'::regnamespace) order by oid");
const check=(name)=>report.checks.push({name,pass:true});
const deny=async(name,fn,expected=null)=>{const before=await snap();let error;try{await fn();}catch(e){error=e;}await reset();assert.ok(error,name+' unexpectedly admitted');if(expected)assert.equal(error.code,expected,name);assert.deepEqual(await snap(),before,name+' changed tables');assert.equal(await scalar('select count(*)::int from app_private.qa_core_provision_context'),0);report.checks.push({name,pass:true,sqlstate:error.code,zero_table_effects:true});};
const uid=id(78010);let memberships;
const source=async(role='service_role',claim='service_role',headers={})=>{await reset();await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({role:claim}),JSON.stringify(headers)]);if(role!=='postgres')await db.exec('set role '+role);};
const call=async({role='service_role',claim='service_role',headers={},key='ceo',user=uid,m=memberships}={})=>{await source(role,claim,headers);return scalar('select public.account_provision_link_internal($1,$2,$3)',[key,user,JSON.stringify(m)]);};
try{
 for(const n of ['20261008010000_qa_isolation_prerequisites.sql','20261008015000_qa_password_transport.sql','20261008018000_qa_rest_provenance.sql'])await db.exec(sql(n));
 // Exact reviewer prerequisite setup: no substitute Core/REST guard bodies.
 const adapter=fs.readFileSync(path.join(root,'tests/qa_isolation_enforcement.mjs'),'utf8');
 const setup=adapter.slice(adapter.indexOf(' // Empty dependency relations:'),adapter.indexOf(' for(const [cohort,run]'));
 await new (Object.getPrototypeOf(async function(){}).constructor)('db','fs',setup)(db,fs);
 await db.exec("update public.account_migration_users a set preferred_login=p.login_name from public.profiles p where p.id=a.migrated_user_id");
 if(!await scalar("select count(*)::int from public.organizational_units where name='مكتب الرئيس التنفيذي' and unit_type='office' and parent_id is null and active"))await db.query("insert into public.organizational_units(id,name,unit_type,parent_id) values($1,'مكتب الرئيس التنفيذي','office',null)",[id(99001)]);
 const m200=sql('20261008020000_qa_isolation_enforcement.sql');const barrierBefore=await snap();
 await assert.rejects(db.exec(m200),e=>e.code==='55000');await db.exec('rollback');assert.deepEqual(await snap(),barrierBefore);check('native200_barrier55000_unchanged');
 await db.exec(m200.split('-- BEGIN LOCAL VERIFIABLE SECTION\n')[1].split('-- END LOCAL VERIFIABLE SECTION')[0]);
 // PGlite PID=0 adaptation affects only unrelated disposable delete context.
 if(!nativeModule){assert.equal(await scalar('select pg_backend_pid()'),0);
 await db.exec('alter table app_private.qa_sql_operation_context drop constraint qa_sql_operation_context_backend_pid_check;alter table app_private.qa_sql_operation_context add check(backend_pid>=0)');}
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role');
 const a=(await db.query("select * from public.account_migration_users where canonical_key='ceo'")).rows[0];
 await db.query('insert into auth.users(id,email) values($1,$2)',[uid,a.internal_email]);
 // An approved unlinked existing profile must actually be synchronized, not
 // merely survive an INSERT suppressed before its ON CONFLICT UPDATE.
 await db.query('insert into public.profiles(id,login_name,full_name,must_change_password) values($1,$2,$3,false)',[uid,a.preferred_login,'pre-existing synthetic display']);
 memberships=await scalar("select app_private.account_expected_memberships('ceo')");
 await db.query("insert into public.notifications(id,user_id,event_type,title,target_login_name) values($1,$2,'fixture','ordinary','employee')",[id(5001),actors.employee]);
 const tables=['transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods','notifications','profiles','user_roles','user_memberships','account_migration_users','audit_log'];
 for(const t of tables)await db.exec(`create trigger zz_combined_reference before insert or update or delete on public.${t} for each row execute function app_private.qa_reference_guard_before_row()`);
 await db.exec('create trigger aa_combined_capture before delete on public.transactions for each row execute function app_private.qa_delete_capture();create trigger zz_combined_finalize after delete on public.transactions for each statement execute function app_private.qa_delete_finalize()');
 // RED always reproduces the real seam before applying the new fragment.
 const pre=await snap();let failure;try{await call();}catch(e){failure=e;}await reset();
 assert.equal(failure?.code,'42501');assert.match(failure.where,/qa_verified_write_actor/);assert.deepEqual(await snap(),pre);
 report.red={sqlstate:failure.code,where:failure.where,zero_table_effects:true};check('baseline_legitimate_link42501');
 if(red){await call();assert.fail('baseline unexpectedly passed');}
 const migration=sql('20261008018500_qa_core_rest_admission.sql');
 const beforeMeta=(await metadata()).rows,beforeDefs=(await definitions()).rows,beforeData=await snap();
 await db.exec(migration);assert.deepEqual((await metadata()).rows,beforeMeta);assert.deepEqual(await snap(),beforeData);
 const changed=(await definitions()).rows.filter((r,i)=>r.definition!==beforeDefs[i].definition);
 assert.equal(changed.length,1);assert.equal(changed[0].oid,await scalar("select 'app_private.qa_reference_guard_before_row()'::regprocedure::oid::text"));check('only_guard_body_changes_ABI_OID_ACL_owner_config_preserved');
 const firstDefs=(await definitions()).rows;await db.exec(migration);assert.deepEqual((await definitions()).rows,firstDefs);assert.deepEqual((await metadata()).rows,beforeMeta);assert.deepEqual(await snap(),beforeData);check('idempotent_no_data_or_attachment_changes');
 const baseGuard=sql('20261008018000_qa_rest_provenance.sql').split('CREATE FUNCTION app_private.qa_reference_guard_before_row()')[1].split('CREATE FUNCTION app_private.qa_delete_finalize()')[0];
 assert.ok(migration.includes(baseGuard.slice(baseGuard.indexOf(' SELECT * INTO a FROM app_private.qa_verified_write_actor();')).trim()));check('whole_normal_OLD_NEW_cohort_guard_retained');
 for(const role of ['anon','authenticated','service_role'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal(await scalar("select has_table_privilege($1,'app_private.qa_core_provision_context',$2)",[role,privilege]),false);
 check('private_context_no_caller_CRUD');
 await deny('raw_owner',()=>call({role:'postgres'}),'42501');
 await deny('wrong_claim',()=>call({claim:'authenticated'}),'42501');
 await deny('wrong_source_role',()=>call({role:'authenticated'}),'42501');
 await deny('actor_tag_is_not_Core_authority',()=>call({headers:{'x-qa-actor-user':actors.employee,'x-qa-actor-sid':id(1001)}}),'42501');
 await deny('unapproved_key',()=>call({key:'fixture_stranger',user:actors.stranger,m:[]}),'42501');
 await deny('mismatched_UID_email',()=>call({user:actors.employee}));
 await deny('mismatched_membership_unit',()=>call({m:memberships.map(x=>({...x,unit_id:f.unit.otherRoot}))}));
 await deny('mismatched_membership_role',()=>call({m:memberships.map(x=>({...x,membership_role:'manager'}))}));
 await deny('client_GUC_no_private_frame',async()=>{await source();await db.query("select set_config('qa.core_provision','true',false),set_config('qa.mode','core',false)");return db.query('insert into public.profiles(id,login_name,full_name,must_change_password) values($1,$2,$3,true)',[uid,a.preferred_login,a.display_name]);},'42501');
 // Exact creator: source pointer resolves to the unchanged trusted link function.
 assert.equal(await scalar("select count(*)::int from pg_proc where oid='public.account_provision_link_internal(text,uuid,jsonb)'::regprocedure and proowner='postgres'::regrole and prosecdef and position('insert into app_private.qa_core_provision_context' in prosrc)>0"),1);check('trusted_source_function_context_creator_verified');
 // Disposable adversarial BEFORE triggers corrupt a real frame/row, not a replacement guard.
 const perturb=async(name,body,table='profiles')=>{await reset();await db.exec(`create function app_private.core_adversary() returns trigger language plpgsql security definer set search_path='' as $$begin ${body};return NEW;end$$;create trigger aa_core_adversary before insert or update on public.${table} for each row execute function app_private.core_adversary()`);try{await deny(name,()=>call());}finally{await reset();await db.exec(`drop trigger aa_core_adversary on public.${table};drop function app_private.core_adversary()`);}};
 await perturb('frame_wrong_PID','update app_private.qa_core_provision_context set backend_pid=backend_pid+1');
 await perturb('frame_wrong_XID',"update app_private.qa_core_provision_context set sql_xid='1'::xid8");
 await perturb('frame_wrong_sourceOID',"update app_private.qa_core_provision_context set source_function='auth.uid()'::regprocedure");
 await perturb('frame_wrong_target_UID',`update app_private.qa_core_provision_context set target_user='${actors.employee}'`);
 await perturb('suppressed_existing_profile_effect_DENY','RETURN NULL');
 await perturb('profile_NEW_contact_email_drift',"NEW.contact_email:='unexpected@fixture.invalid'");
 await perturb('profile_NEW_default_timestamp_drift',"NEW.created_at:=clock_timestamp()+interval '1 second'");
 await perturb('role_NEW_default_timestamp_drift',"NEW.created_at:=clock_timestamp()+interval '1 second'",'user_roles');
 await perturb('membership_NEW_default_timestamp_drift',"NEW.created_at:=clock_timestamp()+interval '1 second'",'user_memberships');
 await perturb('profile_NEW_login_drift',"NEW.login_name:='unexpected'");
 await perturb('role_NEW_drift',"NEW.role_code:='employee'",'user_roles');
 await perturb('membership_NEW_unit_drift',`NEW.unit_id:='${f.unit.otherRoot}'`,'user_memberships');
 await perturb('registry_NEW_drift',"NEW.preferred_login:='changed'",'account_migration_users');
 // Observe each actual predicate-proved row shape during a full trusted link.
 await db.exec(`create table app_private.core_observed(table_name text,op text);create function app_private.core_observer() returns trigger language plpgsql security definer set search_path='' as $$begin if coalesce(app_private.qa_core_provision_row_allowed(TG_RELID,TG_OP,case when TG_OP='UPDATE' then to_jsonb(OLD) else null end,to_jsonb(NEW)),false) then insert into app_private.core_observed values(TG_TABLE_NAME,TG_OP);end if;return NEW;end$$`);
 for(const t of ['profiles','user_roles','user_memberships','account_migration_users'])await db.exec(`create trigger ab_core_observer before insert or update on public.${t} for each row execute function app_private.core_observer()`);
 const linkedBefore=await snap();const linked=await call();await reset();assert.equal(linked.status,'linked');
 const observed=(await db.query('select distinct table_name from app_private.core_observed order by 1')).rows.map(r=>r.table_name);assert.deepEqual(observed,['account_migration_users','profiles','user_memberships','user_roles']);check('full_link_all_four_actual_REST_row_shapes');
 const afterLink=await snap();for(const [table,rows] of Object.entries(linkedBefore))if(!['public.profiles','public.user_roles','public.user_memberships','public.account_migration_users','app_private.account_credential_state','app_private.core_observed'].includes(table))assert.deepEqual(afterLink[table],rows,'unrelated '+table);
 assert.deepEqual(afterLink['public.profiles'].filter(r=>r.row.id!==uid),linkedBefore['public.profiles'].filter(r=>r.row.id!==uid));assert.deepEqual(afterLink['public.user_roles'].filter(r=>r.row.user_id!==uid),linkedBefore['public.user_roles']);assert.deepEqual(afterLink['public.user_memberships'].filter(r=>r.row.user_id!==uid),linkedBefore['public.user_memberships']);assert.deepEqual(afterLink['public.account_migration_users'].filter(r=>r.row.canonical_key!=='ceo'),linkedBefore['public.account_migration_users'].filter(r=>r.row.canonical_key!=='ceo'));check('all_other_profiles_roles_memberships_original_login_Arabic_Faisal_flags_unchanged');
 assert.equal(await scalar('select count(*)::int from app_private.qa_core_provision_context'),0);check('success_context_cleanup');
 const replayBefore=await snap();assert.equal((await call()).status,'already_linked');await reset();assert.deepEqual(await snap(),replayBefore);check('full_link_replay_whole_snapshot_unchanged');
 await deny('no_frame_after_link',async()=>{await source();return db.query("update public.profiles set full_name='untrusted' where id=$1",[uid]);},'42501');
 // Normal actor path still admits ordinary and denies foreign OLD/NEW rows.
 const actor=async()=>{await reset();await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify({'x-qa-actor-user':actors.employee,'x-qa-actor-sid':id(1001)})]);await db.exec('set role service_role');};
 await actor();assert.equal((await db.query("update public.notifications set title='ordinary allowed' where id=$1 returning id",[id(5001)])).rows.length,1);await reset();check('normal_actor_path_positive');
 await actor();assert.equal((await db.query("update public.notifications set user_id=$1,target_login_name='manager' where id=$2 returning id",[actors.manager,id(5001)])).rows.length,1);await reset();check('normal_ordinary_to_ordinary_NEW_allowed');
 // A role change is not a cohort boundary. Explicit exact registry manifests
 // establish foreign QA and cross-run cases; ordinary manager stays ordinary.
 for(const [name,run] of [['assistant',id(78020)],['otherAssistant',id(78021)]]){
  const u=actors[name],a=(await db.query('select * from public.account_migration_users where migrated_user_id=$1',[u])).rows[0];
  await db.query("insert into app_private.qa_runs(run_id,phase,active,expires_at) values($1,'active',true,clock_timestamp()+interval '1 hour')",[run]);
  await db.query("insert into app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class,run_id,owned_creation_operation,owned_creation_receipt_id) values($1,$2,$3,'current_owned_QA',$4,$5,$6)",[u,a.canonical_key,a.login_username,run,id(78030+Number(u.slice(-12))),id(78040+Number(u.slice(-12)))]);
  await db.query('insert into app_private.qa_run_members(run_id,user_id,role_code,active) values($1,$2,$3,true)',[run,u,a.role_code]);
 }
 assert.equal(await scalar("select class from app_private.qa_identity_class($1)",[actors.manager]),'ORDINARY');
 assert.equal(await scalar("select class from app_private.qa_identity_class($1)",[actors.assistant]),'QA_ACTIVE');
 await deny('normal_foreignQA_NEW_denied',async()=>{await actor();return db.query("update public.notifications set user_id=$1,target_login_name='assistant' where id=$2",[actors.assistant,id(5001)]);},'42501');
 await source('service_role','service_role',{'x-qa-actor-user':actors.assistant,'x-qa-actor-sid':id(1003)});
 await db.query("insert into public.notifications(id,user_id,event_type,title,target_login_name) values($1,$2,'fixture','QA row','assistant')",[id(5002),actors.assistant]);await reset();
 await deny('explicit_cross_run_NEW_denied',async()=>{await source('service_role','service_role',{'x-qa-actor-user':actors.assistant,'x-qa-actor-sid':id(1003)});return db.query("update public.notifications set user_id=$1,target_login_name='otherAssistant' where id=$2",[actors.otherAssistant,id(5002)]);},'42501');
 // Remove disposable observers before the missing-predicate probe; otherwise
 // their direct function call raises 42883 before the actual guard runs.
 for(const t of ['profiles','user_roles','user_memberships','account_migration_users'])await db.exec(`drop trigger ab_core_observer on public.${t}`);
 // Predicate unavailable defaults to the entire normal guard, never allow-all.
 await db.exec('alter function app_private.qa_core_provision_row_allowed(oid,text,jsonb,jsonb) rename to core_temporarily_unavailable');
 await deny('unavailable_predicate_Core_denied',()=>call({key:'haif',user:uid}));
 await deny('unavailable_predicate_raw_write_denied',async()=>{await source();return db.query("update public.profiles set full_name='untrusted' where id=$1",[uid]);},'42501');
 await db.exec('alter function app_private.core_temporarily_unavailable(oid,text,jsonb,jsonb) rename to qa_core_provision_row_allowed');
 if(nativeModule){
  // The final effective guard is205, not185. Apply actual190/195 with the
  // original revision functions/attachments, then the non-overwriting composer.
  await db.exec('drop trigger zz_combined_finalize on public.transactions');
  for(const t of ['transaction_assignments','transaction_actions'])await db.exec(`create trigger aa_combined_capture before delete on public.${t} for each row execute function app_private.qa_delete_capture()`);
  for(const n of ['20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql','20261008020500_qa_password_frame_composition.sql'])await db.exec(sql(n));
  const m=(await metadata()).rows,d=await snap(),defs=(await definitions()).rows;
  await db.exec(sql('20261008020500_qa_password_frame_composition.sql'));assert.deepEqual((await metadata()).rows,m);assert.deepEqual((await definitions()).rows,defs);assert.deepEqual(await snap(),d);check('final205_idempotent_ABI_OID_ACL_owner_config_data_unchanged');
  const a2=(await db.query("select * from public.account_migration_users where canonical_key='haif'")).rows[0],u2=id(78011),ms=await scalar("select app_private.account_expected_memberships('haif')");await db.query('insert into auth.users(id,email) values($1,$2)',[u2,a2.internal_email]);
  const b=await snap();assert.equal((await call({key:'haif',user:u2,m:ms})).status,'linked');await reset();assert.equal(await scalar('select count(*)::int from app_private.qa_core_provision_context'),0);check('final205_native_fresh_Core_link');
  const once=await snap();assert.equal((await call({key:'haif',user:u2,m:ms})).status,'already_linked');await reset();assert.deepEqual(await snap(),once);check('final205_Core_duplicate_replay_no_changes');
  await actor();assert.equal((await db.query("update public.notifications set title='final guard ordinary allowed' where id=$1 returning id",[id(5001)])).rows.length,1);await reset();check('final205_normal_ordinary_positive');
  await deny('final205_foreignQA_NEW_DENY',async()=>{await actor();return db.query("update public.notifications set user_id=$1,target_login_name='assistant' where id=$2",[actors.assistant,id(5001)]);},'42501');
 }
 report.status='PASS_LOCAL_NON_ACTIVATING';
}catch(e){report.status=red?'RED_EXPECTED_FAILURE':'BLOCKED';report.failure={code:e.code||null,message:e.message,where:e.where||null};if(!red||e.code!=='42501')process.exitCode=1;else process.exitCode=1;}
finally{await db.close();report.check_count=report.checks.length;fs.writeFileSync(path.join(out,red?'RED.json':'GREEN.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
