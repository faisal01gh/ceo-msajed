import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,OP,uuid} from './accounts_executor_fixture.mjs';
import * as planner from '../scripts/accounts-provision.mjs';
import * as creator from '../scripts/accounts-create-originals.mjs';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

async function canonicalFixture(){
 const f=await fixture();const inventory=planner.loadCanonicalStaffInventory();
 const identities=[inventory.identities.find(i=>i.canonical_key==='faisal'),...inventory.identities.filter(i=>i.canonical_key!=='faisal')];
 const snapshots=[...f.projections.values()];f.projections.clear();
 const roots=[...new Set(identities.map(i=>i.org_name))].map((name,i)=>({id:uuid(100+i),name,unit_type:name==='مكتب الرئيس التنفيذي'?'office':name==='الإدارة المالية'?'independent':'sector',parent_id:null,active:true}));
 const units=[...roots];let number=200;
 for(const i of identities){const root=roots.find(r=>r.name===i.org_name);for(const name of i.dept_names){if(name!==root.name && !units.some(u=>u.name===name && u.parent_id===root.id))units.push({id:uuid(number++),name,unit_type:'department',parent_id:root.id,active:true});}}
 for(let n=0;n<57;n++){
  const row=f.rows[n],i=identities[n];Object.assign(row,Object.fromEntries(['canonical_key','preferred_login','display_name','role_code','org_name','dept_names','internal_email'].map(k=>[k,structuredClone(i[k])])));
  if(row.migrated_user_id){const u=f.users.find(u=>u.id===row.migrated_user_id);u.email=row.internal_email;const s=snapshots[n];s.registry=row;s.profile.login_name=row.preferred_login;s.profile.full_name=row.display_name;s.roles=[{role_code:row.role_code,is_primary:true}];f.projections.set(row.canonical_key,s);}
 }
 f.port.units=async()=>structuredClone(units);
 // An official-SDK-shaped client backed ONLY by this process's synthetic state.
 const auth=f.port.auth;
 const official=planner.createOfficialAuthAdminAdapter({targetUrl:f.port.targetUrl,authorize:()=>true,perPage:3,client:{supabaseUrl:f.port.targetUrl,auth:{admin:{
  async listUsers({page,perPage}){return {data:{users:structuredClone(f.users.slice((page-1)*perPage,page*perPage)),total:f.users.length},error:null};},
  async getUserById(id){return {data:{user:await auth.getUserById(id)},error:null};},
  async createUser(p){return {data:{user:await auth.createUser(p)},error:null};}
 }}}});
 Object.assign(f.port,official);
 const prepared=await planner.provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:inventory});assert.equal(prepared.status,'reviewed');
 f.calls.length=0;f.approval.staff_inventory=inventory;f.approval.canonical_keys=[f.rows[10].canonical_key];
 const directory=await mkdtemp(join(process.env.TMPDIR,'executor-real-gate-fixture-'));
 const persistReceipt=creator.createOriginalStaffReceiptJournal({directory,canonicalKeys:f.approval.canonical_keys});
 const baseline_digest=planner.inventoryDigest(prepared.baseline),now=Date.now();
 f.approval.fresh_inventory={verified:true,pages_complete:true,official_get_verified:true,project_ref:'movzojtnkkmdsjhmlgtq',captured_at:now,expires_at:now+60000,baseline_digest};
 const executor_hashes=Object.fromEntries(['accounts-create-originals.mjs','accounts-provision.mjs'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../scripts/'+name,import.meta.url))).digest('hex')]));
 f.approval.isolation_approval={verdict:'APPROVED',independent:true,issuer:'Parent',receipt_id:uuid(888),project_ref:'movzojtnkkmdsjhmlgtq',source_main:inventory.source_main,operation_id:OP,canonical_keys:f.approval.canonical_keys,expires_at:now+60000,baseline_digest,executor_hashes,reservation_domain:persistReceipt.reservationDomain};
 return {...f,directory,persistReceipt,prepared,build:(options={})=>creator.createOriginalStaffExecutor({prepared,approval:f.approval,port:f.port,persistReceipt,deliver:f.callbacks.deliver,executionMode:'real-apply',verifyIsolationReceipt:()=>true,deadlineMs:5000,...options})};
}
test('full real-apply gate contract executes ONLY an explicitly synthetic official-API transport',async()=>{
 const f=await canonicalFixture();try{const runner=f.build();assert.equal((await runner.run()).status,'completed');assert.equal(f.calls.filter(x=>x==='createUser').length,1);assert.equal(runner.pendingCount(),0);}finally{await rm(f.directory,{recursive:true,force:true});}
});
test('current Arabic preferred login is preserved rather than reauthorized from historical seed values',async()=>{
 const f=await canonicalFixture();try{
  const key=f.rows[10].canonical_key,currentLogin=f.rows[10].login_username;
  f.rows[10].preferred_login+=' الحالي';
  const prepared=await planner.provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:f.approval.staff_inventory});assert.equal(prepared.status,'reviewed');
  const digest=planner.inventoryDigest(prepared.baseline);f.approval.fresh_inventory.baseline_digest=digest;f.approval.isolation_approval.baseline_digest=digest;
  const result=await f.build({prepared}).run();assert.equal(result.status,'completed');assert.equal(f.rows[10].login_username,currentLogin);assert.equal(f.projections.get(key).profile.login_name,f.rows[10].preferred_login);
 }finally{await rm(f.directory,{recursive:true,force:true});}
});

