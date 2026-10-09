// Offline guarded current-producer fixture; synthetic Auth/SIDs, NOT native acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
const out='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-typed-producer-reference-evidence';
fs.mkdirSync(out,{recursive:true});
const red=process.argv.includes('--red');
const report={fixture_only:true,native_acceptance:false,password_integrated_acceptance:false,native_calls:0,provider_calls:0,network_calls:0,git_calls:0,phase:red?'RED':'GREEN',checks:[],covered_producers:[],uncovered_producers:['password begin/finish continuation','dynamic supporting/source-origin schemas','actual Edge request handlers/native SDK'],status:'RUNNING'};
const f=await createTransactionFeedbackFixture();const {db,scalar,id,actors,dir,tx}=f;
const read=n=>fs.readFileSync(path.join(dir,n),'utf8');
const reset=()=>db.exec('reset role');
const snap=async()=>{await reset();const s={};for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth') order by 1,2")).rows)s[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(x) row from "${t.schemaname}"."${t.tablename}" x order by to_jsonb(x)::text`)).rows;return s;};
const meta=()=>db.query("select oid::text,proowner::text,proacl::text,prosecdef,provolatile,proconfig,pg_get_function_arguments(oid) args,pg_get_function_result(oid) result from pg_proc where pronamespace in ('public'::regnamespace,'app_private'::regnamespace) order by oid");
const defs=()=>db.query("select oid::text,pg_get_functiondef(oid) definition from pg_proc where pronamespace in ('public'::regnamespace,'app_private'::regnamespace) order by oid");
const security=()=>db.query("select c.oid::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attname,a.atttypid::text,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace in ('public'::regnamespace,'app_private'::regnamespace) and c.relkind='r' order by c.oid,a.attnum");
const actor=async(u=actors.employee,sid=id(1001))=>{await reset();await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify({'x-qa-actor-user':u,...(sid?{'x-qa-actor-sid':sid}:{})})]);await db.exec('set role service_role');};
const check=n=>report.checks.push({name:n,pass:true});
const deny=async(n,fn)=>{const before=await snap();let e;try{await fn();}catch(x){e=x;}await reset();assert.equal(e?.code,'42501',n+' must deny');assert.deepEqual(await snap(),before,n+' changed tables');report.checks.push({name:n,pass:true,sqlstate:e.code,zero_table_effects:true});};
const insert=async(table,row)=>{const cols=Object.keys(row);return db.query(`insert into public.${table}(${cols.join(',')}) values(${cols.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,cols.map(k=>row[k]&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));};
const edge=fs.readFileSync(path.join(dir,'../functions/transactions-api/index.ts'),'utf8');
const historyBody=edge.slice(edge.indexOf('async function history('),edge.indexOf('async function txRow(')).replace('txId:string,event:string,who:Who,detail:string,meta:any={} ','txId,event,who,detail,meta={} ').replace('txId:string,event:string,who:Who,detail:string,meta:any={}','txId,event,who,detail,meta={}');
const history=new Function('db',historyBody+';return history;')({from:table=>({insert:async row=>{try{await insert(table,row);return {error:null};}catch(error){return {error};}}})});
const who={user_id:actors.employee,login_name:'employee',display_name:'employee display',role:'employee'};
try{
 for(const n of ['20261008010000_qa_isolation_prerequisites.sql','20261008015000_qa_password_transport.sql','20261008018000_qa_rest_provenance.sql'])await db.exec(read(n));
 const adapter=fs.readFileSync(path.join(dir,'../../tests/qa_isolation_enforcement.mjs'),'utf8');const setup=adapter.slice(adapter.indexOf(' // Empty dependency relations:'),adapter.indexOf(' for(const [cohort,run]'));await new (Object.getPrototypeOf(async function(){}).constructor)('db','fs',setup)(db,fs);
 await db.exec('update public.account_migration_users a set preferred_login=p.login_name from public.profiles p where p.id=a.migrated_user_id');
 const m200=read('20261008020000_qa_isolation_enforcement.sql');const before=await snap();await assert.rejects(db.exec(m200),e=>e.code==='55000');await db.exec('rollback');assert.deepEqual(await snap(),before);check('activation_barrier_retained');
 await db.exec(m200.split('-- BEGIN LOCAL VERIFIABLE SECTION\n')[1].split('-- END LOCAL VERIFIABLE SECTION')[0]);await db.exec(read('20261008018500_qa_core_rest_admission.sql'));
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role');
 for(const t of ['audit_log','transaction_history','transaction_requests','transaction_routes','notifications'])await db.exec(`create trigger zz_typed_guard before insert or update or delete on public.${t} for each row execute function app_private.qa_reference_guard_before_row()`);
 // The first vertical slice is the actual current Edge history helper, SQL transport only.
 await deny('baseline_known_created_audit',async()=>{await actor();await insert('audit_log',{actor_id:who.user_id,event_type:'created',entity_type:'transaction',entity_id:tx,detail:'prose',meta:{actor_login:who.login_name,actor_name:who.display_name,actor_role:who.role}});});report.red={sqlstate:'42501',zero_table_effects:true};
 if(red){report.status='RED_EXPECTED_FAILURE';process.exitCode=1;}else{
 const migration=read('20261008019000_qa_typed_producer_references.sql');report.ddl_sha256=crypto.createHash('sha256').update(migration).digest('hex');const bm=(await meta()).rows,bd=(await defs()).rows,bs=(await security()).rows,data=await snap();await db.exec(migration);assert.deepEqual((await meta()).rows,bm);assert.deepEqual((await security()).rows,bs);assert.deepEqual(await snap(),data);const changed=(await defs()).rows.filter((r,i)=>r.definition!==bd[i].definition);assert.equal(changed.length,1);assert.equal(changed[0].oid,await scalar("select 'app_private.qa_row_references(oid,jsonb,oid[])'::regprocedure::oid::text"));check('one_body_only_ABI_OID_ACL_owner_defaults_columns_security_unchanged');const first=(await defs()).rows;await db.exec(migration);assert.deepEqual((await defs()).rows,first);assert.deepEqual(await snap(),data);check('idempotent_non_activating');
 await actor();await history(tx,'created',who,'prose with unrelated UUID '+actors.manager);await reset();report.covered_producers.push('current Edge history(created) actual helper -> history/audit guarded inserts');check('actual_Edge_history_created');
 await actor();await history(tx,'subject_changed',who,'text',{old_subject:actors.manager,new_subject:'text'});await reset();report.covered_producers.push('current Edge history(subject_changed)');check('prose_not_identity');
 await deny('unknown_extra_actionable',async()=>{await actor();await history(tx,'created',who,'text',{target_user_id:actors.manager});});
 await deny('unknown_event',async()=>{await actor();await history(tx,'invented_event',who,'text');});
 await deny('foreign_actor_login',async()=>{await actor();await insert('audit_log',{actor_id:actors.employee,event_type:'created',entity_type:'transaction',entity_id:tx,meta:{actor_login:'manager',actor_name:'text',actor_role:'employee'}});});
 await deny('foreign_target_alias',async()=>{await actor();await history(tx,'directive_employee',who,'text',{targets:['missing_alias'],unit:'display'});});
 await actor();await history(tx,'directive_employee',who,'text',{targets:['employee'],unit:'display'});await reset();report.covered_producers.push('current Edge history(directive_employee)');check('exact_login_targets');
 const qaRun=id(70001),qaTx=id(70002);
 await db.query("insert into app_private.qa_runs(run_id,phase,active,expires_at) values($1,'active',true,clock_timestamp()+interval '1 hour')",[qaRun]);
 // Fixture identity invariant: use this exact registry UUID's login_username,
 // not the profile login/preferred_login; never modify the registry or Guard.
 const managerRegistry=(await db.query('select login_username from public.account_migration_users where migrated_user_id=$1 and canonical_key=$2',[actors.manager,'fixture_manager'])).rows;
 assert.equal(managerRegistry.length,1,'QA manager fixture must resolve exactly one registry row');
 const managerManifest=(await db.query("insert into app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class,run_id,owned_creation_operation,owned_creation_receipt_id) values($1,'fixture_manager',$2,'current_owned_QA',$3,$4,$5) returning login_alias",[actors.manager,managerRegistry[0].login_username,qaRun,id(70003),id(70004)])).rows;
 assert.equal(managerManifest[0].login_alias,managerRegistry[0].login_username,'QA manifest alias must equal its registry login_username');
 await db.query("insert into app_private.qa_run_members(run_id,user_id,role_code,active) values($1,$2,'manager',true)",[qaRun,actors.manager]);
 await db.query("insert into public.transactions(id,number,title,created_by,responsible_user_id,responsible_login_name,responsible_name,responsible_unit_id,current_level) values($1,'QA-TYPED','fixture',$2,$2,'manager','display',$3,'manager')",[qaTx,actors.manager,f.unit.dept]);
 await db.query('insert into app_private.qa_transaction_manifest(transaction_id,run_id,owned_creation_operation) values($1,$2,$3)',[qaTx,qaRun,id(70005)]);
 await actor(actors.manager,id(1002));await history(qaTx,'directive_employee',{user_id:actors.manager,login_name:'manager',display_name:'display',role:'manager'},'text',{targets:['manager'],unit:'display'});await reset();check('same_QA_typed_producer_positive');
 await deny('foreign_QA_target_alias',async()=>{await actor();await history(tx,'directive_employee',who,'text',{targets:['manager'],unit:'display'});});
 await deny('foreign_QA_root',async()=>{await actor();await history(qaTx,'created',who,'text');});
 await deny('foreign_QA_canonical_key',async()=>{await actor();await insert('audit_log',{actor_id:actors.employee,event_type:'profile_name_changed',entity_type:'account',entity_id:'fixture_manager',meta:{name:'display',target_user_id:actors.manager}});});
 await actor();await insert('audit_log',{actor_id:actors.employee,event_type:'profile_name_changed',entity_type:'account',entity_id:'fixture_employee',meta:{name:'display',target_user_id:actors.employee}});await reset();report.covered_producers.push('SQL admin_set_account_name_current audit schema guarded row');check('canonical_key_profile_audit_positive');
 await deny('dynamic_supporting_unresolved',async()=>{await actor();await history(tx,'assistant_scope_route',who,'text',{responsible_targets:['employee'],supporting:[]});});
 await deny('missing_native_SID',async()=>{await actor(actors.employee,null);await history(tx,'created',who,'text');});
 // Normal notification PATCH remains the complete normal guard, not a narrowed permission path.
 await actor();const notification=(await insert('notifications',{user_id:actors.employee,target_login_name:'employee',event_type:'fixture',title:'ordinary'})).rows[0];
 // is_read=true means read: the current schema stores that state as read_at.
 const patchedNotification=(await db.query("update public.notifications set title='full PATCH',body='text',read_at=clock_timestamp() where id=$1 returning title,body,read_at,read_at is not null as marked_read",[notification.id])).rows[0];
 assert.equal(patchedNotification.title,'full PATCH');assert.equal(patchedNotification.body,'text');assert.equal(patchedNotification.marked_read,true);assert.notEqual(patchedNotification.read_at,null);
 await reset();check('normal_notifications_full_PATCH');
 await db.query('update public.profiles set must_change_password=true where id=$1',[actors.employee]);await deny('forced_normal_service_audit_denied',async()=>{await actor();await history(tx,'created',who,'text');});await db.query('update public.profiles set must_change_password=false where id=$1',[actors.employee]);
 await db.query('update app_private.account_credential_state set session_valid_after=clock_timestamp() where user_id=$1',[actors.employee]);await deny('stale_normal_service_audit_denied',async()=>{await actor();await history(tx,'created',who,'text');});check('readiness_not_weakened');
 report.status='PASS_LOCAL_SUBSET_NON_ACTIVATING';
 }
}catch(e){report.status='BLOCKED_FIRST_RESIDUAL_FAILURE';report.failure={code:e.code||null,message:e.message,where:e.where||null};process.exitCode=1;}
finally{await db.close();report.check_count=report.checks.length;fs.writeFileSync(path.join(out,red?'RED.json':'REPORT.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
