// Offline PostgreSQL mechanics ONLY; native transport/races/provider actions NOT RUN.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
const {db,scalar,id,actors}=await createTransactionFeedbackFixture();
let assertions=0; const eq=(a,b)=>{assert.deepEqual(a,b);assertions++};
const manifest=['qa_runs','qa_account_manifest','qa_run_members','qa_transaction_manifest'];
const migration=new URL('../supabase/migrations/20261008010000_qa_isolation_prerequisites.sql',import.meta.url);
const metadata=()=>db.query(`select p.oid,p.proname,p.proowner,p.proacl,p.provolatile,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') order by p.oid`);
const rows=async()=>{const ts=(await db.query(`select schemaname,tablename from pg_tables where schemaname in ('auth','public','app_private') order by 1,2`)).rows; const out={}; for(const t of ts) out[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(t) row from "${t.schemaname}"."${t.tablename}" t order by to_jsonb(t)::text`)).rows;return out};
const catalog=async()=>{
 const relations=(await db.query(`select c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') order by c.oid`)).rows;
 const policies=(await db.query(`select oid,polrelid,polname,polcmd,polpermissive,polroles,polqual::text,polwithcheck::text from pg_policy order by oid`)).rows;
 const triggers=(await db.query(`select oid,tgrelid,tgname,tgfoid,tgtype,tgenabled,tgisinternal,tgargs::text,tgqual::text from pg_trigger order by oid`)).rows;
 const columns=(await db.query(`select a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) default_expr from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','app_private','auth') and a.attnum>0 and not a.attisdropped order by a.attrelid,a.attnum`)).rows;
 return {relations,policies,triggers,columns};
};
try {
 const before=await rows(), funcs=(await metadata()).rows, cats=await catalog();
 if(fs.existsSync(migration)) await db.exec(fs.readFileSync(migration,'utf8'));
 eq((await db.query(`select tablename from pg_tables where schemaname='app_private' and tablename=any($1) order by tablename`,[manifest])).rows.map(x=>x.tablename),[...manifest].sort());
 for(const name of manifest) eq(await scalar(`select count(*)::int from app_private.${name}`),0);
 const after=await rows(); for(const [k,v] of Object.entries(before)){const a=after[k].map(x=>({row:Object.fromEntries(Object.entries(x.row).filter(([key])=>!['qa_control','dispatch_state','dispatch_token','dispatch_admitted_at','candidate_verified_session'].includes(key)))}));eq(a,v);}
 eq((await metadata()).rows.filter(x=>funcs.some(y=>y.oid===x.oid)),funcs);
 for(const role of ['anon','authenticated','service_role']) for(const table of [...manifest,'qa_sql_operation_context']) for(const priv of ['SELECT','INSERT','UPDATE','DELETE']) eq(await scalar(`select has_table_privilege($1,$2,$3)`,[role,'app_private.'+table,priv]),false);


 const catsAfter=await catalog();for(const key of ['relations','policies','triggers'])eq(catsAfter[key].filter(x=>cats[key].some(y=>y.oid===x.oid)),cats[key]);
 eq(catsAfter.columns.filter(x=>cats.columns.some(y=>y.attrelid===x.attrelid&&y.attnum===x.attnum)),cats.columns);

 const user=actors.employee, sid=id(1001), run=id(3001), run2=id(3002);
 const headers=async(u=user,s=sid,role='service_role',claim=role)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({role:claim,sub:u,session_id:s}),JSON.stringify({'x-qa-actor-user':u,'x-qa-actor-sid':s})]);await db.exec('set role '+role)};
 const probe=async(u=null,k=null,t=null)=>(await db.query('select * from public.qa_scope_probe_internal($1,$2,$3)',[u,k,t])).rows[0];
 await headers(); eq((await probe(actors.manager)).allowed,true);
 await headers('',sid);eq((await probe(actors.manager)).allowed,false);
 await headers(user,'bad');eq((await probe(actors.manager)).allowed,false);
 await headers(user,sid,'service_role','authenticated');eq((await probe(actors.manager)).allowed,false);
 await headers(user,sid,'authenticated');eq(await scalar('select actor_user from app_private.qa_verified_write_actor()').catch(e=>e.code),'42501');
 await db.exec('reset role'); await db.query(`insert into app_private.qa_runs(run_id,phase,active,expires_at) values($1,'active',true,clock_timestamp()+interval '1 hour'),($2,'active',true,clock_timestamp()+interval '1 hour')`,[run,run2]);
 const qa=[actors.manager,actors.assistant,actors.ceo];
 for(let i=0;i<qa.length;i++){await db.query(`insert into app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class,run_id,owned_creation_operation,owned_creation_receipt_id) values($1,$2,$3,'current_owned_QA',$4,$5,$6)`,[qa[i],['fixture_manager','fixture_assistant','fixture_ceo'][i],['fixture_manager','fixture_assistant','fixture_ceo'][i],i===2?run2:run,id(4000+i),id(4100+i)]);await db.query(`insert into app_private.qa_run_members values($1,$2,$3,true)`,[i===2?run2:run,qa[i],['manager','assistant','ceo'][i]])}
 await db.query(`insert into app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class) values($1,'fixture_secretary','fixture_secretary','legacy_protected_QA')`,[actors.secretary]);
 await headers();eq((await probe(qa[0])).allowed,false);eq((await probe(actors.secretary)).target_class,'legacy_protected_QA');
 await headers(qa[0],id(1002));eq((await probe(qa[1])).allowed,true);eq((await probe(qa[2])).allowed,false);eq((await probe(user)).allowed,false);eq((await probe(qa[1],'fixture_employee')).allowed,false);
 await db.exec('reset role'); await db.query(`update app_private.qa_runs set active=false,phase='halted' where run_id=$1`,[run]);
 await headers(qa[0],id(1002));eq((await probe(qa[1])).allowed,false);
 await db.exec('reset role');await db.query(`update app_private.qa_runs set active=true,phase='active' where run_id=$1`,[run]);
 await db.query(`update app_private.qa_account_manifest set tombstoned_at=clock_timestamp() where user_id=$1`,[qa[1]]);await headers(qa[0],id(1002));eq((await probe(qa[1])).allowed,false);
 await db.exec('reset role');await db.query(`update app_private.qa_account_manifest set tombstoned_at=null where user_id=$1`,[qa[1]]);


 const operation=id(5000), candidate=id(5001);
 const control={version:1,principal_class:'current_owned_QA',run_id:run,canonical_key:'fixture_manager',original_actor_user:qa[0],original_actor_session:id(1002),original_session_cutoff:null,original_session_not_after:null,candidate_handle:candidate,provider_project_ref:'movzojtnkkmdsjhmlgtq',provider_user_id:qa[0],provider_exact_email:'manager@fixture.invalid',admission_permission:'self_change',owned_creation_receipt_id:id(4100)};
 await db.exec('reset role');
 await db.query(`insert into app_private.account_password_operations(operation_id,actor_id,actor_session_id,target_id,kind,status,generation,source,qa_control,dispatch_state) values($1,$2,$3,$2,'change','pending',1,'verified_session',$4,'prepared')`,[operation,qa[0],id(1002),JSON.stringify(control)]);
 await db.query('update app_private.account_credential_state set generation=1 where user_id=$1',[qa[0]]);
 await headers(qa[0],id(1002));
 const dispatch=async(op=operation,g=1,c=candidate)=>(await db.query('select * from public.qa_password_dispatch_internal($1,$2,$3)',[op,g,c])).rows[0];
 eq(await dispatch(operation,1,id(5002)).catch(e=>e.code),'42501');
 const first=await dispatch();eq(first.dispatch_state,'admitted_new');eq(typeof first.dispatch_token,'string');
 const second=await dispatch();eq(second.dispatch_state,'admitted_observed');eq(second.dispatch_token,first.dispatch_token);
 eq(await dispatch(operation,2).catch(e=>e.code),'42501');
 await db.exec('reset role');await db.query(`update app_private.qa_runs set active=false,phase='halted' where run_id=$1`,[run]);
 await headers(qa[0],id(1002));eq((await dispatch()).dispatch_state,'admitted_observed');
 await db.exec('reset role');await db.query(`update app_private.account_password_operations set qa_control=qa_control||'{"password":true}'::jsonb where operation_id=$1`,[operation]).then(()=>eq(true,false)).catch(e=>eq(e.code,'23514'));
 await db.query(`update app_private.account_password_operations set candidate_verified_session=$2,dispatch_state='completed' where operation_id=$1`,[operation,id(5999)]).then(()=>eq(true,false)).catch(e=>eq(e.code,'23514'));
 await db.query(`update app_private.qa_runs set active=true,phase='active' where run_id=$1`,[run]);
 await db.query(`update app_private.account_password_operations set dispatch_state='uncertain' where operation_id=$1`,[operation]);await headers(qa[0],id(1002));eq((await dispatch()).dispatch_state,'uncertain');
 await db.exec('reset role');
 const funcs2=(await metadata()).rows;const newFuncs=funcs2.filter(x=>!funcs.some(y=>y.oid===x.oid));
 for(const f of newFuncs){eq(f.prosecdef,true);eq(f.proconfig,['search_path=""']);}
 eq(newFuncs.filter(f=>f.proname==='qa_scope_internal')[0].provolatile,'s');
 eq(newFuncs.filter(f=>f.proname==='qa_password_dispatch_internal')[0].provolatile,'v');

 const fnCatalog=(await db.query(`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,p.provolatile volatility,p.prosecdef security_definer,p.proconfig config,r.rolname owner,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where p.proname like 'qa_%' order by 1,2`)).rows;
 for(const f of fnCatalog) for(const role of ['anon','authenticated','service_role']) eq(await scalar('select has_function_privilege($1,$2,$3)',[role,`${f.schema}.${f.name}(${f.identity_args.replace(/\b[a-z_]+ (?=(uuid|text|timestamp|boolean|bigint|jsonb|oid))/g,'')})`,'EXECUTE']),role==='service_role'&&f.schema==='public');
 const expectDenied=async(f)=>{try{await f();eq('allowed','denied')}catch(e){eq(e.code,'42501')}};
 await db.exec(`create function public.fixture_verified_actor() returns uuid language sql volatile security definer set search_path='' as $$select actor_user from app_private.qa_verified_write_actor()$$;grant execute on function public.fixture_verified_actor() to authenticated,service_role;`);
 await headers(user,sid,'authenticated');eq(await scalar('select public.fixture_verified_actor()'),user);
 await db.exec('reset role');await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-qa-actor-user':'bad','x-qa-actor-sid':'bad'})]);await db.exec('set role authenticated');eq(await scalar('select public.fixture_verified_actor()'),user);
 await headers(user,id(1002));eq((await probe(actors.stranger)).allowed,false);await expectDenied(()=>scalar('select public.fixture_verified_actor()'));
 for(const h of ['{}','{"x-qa-actor-user":"bad","x-qa-actor-sid":"bad"}','[]','not-json']){await db.exec('reset role');await db.query("select set_config('request.headers',$1,false)",[h]);await db.exec('set role service_role');eq((await probe(user)).allowed,false);}
 await headers();const transport=(await db.query('select * from public.qa_transport_probe_internal($1)',[id(7001)])).rows[0];eq(transport.nonce,id(7001));eq(transport.parse_valid,true);eq(Object.keys(transport),['nonce','native_role','claim_role','actor_header_present','session_header_present','actor_header_matches_claim','session_header_matches_claim','parse_valid','schema_revision']);
 await db.exec('reset role');await db.query('update auth.sessions set not_after=clock_timestamp()-interval \'1 second\' where id=$1',[sid]);await headers();eq((await probe(user)).allowed,false);await expectDenied(()=>scalar('select public.fixture_verified_actor()'));
 await db.exec('reset role');await db.query('update auth.sessions set not_after=null where id=$1',[sid]);
 await db.query('delete from app_private.qa_run_members where user_id=$1',[qa[1]]);await headers(user,sid);eq((await probe(qa[1])).target_class,'QA_MEMBER_MISSING');
 await db.exec('reset role');await db.query(`insert into app_private.qa_run_members values($1,$2,'assistant',true)`,[run,qa[1]]);
 await db.query(`update app_private.qa_runs set expires_at=clock_timestamp()-interval '1 second' where run_id=$1`,[run]);await headers(qa[0],id(1002));eq((await probe(qa[1])).allowed,false);
 await db.exec('reset role');await db.query(`update app_private.qa_runs set expires_at=clock_timestamp()+interval '1 hour' where run_id=$1`,[run]);
 // A new prepared op is not admitted across a committed halt fence.
 const op2=id(5100), c2=id(5101);await db.query(`update app_private.account_password_operations set status='failed' where operation_id=$1`,[operation]);
 await db.query(`insert into app_private.account_password_operations(operation_id,actor_id,actor_session_id,target_id,kind,status,generation,source,qa_control,dispatch_state) values($1,$2,$3,$2,'change','pending',2,'verified_session',$4,'prepared')`,[op2,qa[0],id(1002),JSON.stringify({...control,candidate_handle:c2})]);
 await db.query(`update app_private.qa_runs set active=false,phase='halted' where run_id=$1`,[run]);await headers(qa[0],id(1002));await expectDenied(()=>dispatch(op2,2,c2));
 await db.exec('reset role');eq(await scalar('select dispatch_token is null from app_private.account_password_operations where operation_id=$1',[op2]),true);
 // NULL-control legacy behavior remains untouched; malformed typed new control cannot progress.
 for(const change of [{provider_project_ref:'wrong'},{original_actor_user:id(99999)},{candidate_handle:'malformed'},{run_id:null},{principal_class:'legacy_protected_QA'},{version:2}]) eq(await scalar(`select app_private.qa_password_control_shape($1,$2,$3,$2,'change','verified_session','prepared',null,null,null)`,[JSON.stringify({...control,...change}),qa[0],id(1002)]),false);
 eq(await scalar(`select app_private.qa_password_control_shape(null,null,null,$1,'reset','authorized_maintenance',null,null,null,null)`,[user]),true);
 // All manifest references are private/source-role only, never Auth/public row cascades.
 eq(await scalar(`select count(*)::int from pg_constraint x join pg_class t on t.oid=x.conrelid where t.relname=any($1) and x.contype='f' and x.confdeltype='c'`,[manifest]),0);

 await db.query(`insert into app_private.qa_runs(run_id,phase,active,expires_at) values($1,'active',true,'infinity')`,[id(9001)]).then(()=>eq('accepted','finite-required')).catch(e=>eq(e.code,'23514'));
 await db.query(`insert into app_private.qa_sql_operation_context(backend_pid,sql_xid,operation_id,table_oid,old_key,actor_uid,actor_sid,operation_mode,root_transaction_ids,parent_ids,old_references) values(123,pg_current_xact_id(),$1,'public.transactions'::regclass,'{"id":"bad"}',$2,$3,'ordinary_delete_hard',array[$4::uuid],'{}','{}')`,[id(9002),user,sid,id(201)]).then(()=>eq('accepted','typed-old-required')).catch(e=>eq(e.code,'23514'));


 eq(await scalar(`select app_private.qa_sql_old_key_valid('public.transactions'::regclass,$1)`,[JSON.stringify({id:id(201)})]),true);
 eq(await scalar(`select app_private.qa_sql_old_key_valid('public.transactions'::regclass,$1)`,[JSON.stringify({id:id(201),extra:id(202)})]),false);
 eq(await scalar(`select app_private.qa_sql_old_key_valid('public.transaction_assignment_users'::regclass,$1)`,[JSON.stringify({assignment_id:id(6001),user_id:user})]),true);


 // Same-statement expiry proves mutation uses wall clock, not statement start.
 await db.query(`update app_private.qa_runs set active=true,phase='active',expires_at=clock_timestamp()+interval '1 hour' where run_id=$1`,[run]);
 await db.exec(`create function public.fixture_expiring_actor() returns uuid language plpgsql volatile security definer set search_path='' as $$begin perform pg_sleep(0.06);return (select actor_user from app_private.qa_verified_write_actor());end$$;grant execute on function public.fixture_expiring_actor() to service_role;`);
 await db.query(`update app_private.qa_runs set expires_at=clock_timestamp()+interval '0.03 seconds' where run_id=$1`,[run]);
 await headers(qa[1],id(1003));await expectDenied(()=>scalar('select public.fixture_expiring_actor()'));
 await db.exec('reset role');
 // Native-SID shape in this fixture is synthetic, not provider verification.
 await db.exec(`create function public.fixture_reconcile(op uuid,g bigint) returns void language sql volatile security definer set search_path='' as $$select app_private.qa_operation_reconcile_locked(op,g)$$;grant execute on function public.fixture_reconcile(uuid,bigint) to service_role;`);
 const receipt=(await db.query('select clock_timestamp()::text value')).rows[0].value;
 await db.query(`update app_private.account_password_operations set dispatch_state='completed',status='completed',candidate_verified_session=$2,qa_control=qa_control||jsonb_build_object('provider_observed_at',$3::text,'candidate_verified_at',$3::text,'terminal_recorded_at',$3::text) where operation_id=$1`,[operation,id(8801),receipt]);
 await headers(qa[0],id(1002));await expectDenied(()=>db.query('select public.fixture_reconcile($1,$2)',[operation,1]));
 await db.exec('reset role');await db.query(`insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())`,[id(8801),qa[0]]);
 await headers(qa[0],id(1002));await db.query('select public.fixture_reconcile($1,$2)',[operation,1]);assertions++;eq((await dispatch()).dispatch_state,'completed');
 await db.exec('reset role');


 await db.query(`update app_private.qa_runs set active=true,phase='active',expires_at=clock_timestamp()+interval '1 hour' where run_id=$1`,[run]);
 await db.exec('begin');await db.query('delete from auth.sessions where user_id=$1',[qa[1]]);await db.query('delete from auth.users where id=$1',[qa[1]]);await headers(user,sid);eq((await probe(qa[1])).allowed,false);eq((await probe(qa[1])).target_class,'QA_TOMBSTONED');await db.exec('reset role;rollback');
 await db.query(`update app_private.qa_account_manifest set canonical_key='wrong-key' where user_id=$1`,[qa[1]]);await headers(qa[0],id(1002));eq((await probe(qa[1])).allowed,false);await db.exec('reset role');await db.query(`update app_private.qa_account_manifest set canonical_key='fixture_assistant' where user_id=$1`,[qa[1]]);

 if(process.env.QA_ABI_OUTPUT)fs.writeFileSync(process.env.QA_ABI_OUTPUT,JSON.stringify({target:'movzojtnkkmdsjhmlgtq',native_actions:0,functions:fnCatalog},null,2));


 console.log(JSON.stringify({status:'GREEN',assertions,native_actions:0,scope:'synthetic PGlite PostgreSQL mechanics, not native SID/transport/concurrency',manifests_empty:true}));
} finally {await db.close()}