for(const [label,mutate,options] of [
 ['receipt absent',f=>delete f.approval.isolation_approval],
 ['self approval',f=>f.approval.isolation_approval.issuer='Executor'],
 ['not independent',f=>f.approval.isolation_approval.independent=false],
 ['expired receipt',f=>f.approval.isolation_approval.expires_at=0],
 ['wrong project',f=>f.approval.isolation_approval.project_ref='wrong'],
 ['wrong operation',f=>f.approval.isolation_approval.operation_id=uuid(999)],
 ['wrong scope',f=>f.approval.isolation_approval.canonical_keys=['faisal']],
 ['stale inventory',f=>f.approval.fresh_inventory.captured_at=Date.now()-60001],
 ['future inventory',f=>f.approval.fresh_inventory.captured_at=Date.now()+60000],
 ['incomplete pages',f=>f.approval.fresh_inventory.pages_complete=false],
 ['unverified GET',f=>f.approval.fresh_inventory.official_get_verified=false],
 ['wrong digest',f=>f.approval.fresh_inventory.baseline_digest='wrong'],
 ['wrong source hashes',f=>f.approval.isolation_approval.executor_hashes={}],
 ['wrong reservation domain',f=>f.approval.isolation_approval.reservation_domain='wrong'],
 ['unofficial adapter marker',f=>f.port.auth={...f.port.auth}],
 ['unverified receipt',()=>{},{verifyIsolationReceipt:()=>false}],
 ['async receipt boolean',()=>{},{verifyIsolationReceipt:()=>Promise.resolve(true)}],
])test(`real-apply gate denies ${label} before every adapter IO`,async()=>{
 const f=await canonicalFixture();try{mutate(f);const result=await f.build(options).run();assert.equal(result.status,'blocked');assert.equal(f.calls.length,0);}finally{await rm(f.directory,{recursive:true,force:true});}
});

