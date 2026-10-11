// TEST ONLY. Shared reporting/transport for final-native preservation cases.
// No SQL is executed on import. Only the serial native parent may invoke a group.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFinalComposedFixture} from './qa_final_composed_fixture.mjs';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const quote=value=>'"'+value.replaceAll('"','""')+'"';
export const immutable200='1b6a5813ccbd6fa7aac2f0525558853351dac75c0a8645dbfd4203c36ec8de72';
export const migrationNames=['20261008010000_qa_isolation_prerequisites.sql','20261008015000_qa_password_transport.sql','20261008018000_qa_rest_provenance.sql','20261008018500_qa_core_rest_admission.sql','20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql','20261008020000_qa_isolation_enforcement.sql','20261008020500_qa_password_frame_composition.sql','20261008021000_qa_owned_fence_composition.sql','20261008021100_qa_completed_cleanup_replay_read.sql'];
export async function verifyManifest(f){
 const {manifest,dir}=f;
 assert.equal(manifest.status,'COMPOSED_SETUP_PASS');
 const expected=[]; // blocked full200 and authorized local section are distinct entries
 expected.push(...migrationNames.slice(0,6).map(name=>({name,kind:'full',status:'applied'})),{name:migrationNames[6],kind:'full',status:'blocked_by_activation_guard'},{name:migrationNames[6],kind:'local_section',status:'applied_for_local_test'},...migrationNames.slice(7).map(name=>({name,kind:'full',status:'applied'})));
 assert.deepEqual(manifest.entries.map(({name,kind,status})=>({name,kind,status})),expected);
 assert.deepEqual(manifest.entries.map(x=>x.apply_order),expected.map((_,i)=>i+1));
 for(const entry of manifest.entries){assert.equal(entry.source_sha256,sha(fs.readFileSync(path.join(dir,entry.name))));assert.deepEqual(entry.target_identity,manifest.target_identity);}
 assert.equal(manifest.source_pins[migrationNames[6]],immutable200);
 const full=fs.readFileSync(path.join(dir,migrationNames[6]));
 const i=full.indexOf('-- BEGIN LOCAL VERIFIABLE SECTION'),j=full.indexOf('-- END LOCAL VERIFIABLE SECTION');assert(i>=0&&j>i);
 const section=full.subarray(full.indexOf(10,i)+1,j);
 const barrier=/DO \$blocked\$[\s\S]*?END \$blocked\$;/.exec(full.toString())?.[0];assert(barrier?.includes("USING ERRCODE='55000'"));
 for(const entry of manifest.entries.filter(x=>x.name===migrationNames[6])){assert.equal(entry.section_sha256,sha(section));assert.equal(entry.barrier_sha256,sha(barrier));}
 assert.equal(manifest.gatewayInitialization.roleAttributesAndMembershipsMutated,false);
 assert.equal(manifest.target_identity.database,process.env.QA_LOCAL_PG_DATABASE);assert.equal(manifest.target_identity.host,'127.0.0.1');assert.equal(manifest.target_identity.port,51771);
}
export function harness(f){
 const {db,scalar,id,actors}=f;
 const reset=()=>db.exec('RESET ROLE');
 const snapshot=async()=>{await reset();const out={};for(const t of(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','app_private','auth') ORDER BY 1,2")).rows)out[t.schemaname+'.'+t.tablename]=(await db.query(`SELECT to_jsonb(t) row FROM ${quote(t.schemaname)}.${quote(t.tablename)} t ORDER BY to_jsonb(t)::text`)).rows;return out;};
 const actor=async(u=actors.manager,sid=id(1000+Number(u.slice(-12))))=>{await reset();await db.query("SELECT set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({role:'service_role'}),JSON.stringify({'x-qa-actor-user':u,...(sid?{'x-qa-actor-sid':sid}:{})})]);await db.exec('SET ROLE service_role');};
 const catalog=async()=>{await reset();return (await db.query("SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl,'config',p.proconfig,'volatile',p.provolatile,'secdef',p.prosecdef,'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace)),'classes',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace)),'columns',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relnamespace IN ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace) AND a.attnum>0),'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.connamespace IN ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace)),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace IN ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace)),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p)) value")).rows[0].value;};
 const zero=async()=>{await reset();for(const t of ['qa_sql_operation_context','qa_password_frames','qa_core_provision_context','qa_owned_frames','qa_owned_native_frames'])assert.equal(await scalar('SELECT count(*)::int FROM app_private.'+t),0,t);};
 const closed=async()=>{await reset();await db.query('SELECT app_private.qa_owned_fence_catalog_closed(),app_private.qa_delete_catalog_closed()');};
 const insert=async(table,row)=>{const cols=Object.keys(row);const result=await db.query(`INSERT INTO public.${quote(table)}(${cols.map(quote).join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING to_jsonb(${quote(table)}.*) row`,cols.map(k=>row[k]&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));return {...result,rows:result.rows.map(x=>x.row)};};
 const deny=async(fn,code='42501')=>{const before=await snapshot();await db.exec('SAVEPOINT final_negative');let error;try{await fn();}catch(e){error=e;}await db.exec('ROLLBACK TO SAVEPOINT final_negative;RELEASE SAVEPOINT final_negative');assert.equal(error?.code,code,error?.message||'unexpectedly admitted');assert.deepEqual(await snapshot(),before,'denied call must have zero table effects');await closed();return {sqlstate:error.code,message:error.message,zero_table_effects:true};};
 return {reset,snapshot,actor,catalog,zero,closed,insert,deny};
}
export async function seedManagerOwnership(f,run,roots){
 const {db,scalar,id,actors}=f;await db.exec('RESET ROLE');
 const registry=(await db.query('SELECT canonical_key,login_username FROM public.account_migration_users WHERE migrated_user_id=$1 AND canonical_key=$2',[actors.manager,'fixture_manager'])).rows;
 assert.equal(registry.length,1);assert.equal(registry[0].login_username,'fixture_manager');
 await db.query("INSERT INTO app_private.qa_runs(run_id,phase,active,expires_at) VALUES($1,'active',true,clock_timestamp()+interval '1 hour')",[run]);
 await db.query("INSERT INTO app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class,run_id,owned_creation_operation,owned_creation_receipt_id) VALUES($1,$2,$3,'current_owned_QA',$4,$5,$6)",[actors.manager,registry[0].canonical_key,registry[0].login_username,run,id(9302),id(9303)]);
 await db.query("INSERT INTO app_private.qa_run_members(run_id,user_id,role_code,active) VALUES($1,$2,'manager',true)",[run,actors.manager]);
 for(let i=0;i<roots.length;i++)await db.query('INSERT INTO app_private.qa_transaction_manifest(transaction_id,run_id,owned_creation_operation) VALUES($1,$2,$3)',[roots[i],run,id(9390+i)]);
 assert.equal(await scalar('SELECT login_alias FROM app_private.qa_account_manifest WHERE user_id=$1',[actors.manager]),registry[0].login_username);
}
export async function runGroup({group,names,beforeGuards,run,retired=[]}){
 const out=process.env.QA_DELETE_EVIDENCE||process.env.QA_PW_REPORT_DIR;assert(out,'QA_DELETE_EVIDENCE or QA_PW_REPORT_DIR required');fs.mkdirSync(out,{recursive:true});
 const report={group,status:'RUNNING',expected:names.length,checkpoints:[],retired_installation_checks:retired,provider_calls:0,external_network_calls:0,production_actions:0,activation_ready:false};
 let f;const reportFile=path.join(out,group+'.json');const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
 const check=async(name,fn)=>{assert(names.includes(name)&&!report.checkpoints.some(x=>x.name===name),'unknown/duplicate checkpoint '+name);try{const detail=await fn();report.checkpoints.push({name,status:'Passed',pass:true,...(detail||{})});save();}catch(e){report.checkpoints.push({name,status:'Failed',pass:false,code:e.code,reason:e.message});throw e;}};
 try{
  assert.equal(process.env.QA_WSL_HANDOFF,'AFTER_14_PARENT_SERIAL');assert.match(process.env.QA_LOCAL_PG_DATABASE||'',/^qa_local_composed_[a-z0-9_]+$/);
  assert(!Object.keys(process.env).some(k=>/^(SUPABASE|SERVICE_ROLE|PGPASSWORD)/i.test(k)),'no inherited provider credentials');
  const manifestPath=process.env.QA_LOCAL_MANIFEST||path.join(out,group+'_MANIFEST.json');assert(!fs.existsSync(manifestPath),'fresh one-shot manifest required');process.env.QA_LOCAL_MANIFEST=manifestPath;report.manifest_path=manifestPath;
  f=await createFinalComposedFixture({beforeGuards});report.engine=f.db.connection;report.manifest=f.manifest;await verifyManifest(f);save();
  await run(f,harness(f),check,report);assert.deepEqual(report.checkpoints.map(x=>x.name),names);assert(report.checkpoints.every(x=>x.pass));await harness(f).zero();await harness(f).closed();report.status='PASS';report.native_local_catalog_acceptance=true;
 }catch(e){report.status='FAIL';report.failure={code:e.code,message:e.message,where:e.where,stack:e.stack};process.exitCode=1;if(!report.checkpoints.some(x=>!x.pass))report.setup_or_completion_failed=true;}
 finally{
  if(f){try{await f.db.exec('ROLLBACK;RESET ROLE');}catch(e){report.cleanup_error={message:e.message,code:e.code};report.status='FAIL';process.exitCode=1;}try{await f.db.close();}catch(e){report.cleanup_error={message:e.message,code:e.code};report.status='FAIL';process.exitCode=1;}}
  report.native_local_catalog_acceptance=report.status==='PASS';
  if(report.manifest_path&&fs.existsSync(report.manifest_path))report.manifest=JSON.parse(fs.readFileSync(report.manifest_path,'utf8'));
  report.passed=report.checkpoints.filter(x=>x.pass).length;report.failed=report.checkpoints.filter(x=>!x.pass).length+(report.setup_or_completion_failed||report.cleanup_error?1:0);report.skipped=0;report.xfail=0;
  report.unexecuted=names.filter(n=>!report.checkpoints.some(x=>x.name===n));report.counts={Passed:report.passed,Failed:report.failed,Skipped:0,XFail:0};save();console.log(JSON.stringify(report,null,2));
 }
 return report;
}
