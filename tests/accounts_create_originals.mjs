import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionAccounts } from '../scripts/accounts-provision.mjs';
import { createOriginalStaffExecutor } from '../scripts/accounts-create-originals.mjs';
const SOURCE = '717375eee1e99d558af80eca91a7ea7e829edd20';
const TARGET = 'https://movzojtnkkmdsjhmlgtq.supabase.co';
const F = '0a1df502-9232-4ef5-af2d-df585ad7f187';
const OP = '20000000-0000-4000-8000-000000000001';
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = v => structuredClone(v);
globalThis.fetch = async () => { throw Error('synthetic_network_forbidden'); };
// Entire inventory is synthetic. No native identity or credentials loaded.
async function fixture(keys=['person_10']) {
  const inventory = {source_main:SOURCE,authority:'parent-approved-original-staff-keys',canonical_keys:['faisal',...Array.from({length:56},(_,i)=>`person_${i+1}`)]};
  const units=[{id:uuid(100),name:'مكتب الرئيس التنفيذي',unit_type:'office',parent_id:null,active:true}];
  const rows=Array.from({length:57},(_,i)=>({canonical_key:i?`person_${i}`:'faisal',login_username:i?`ameen${i}`:'faisal',preferred_login:`اسم مصدر ${i}`,display_name:`موظف مصدر ${i}`,role_code:i?'employee':'ceo_office_manager',org_name:units[0].name,dept_names:[units[0].name],internal_email:i?`person-${i}@msajed.local`:'faisal@msajed.local',eligible:true,migrated_user_id:i===0?F:i<10?uuid(i):null,must_change_password:i!==0,profile_active:i<10?true:null,profile_must_change:i<10?i!==0:null}));
  const users=rows.filter(r=>r.migrated_user_id).map(r=>({id:r.migrated_user_id,email:r.internal_email,email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{untouched:true}}));
  const projections=new Map();
  const calls=[], receipts=[], delivered=[];
  const snapshot=(key,id)=>{const r=rows.find(r=>r.canonical_key===key);return clone(projections.get(key)??{registry:r,profile:null,roles:[],memberships:[],permission_overrides:[],page_overrides:[],login_conflicts:[],credential_generation:0,has_password_operations:false});};
  for(const r of rows.filter(r=>r.migrated_user_id)) projections.set(r.canonical_key,{registry:r,profile:{id:r.migrated_user_id,login_name:r.preferred_login,full_name:r.display_name,active:true,must_change_password:r.must_change_password},roles:[{role_code:r.role_code,is_primary:true}],memberships:[{unit_id:uuid(100),membership_role:'member',is_primary:true,active:true}],permission_overrides:[{opaque:'preserved'}],page_overrides:[],login_conflicts:[],credential_generation:0,has_password_operations:false});
  projections.get('faisal').memberships[0].membership_role='office';
  const port={targetUrl:TARGET,transportMode:'synthetic',
    async registry(){calls.push('registry');return clone(rows);},async units(){return clone(units);},
    async listAllUsers(){calls.push('listAllUsers');const pages=[];for(let i=0;i<users.length;i+=3)pages.push(...clone(users.slice(i,i+3)));return {complete:true,users:pages};},
    async readAccount(key,id){calls.push('readAccount');return snapshot(key,id);},
    auth:{async getUserById(id){calls.push('getUserById');return clone(users.find(u=>u.id===id));},
      async createUser(payload){calls.push('createUser');assert.equal(payload.email_confirm,true);assert.deepEqual(Object.keys(payload).sort(),['email','email_confirm','password','user_metadata']);assert.ok(Array.from(payload.password).length>=8);for(const re of [/[A-Z]/,/[a-z]/,/[0-9]/,/[^A-Za-z0-9]/])assert.match(payload.password,re);const u={id:uuid(1000+users.length),email:payload.email,email_confirmed_at:'persisted',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:clone(payload.user_metadata)};users.push(u);return {...clone(u),email_confirmed_at:'create-envelope',created_at:'different'};}},
    async linkCanonical(payload){calls.push('linkCanonical');assert.deepEqual(Object.keys(payload).sort(),['p_auth_user','p_key','p_memberships']);const r=rows.find(r=>r.canonical_key===payload.p_key);r.migrated_user_id=payload.p_auth_user;r.profile_active=true;r.profile_must_change=true;projections.set(r.canonical_key,{registry:r,profile:{id:r.migrated_user_id,login_name:r.preferred_login,full_name:r.display_name,active:true,must_change_password:true},roles:[{role_code:r.role_code,is_primary:true}],memberships:payload.p_memberships.map(m=>({...m,active:true})),permission_overrides:[],page_overrides:[],login_conflicts:[],credential_generation:0,has_password_operations:false});return {ok:true,status:'linked',target_user_id:r.migrated_user_id,canonical_key:r.canonical_key,login_username:r.login_username};}};
  const prepared=await provisionAccounts(port,()=>{}, {mode:'plan-only',staffInventory:inventory});
  assert.equal(prepared.status,'reviewed');calls.length=0;
  const approval={approved:true,current_source:true,source_main:SOURCE,staff_inventory:inventory,canonical_keys:keys,operation_id:OP,expires_at:Date.now()+60000,target:{origin:TARGET,project_ref:'movzojtnkkmdsjhmlgtq',official_admin:true}};
  const callbacks={async persistReceipt(r){receipts.push(clone(r));return {persisted:true,operation_id:r.operation_id,sequence:r.sequence,write_allowed:r.phase==='create_intent'};},async deliver(c){delivered.push({id:c.target_user_id,password:c.password});assert.equal(JSON.stringify(c).includes(c.password),false);return {acknowledged:true,operation_id:c.operation_id,target_user_id:c.target_user_id};}};
  const build=(options={})=>createOriginalStaffExecutor({prepared,approval,port,...callbacks,deadlineMs:5000,executionMode:'synthetic',...options});
  return {rows,users,projections,port,prepared,approval,callbacks,calls,receipts,delivered,build};
}