function sdkFixture(mode='valid'){
 const users=Array.from({length:7},(_,i)=>({id:uuid(300+i),email:`synthetic-${i}@msajed.local`,email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{}}));
 const calls=[];const admin={
  async listUsers({page,perPage}){calls.push({page,perPage});const rows=users.slice((page-1)*perPage,page*perPage);if(mode==='duplicate'&&page===2)rows[0]=users[0];if(mode==='failure'&&page===2)return {data:null,error:{message:'private-provider-detail'}};return {data:{users:structuredClone(rows),nextPage:page<3?page+1:null,lastPage:3,total:7},error:null};},
  async getUserById(id){return {data:{user:structuredClone(users.find(u=>u.id===id))},error:null};},
  async createUser(p){calls.push({create:true});return {data:{user:{...users[0],email:p.email,user_metadata:p.user_metadata}},error:null};}
 };for(const k of ['updateUserById','deleteUser','generateLink','signOut'])Object.defineProperty(admin,k,{get(){assert.fail('forbidden admin method');}});
 return {client:{supabaseUrl:'https://movzojtnkkmdsjhmlgtq.supabase.co',auth:{admin}},calls,users};
}
test('official SDK adapter consumes every page and unwraps authoritative exact-ID GET',async()=>{
 assert.equal(typeof planner.createOfficialAuthAdminAdapter,'function');const f=sdkFixture();
 const port=planner.createOfficialAuthAdminAdapter({client:f.client,targetUrl:'https://movzojtnkkmdsjhmlgtq.supabase.co',authorize:()=>true,perPage:3});
 const all=await port.listAllUsers();assert.equal(all.complete,true);assert.equal(all.users.length,7);assert.deepEqual(f.calls.map(c=>c.page),[1,2,3,4]);
 assert.deepEqual(await port.auth.getUserById(f.users[0].id),f.users[0]);
 const p={email:'new@msajed.local',email_confirm:true,password:['A','b','3','!','x','y','z','w'].join(''),user_metadata:{}};
 assert.equal((await port.auth.createUser(p)).email,p.email);assert.equal(f.calls.filter(c=>c.create).length,1);
});
for(const mode of ['duplicate','failure'])test(`official pagination ${mode} is failclosed and sanitized`,async()=>{
 const f=sdkFixture(mode);assert.equal(typeof planner.createOfficialAuthAdminAdapter,'function');const port=planner.createOfficialAuthAdminAdapter({client:f.client,targetUrl:'https://movzojtnkkmdsjhmlgtq.supabase.co',authorize:()=>true,perPage:3});
 await assert.rejects(()=>port.listAllUsers(),error=>!String(error).includes('private-provider-detail'));
});
test('official adapter cannot read or write before a synchronous authorization permit',async()=>{
 assert.equal(typeof planner.createOfficialAuthAdminAdapter,'function');const f=sdkFixture();const port=planner.createOfficialAuthAdminAdapter({client:f.client,targetUrl:'https://movzojtnkkmdsjhmlgtq.supabase.co',authorize:()=>false});
 await assert.rejects(()=>port.listAllUsers());await assert.rejects(()=>port.auth.getUserById(uuid(300)));await assert.rejects(()=>port.auth.createUser({}));assert.equal(f.calls.length,0);
});
test('official adapter revalidates the SDK target at every dispatch',async()=>{
 const f=sdkFixture();const port=planner.createOfficialAuthAdminAdapter({client:f.client,targetUrl:'https://movzojtnkkmdsjhmlgtq.supabase.co',authorize:()=>true});f.client.supabaseUrl='https://wrong.invalid';
 await assert.rejects(()=>port.listAllUsers());await assert.rejects(()=>port.auth.getUserById(uuid(300)));await assert.rejects(()=>port.auth.createUser({}));assert.equal(f.calls.length,0);
});

