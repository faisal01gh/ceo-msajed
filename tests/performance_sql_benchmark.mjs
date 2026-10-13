// LOCAL SYNTHETIC ONLY. Current source read functions are executed intact in PGlite.
// Run using node --permission --allow-fs-read=<repo>,<cached-PGlite> --allow-fs-write=<artifacts>.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {canonicalShape,buildShape,sha} from './performance_backend_sql_shape.mjs';
const root=path.resolve(import.meta.dirname,'..');
const out=process.argv[2];assert(out,'artifact directory required');
const phase=process.argv[3]||'before';assert(['before','after','red'].includes(phase));
const modulePath='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/release-performance-tools-20261013/node_modules/@electric-sql/pglite/dist/index.js';
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite(),shape=canonicalShape(root),id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const roles=['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'];
const stats=values=>{const a=[...values].sort((x,y)=>x-y),q=p=>a[Math.ceil(a.length*p)-1];return {count:a.length,min:a[0],avg:a.reduce((x,y)=>x+y,0)/a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1)};};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const claims=async n=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),session_id:id(1000+n),role:'authenticated'})]);
const networkDenied=typeof Deno!=='undefined'?(await Deno.permissions.query({name:'net'})).state==='denied':process.permission?.has('net')===false;
const execContext={kind:'LOCAL_SYNTHETIC_PGLITE_CANONICAL_READ_FUNCTIONS',staff:80,transactions:120,routeRows:2880,samplesPerPath:30,networkDenied,runtime:typeof Deno!=='undefined'?Deno.version:process.version,sourceManifest:shape.manifest,functionManifest:[...shape.wanted].map(name=>({name,file:shape.functions.get(name).file,sha256:sha(shape.functions.get(name).sql)})),harnessSha256:sha(fs.readFileSync(import.meta.filename)),shapeHarnessSha256:sha(fs.readFileSync(new URL('./performance_backend_sql_shape.mjs',import.meta.url)))};
try{
 assert(execContext.networkDenied,'Node permission mode must deny network');
 await buildShape(db,shape);
 for(const fn of ['public.list_transactions_internal','public.user_context_internal','app_private.transaction_feedback_flags','app_private.account_permission_effective'])assert.equal(await scalar("select bool_or(has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=$1",[fn]),false,'private read boundary '+fn);
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
 const indexes=(await db.query("select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','app_private') order by indexname")).rows;
 const baselineIndexes=indexes.filter(r=>['account_password_operations','transaction_read_state','transaction_routes'].includes(r.tablename));
 if(phase==='after')for(const name of ['20261013190000_read_performance.sql','20261013190100_fk_indexes.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
 const indexQueries={latest_route:`select * from public.transaction_routes where transaction_id='${id(10001)}' and route_type<>'ceo_view' and status in ('completed','accepted') order by created_at desc,id desc limit 1`,actor_fk:`select 1 from app_private.account_password_operations where actor_id='${id(1)}'`,read_state_fk:`select 1 from app_private.transaction_read_state where user_id='${id(1)}'`};
 const plans={};
 for(const [name,query] of Object.entries(indexQueries))plans[name]=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+query)).rows[0]['QUERY PLAN'];
 if(phase==='red'||phase==='after')assert(JSON.stringify(plans.latest_route).includes('idx_routes_latest_custody_read'),'latest custody read must use proposal index, avoiding per-row sort');
 const cases=[];
 const run=async(n,sql,args=[])=>{await claims(n);await db.exec('set role authenticated');try{return await scalar(sql,args);}finally{await db.exec('reset role');}};
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
 const metrics={};
 if(phase==='after'){const before=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));assert.deepEqual(cases,before,'all role/filter/pagination/count/read-state/override/readiness results identical');}
 const paths={list:'select public.list_my_transactions()',tab:"select public.list_my_transactions(p_tab=>'incoming')",pagination:'select public.list_my_transactions(p_page=>2)',search:"select public.list_my_transactions(p_search=>'alpha')",filter:"select public.list_my_transactions(p_status=>'open',p_origin=>'new')",directory:'select public.transaction_directory_my()',permissions:'select public.my_permissions()',profile:'select public.my_profile()',details_flags:`select app_private.transaction_feedback_flags('${id(5)}','${id(10001)}')`,...indexQueries};
 await claims(5);
 for(const [name,sql] of Object.entries(paths)){
  if(name!=='details_flags'&&!(name in indexQueries))await db.exec('set role authenticated');
  const samples=[];
  for(let i=0;i<30;i++){const start=performance.now(),result=await db.query(sql),data=name in indexQueries?result.rows:Object.values(result.rows[0])[0];samples.push({elapsedMs:performance.now()-start,payloadBytes:Buffer.byteLength(JSON.stringify(data))});}
  await db.exec('reset role');metrics[name]={elapsedMs:stats(samples.map(x=>x.elapsedMs)),payloadBytes:stats(samples.map(x=>x.payloadBytes)),topLevelSqlStatementsPerSample:1,nestedSqlStatementCount:'UNMEASURED',samples};
 }
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'sql-metrics.json'),JSON.stringify({...execContext,phase,baselineIndexes,plans,metrics,cases:cases.map(({data,...r})=>r),caseCount:cases.length,semanticResultsSha256:sha(JSON.stringify(cases)),limitations:['Synthetic role grants are test inputs; no real registry replay.','PGlite query total includes JS/WASM boundary; not live server/network latency.','Details flags measured separately; Edge details and local mutation have separate transport fixtures.','Auth JWT GUC is synthetic transport identity; source session/readiness and permissions functions are intact.']},null,2));
 fs.writeFileSync(path.join(out,'sql-equivalence.json'),JSON.stringify(cases,null,2));
 console.log(JSON.stringify({phase,caseCount:cases.length,paths:Object.keys(metrics).length,samplesPerPath:30,artifact:path.join(out,'sql-metrics.json')}));
}catch(e){console.error(JSON.stringify({failure:e.message,code:e.code||null}));process.exitCode=1;}finally{await db.close();}
