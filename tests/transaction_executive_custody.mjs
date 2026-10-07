// Network-free actual PostgreSQL fixture + extracted actual Edge producer/predicates/UI tabs.
// This is NOT native Auth/browser/deployed E2E or a complete historical migration replay.
// Run: node tests/transaction_executive_custody.mjs [--baseline] [--slice=handoff]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createTransactionFeedbackFixture} from './transaction_feedback_sql_fixture.mjs';
// Fixture-only extension: run the unchanged legacy assertions against this forward
// function. The old unit-addressed CEO test lacked the active membership required
// for ANY unit recipient; supply that one prerequisite, not blanket executive custody.
if(process.argv.includes('--existing-regressions')){
 const fixtureUrl=new URL('./transaction_feedback_sql_fixture.mjs',import.meta.url).href;
 const loader=`export async function load(url,context,next){const result=await next(url,context);if(url!==${JSON.stringify(fixtureUrl)})return result;let source=String(result.source).replace('export async function createTransactionFeedbackFixture(','async function baseFixture(');source+=\`\nexport async function createTransactionFeedbackFixture(options={}){const f=await baseFixture(options);if(options.applyFoundation===false)return f;await f.db.exec(fs.readFileSync(path.join(f.dir,'20261007190000_transaction_executive_custody.sql'),'utf8'));const originalQuery=f.db.query.bind(f.db);f.db.query=async(sql,args=[])=>{const result=await originalQuery(sql,args);if(sql.includes('insert into public.organizational_units')&&sql.includes('fixture executive office')&&args[0]===f.id(105)){await originalQuery(\"insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,'member',false)\",[f.actors.ceo,f.id(105)]);}return result;};return f;}\`;return {...result,source};}`;
 const loaderUrl='data:text/javascript,'+encodeURIComponent(loader);
 const registerUrl='data:text/javascript,'+encodeURIComponent(`import {register} from 'node:module';register(${JSON.stringify(loaderUrl)},${JSON.stringify(import.meta.url)});`);
 let failed=0;
 for(const filename of ['transaction_feedback_sql.mjs','transaction_assistant_reply_sql.mjs','transaction_assistant_reply_regressions.mjs','transaction_feedback_cross_layer.mjs']){
  const result=spawnSync(process.execPath,['--import',registerUrl,path.join(import.meta.dirname,filename)],{encoding:'utf8',timeout:180000});
  console.log(`FORWARD REGRESSION ${filename} (actual unchanged assertions; fixture CEO unit membership prerequisite only)`);process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.status!==0){failed++;console.error(result.error||`child exit ${result.status}`);}
 }
 console.log(JSON.stringify({forwardRegressionFiles:4,failedFiles:failed,fixtureExtension:'active CEO member of old explicitly addressed fixture executive office unit',network:'none'}));process.exit(failed?1:0);
}
const baseline=process.argv.includes('--baseline');
const selected=process.argv.find(x=>x.startsWith('--slice='))?.slice(8);
const source=fs.readFileSync(new URL('../supabase/functions/transactions-api/index.ts',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function chunk(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a,`actual source seam ${start}`);return text.slice(a,b);}
const fixture=await createTransactionFeedbackFixture();
const {db,scalar,id,actors,unit,claims,dir}=fixture;
const failures=[];let passed=0,checks=0,originalRed=0;
function check(label,actual,expected,{original=false}={}){
 checks++;try{assert.deepEqual(actual,expected,label);}catch(e){failures.push({label,actual,expected});if(original)originalRed++;}
}
async function test(slice,name,fn){if(selected&&selected!==slice)return;const start=failures.length;await db.exec('begin');try{await fn();if(failures.length===start){console.log(`PASS ${++passed} [${slice}] ${name}`);}else console.error(`FAIL [${slice}] ${name}: ${failures.length-start} assertions`);}finally{await db.exec('rollback');}}
const flags=(user,tx)=>scalar('select public.transaction_feedback_flags_internal($1,$2)',[user,tx]);
async function list(user,tab){await claims(user);await db.exec('set local role authenticated');try{return await scalar('select public.list_my_transactions($1)',[tab]);}finally{await db.exec('reset role');}}
async function tx(n,{owner=actors.employee,level='ceo',started=true,status='open'}={}){
 const tid=id(n);await db.query('insert into public.transactions(id,number,title,created_by,responsible_user_id,current_level,close_level,workflow_started,status) values($1,$2,$2,$3,$3,$4,\'ceo\',$5,$6)',[tid,`EXEC-${n}`,owner,level,started,status]);return tid;
}
async function route(tid,n,{from=actors.assistant,uid=null,login=null,name='الرئيس التنفيذي',toUnit=null,type='raise',status='completed',at='2026-10-06T02:00:00Z'}={}){
 await db.query('insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_login_name,to_user_id,to_login_name,to_name,to_unit_id,status,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id(n),tid,type,from,from===actors.office?'office':'assistant',uid,login,name,toUnit,status,at]);
}
// Only the Supabase transport is replaced. Its emitted rows execute against the real fixture SQL.
function transport(table){
 assert(/^[a-z_]+$/.test(table));let mode='select',payload,columns='*',single=false,limit=null;const filters=[],orders=[],args=[];
 const bind=v=>{args.push(v);return '$'+args.length;};
 const q={select(c='*'){columns=c;return q;},insert(p){mode='insert';payload=p;return q;},update(p){mode='update';payload=p;return q;},eq(k,v){filters.push(`${k}=${bind(v)}`);return q;},in(k,vs){filters.push(`${k} in (${vs.map(bind).join(',')})`);return q;},order(k){orders.push(k);return q;},limit(n){assert(Number.isInteger(n)&&n>=0);limit=n;return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},then(resolve,reject){return (async()=>{
 let sql;const where=filters.length?' where '+filters.join(' and '):'';
 if(mode==='insert'){assert(!Array.isArray(payload));const keys=Object.keys(payload);sql=`insert into public.${table}(${keys.join(',')}) values(${keys.map(k=>bind(payload[k])).join(',')}) returning *`;}
 else if(mode==='update')sql=`update public.${table} set ${Object.entries(payload).map(([k,v])=>`${k}=${bind(v)}`).join(',')}${where} returning *`;
 else sql=`select ${columns} from public.${table}${where}${orders.length?' order by '+orders.join(','):''}${limit===null?'':' limit '+limit}`;
 const rows=(await db.query(sql,args)).rows;return {data:single?rows[0]:rows,error:null};
 })().then(resolve,reject);}};return q;
}
const edge={db:{from:transport},Date,Map,Set,CACHE_MS:60000,directoryCache:{at:0,data:[]},fetch:()=>{throw Error('network forbidden');}};
vm.createContext(edge);
const edgeCode=chunk(source,'function arr(','function validUuid(')+chunk(source,'function canonicalDept(','async function effectivePermissions(')+chunk(source,'async function effectivePermissions(','async function identity(')+chunk(source,'function canAct(','function canSetDue(')+chunk(source,'function canRaiseCeo(','async function ownedUnreadCount(')+chunk(source,'async function notify(','async function txRow(')+chunk(source,'async function account(','async function responsibleTarget(');
const branch=chunk(source,'    if(action===\"route_assistant_ceo\")','    if(action===\"route_exec_assistant\")');
edge.out=(_req,data,status=200)=>({data,status});
edge.txAccess=async(_who,tid)=>({tx:await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tid]),flags:await flags(_who.user_id,tid)});
vm.runInContext(stripTypeScriptTypes(edgeCode)+`;globalThis.probe={effectivePermissions,canAct,canRaiseCeo,addRoute,raise:async function(who,b){const action='route_assistant_ceo',req={};${branch}}};`,edge);
const ui={hasTxPerm:()=>true,fetch:()=>{throw Error('network forbidden');}};vm.createContext(ui);
vm.runInContext(chunk(app,'function tabsFor(','function defaultTab(')+';globalThis.tabs=tabsFor',ui);
const incomingCounterExpression=app.match(/id="statIncoming">\$\{([^}]+)\}/)?.[1];assert(incomingCounterExpression,'actual UI incoming counter seam');
function renderedCounter(data){ui.listData=data;return vm.runInContext(incomingCounterExpression,ui);}
const execRoles={ceo:'ceo',office:'ceo_office_manager',ceosecretary:'ceo_secretary'};
async function matrix(tid,expected,{original=false,sharedOffice=false}={}){
 for(const [key,role] of Object.entries(execRoles)){
  const f=await flags(actors[key],tid);check(`${tid} ${key} incoming`,f.incoming,expected[key],{original});
  const tabs=Array.from(ui.tabs(role),x=>Array.from(x));const incoming=tabs.find(x=>x[1]==='وارد إليّ')?.[0];assert(incoming,'actual incoming UI key');
  const rows=await list(actors[key],incoming);check(`${tid} ${key} actual UI→SQL incoming`,rows.rows.some(x=>x.id===tid),expected[key]);
  // Independent expected custody inventory: initial employee work, the populated
  // preservation Office handoff, and this isolated case. Do not derive expected
  // counters from the buggy flags under test.
  const inventory=new Map([[fixture.tx,false],[id(900),key==='office'],[tid,expected[key]]]);
  check(`${tid} exact isolated inventory`,(await db.query('select id from public.transactions order by id')).rows.map(x=>x.id),[...inventory.keys()].sort());
  const count=[...inventory.values()].filter(Boolean).length;
  check(`${tid} ${key} SQL incoming counter`,rows.counters.incoming,count);check(`${tid} ${key} UI rendered counter`,renderedCounter(rows),count);
  check(`${tid} ${key} visible`,f.visible,true);
  const allTab=tabs.find(x=>x[0]==='all')?.[0];assert(allTab);const all=await list(actors[key],allTab);check(`${tid} ${key} all visibility`,all.rows.some(x=>x.id===tid),true);
  if(key!=='ceo'){const monitor=tabs.find(x=>x[1]==='معاملات الرئيس التنفيذي')?.[0];assert(monitor);check(`${tid} ${key} actual CEO monitoring`,(await list(actors[key],monitor)).rows.some(x=>x.id===tid),true);}
  await claims(actors[key]);await db.exec('set local role authenticated');try{check(`${tid} ${key} RLS detail visibility`,await scalar('select count(*)::int from public.transactions where id=$1',[tid]),1);}finally{await db.exec('reset role');}
 }
 if(sharedOffice){check(`${tid} historical Office shared`,(await flags(actors.office,tid)).shared,true,{original});check(`${tid} actual Office shared list`,(await list(actors.office,'shared')).rows.some(x=>x.id===tid),true);}
}
try{
 for(const [key,n,role] of [['office',9,'ceo_office_manager'],['ceosecretary',10,'ceo_secretary']]){
  const uid=id(n);actors[key]=uid;
  await db.query('insert into auth.users(id,email) values($1,$2)',[uid,`${key}@fixture.invalid`]);
  await db.query('insert into public.profiles(id,login_name,full_name,must_change_password) values($1,$2,$3,false)',[uid,key,`${key} display`]);
  await db.query('insert into public.user_roles(user_id,role_code,is_primary) values($1,$2,true)',[uid,role]);
  await db.query("insert into public.account_migration_users(canonical_key,login_username,preferred_login,display_name,role_code,org_name,dept_names,internal_email,eligible,migrated_user_id,must_change_password) values($1,$2,$2,$3,$4,'fixture executive office',ARRAY[]::text[],$5,true,$6,false)",[`fixture_${key}`,key,`${key} display`,role,`${key}@fixture.invalid`,uid]);
  await db.query('insert into app_private.account_credential_state(user_id) values($1)',[uid]);
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[id(1000+n),uid]);
 }
 await db.exec(fs.readFileSync(path.join(dir,'20261006194500_transaction_assistant_reply.sql'),'utf8'));
 // Seed populated predecessor business state BEFORE replacing the function; prove zero backfill.
 const preservationTx=await tx(900);await route(preservationTx,2900,{uid:actors.office,login:'office'});
 const tables=(await db.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','app_private') and c.relkind in ('r','p') order by 1,2")).rows;
 async function tableSnapshot(){const rows={};for(const t of tables){assert(/^[a-z_]+$/.test(t.schema)&&/^[a-z_]+$/.test(t.name));rows[`${t.schema}.${t.name}`]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${t.schema}.${t.name} t`);}return rows;}
 const catalogSql="select jsonb_build_object('functions',(select jsonb_agg(to_jsonb(p)-'prosrc' order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','app_private')),'tables',(select jsonb_agg(jsonb_build_object('id',c.oid,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','app_private') and c.relkind in ('r','p')),'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),'columns',(select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','app_private') and a.attnum>0))";
 const definitionsSql="select p.oid::text id,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','app_private') and p.prokind='f' order by p.oid";
 if(!baseline){
  const beforeTables=await tableSnapshot(),beforeCatalog=await scalar(catalogSql),beforeDefinitions=(await db.query(definitionsSql)).rows;
  const migration=fs.readFileSync(path.join(dir,'20261007190000_transaction_executive_custody.sql'),'utf8');
  await db.exec(migration);
  if(!selected||selected==='preservation'){
   const start=failures.length;
   check('forward correction preserves every populated table including revisions',await tableSnapshot(),beforeTables);check('forward correction preserves all ACL/owner/security/signature/roles/schema/RLS catalogs',await scalar(catalogSql),beforeCatalog);
   const afterDefinitions=(await db.query(definitionsSql)).rows;const changed=afterDefinitions.filter((x,i)=>x.definition!==beforeDefinitions[i]?.definition);
   const target=String(await scalar("select 'app_private.transaction_feedback_flags(uuid,uuid)'::regprocedure::oid::text"));check('only existing custody function definition changes',changed.map(x=>x.id),[target]);
   await db.exec(migration);check('definition-only migration reapplies without table writes',await tableSnapshot(),beforeTables);check('reapplication preserves ACL and all other metadata',await scalar(catalogSql),beforeCatalog);check('reapplication is definition idempotent',(await db.query(definitionsSql)).rows,afterDefinitions);
   if(failures.length===start)console.log(`PASS ${++passed} [preservation] populated data, ACL, security, signatures, RLS and definition-only idempotence (${tables.length} tables)`);
  }
 }
 const one=key=>Object.fromEntries(Object.keys(execRoles).map(k=>[k,k===key]));
 const variants=[
  {n:910,name:'Office forwarded explicitly to CEO UUID',uid:actors.ceo,login:'ceo',display:'ceo display',key:'ceo',history:true},
  {n:911,name:'CEO UUID outranks contradictory Office login/display',uid:actors.ceo,login:'office',display:'office display',key:'ceo',history:true},
  {n:912,name:'explicit Office recipient at executive level',uid:actors.office,login:'office',display:'office display',key:'office'},
  {n:913,name:'NULL UUID CEO login fallback',uid:null,login:'ceo',display:'ceo display',key:'ceo',history:true},
  {n:914,name:'NULL UUID Office login fallback',uid:null,login:'office',display:'office display',key:'office'},
  {n:915,name:'actual Edge generic raise producer → SQL → actual UI tabs/counters',producer:true,key:'ceo'}
 ];
 for(const v of variants)await test('handoff',v.name,async()=>{
  const tid=await tx(v.n,{level:v.producer?'assistant':'ceo'});
  if(v.history)await route(tid,v.n+1000,{uid:actors.office,login:'office',name:'office display',at:'2026-10-06T01:00:00Z'});
  if(v.producer){
   await route(tid,v.n+1000,{uid:actors.assistant,login:'assistant',name:'assistant display'});
   const before=await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tid]);
   const response=await edge.probe.raise({user_id:actors.assistant,login_name:'assistant',display_name:'assistant display',role:'assistant',permissions:['transactions.raise_ceo']},{transaction_id:tid,raise_reason:'سبب الاختبار',proposed_decision:'القرار المطلوب'});
   check('actual Edge producer success',response.status,200);
   const produced=await scalar("select to_jsonb(r) from public.transaction_routes r where transaction_id=$1 and to_name='الرئيس التنفيذي'",[tid]);
   for(const key of ['to_user_id','to_login_name','to_unit_id'])check(`actual Edge emits NULL ${key}`,produced[key],null);
   check('actual Edge generic route type',produced.route_type,'raise');check('actual schema has no to_role',Object.hasOwn(produced,'to_role'),false);
   const after=await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tid]);
   check('actual Edge sets executive level',after.current_level,'ceo');for(const key of ['created_by','responsible_user_id','responsible_unit_id'])check(`actual raise preserves ${key}`,after[key],before[key]);
   const notifications=(await db.query('select user_id from public.notifications where transaction_id=$1 order by user_id',[tid])).rows.map(x=>x.user_id);
   check('actual notification fanout includes all executives without giving custody',[...new Set(notifications.filter(Boolean))],[actors.ceo,actors.office,actors.ceosecretary].sort());
  }else await route(tid,v.n+2000,{from:v.history?actors.office:actors.assistant,uid:v.uid,login:v.login,name:v.display});
  await matrix(tid,one(v.key),{original:true,sharedOffice:v.history});
  if(v.n===910){
   const f=await flags(actors.office,tid),t=await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tid]);
   check('delegated act_all remains effective before denial',edge.probe.canAct({role:'ceo_office_manager',permissions:['transactions.act_all']},t,f),true);
   await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'transactions.act_all','deny')",[actors.office]);
   check('deny effective in real SQL',await scalar("select app_private.account_permission_effective($1,'transactions.act_all')",[actors.office]),false);
   const before=await tableSnapshot();
   const who={user_id:actors.office,login_name:'office',role:'ceo_office_manager'};who.permissions=await edge.probe.effectivePermissions(who);
   check('actual Edge permission producer applies user deny',who.permissions.includes('transactions.act_all'),false);
   check('nonrecipient denied act_all actual Edge canAct',edge.probe.canAct(who,t,f),false,{original:true});
   check('nonrecipient denied act_all SQL list can_act',(await list(actors.office,'all')).rows.find(x=>x.id===tid).can_act,false,{original:true});
   check('existing Office→already CEO guard remains false',edge.probe.canRaiseCeo({role:'ceo_office_manager',permissions:['transactions.raise_ceo','transactions.act_all']},{tx:t,flags:f}),false);
   check('predicate proof has zero writes across all fixture tables',await tableSnapshot(),before);
  }
 });
 // Supplemental edge cases use the same real SQL→actual UI/list/counter path.
 const identityCases=[
  {n:920,label:'explicit CEO-secretary UUID',uid:actors.ceosecretary,login:'ceosecretary',key:'ceosecretary'},
  {n:921,label:'NULL UUID CEO-secretary login',login:'ceosecretary',key:'ceosecretary'},
  {n:922,label:'Office UUID outranks CEO login and exact generic CEO label',uid:actors.office,login:'ceo',key:'office'},
  {n:923,label:'secretary UUID outranks Office login/display',uid:actors.ceosecretary,login:'office',key:'ceosecretary'},
  {n:924,label:'nonexecutive UUID with matching CEO login never falls back',uid:actors.employee,login:'ceo',key:null},
  {n:925,label:'unknown NULL-UUID login with exact CEO label is not generic',login:'missing-ceo',key:null},
  {n:926,label:'other unaddressed display label is not a CEO raise',name:'مكتب الرئيس التنفيذي',key:null},
  {n:927,label:'unaddressed non-raise exact CEO label is not generic',type:'directive',key:null},
  {n:928,label:'generic-looking raise with explicit foreign unit is not generic',toUnit:unit.otherRoot,key:null},
  {n:929,label:'empty legacy login remains generic when no identity/unit exists',login:'',key:'ceo'},
  {n:933,label:'explicit CEO UUID outranks foreign unit and Office label',uid:actors.ceo,toUnit:unit.otherRoot,name:'office display',key:'ceo'},
  {n:934,label:'NULL UUID Office login outranks foreign unit and CEO label',login:'office',toUnit:unit.otherRoot,key:'office'}
 ];
 for(const v of identityCases)await test('identity',v.label,async()=>{const tid=await tx(v.n);await route(tid,v.n+2000,v);await matrix(tid,one(v.key));});
 await test('identity','explicit unit requires live same-level CEO membership, not executive notification membership',async()=>{
  const tid=await tx(935);await route(tid,2935,{toUnit:unit.otherRoot});
  for(const key of Object.keys(execRoles))await db.query("insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,'member',false)",[actors[key],unit.otherRoot]);
  await matrix(tid,one('ceo'));
  await db.query('update public.user_memberships set active=false where user_id=$1 and unit_id=$2',[actors.ceo,unit.otherRoot]);
  await matrix(tid,one(null));
 });
 await test('identity','unknown nonNULL UUID cannot claim login/display fallback',async()=>{
  const tid=await tx(930);
  // Historical dangling-recipient shape ONLY in this synthetic fixture. No live FK/schema change.
  await db.exec('set session_replication_role=replica');try{await route(tid,2930,{uid:id(999999),login:'ceo'});}finally{await db.exec('set session_replication_role=origin');}
  await matrix(tid,one(null));
 });
 await test('identity','malformed UUID is rejected by actual SQL type before any route/custody change',async()=>{
  const tid=await tx(931);const before=await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tid]);
  await db.exec('savepoint malformed');let error;try{await route(tid,2931,{uid:'not-a-uuid',login:'ceo'});}catch(e){error=e;}
  if(error)await db.exec('rollback to savepoint malformed');await db.exec('release savepoint malformed');
  check('actual malformed UUID code',error?.code,'22P02');check('no malformed route inserted',await scalar('select count(*)::int from public.transaction_routes where transaction_id=$1',[tid]),0);check('malformed UUID has zero tx writes',await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tid]),before);
  await matrix(tid,one(null));
 });
 await test('identity','inactive explicit executive UUID blocks fallback',async()=>{
  const tid=await tx(932);await route(tid,2932,{uid:actors.office,login:'ceo'});await db.query('update public.profiles set active=false where id=$1',[actors.office]);
  check('inactive explicit recipient not current',(await flags(actors.office,tid)).incoming,false);check('CEO matching stale login not current',(await flags(actors.ceo,tid)).incoming,false);check('secretary not current',(await flags(actors.ceosecretary,tid)).incoming,false);
 });
 async function assignment(tid,n,{user=actors.office,at='2026-10-06T03:00:00Z',status='active',completed=false,targetActive=true,targetCompleted=false,viaUsers=false}={}){
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,status,created_at,completed_at) values($1,$2,$3,'responsible',$4,$5,$6)",[id(n),tid,unit.dept,status,at,completed?'2026-10-06T04:00:00Z':null]);
  if(viaUsers)await db.query('insert into public.transaction_assignment_users(assignment_id,user_id,active,completed_at) values($1,$2,$3,$4)',[id(n),user,targetActive,targetCompleted?'2026-10-06T04:00:00Z':null]);
  else await db.query('insert into public.transaction_assignment_targets(id,assignment_id,user_id,login_name,display_name,active,completed_at) values($1,$2,$3,$4,$5,$6,$7)',[id(n+100),id(n),user,user===actors.office?'office':'employee',user===actors.office?'office display':'employee display',targetActive,targetCompleted?'2026-10-06T04:00:00Z':null]);
 }
 for(const [label,options,current] of [
  ['newer live explicit assignment outranks route',{},'office'],
  ['older active assignment cannot outrank latest executive handoff',{at:'2026-10-06T01:00:00Z'},'ceo'],
  ['completed assignment is history, not current',{status:'completed'},'ceo'],
  ['cancelled assignment is history, not current',{status:'cancelled'},'ceo'],
  ['active but completed assignment is not current',{completed:true},'ceo'],
  ['inactive explicit target is not current',{targetActive:false},'ceo'],
  ['completed explicit target is not current',{targetCompleted:true},'ceo'],
  ['newer live assignment-user wins',{viaUsers:true},'office'],
  ['inactive assignment-user does not win',{viaUsers:true,targetActive:false},'ceo'],
  ['completed assignment-user does not win',{viaUsers:true,targetCompleted:true},'ceo']
 ])await test('assignment',label,async()=>{const tid=await tx(940);await route(tid,2940,{uid:actors.ceo,login:'ceo'});await assignment(tid,3940,options);await matrix(tid,one(current));});
 await test('assignment','live nonexecutive execution assignment remains current without a group override',async()=>{
  const tid=await tx(941);await route(tid,2941);await assignment(tid,3941,{user:actors.employee});await matrix(tid,one(null));check('actual execution target remains incoming',(await flags(actors.employee,tid)).incoming,true);check('actual incoming execution list',(await list(actors.employee,'incoming')).rows.some(x=>x.id===tid),true);
 });
 for(const [label,routeOptions] of [
  ['newer pending route ignored',{status:'pending'}],['newer rejected route ignored',{status:'rejected'}],['CEO-view route ignored',{type:'ceo_view'}]
 ])await test('lifecycle',label,async()=>{const tid=await tx(950);await route(tid,2950,{uid:actors.office,login:'office',at:'2026-10-06T01:00:00Z'});await route(tid,2951,{uid:actors.ceo,login:'ceo',at:'2026-10-06T03:00:00Z',...routeOptions});await matrix(tid,one('office'));});
 await test('lifecycle','latest accepted route uses ID tie-breaker and moves old Office custody to shared',async()=>{
  const tid=await tx(951);await route(tid,2951,{uid:actors.office,login:'office'});await route(tid,2952,{from:actors.office,uid:actors.ceosecretary,login:'ceosecretary',status:'accepted'});await matrix(tid,one('ceosecretary'),{sharedOffice:true});
 });
 for(const owner of Object.keys(execRoles))await test('lifecycle',`no-route first-created executive record belongs only to ${owner}`,async()=>{const tid=await tx(952,{owner:actors[owner],started:false});await matrix(tid,one(owner));});
 await test('lifecycle','no-route started executive record does not invent a recipient',async()=>{const tid=await tx(953,{owner:actors.office});await matrix(tid,one(null));check('started no-route owner remains shared',(await flags(actors.office,tid)).shared,true);});
 await test('lifecycle','no-route first-created responsibility and creator behavior stays intact',async()=>{
  const tid=await tx(954,{owner:actors.office,started:false});await db.query('update public.transactions set responsible_user_id=$2 where id=$1',[tid,actors.ceosecretary]);await matrix(tid,{ceo:false,office:true,ceosecretary:true});
 });
 for(const status of ['closed','cancelled'])await test('lifecycle',`${status} terminal flags never advertise custody/action`,async()=>{
  const tid=await tx(955,{status});await route(tid,2955,{uid:actors.office,login:'office'});
  for(const [key,role] of Object.entries(execRoles)){
   const f=await flags(actors[key],tid);check(`${status} ${key} incoming`,f.incoming,false);check(`${status} ${key} shared`,f.shared,false);check(`${status} ${key} closed`,f.closed,status==='closed');check(`${status} ${key} visible`,f.visible,true);
   const row=(await list(actors[key],status==='closed'?'closed':'all')).rows.find(x=>x.id===tid);check(`${status} ${key} SQL can_act`,row.can_act,false);check(`${status} ${key} SQL can_close`,row.can_close,false);check(`${status} ${key} Edge canAct`,edge.probe.canAct({role,permissions:['transactions.act_all']},row,f),false);
  }
 });
 await test('permissions','permission overrides remain separate from recipient identity and close authority',async()=>{
  const tid=await tx(960);await route(tid,2960,{from:actors.office,uid:actors.ceo,login:'ceo'});
  for(const [key,role] of Object.entries(execRoles)){
   const f=await flags(actors[key],tid);check(`${key} default act_all effective`,await scalar("select app_private.account_permission_effective($1,'transactions.act_all')",[actors[key]]),true);
   const who={user_id:actors[key],login_name:key,role};who.permissions=await edge.probe.effectivePermissions(who);
   check(`${key} actual Edge permission producer retains delegation`,who.permissions.includes('transactions.act_all'),true);
   const row=(await list(actors[key],'all')).rows.find(x=>x.id===tid);check(`${key} delegated SQL act`,row.can_act,true);check(`${key} delegated SQL close`,row.can_close,true);check(`${key} close authority retained`,row.close_authority,'ceo');check(`${key} delegated Edge act`,edge.probe.canAct(who,row,f),true);
   await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'transactions.act_all','deny')",[actors[key]]);
   who.permissions=await edge.probe.effectivePermissions(who);check(`${key} actual Edge permission producer applies deny`,who.permissions.includes('transactions.act_all'),false);
   const denied=(await list(actors[key],'all')).rows.find(x=>x.id===tid);check(`${key} denied act_all does not change incoming`,denied.incoming,key==='ceo');check(`${key} denied SQL action follows custody`,denied.can_act,key==='ceo');check(`${key} denied Edge action follows custody`,edge.probe.canAct(who,denied,f),key==='ceo');check(`${key} denied close unchanged separate authority rule`,denied.can_close,false);
  }
 });
 await test('permissions','explicit Office recipient keeps custody/action when act_all is denied',async()=>{
  const tid=await tx(961);await route(tid,2961,{uid:actors.office,login:'office'});await db.query("insert into public.account_permission_overrides(canonical_key,permission_code,effect) values('fixture_office','transactions.act_all','deny')");const row=(await list(actors.office,'incoming')).rows.find(x=>x.id===tid);check('canonical deny actually effective',await scalar("select app_private.account_permission_effective($1,'transactions.act_all')",[actors.office]),false);check('Office actual custody action retained',row.can_act,true);check('Office actual custody Edge action retained',edge.probe.canAct({role:'ceo_office_manager',permissions:[]},row,await flags(actors.office,tid)),true);
 });
 await test('permissions','denied view_all preserves explicit history and recipient visibility without unrelated leaks',async()=>{
  const tid=await tx(962);await route(tid,2962,{from:actors.office,uid:actors.ceo,login:'ceo'});await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'transactions.view_all','deny')",[actors.office]);check('historical Office retains visibility',(await flags(actors.office,tid)).visible,true);check('historical Office shared retained',(await flags(actors.office,tid)).shared,true);check('historical Office not recipient',(await flags(actors.office,tid)).incoming,false);check('unrelated initial employee row does not leak',(await list(actors.office,'all')).rows.some(x=>x.id===fixture.tx),false);
 });
 console.log(JSON.stringify({mode:baseline?'predecessor RED':'forward migration',slice:selected||'all',passed,assertions:checks,failedAssertions:failures.length,original17Failures:originalRed,failures,network:'none',evidence:'local PGlite + actual extracted source; no native/deployed E2E'}));
 process.exitCode=failures.length?1:0;
}finally{await db.close();}