test('provider dispatch enters exact in-flight phase before IO and late settlement cannot retry',async()=>{
 const f=await fixture();let runner;const phases=[];const create=f.port.auth.createUser,link=f.port.linkCanonical;
 f.port.auth.createUser=async p=>{phases.push(runner.state().phases.person_10);assert.equal(runner.state().mutating_io,1);return create(p);};
 f.port.linkCanonical=async p=>{phases.push(runner.state().phases.person_10);return link(p);};
 runner=f.build();assert.equal((await runner.run()).status,'completed');assert.deepEqual(phases,['create_in_flight','link_in_flight']);assert.equal(runner.state().phases.person_10,'acknowledged');assert.equal(runner.state().mutating_io,0);
});
test('executable self-test actually creates and links synthetic originals and emits no candidates',()=>{
 const main=fileURLToPath(new URL('../scripts/accounts-create-originals.mjs',import.meta.url));
 const preload=new URL('./accounts_executor_deny_network.mjs',import.meta.url).href;
 const child=spawnSync(process.execPath,['--import',preload,main,'--synthetic-self-test'],{encoding:'utf8'});
 assert.equal(child.status,0);const output=JSON.parse(child.stdout);assert.equal(output.synthetic,true);assert.equal(output.status,'completed');assert.equal(output.created,47);assert.equal(output.auth_create_dispatches,47);assert.equal(output.canonical_link_dispatches,47);assert.equal(output.pending,0);assert.doesNotMatch(child.stdout,/password|token|secret/i);
});

test('destroy before run is terminal and cannot later acquire provider IO',async()=>{
 const f=await fixture();const runner=f.build();runner.finalize('destroy');const r=await runner.run();assert.equal(r.status,'blocked');assert.equal(r.blocked.code,'executor_finalized');assert.equal(f.calls.length,0);
});

