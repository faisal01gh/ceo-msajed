// UNEXECUTED OWNED SYNTHETIC PGLITE SOURCE HARNESS. No native transport or process creation.
// Parent must supply an already connected, separately authorized disposable EMPTY
// native database client. Never use production or an identity/business database.
// All generated fixture DDL/DML is rolled back. No install or native command here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalShape,buildShape,sha} from './shape.mjs';
import {repoRoot as root,packageRoot} from '../config.mjs';
const native=packageRoot+'/fixture/frozen',pins=[{"file":"BEFORE_NATIVE_app_private_account_permission_effective.sql","sha256":"9ceed04a16e31ec16e224134bebdf4fa5515394aefc8c7bfc1d6df7881385175","bytes":837},{"file":"BEFORE_NATIVE_app_private_list_transactions_current.sql","sha256":"2f847228d9386770dbab25b1074a69877ab9f77b0c908bba0c4ff10279e5b9d9","bytes":1552},{"file":"BEFORE_NATIVE_app_private_transaction_feedback_flags.sql","sha256":"a35f97c40d3d358c6ba3bdb2121750275a417d1f7e02409ae0f78988630812a5","bytes":11280},{"file":"BEFORE_NATIVE_list_my_transactions.sql","sha256":"9946a90d00cb0e4a1d67dd321293fad9b371d1d257b2e60456dd33554873c973","bytes":716},{"file":"BEFORE_NATIVE_public_list_transactions_internal.sql","sha256":"d059bba046f481dd55bfff5b9d7800a4d426a7c14b7e1faccf42fc537afcb1b8","bytes":9437},{"file":"BEFORE_NATIVE_public_user_context_internal.sql","sha256":"a393c2a67e78b7217f95de17da611b41b63a28684ae3e75b55e26a1c12d00389","bytes":1501}];
export async function runFixture(client, candidate=null){
 const db={query:(sql,args)=>client.query(sql,args),exec:sql=>client.exec(sql)};
 const id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const roles=['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'];
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const claims=async n=>db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id(n),session_id:id(1000+n),role:'authenticated'})]);
 for(const pin of pins)assert.equal(sha(fs.readFileSync(native+'/'+pin.file)),pin.sha256,'frozen source pin '+pin.file);
 assert.equal(Number(await scalar("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') and c.relkind in ('r','p')")),0,'EMPTY disposable fixture database required');
 for(const name of ['anon','authenticated','service_role'])assert.equal(Number(await scalar('select count(*) from pg_roles where rolname=$1',[name])),0,'fresh disposable cluster roles required');
 const result={kind:'SYNTHETIC_PGLITE_SOURCE_OFFLINE',sourcePins:pins,executed:true,loadAcceptance:'FAILED',samples:[],regressionRed:false};
 await db.exec('begin');
 try {
 await buildShape(db,canonicalShape(root));
 for(const pin of pins.filter(p=>p.file.endsWith('.sql')))await db.exec(fs.readFileSync(native+'/'+pin.file,'utf8'));
 const current553=fs.readFileSync(root+'/supabase/migrations/20261013190200_list_requester_context.sql','utf8');
 assert.equal(sha(current553),'553cd6dcc1ed5e0a76feb33f8e1c6b5ed8f488f8156e22e0aff2553373c67c4c');
 await db.exec(current553);
 // Generated catalog/grants are fixture inputs, never copied identities or business rows.
 for(const role of roles)await db.query('insert into public.roles(code,name_ar) values($1,$1)',[role]);
 const permissions=['transactions.create','transactions.view_all','transactions.act_all','transactions.close','transactions.assign_sector','transactions.assign_cross_sector','transactions.transfer_assistant','transactions.reply_raise','profiles.edit_email'];
 for(const permission of permissions)await db.query('insert into public.permissions(code,name_ar) values($1,$1)',[permission]);
 for(const role of roles)for(const permission of ['transactions.create',...(role.startsWith('ceo')?['transactions.view_all','transactions.act_all']:[])])await db.query('insert into public.role_permissions values($1,$2)',[role,permission]);
 await db.query("insert into public.organizational_units(id,name,unit_type,parent_id) values($1,'Synthetic sector','sector',null),($2,'Synthetic department','department',$1),($3,'Other sector','sector',null),($4,'Other department','department',$3)",[id(201),id(202),id(203),id(204)]);
 for(let n=1;n<=80;n++){
  const role=roles[(n-1)%7],login=`synthetic_${n}`,org=n%2?'Synthetic sector':'Other sector',dept=n%2?'Synthetic department':'Other department';
  await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),login+'@fixture.invalid']);
  await db.query('insert into public.profiles(id,login_name,full_name,must_change_password) values($1,$2,$3,false)',[id(n),login,`Synthetic staff ${n}`]);
  await db.query('insert into public.user_roles(user_id,role_code,is_primary) values($1,$2,true)',[id(n),role]);
  await db.query('insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,$3,true)',[id(n),id((role==='assistant'||role==='assistant_secretary')?(n%2?201:203):(n%2?202:204)),role==='assistant'?'assistant':role==='manager'?'manager':role==='assistant_secretary'?'office':'member']);
  await db.query('insert into public.account_migration_users(canonical_key,preferred_login,display_name,role_code,org_name,dept_names,internal_email,migrated_user_id,must_change_password,login_username) values($1,$1,$2,$3,$4,$5,$6,$7,false,$1)',[login,`Synthetic staff ${n}`,role,org,[dept],login+'@fixture.invalid',id(n)]);
  await db.query('insert into app_private.account_credential_state(user_id) values($1)',[id(n)]);
  await db.query("insert into auth.sessions(id,user_id,created_at) values($1,$2,now()-interval '1 minute')",[id(1000+n),id(n)]);
 }
 for(let n=1;n<=120;n++){
  const actor=(n-1)%80+1,status=n%9===0?'closed':n%11===0?'cancelled':'open';
  await db.query(`insert into public.transactions(id,number,title,subject,created_by,created_by_name,responsible_user_id,responsible_login_name,responsible_name,responsible_unit_id,current_level,status,closed_at,created_at,due_at,workflow_started,activity_revision)
    values($1,$2,$3,'Synthetic only',$4,$5,$4,$6,$5,$7,$8,$9,case when $9='closed' then timestamptz '2026-10-12' end,timestamptz '2026-10-01'+($10%3)*interval '1 day',timestamptz '2026-10-03',true,2)`,[id(10000+n),`SYN-${String(n).padStart(4,'0')}`,n%2?'Synthetic alpha':'Synthetic beta',id(actor),`Synthetic staff ${actor}`,`synthetic_${actor}`,id(n%2?202:204),n%3?'manager':'assistant',status,n]);
  await db.query('insert into public.transaction_periods(transaction_id,cycle_no,started_at) values($1,1,$2)',[id(10000+n),'2026-10-01T00:00:00Z']);
  const aid=id(20000+n);
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,directive,status,visibility_scope) values($1,$2,$3,$4,'Synthetic assignment','active',$5)",[aid,id(10000+n),id(n%2?202:204),n%5?'responsible':'direct',n%10?'manager_assistant':'assignee']);
  await db.query("insert into public.transaction_assignment_targets(assignment_id,user_id,login_name,display_name) values($1,$2,$3,$4)",[aid,id(actor),`synthetic_${actor}`,`Synthetic staff ${actor}`]);
  for(let j=1;j<=24;j++)await db.query("insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_login_name,to_user_id,to_login_name,status,created_at) values($1,$2,$3,$4,$5,$6,$7,'completed',timestamptz '2026-10-02'+($8%4)*interval '1 hour')",[id(30000+n*30+j),id(10000+n),j%4?'raise':'ceo_view',id(actor),`synthetic_${actor}`,id(j%3===0?4:actor),`synthetic_${j%3===0?4:actor}`,j]);
  if(n%2===0)await db.query('insert into app_private.transaction_read_state(transaction_id,user_id,seen_revision) values($1,$2,$3)',[id(10000+n),id(5),n%4?1:2]);
 }
 await db.exec("update public.transactions set last_activity_at='2026-10-03',updated_at='2026-10-03'");
 for(let n=1;n<=80;n++)if(n!==5)for(let t=1;t<=6;t++)await db.query('insert into app_private.transaction_read_state(transaction_id,user_id,seen_revision) values($1,$2,1)',[id(10000+t),id(n)]);
 for(let n=1;n<=800;n++)await db.query("insert into app_private.account_password_operations(operation_id,actor_id,actor_session_id,target_id,kind,status,generation,source) values($1,$2,$3,$4,'reset','completed',$5,'verified_session')",[id(100000+n),id((n%80)+1),id(1000+(n%80)+1),id(((n+1)%80)+1),n]);
 await db.exec('analyze');

 if(candidate)await db.exec(candidate);
 await claims(5);
 await db.exec("set local track_functions='all'");
 assert.equal(await scalar('show track_functions'),'all');
 const counts=async()=>Object.fromEntries((await db.query("select n.nspname||'.'||p.proname as name,coalesce(s.calls,0)::bigint as calls from pg_proc p join pg_namespace n on n.oid=p.pronamespace left join pg_stat_xact_user_functions s on s.funcid=p.oid where n.nspname||'.'||p.proname=any($1::text[])",[['app_private.transaction_feedback_flags','app_private.transaction_feedback_flags_with_context','public.user_context_internal','app_private.account_permission_effective','app_private.account_session_valid']])).rows.map(r=>[r.name,Number(r.calls)]));
 const snapshots=[];
 for(let i=0;i<3;i++){
  const before=await counts();
  await db.exec('set local role authenticated');
  let payload;try{payload=await scalar('select public.list_my_transactions()');}finally{await db.exec('reset role');}
  const after=await counts(),delta=Object.fromEntries(Object.entries(after).map(([k,v])=>[k,v-before[k]]));
  result.samples.push({repetition:i+1,delta,payload});
  assert.equal(delta['app_private.transaction_feedback_flags_with_context'],candidate.includes('feedback_actor as materialized')?0:120,'selected helper counters match installed list');
  snapshots.push(payload);
 }
 assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
 result.counterCapabilityVerified=true;
 // This fixture has live assignment recipients, so no recipient-context scans.
 // Total counters are genuine pg_stat_xact_user_functions deltas, never edits to functions.
 result.regressionViolations=result.samples.flatMap(s=>[
  ...(s.delta['public.user_context_internal']>8?[{repetition:s.repetition,function:'public.user_context_internal',maximum:8,actual:s.delta['public.user_context_internal']}]:[]),
  ...(s.delta['app_private.account_permission_effective']>2?[{repetition:s.repetition,function:'app_private.account_permission_effective',maximum:2,actual:s.delta['app_private.account_permission_effective']}]:[])
 ]);
 result.regressionRed=result.regressionViolations.length>0;
 result.exitCode=result.regressionRed?1:0;
 result.classification=result.regressionRed?'GENUINE_CALL_COUNT_REGRESSION_RED':candidate?'CALL_COUNT_GREEN':'UNEXPECTED_ORIGINAL_PASS';
 const cases=[];
 const run=async(n,sql,args=[])=>{await claims(n);await db.exec('savepoint semantic_call');await db.exec('set role authenticated');try{const value=await scalar(sql,args);await db.exec('reset role');await db.exec('release savepoint semantic_call');return value;}catch(e){await db.exec('rollback to savepoint semantic_call');await db.exec('release savepoint semantic_call');throw e;}};
 const add=async(name,n,sql,args=[])=>{try{const data=await run(n,sql,args);cases.push({name,sha256:sha(JSON.stringify(data)),data});return data;}catch(e){if(!name.startsWith('active_')&&!name.startsWith('must_change_password_'))throw e;cases.push({name,sqlstate:e.code});return {sqlstate:e.code};}};
 for(let n=1;n<=7;n++)for(const tab of ['all','incoming','shared','secretary_queue','scope','ceo','ceo_view','closed'])await add(roles[n-1]+'_'+tab,n,'select public.list_my_transactions(p_tab=>$1)',[tab]);
 const first=await add('ceo_page1',5,'select public.list_my_transactions()');assert.equal(first.page_size,50);assert.equal(first.rows.length,50);
 const second=await add('ceo_page2',5,'select public.list_my_transactions(p_page=>2)');assert(!second.rows.some(row=>first.rows.some(r=>r.id===row.id)),'tied pagination cannot duplicate rows');
 const capped=await add('page_cap',5,'select public.list_my_transactions(p_page_size=>999)');assert.equal(capped.page_size,100);
 for(const [name,sql] of Object.entries({search:"select public.list_my_transactions(p_search=>'alpha')",filter:"select public.list_my_transactions(p_status=>'open',p_priority=>'عادي',p_origin=>'new',p_department=>'Synthetic department')",employee:"select public.list_my_transactions(p_employee=>'synthetic_1')",dates:"select public.list_my_transactions(p_date_from=>'2026-10-01',p_date_to=>'2026-10-02',p_late_only=>true)"}))await add(name,5,sql);
 assert(first.rows.every(r=>!r.actions&&!r.history&&!r.routes&&!r.requests),'no full detail payload in list');
 assert(capped.rows.some(r=>r.read_state==='read')&&capped.rows.some(r=>r.read_state==='updated')&&capped.rows.some(r=>r.read_state==='unread'),'three read states');
 for(let n=1;n<=7;n++)for(const fn of ['transaction_directory_my','my_permissions','my_profile'])await add(roles[n-1]+'_'+fn,n,`select public.${fn}()`);
 const employeeRls=await add('employee_direct_rls',1,'select coalesce(jsonb_agg(id order by id),\'[]\'::jsonb) from public.transactions');
 const executiveRls=await add('ceo_direct_rls',5,'select coalesce(jsonb_agg(id order by id),\'[]\'::jsonb) from public.transactions');
 assert(employeeRls.length<executiveRls.length,'direct reads retain source RLS scope');
 await db.query("insert into public.account_permission_overrides(canonical_key,permission_code,effect) values('synthetic_5','transactions.view_all','deny')");
 await add('account_override_deny',5,'select public.list_my_transactions()');
 await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'transactions.view_all','allow')",[id(5)]);
 const override=await add('user_override_allow',5,'select public.list_my_transactions()');assert.equal(override.total,first.total);
 for(const gate of ['active','must_change_password']){
  await db.query(`update public.profiles set ${gate}=$1 where id=$2`,[gate!=='active',id(8)]);
  for(const fn of ['list_my_transactions','transaction_directory_my','my_permissions','my_profile']){const result=await add(gate+'_'+fn,8,`select public.${fn}()`);if(fn==='my_permissions')assert.deepEqual(result,[]);else if(fn==='my_profile'&&gate==='must_change_password')assert.deepEqual(result,{ok:true,user_id:id(8),must_change_password:true,can_edit_email:false});else assert.equal(result.sqlstate,'42501');}
  await db.query(`update public.profiles set ${gate}=$1 where id=$2`,[gate==='active',id(8)]);
 }

 result.cases=cases;result.caseCount=cases.length;
 return result;
 }catch(error){result.classification='HARNESS_OR_SEMANTICS_FAILURE_NOT_RED';result.exitCode=2;result.error={message:error.message,code:error.code||null,stack:error.stack};return result;}
 finally{await db.exec('rollback');}
}