test('CREATE uses persisted GET proof, exact canonical atomic link and acknowledged memory-only delivery',async()=>{
 const f=await fixture(['person_10','person_11','person_12']);
 const runner=f.build();const result=await runner.run();
 assert.equal(result.status,'completed');assert.equal(result.created,3);
 assert.equal(f.calls.filter(x=>x==='createUser').length,3);assert.equal(f.calls.filter(x=>x==='linkCanonical').length,3);
 assert.equal(new Set(f.delivered.map(x=>x.password)).size,3);
 for(const c of f.delivered)assert.equal(JSON.stringify(result).includes(c.password),false);
 assert.equal(runner.pendingCount(),0);
 assert.ok(f.receipts.some(r=>r.phase==='auth_proven'));assert.ok(f.receipts.some(r=>r.phase==='linked_verified'));
});

for(const [name,mutate] of [
 ['wrong target',f=>f.port.targetUrl='https://wrong.invalid'],
 ['missing review',f=>f.approval.approved=false],
 ['expired review',f=>f.approval.expires_at=0],
 ['wrong original allowlist',f=>f.approval.staff_inventory.canonical_keys[1]='qa_test'],
 ['Faisal',f=>f.approval.canonical_keys=['faisal']],
 ['reset',f=>f.approval.canonical_keys=['person_1']],
 ['mixed scope',f=>f.approval.canonical_keys=['person_10','person_1']],
 ['QA key',f=>f.approval.canonical_keys=['qa_test']],
])test(`preflight denies ${name} before all IO`,async()=>{const f=await fixture();mutate(f);const r=await f.build().run();assert.equal(r.status,'blocked');assert.equal(f.calls.length,0);});
for(const [name,mutate] of [
 ['duplicate email',f=>f.users.push({...clone(f.users[1]),id:uuid(990)})],
 ['duplicate UUID',f=>f.users.push({...clone(f.users[1]),email:'other@msajed.local'})],
 ['untyped list status',f=>delete f.users[1].deleted_at],
 ['Arabic field drift',f=>f.rows[10].preferred_login+=' تغير'],
 ['protected metadata drift',f=>f.users[0].user_metadata.untouched=false],
 ['protected role drift',f=>f.projections.get('faisal').roles[0].role_code='employee'],
 ['incomplete paging',f=>f.port.listAllUsers=async()=>({complete:false,users:clone(f.users)})],
 ['DB error',f=>f.port.registry=async()=>({data:clone(f.rows),error:{message:'unsafe'}})],
])test(`fresh reconciliation denies ${name} without CREATE`,async()=>{const f=await fixture();mutate(f);const r=await f.build().run();assert.equal(r.status,'blocked');assert.equal(f.calls.includes('createUser'),false);});
for(const [name,mutate] of [
 ['email mismatch',u=>u.email='wrong@msajed.local'],
 ['UID mismatch',u=>u.id=uuid(999)],
 ['marker mismatch',u=>u.user_metadata.original_registration.operation_id=uuid(998)],
 ['missing GET status',u=>delete u.deleted_at],
])test(`provider GET ${name} quarantines before link`,async()=>{const f=await fixture();const original=f.port.auth.getUserById;f.port.auth.getUserById=async id=>{const u=await original(id);if(u.email==='person-10@msajed.local')mutate(u);return u;};const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(runner.pendingCount(),1);runner.finalize('destroy');});
for(const kind of ['CREATE and GET','GET only'])test(`provider-added metadata in ${kind} is compatible without normalization or rewrite`,async()=>{
 const f=await fixture();const original=f.port.auth.createUser;let persistedMetadata;
 f.port.auth.createUser=async p=>{const envelope=await original(p);const u=f.users.find(u=>u.id===envelope.id);
  u.user_metadata={...u.user_metadata,email_verified:true,provider_derived:{version:1}};
  persistedMetadata=clone(u.user_metadata);
  if(kind==='CREATE and GET')envelope.user_metadata={...envelope.user_metadata,provider_envelope:'synthetic-only'};
  return envelope;
 };
 const r=await f.build().run();assert.equal(r.status,'completed');assert.equal(r.created,1);
 assert.equal(f.calls.filter(x=>x==='createUser').length,1);assert.equal(f.delivered.length,1);
 assert.deepEqual(f.users.find(u=>u.email==='person-10@msajed.local').user_metadata,persistedMetadata);
});
// Preserve the reviewed marker ABI: project and canonical identity are separately gated.
for(const stage of ['CREATE','GET'])for(const field of ['operation_id','source_main'])test(`${stage} altered required ownership ${field} cannot authorize linking`,async()=>{
 const f=await fixture();const originalCreate=f.port.auth.createUser,originalGet=f.port.auth.getUserById;
 const alter=u=>{u.user_metadata.original_registration[field]='outside-change';return u;};
 if(stage==='CREATE')f.port.auth.createUser=async p=>alter(await originalCreate(p));
 else f.port.auth.getUserById=async id=>{const u=await originalGet(id);return u.email==='person-10@msajed.local'?alter(u):u;};
 const runner=f.build();assert.equal((await runner.run()).status,'quarantined');assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
test('provider-added persisted metadata remains strict after link',async()=>{
 const f=await fixture();const originalCreate=f.port.auth.createUser,originalLink=f.port.linkCanonical;
 f.port.auth.createUser=async p=>{const r=await originalCreate(p);f.users.find(u=>u.id===r.id).user_metadata.email_verified=true;return r;};
 f.port.linkCanonical=async p=>{const r=await originalLink(p);f.users.find(u=>u.id===p.p_auth_user).user_metadata.email_verified=false;return r;};
 const runner=f.build();assert.equal((await runner.run()).status,'quarantined');assert.equal(f.calls.filter(x=>x==='linkCanonical').length,1);assert.equal(f.delivered.length,0);runner.finalize('destroy');
});

test('reuse exact unlinked Auth performs zero CREATE and requires private original-password delivery',async()=>{
 const f=await fixture();f.users.push({id:uuid(777),email:'person-10@msajed.local',email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{existing:true}});
 const prepared=await provisionAccounts(f.port,()=>{}, {mode:'plan-only',staffInventory:f.approval.staff_inventory});assert.equal(prepared.status,'reviewed');f.calls.length=0;
 const runner=f.build({prepared});const r=await runner.run();assert.equal(r.status,'needs_private_original_password_delivery');assert.equal(r.reused,1);assert.equal(f.calls.includes('createUser'),false);assert.equal(f.delivered.length,0);assert.equal(runner.pendingCount(),0);
});

for(const mode of ['disconnect','reject','wrong acknowledgement'])test(`delivery ${mode} retains custody; exact explicit acknowledgement clears`,async()=>{
 const f=await fixture();let exposed;
 f.callbacks.deliver=async c=>{exposed=c;if(mode==='reject')throw Error(c.password);if(mode==='disconnect')return {transmitted:true};return {acknowledged:true,operation_id:uuid(123),target_user_id:c.target_user_id};};
 const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(runner.pendingCount(),1);assert.ok(exposed.password);assert.equal(JSON.stringify(r).includes(exposed.password),false);
 f.callbacks.deliver=async c=>({acknowledged:true,operation_id:c.operation_id,target_user_id:c.target_user_id});
 // Callback identity is fixed at construction: recovery uses the same trusted channel.
 runner.finalize('destroy');assert.equal(exposed.password,null);assert.equal(runner.pendingCount(),0);
});
test('explicit acknowledgement clears credential references rather than retaining plaintext uniqueness set',async()=>{
 const f=await fixture();let exposed;const deliver=async c=>{exposed=c;return {acknowledged:true,operation_id:c.operation_id,target_user_id:c.target_user_id};};
 const runner=f.build({deliver});assert.equal((await runner.run()).status,'completed');assert.equal(exposed.password,null);
});
test('delivery has one synchronous reservation and cannot finalize an active transmission',async()=>{
 const f=await fixture();let release,exposed;let count=0;
 const held=new Promise(r=>release=r);const runner=f.build({deliver:async c=>{count++;exposed=c;await held;return {transmitted:true};}});
 const run=runner.run();while(!exposed)await new Promise(r=>setTimeout(r,1));
 const concurrent=await Promise.race([runner.deliverPending(),new Promise(r=>setTimeout(()=>r({status:'test_reservation_missing'}),100))]);
 let refused=false;try{runner.finalize('destroy');}catch{refused=true;}release();await run;runner.finalize('destroy');
 assert.equal(concurrent.status,'busy');assert.equal(count,1);assert.equal(refused,true);assert.equal(exposed.password,null);
});
for(const kind of ['own','inherited','getter'])test(`external ${kind} guardCode cannot reflect a candidate into result or receipts`,async()=>{
 const f=await fixture();let candidate;
 f.port.auth.createUser=async p=>{f.calls.push('createUser');candidate=p.password;const e=Error(p.password);
  if(kind==='own')e.guardCode=p.password;
  if(kind==='inherited')Object.setPrototypeOf(e,{guardCode:p.password});
  if(kind==='getter')Object.defineProperty(e,'guardCode',{enumerable:true,get(){throw Error(p.password);}});
  throw e;
 };
 const runner=f.build();let r;
 try{r=await runner.run();}catch{assert.fail('external exception escaped sanitization');}
 assert.ok(!JSON.stringify(r).includes(candidate),'result must not reflect private candidate');
 assert.ok(!JSON.stringify(f.receipts).includes(candidate),'receipts must not reflect private candidate');
 assert.ok(r.blocked?.code==='uncertain_adapter_outcome','external guardCode must not be trusted');
 assert.equal(r.status,'quarantined');assert.equal(runner.pendingCount(),1);
 await runner.run();assert.equal(f.calls.filter(x=>x==='createUser').length,1);runner.finalize('destroy');
});

for(const kind of ['valid','wrong','wrong UID'])test(`timed-out outstanding delivery retains reservation and custody until actual ${kind} ACK settlement`,async()=>{
 const f=await fixture();let release,exposed,sends=0,recovery=false;
 const socket=new Promise(resolve=>release=resolve);
 const runner=f.build({deadlineMs:100,deliver:async c=>{sends++;exposed=c;return recovery?{acknowledged:true,operation_id:OP,target_user_id:c.target_user_id}:socket;}});
 const r=await Promise.race([runner.run(),new Promise(resolve=>setTimeout(()=>resolve({status:'test_deadline_not_bounded'}),500))]);
 const pendingBefore=runner.pendingCount();const stillPrivate=typeof exposed?.password==='string';
 const concurrent=await runner.deliverPending();let refused=false;
 try{runner.finalize('destroy');}catch{refused=true;}
 const sendsBefore=sends;
 release({acknowledged:true,operation_id:kind==='wrong'?uuid(333):OP,target_user_id:kind==='wrong UID'?uuid(334):exposed?.target_user_id});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(r.status,'quarantined');assert.equal(pendingBefore,1);assert.equal(stillPrivate,true);
 assert.equal(concurrent.status,'busy');assert.equal(refused,true);assert.equal(sendsBefore,1);
 if(kind==='valid'){assert.equal(runner.pendingCount(),0);assert.equal(exposed.password,null);}
 else{assert.equal(runner.pendingCount(),1);assert.ok(typeof exposed.password==='string','wrong ACK must not clear candidate');recovery=true;assert.equal((await runner.deliverPending()).status,'delivered');assert.equal(sends,2);assert.equal(exposed.password,null);}
 runner.finalize('destroy');
});

test('unknown CREATE retains candidate, sanitizes exception, and cannot re-enter or link',async()=>{
 const f=await fixture();let candidate;f.port.auth.createUser=async p=>{f.calls.push('createUser');candidate=p.password;throw Error(p.password);};
 const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(runner.pendingCount(),1);assert.equal(JSON.stringify(r).includes(candidate),false);
 await runner.run();assert.equal(f.calls.filter(x=>x==='createUser').length,1);assert.equal(f.calls.includes('linkCanonical'),false);assert.ok(r.receipts.some(x=>x.phase==='quarantined' && x.can_retry_create===false));runner.finalize('destroy');
});
test('CREATE returned UID is persisted as observed but not cleanup-owned when GET is lost',async()=>{
 const f=await fixture();const original=f.port.auth.getUserById;f.port.auth.getUserById=async id=>{if(id!==F && !f.prepared.baseline.users.some(u=>u.id===id))throw Error('lost GET');return original(id);};
 const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');assert.ok(f.receipts.some(x=>x.phase==='create_returned_unproven' && x.target_user_id && x.ownership_proven===false));assert.equal(f.calls.includes('linkCanonical'),false);runner.finalize('destroy');
});
for(const kind of ['wrong UUID','network loss','DB error'])test(`atomic link ${kind} is never success or retried`,async()=>{
 const f=await fixture();const original=f.port.linkCanonical;f.port.linkCanonical=async p=>{const r=await original(p);if(kind==='network loss')throw Error('lost');if(kind==='DB error')return {data:r,error:{message:'denied'}};return {...r,target_user_id:uuid(999)};};
 const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');await runner.run();assert.equal(f.calls.filter(x=>x==='createUser').length,1);assert.equal(f.calls.filter(x=>x==='linkCanonical').length,1);assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
for(const field of ['roles','memberships','permission_overrides','page_overrides','profile'])test(`post-link ${field} drift prevents delivery`,async()=>{
 const f=await fixture();const original=f.port.linkCanonical;f.port.linkCanonical=async p=>{const r=await original(p);const s=f.projections.get(p.p_key);if(field==='profile')s.profile.full_name+=' altered';else s[field]=[{invalid:true}];return r;};const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
for(const field of ['profile','roles','memberships','permission_overrides','page_overrides','forced_flag','auth_metadata'])test(`earlier completed ${field} drift during second link quarantines the entire batch`,async()=>{
 const f=await fixture(['person_10','person_11']);const original=f.port.linkCanonical;
 f.port.linkCanonical=async p=>{const r=await original(p);if(p.p_key==='person_11'){
  const s=f.projections.get('person_10');
  if(field==='auth_metadata')f.users.find(u=>u.email==='person-10@msajed.local').user_metadata.provider_extra='outside-change';
  else if(field==='profile')s.profile.full_name+=' outside-change';
  else if(field==='forced_flag')s.profile.must_change_password=false;
  else s[field].push({outside_change:true});
 }return r;};
 const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');
 assert.ok(r.blocked?.code===(field==='auth_metadata'?'completed_auth_drift':'completed_projection_drift'),'final batch drift must retain its owned sanitized reason');
 assert.ok(r.receipts.some(x=>x.phase==='quarantined' && x.can_retry_create===false),'final drift must be journaled as quarantined');
 assert.equal(f.delivered.length,0);assert.equal(runner.pendingCount(),2);
 assert.equal(f.calls.filter(x=>x==='createUser').length,2);assert.equal(f.calls.filter(x=>x==='linkCanonical').length,2);
 assert.equal((await runner.deliverPending()).status,'quarantined');assert.equal(f.delivered.length,0);
 runner.finalize('destroy');
});
test('earlier completed drift is caught before a later CREATE mutation',async()=>{
 const f=await fixture(['person_10','person_11']);const original=f.callbacks.persistReceipt;
 const runner=f.build({persistReceipt:async r=>{const ack=await original(r);if(r.phase==='linked_verified' && r.canonical_key==='person_10')f.projections.get('person_10').roles[0].role_code='outside-change';return ack;}});
 const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(f.calls.filter(x=>x==='createUser').length,1);assert.equal(f.delivered.length,0);assert.equal(runner.pendingCount(),1);runner.finalize('destroy');
});

// Supplemental coverage: these cases already pass the corrected completion mechanism.
test('earlier completed reuse is protected without acquiring or resetting its original credential',async()=>{
 const f=await fixture(['person_10','person_11']);const existing={id:uuid(777),email:'person-10@msajed.local',email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{existing:true}};f.users.push(existing);
 const prepared=await provisionAccounts(f.port,()=>{}, {mode:'plan-only',staffInventory:f.approval.staff_inventory});const original=f.port.linkCanonical;
 f.port.linkCanonical=async p=>{const r=await original(p);if(p.p_key==='person_11')f.projections.get('person_10').roles[0].role_code='outside-change';return r;};
 const runner=f.build({prepared});const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(r.reused,1);assert.equal(f.calls.filter(x=>x==='createUser').length,1);assert.equal(f.delivered.length,0);assert.equal(runner.pendingCount(),1);
 assert.deepEqual(f.users.find(u=>u.id===uuid(777)),existing);assert.equal(f.projections.get('person_10').roles[0].role_code,'outside-change');runner.finalize('destroy');
});
test('earlier completed drift at later link-intent receipt is caught before that link mutation',async()=>{
 const f=await fixture(['person_10','person_11']);const original=f.callbacks.persistReceipt;
 const runner=f.build({persistReceipt:async r=>{const ack=await original(r);if(r.phase==='link_intent' && r.canonical_key==='person_11')f.projections.get('person_10').profile.full_name+=' outside-change';return ack;}});
 const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(f.calls.filter(x=>x==='createUser').length,2);assert.equal(f.calls.filter(x=>x==='linkCanonical').length,1);assert.equal(f.delivered.length,0);assert.equal(runner.pendingCount(),2);runner.finalize('destroy');
});
for(const stage of ['CREATE','GET'])for(const part of ['tuple','operation_id'])test(`${stage} inherited required ownership ${part} cannot authorize linking`,async()=>{
 const f=await fixture();const originalCreate=f.port.auth.createUser,originalGet=f.port.auth.getUserById;
 const alter=u=>{if(part==='tuple')u.user_metadata=Object.create({original_registration:clone(u.user_metadata.original_registration)});else{const m=u.user_metadata.original_registration;const op=m.operation_id;delete m.operation_id;Object.setPrototypeOf(m,{operation_id:op});}return u;};
 if(stage==='CREATE')f.port.auth.createUser=async p=>alter(await originalCreate(p));
 else f.port.auth.getUserById=async id=>{const u=await originalGet(id);return u.email==='person-10@msajed.local'?alter(u):u;};
 const runner=f.build();assert.equal((await runner.run()).status,'quarantined');assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(f.delivered.length,0);runner.finalize('destroy');
});

test('receipt persistence rejection stops before CREATE',async()=>{
 const f=await fixture();const r=await f.build({persistReceipt:async()=>({persisted:false})}).run();assert.equal(r.status,'blocked');assert.equal(f.calls.includes('createUser'),false);
});
test('deadline bounds pending CREATE and quarantines without retry',async()=>{
 const f=await fixture();let release,settled=false;const held=new Promise(r=>release=r);const original=f.port.auth.createUser;f.port.auth.createUser=async p=>{f.calls.push('createUser_entered');await held;try{return await original(p);}finally{settled=true;}};const runner=f.build({deadlineMs:100});
 const r=await Promise.race([runner.run(),new Promise(resolve=>setTimeout(()=>resolve({status:'test_deadline_not_bounded'}),300))]);assert.equal(r.status,'quarantined');assert.equal(r.blocked.code,'deadline_exceeded');assert.equal(runner.pendingCount(),1);assert.equal(settled,false);assert.throws(()=>runner.finalize('destroy'),/explicit_final_decision_required/);release();await new Promise(r=>setTimeout(r,0));assert.equal(settled,true);assert.equal(runner.pendingCount(),1);assert.equal(f.calls.filter(x=>x==='createUser').length,1);assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
test('deadline bounds trusted persistence callback before CREATE',async()=>{
 const f=await fixture();const runner=f.build({deadlineMs:100,persistReceipt:async()=>new Promise(()=>{})});const r=await Promise.race([runner.run(),new Promise(resolve=>setTimeout(()=>resolve({status:'test_deadline_not_bounded'}),300))]);assert.equal(r.status,'blocked');assert.equal(r.blocked.code,'deadline_exceeded');assert.equal(f.calls.includes('createUser'),false);
});
test('pre-link registry drift in another original stops linking',async()=>{
 const f=await fixture();const original=f.port.auth.createUser;f.port.auth.createUser=async p=>{const r=await original(p);f.rows[20].display_name+=' drift';return r;};const runner=f.build();const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(f.calls.includes('linkCanonical'),false);runner.finalize('destroy');
});
test('forbidden mutation methods are never even read',async()=>{
 const f=await fixture();for(const k of ['updateUserById','deleteUser','resetPasswordForEmail'])Object.defineProperty(f.port.auth,k,{get(){assert.fail(`forbidden method read: ${k}`);}});
 assert.equal((await f.build().run()).status,'completed');
});

test('omitted provider status is supplemented only by exact-ID/email typed DB facts',async()=>{
 const f=await fixture();const original=f.port.auth.getUserById;
 f.port.auth.getUserById=async id=>{const u=await original(id);if(u.email==='person-10@msajed.local'){delete u.banned_until;delete u.deleted_at;}return u;};
 let reads=0;f.port.readAuthStatusFacts=async(id,email)=>{reads++;assert.equal(email,'person-10@msajed.local');return {id,email,banned_until:null,deleted_at:null};};
 assert.equal((await f.build().run()).status,'completed');assert.equal(reads,4); // CREATE GET, pre-dispatch GET, persisted GET, final delivery GET.
});
test('DB status facts with mismatched identity cannot authorize link',async()=>{
 const f=await fixture();const original=f.port.auth.getUserById;f.port.auth.getUserById=async id=>{const u=await original(id);if(u.email==='person-10@msajed.local')delete u.deleted_at;return u;};f.port.readAuthStatusFacts=async(id,email)=>({id:uuid(999),email,banned_until:null,deleted_at:null});const runner=f.build();assert.equal((await runner.run()).status,'quarantined');assert.equal(f.calls.includes('linkCanonical'),false);runner.finalize('destroy');
});
test('post-link drift in a protected original prevents delivery',async()=>{
 const f=await fixture();const original=f.port.linkCanonical;f.port.linkCanonical=async p=>{const r=await original(p);f.projections.get('faisal').permission_overrides.push({unexpected:true});return r;};const runner=f.build();assert.equal((await runner.run()).status,'quarantined');assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
test('persistent one-shot create-intent reservation is mandatory',async()=>{
 const f=await fixture();const persistReceipt=async r=>({persisted:true,operation_id:r.operation_id,sequence:r.sequence});const r=await f.build({persistReceipt}).run();assert.equal(r.status,'blocked');assert.equal(f.calls.includes('createUser'),false);
});
test('delayed acknowledgement is explicit and only delivery is retried',async()=>{
 const f=await fixture();let ack=false,exposed;const deliver=async c=>{exposed=c;return ack?{acknowledged:true,operation_id:c.operation_id,target_user_id:c.target_user_id}:{transmitted:true};};const runner=f.build({deliver});assert.equal((await runner.run()).status,'quarantined');ack=true;assert.deepEqual(await runner.deliverPending(),{status:'delivered',pending:0});assert.equal(exposed.password,null);assert.equal(f.calls.filter(x=>x==='createUser').length,1);
});


// Pass2: per-send full snapshot drift and underlying mutating IO custody.
const tick=()=>new Promise(r=>setTimeout(r,0));
const driftNext=(f,field)=>{
 if(field==='auth_metadata')f.users.find(u=>u.email==='person-11@msajed.local').user_metadata.outside_change=true;
 else if(field==='registry')f.rows[11].profile_must_change=false;
 else if(field==='profile')f.projections.get('person_11').profile.full_name+=' outside-change';
 else f.projections.get('person_11').roles[0].role_code='outside-change';
};
for(const mode of ['initial','disconnect-recovery','late-recovery'])for(const field of ['profile','roles','auth_metadata','registry'])test(`each dispatch revalidates ${mode} ${field} after previous exact ACK`,async()=>{
 const f=await fixture(['person_10','person_11']);let recovery=mode==='initial',entered=false,release,drifted=false,first;const sends=[];
 const held=new Promise(r=>release=r);const deliver=async c=>{
  sends.push({key:c.canonical_key,recovery,drifted});
  if(!recovery)return {transmitted:true};
  if(c.canonical_key==='person_10'){first=c;entered=true;if(mode==='late-recovery')await held;else{driftNext(f,field);drifted=true;}}
  return {acknowledged:true,operation_id:OP,target_user_id:c.target_user_id};
 };
 const runner=f.build({deliver});const initial=await runner.run();let final=initial;
 if(mode!=='initial'){recovery=true;const attempt=runner.deliverPending();if(mode==='late-recovery'){while(!entered)await tick();driftNext(f,field);drifted=true;release();}final=await attempt;}
 assert.equal(sends.some(s=>s.recovery && s.key==='person_11' && s.drifted),false,'no send after drift');
 assert.equal(final.status,'quarantined');assert.equal(runner.pendingCount(),1);assert.equal(first.password,null);
 assert.equal(final.blocked?.code,field==='auth_metadata'?'completed_auth_drift':field==='registry'?'completed_registry_drift':'completed_projection_drift');
 assert.ok(f.receipts.some(r=>r.phase==='quarantined' && r.can_retry_create===false));
 const before=sends.length;assert.equal((await runner.deliverPending()).status,'quarantined');assert.equal(sends.length,before);
 assert.equal(f.calls.filter(x=>x==='createUser').length,2);assert.equal(f.calls.filter(x=>x==='linkCanonical').length,2);runner.finalize('destroy');
});
for(const phase of ['CREATE','link','create_intent','link_intent','linked_verified','quarantined'])test(`actual ${phase} settlement retains custody beyond bounded deadline`,async()=>{
 const f=await fixture();let release,entered=false,settled=false;const held=new Promise(r=>release=r);
 let persistReceipt=f.callbacks.persistReceipt;
 if(phase==='CREATE' || phase==='link'){
  const owner=phase==='CREATE'?f.port.auth:f.port;const method=phase==='CREATE'?'createUser':'linkCanonical';const original=owner[method];
  owner[method]=async p=>{entered=true;await held;try{return await original(p);}finally{settled=true;}};
 }else{
  const original=persistReceipt;persistReceipt=async r=>{if(r.phase===phase){entered=true;await held;try{return await original(r);}finally{settled=true;}}return original(r);};
  if(phase==='quarantined')f.port.auth.createUser=async()=>{f.calls.push('createUser');throw 'external primitive';};
 }
 const runner=f.build({deadlineMs:100,persistReceipt});
 const result=await Promise.race([runner.run(),new Promise(r=>setTimeout(()=>r({status:'test_not_finite'}),600))]);
 assert.equal(entered,true);assert.equal(settled,false);assert.equal(result.status,phase==='create_intent'?'blocked':'quarantined');
 const before=runner.pendingCount();assert.equal(before,phase==='create_intent'?0:1);
 assert.throws(()=>runner.finalize('destroy'),/explicit_final_decision_required/);assert.equal(runner.pendingCount(),before);
 await runner.run();assert.equal(f.calls.filter(x=>x==='createUser').length,phase==='CREATE' || phase==='create_intent'?0:1);
 f.approval.expires_at=0;assert.throws(()=>runner.finalize('destroy'),/explicit_final_decision_required/);
 release();await tick();await tick();assert.equal(settled,true);assert.equal(runner.pendingCount(),before);
 assert.equal(f.delivered.length,0);assert.equal(f.calls.filter(x=>x==='createUser').length,phase==='create_intent'?0:1);
 assert.equal(f.calls.filter(x=>x==='linkCanonical').length,phase==='link' || phase==='linked_verified'?1:0);
 runner.finalize('destroy');assert.equal(runner.pendingCount(),0);
});
for(const mode of ['initial','recovery'])test(`steady two-credential ${mode} delivery remains exact ACK only`,async()=>{
 const f=await fixture(['person_10','person_11']);let ack=mode==='initial',sends=0;
 const runner=f.build({deliver:async c=>{sends++;return ack?{acknowledged:true,operation_id:OP,target_user_id:c.target_user_id}:{transmitted:true};}});
 assert.equal((await runner.run()).status,ack?'completed':'quarantined');
 if(!ack){ack=true;assert.deepEqual(await runner.deliverPending(),{status:'delivered',pending:0});}
 assert.equal(runner.pendingCount(),0);assert.equal(sends,mode==='initial'?2:4);runner.finalize('destroy');
});