// A local nonsecret durable reservation is never a credential handoff file.
test('durable one-shot journal denies simultaneous, restarted and different-operation CREATE intents',async()=>{
 assert.equal(typeof creator.createOriginalStaffReceiptJournal,'function');
 const dir=await mkdtemp(join(process.env.TMPDIR,'executor-journal-'));
 const receipt={operation_id:OP,sequence:1,phase:'create_intent',canonical_key:'person_10',target_user_id:null,ownership_proven:false,can_retry_create:false};
 try{
  const writer=creator.createOriginalStaffReceiptJournal({directory:dir,canonicalKeys:['person_10']});
  const attempts=await Promise.all([writer(receipt),writer(receipt)]);assert.equal(attempts.filter(a=>a.write_allowed).length,1);
  const restarted=creator.createOriginalStaffReceiptJournal({directory:dir,canonicalKeys:['person_10']});
  assert.equal((await restarted(receipt)).write_allowed,false);
  assert.equal((await restarted({...receipt,operation_id:uuid(666)})).write_allowed,false);
  const moduleUrl=new URL('../scripts/accounts-create-originals.mjs',import.meta.url).href;
  const child=spawnSync(process.execPath,['--import',new URL('./accounts_executor_deny_network.mjs',import.meta.url).href,'--input-type=module','--eval',`import {createOriginalStaffReceiptJournal} from ${JSON.stringify(moduleUrl)}; const writer=createOriginalStaffReceiptJournal({directory:process.argv[1],canonicalKeys:['person_10']}); const r=await writer(JSON.parse(process.argv[2]));console.log(JSON.stringify({persisted:r.persisted,write_allowed:r.write_allowed}));`,dir,JSON.stringify(receipt)],{encoding:'utf8'});
  assert.equal(child.status,0);assert.deepEqual(JSON.parse(child.stdout),{persisted:false,write_allowed:false});
  const content=await readFile(join(dir,'reservation-person_10.json'),'utf8');assert.deepEqual(JSON.parse(content),receipt);
  assert.equal((await restarted({...receipt,sequence:2,phase:'quarantined'})).persisted,true);
  await assert.rejects(()=>restarted({...receipt,sequence:3,phase:'auth_proven',target_user_id:uuid(999),ownership_proven:true}));
  await assert.rejects(()=>restarted({...receipt,sequence:4,phase:'link_intent',target_user_id:uuid(999),ownership_proven:true}));
  assert.doesNotMatch(content,/password|token|secret/i);
  await assert.rejects(()=>restarted({...receipt,password:'private-placeholder'}));
  await assert.rejects(()=>restarted({...receipt,canonical_key:'faisal'}));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('durable link reservation prevents restart or new-operation linking of an uncertain reuse',async()=>{
 const dir=await mkdtemp(join(process.env.TMPDIR,'executor-link-journal-'));
 const receipt={operation_id:OP,sequence:1,phase:'link_intent',canonical_key:'person_10',target_user_id:uuid(900),ownership_proven:false,can_retry_create:false};
 try{
  const writer=creator.createOriginalStaffReceiptJournal({directory:dir,canonicalKeys:['person_10']});assert.equal((await writer(receipt)).persisted,true);
  const restarted=creator.createOriginalStaffReceiptJournal({directory:dir,canonicalKeys:['person_10']});
  await assert.rejects(()=>restarted({...receipt,operation_id:uuid(777),sequence:2}));
  await assert.rejects(()=>restarted({...receipt,sequence:3,phase:'auth_proven'}));
  assert.equal((await writer({...receipt,sequence:4,phase:'linked_verified'})).persisted,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

// Default execution is never activation authority, even with the older review flag.
test('real apply requires independent isolation approval before any adapter read',async()=>{
 const f=await fixture();const runner=f.build({executionMode:'real-apply'});
 const r=await runner.run();assert.equal(r.status,'blocked');assert.equal(f.calls.length,0);
 assert.equal(r.blocked.code,'independent_isolation_approval_required');
});
test('canonical source join recovers exactly57 identities without executing historical SQL',()=>{
 assert.equal(typeof planner.buildOriginalStaffInventory,'function');
 const staff=readFileSync(new URL('../data/staff/staff-original.json',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/migrations/20261004210000_full_staff_registry_profiles.sql',import.meta.url),'utf8');
 const inventory=planner.buildOriginalStaffInventory(staff,sql);
 assert.equal(inventory.canonical_keys.length,57);assert.equal(new Set(inventory.canonical_keys).size,57);
 assert.equal(inventory.identities.length,57);assert.equal(inventory.canonical_keys.includes('faisal'),true);
 assert.equal(inventory.canonical_keys.some(k=>k.startsWith('qa_')),false);
 assert.equal(Object.isFrozen(inventory.identities[0]),true);
 assert.throws(()=>planner.buildOriginalStaffInventory(staff,sql.replace('عبداللطيف سليمان عبدالله السريع','other')),/canonical_source_join_required/);
});

// No real transport. The actual production executor is exercised end-to-end.
test('duplicate arriving during durable CREATE reservation blocks the actual dispatch',async()=>{
 const f=await fixture();const persist=f.callbacks.persistReceipt;
 const runner=f.build({persistReceipt:async r=>{const ack=await persist(r);if(r.phase==='create_intent')f.users.push({...structuredClone(f.users[1]),id:uuid(900),email:f.rows[10].internal_email});return ack;}});
 const result=await runner.run();assert.equal(f.calls.filter(x=>x==='createUser').length,0);assert.equal(result.status,'blocked');runner.finalize('destroy');
});
for(const field of ['registry','units','auth','roles','operations'])test(`current ${field} drift during link reservation prevents actual link dispatch`,async()=>{
 const f=await fixture();const persist=f.callbacks.persistReceipt;
 const runner=f.build({persistReceipt:async r=>{const ack=await persist(r);if(r.phase==='link_intent'){
  if(field==='registry')f.rows[10].preferred_login+=' changed';
  if(field==='units')f.port.units=async()=>[];
  if(field==='auth')f.users.find(u=>u.email===f.rows[10].internal_email).user_metadata.outside_change=true;
  if(field==='roles'||field==='operations'){const read=f.port.readAccount;f.port.readAccount=async(key,id)=>{const s=await read(key,id);if(key==='person_10'){if(field==='roles')s.roles=[{role_code:'manager',is_primary:true}];else s.has_password_operations=true;}return s;};}
 }return ack;}});
 const result=await runner.run();assert.equal(result.status,'quarantined');assert.equal(f.calls.filter(x=>x==='linkCanonical').length,0);assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
