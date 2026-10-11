import '../../tests/accounts_executor_deny_network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture,id,ORIGIN} from './lifecycle.test-fixture.mjs';
import * as api from '../qa-runtime-provenance.mjs';
import {OWNED_CONTROL_INVENTORY_FACETS,OWNED_CONTROL_PRIMARY_METADATA_SELECT,OWNED_CONTROL_FUNCTION_SPECS} from './owned-attestation.mjs';
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:stable(v)).digest('hex');
const raw=n=>hash(readFileSync(new URL(n,import.meta.url)));
function model(){
 const runId=id(8000000),units=[{id:id(8000001),unit_type:'department'}];
 const specs=['public.qa_owned_delete_prepare_internal(p_run uuid, p_source uuid, p_operation uuid)','public.qa_owned_delete_transition_internal(p_operation uuid, p_generation bigint, p_status text)','public.qa_owned_delete_absence_internal(p_operation uuid, p_generation bigint, p_uid uuid, p_readback_digest text)','public.qa_owned_delete_finalize_internal(p_operation uuid, p_generation bigint)','public.qa_owned_delete_read_internal(p_operation uuid)'];
 const snapshot={functions:specs.map(identity=>({identity,result:'jsonb',owner:'postgres',security_definer:true,definition:'OFFLINE INERT'}))};
 const resources=Array.from({length:57},(_,i)=>({runId,sourceId:id(8100000+i),createOperation:id(8200000+i),receiptId:id(8300000+i),kind:i<50?'owned-load-qa':'owned-role-e2e',canonicalKey:'fixture-'+i,loginAlias:'fixture-'+i,displayName:'fixture',email:'fixture-'+i+'@fixture.invalid',role:'employee',memberships:[{unit_id:units[0].id,membership_role:'member',is_primary:true}]}));
 const rolePlanDigest=hash({resources,units});resources.forEach(r=>r.rolePlanDigest=rolePlanDigest);
 const plan={runId,resources,units,protectedUIDs:[],protectedCanonicalKeys:['faisal'],controlIdentityDigest:hash(snapshot),rolePlanDigest,sourceHash:raw('owned-control.sql'),sourceHashes:{'owned-control.sql':raw('owned-control.sql'),'owned-deletion-fence.sql':raw('owned-deletion-fence.sql')}};
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const seal=p=>{const payload=stable(p);return {planId:id(8000002),runId:p.runId,identityDigest:p.controlIdentityDigest,rolePlanDigest:p.rolePlanDigest,reviewerPublicKey:publicKey.export({type:'spki',format:'pem'}),signedPlan:{payload,signature:sign(null,Buffer.from('QA-OWNED-ROLEPLAN-v1\n'+payload),privateKey).toString('base64')}};};
 return {plan,snapshot,seal};
}
test('LQR01 signed nine-field raw dual-source plan constructs current adapter',async()=>{
 const m=model();const f=await fixture({ownedControl:m.seal(m.plan),ownedMetadataHash:hash(m.snapshot)});assert(f.adapter);
});

for(const drift of ['owned-control.sql','owned-deletion-fence.sql','extra','missing','plan-extra'])test('LQR01 rejects signed source/schema drift '+drift,async()=>{
 const m=model(),p=structuredClone(m.plan);
 if(drift==='extra')p.sourceHashes.extra='a'.repeat(64);else if(drift==='missing')delete p.sourceHashes['owned-deletion-fence.sql'];else if(drift==='plan-extra')p.extra=true;else p.sourceHashes[drift]='a'.repeat(64);
 await assert.rejects(()=>fixture({ownedControl:m.seal(p),ownedMetadataHash:hash(m.snapshot)}));
});

// Reuse the deterministic F3 protocol fixture without registering/executing its
// native SQL case. This executes current F3 exports, never native network/DB.
const provenanceSource=readFileSync(new URL('../../tests/qa_runtime_provenance.mjs',import.meta.url),'utf8');
const fixtureBody=provenanceSource.slice(provenanceSource.indexOf('function fixture(t,'),provenanceSource.indexOf("test('authentic signed approval"));
const protocolModule=await import('data:text/javascript;base64,'+Buffer.from(`
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {execFileSync} from 'node:child_process';
const scratch=${JSON.stringify(process.env.TMPDIR||'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch')};
const api=await import(${JSON.stringify(new URL('../qa-runtime-provenance.mjs',import.meta.url).href)});
const {OWNED_CONTROL_INVENTORY_FACETS,OWNED_CONTROL_FUNCTION_SPECS}=await import(${JSON.stringify(new URL('./owned-attestation.mjs',import.meta.url).href)});
const stable=v=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
const hash=v=>createHash('sha256').update(v).digest('hex');
${fixtureBody.replaceAll("new URL('../scripts/qa-load-preparation/'+name,import.meta.url)","new URL(name,"+JSON.stringify(new URL('./',import.meta.url).href)+")").replaceAll("new URL('../scripts/qa-load-preparation/owned-control.sql',import.meta.url)","new URL("+JSON.stringify(new URL('./owned-control.sql',import.meta.url).href)+")").replaceAll("new URL('../scripts/qa-load-preparation/'+n,import.meta.url)","new URL(n,"+JSON.stringify(new URL('./',import.meta.url).href)+")")}
export {fixture};`).toString('base64'));
function composedProtocol(t){
 const f=protocolModule.fixture(t,{owned:true}),row=f.state.sqlInventory.ownedPlans[0],p=row.payload;
 p.resources.forEach((r,i)=>{r.sourceId=id(8100000+i);r.createOperation=id(8200000+i);r.receiptId=id(8300000+i);});
 p.rolePlanDigest=hash({resources:p.resources.map(({rolePlanDigest,...r})=>r),units:p.units});p.resources.forEach(r=>r.rolePlanDigest=p.rolePlanDigest);
 row.signature=f.envelope(p,'QA-OWNED-ROLEPLAN-v1').signature;
 f.state.sqlInventory.facets.qaOwnedPlans[0].role_plan_digest=p.rolePlanDigest;
 const approval=()=>{const a=f.approval();a.payload.operationId=id(80);return f.envelope(a.payload,'QA-PROVENANCE-APPROVAL-v1');};
 const pin=JSON.parse(readFileSync(f.pinPath));
 const ownedControl={planId:row.plan_id,runId:p.runId,identityDigest:p.controlIdentityDigest,rolePlanDigest:p.rolePlanDigest,reviewerPublicKey:pin.publicKey,signedPlan:{payload:stable(p),signature:row.signature}};
 return {...f,approval,ownedControl,plan:p};
}
test('LQR02 actual F3 final closing proof admits adapter with distinct full and controller hash domains',async t=>{
 const p=composedProtocol(t);assert.notEqual(api.canonicalMetadataHash(p.state.ownedMetadata),hash(p.state.ownedMetadata.controlIdentity));
 const mutations=[];const providerTransport=async(input,init)=>{const path=new URL(String(input)).pathname;
  if(path.endsWith('/qa_owned_identity_snapshot_internal'))return new Response(JSON.stringify({snapshot:p.state.ownedMetadata.controlIdentity,digest:p.state.ownedIdentityDigest}));
  mutations.push(path);assert(path.endsWith('/qa_owned_operation_internal'));return new Response(JSON.stringify({ok:true,operation_id:JSON.parse(init.body).p_operation}));
 };
 const f=await fixture({nativeFactory:true,ownedControl:p.ownedControl,providerTransport,realProvenance:{api,reader:p.reader,readApproval:p.approval}});
 assert.equal(api.isRuntimeProvenanceGate(p.gate()),false,'offline fixture cannot acquire native brand');
 await f.adapter.reserve({runId:p.plan.runId,operationId:p.plan.resources[0].createOperation,scope:'create',resourceKey:p.plan.resources[0].sourceId});
 assert.equal(mutations.length,1);
 const closing=p.state.calls.filter(c=>c.body?.query===api.RUNTIME_OWNED_CLOSING_SELECT);assert.equal(closing.length,1);
 const a=await f.runtimeAuthority.assertCurrent({scope:'qa-receipt',operationId:id(80)});
 assert.equal(a.ownedControlMetadataHash,api.canonicalMetadataHash(p.state.ownedMetadata));
 assert.equal(a.ownedControllerIdentityDigest,p.state.ownedIdentityDigest);assert(Object.isFrozen(a));
});

async function resumedModel({drift='none',session=false,status='completed'}={}){
 const m=model(),operationId=id(8600000),uid=id(8400000),r=m.plan.resources[0];
 const receipt={run_id:m.plan.runId,operation_id:operationId,target_user_id:uid,canonical_key:r.canonicalKey,generation:1,status,ownership_receipt_digest:'b'.repeat(64),protected_snapshot_digest:'c'.repeat(64),prepared_at:new Date().toISOString(),auth_readback_digest:'d'.repeat(64),db_absent:true,auth_absent:true};
 const effects=[];const providerTransport=async(input,init={})=>{const path=new URL(String(input)).pathname;
  if(path.endsWith('/qa_owned_identity_snapshot_internal'))return new Response(JSON.stringify({snapshot:m.snapshot,digest:m.plan.controlIdentityDigest}));
  if(path.endsWith('/qa_owned_delete_read_internal'))return new Response(JSON.stringify(receipt));
  effects.push(path);throw Error('OFFLINE_EFFECT_DENIED');
 };
 const f=await fixture({nativeFactory:true,ownedControl:m.seal(m.plan),providerTransport,ownedMetadataHash:hash({fullPrimary:m.snapshot}),ownedControllerIdentityDigest:m.plan.controlIdentityDigest});
 const resource={sourceId:r.sourceId,uid,deleteOperationId:operationId,deleteGeneration:1};let runId=m.plan.runId;
 if(drift==='uid')resource.uid=id(8500000);if(drift==='source')resource.sourceId=m.plan.resources[1].sourceId;if(drift==='run')runId=id(8600001);if(drift==='generation')resource.deleteGeneration=2;if(drift==='operation')receipt.operation_id=id(8600002);if(drift==='canonical')receipt.canonical_key='unsealed';
 if(session)resource.session={uid:resource.uid,sid:id(8500001),token:'ephemeral-private'};
 return {f,effects,resource,runId,m};
}
for(const drift of ['uid','source','run','generation','operation','canonical'])test('LQR03 resumed completed receipt rejects wrong '+drift+' before completion',async()=>{
 const p=await resumedModel({drift});let result;try{result=await p.f.cleanup.executeOwnedCleanup({adapter:p.f.adapter,runtimeAuthority:p.f.runtimeAuthority,runId:p.runId,inventoryDigest:p.m.plan.rolePlanDigest,resources:[p.resource]});}catch{}
 assert.notEqual(result?.status,'complete');assert.equal(p.effects.length,0);
});
test('LQR03 wrong UID rejects before logout or delete effects',async()=>{
 const p=await resumedModel({drift:'uid',session:true,status:'delete_prepared'});
 await assert.rejects(()=>p.f.cleanup.executeOwnedCleanup({adapter:p.f.adapter,runtimeAuthority:p.f.runtimeAuthority,runId:p.runId,inventoryDigest:p.m.plan.rolePlanDigest,resources:[p.resource]}));
 assert.equal(p.effects.length,0,'binding must precede logout reservation');
});
test('LQR03 exact completed replay uses durable canonical seal after ephemeral sources are gone',async()=>{
 const p=await resumedModel();for(let i=0;i<2;i++){
  const result=await p.f.cleanup.executeOwnedCleanup({adapter:p.f.adapter,runtimeAuthority:p.f.runtimeAuthority,runId:p.runId,inventoryDigest:p.m.plan.rolePlanDigest,resources:[p.resource]});
  assert.equal(result.status,'complete');assert.equal(result.proofs[0].uid,p.resource.uid);assert.equal(result.proofs[0].sourceId,p.resource.sourceId);
 }assert.equal(p.effects.length,0);
});

for(const drift of ['full-primary','controller-closing','status-metadata','rpc-controller','signed-source'])test('LQR02 actual F3/adapter rejects '+drift+' with zero physical dispatch',async t=>{
 const p=composedProtocol(t),approved=p.approval(),effects=[];
 if(drift==='signed-source'){p.state.sqlInventory.ownedPlans[0].payload.sourceHashes['owned-deletion-fence.sql']='f'.repeat(64);}
 p.state.hook=async req=>{
  if(drift==='full-primary'&&req.body?.query===api.RUNTIME_OWNED_CLOSING_SELECT)p.state.ownedMetadata.columns[0].required=false;
  if(drift==='controller-closing'&&req.body?.query===api.RUNTIME_OWNED_CLOSING_SELECT)p.state.ownedIdentityDigest='e'.repeat(64);
  if(drift==='status-metadata'&&new URL(req.url).hostname==='review.example.invalid')p.state.ownedMetadata.columns[0].required=false;
 };
 const providerTransport=async input=>{const path=new URL(String(input)).pathname;if(path.endsWith('/qa_owned_identity_snapshot_internal'))return new Response(JSON.stringify({snapshot:p.state.ownedMetadata.controlIdentity,digest:drift==='rpc-controller'?'d'.repeat(64):p.ownedControl.identityDigest}));effects.push(path);throw Error('OFFLINE_DISPATCH_DENIED');};
 const f=await fixture({nativeFactory:true,ownedControl:p.ownedControl,providerTransport,realProvenance:{api,reader:p.reader,readApproval:async()=>approved}});
 await assert.rejects(()=>f.adapter.reserve({runId:p.plan.runId,operationId:p.plan.resources[0].createOperation,scope:'create',resourceKey:p.plan.resources[0].sourceId}));assert.equal(effects.length,0);
});
for(const drift of ['uid','source','generation','run'])test('LQR03 composed actual F3 authority and cleanup rejects requested '+drift+' before logout',async t=>{
 const p=composedProtocol(t),operationId=id(8600000),uid=id(8400000),resource=p.plan.resources[0],effects=[];
 const row={run_id:p.plan.runId,operation_id:operationId,target_user_id:uid,canonical_key:resource.canonicalKey,generation:1,status:'completed',ownership_receipt_digest:'b'.repeat(64),protected_snapshot_digest:'c'.repeat(64),prepared_at:new Date().toISOString(),auth_readback_digest:'d'.repeat(64),db_absent:true,auth_absent:true};
 const providerTransport=async input=>{const path=new URL(String(input)).pathname;if(path.endsWith('/qa_owned_identity_snapshot_internal'))return new Response(JSON.stringify({snapshot:p.state.ownedMetadata.controlIdentity,digest:p.state.ownedIdentityDigest}));if(path.endsWith('/qa_owned_delete_read_internal'))return new Response(JSON.stringify(row));effects.push(path);throw Error('OFFLINE_EFFECT_DENIED');};
 const f=await fixture({nativeFactory:true,ownedControl:p.ownedControl,providerTransport,realProvenance:{api,reader:p.reader,readApproval:p.approval}});
 const r={uid:drift==='uid'?id(8500000):uid,sourceId:drift==='source'?p.plan.resources[1].sourceId:resource.sourceId,deleteOperationId:operationId,deleteGeneration:drift==='generation'?2:1};r.session={uid:r.uid,sid:id(8500001),token:'ephemeral-private'};
 await assert.rejects(()=>f.cleanup.executeOwnedCleanup({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,runId:drift==='run'?id(8600001):p.plan.runId,inventoryDigest:p.approval().payload.inventoryDigest,resources:[r]}));assert.equal(effects.length,0);
 assert(p.state.calls.some(c=>c.body?.query===api.RUNTIME_OWNED_CLOSING_SELECT));
});
test('final fixture optional beforeGuards hook follows unchanged canonical seeds and least grants',()=>{
 const s=readFileSync(new URL('./lifecycle.fence-final.fixture.mjs',import.meta.url),'utf8');
 assert.match(s,/export async function install\(\{beforeGuards\}=\{\}\)/);
 assert(s.indexOf('if(beforeGuards)await beforeGuards(f)')>s.indexOf('CREATE TABLE auth.refresh_tokens'));
 assert.match(s,/d.query\(RUNTIME_OWNED_METADATA_SELECT\)/);assert.doesNotMatch(s,/ownedMetadataHash:hash\(identity.snapshot\)/);
});

test('LQR02 genuine F3 rejects a signed controller-subset hash masquerading as full primary approval',async t=>{
 const p=composedProtocol(t),a=p.approval();a.payload.ownedControlMetadataHash=hash(p.state.ownedMetadata.controlIdentity);
 const signed=p.envelope(a.payload,'QA-PROVENANCE-APPROVAL-v1'),effects=[];
 const transport=async input=>{const path=new URL(String(input)).pathname;if(path.endsWith('/qa_owned_identity_snapshot_internal'))return new Response(JSON.stringify({snapshot:p.state.ownedMetadata.controlIdentity,digest:p.state.ownedIdentityDigest}));effects.push(path);throw Error('OFFLINE_EFFECT_DENIED');};
 const f=await fixture({nativeFactory:true,ownedControl:p.ownedControl,providerTransport:transport,realProvenance:{api,reader:p.reader,readApproval:async()=>signed}});
 await assert.rejects(()=>f.adapter.reserve({runId:p.plan.runId,operationId:p.plan.resources[0].createOperation,scope:'create',resourceKey:p.plan.resources[0].sourceId}));assert.equal(effects.length,0);
});
test('LQR02 independently verified closing fact does not expand exact signed receipt schema',async t=>{
 const p=composedProtocol(t),a=p.approval();a.payload.ownedControllerIdentityDigest=p.state.ownedIdentityDigest;
 assert.throws(()=>api.createRuntimeProvenanceGate({reader:p.reader,receipt:p.envelope(a.payload,'QA-PROVENANCE-APPROVAL-v1')}),/runtime_provenance_denied/);
});
test('final fixture executes optional hook only after identical default seeds/grants under no-DB transport',async()=>{
 const vm=await import('node:vm'),url=new URL('./lifecycle.fence-final.fixture.mjs',import.meta.url).href;
 const context=vm.createContext({Buffer,URL,Response,Headers,structuredClone,console});const modules=new Map(),events=[];
 const db={query:async(sql,args)=>{events.push({kind:'query',sql,args});return {rows:[{fks:[]}]};},exec:async sql=>{events.push({kind:'exec',sql});}};
 async function load(spec){
  if(modules.has(spec))return modules.get(spec);let obj;
  if(spec.startsWith('node:'))obj=await import(spec);
  else if(spec.endsWith('/qa_postgres_native_fixture.mjs'))obj={PGlite:class{constructor(){throw Error('OFFLINE_DATABASE_FORBIDDEN');}}};
  else if(spec.endsWith('/qa_final_composed_fixture.mjs'))obj={createFinalComposedFixture:async options=>{await options.beforeGuards({db});events.push({kind:'guards'});return {db,manifest:{entries:[]}};}};
  else if(spec.endsWith('/lifecycle.test-fixture.mjs'))obj={fixture:()=>{throw Error('OFFLINE_PROVIDER_FORBIDDEN');},id,ORIGIN};
  else if(spec.endsWith('/qa-runtime-provenance.mjs'))obj=api;
  if(obj){const m=new vm.SyntheticModule(Object.keys(obj),function(){for(const [k,v] of Object.entries(obj))this.setExport(k,v);},{context,identifier:spec});modules.set(spec,m);return m;}
  const m=new vm.SourceTextModule(readFileSync(new URL(spec),'utf8'),{context,identifier:spec,initializeImportMeta:meta=>{meta.url=spec;}});modules.set(spec,m);await m.link((s,ref)=>load(s.startsWith('node:')?s:new URL(s,ref.identifier).href));return m;
 }
 const m=await load(url);await m.evaluate();await m.namespace.install();const defaultEvents=structuredClone(events);events.length=0;
 await m.namespace.install({beforeGuards:async f=>{assert.equal(f.db,db);assert.equal(events.filter(e=>e.kind==='query').length,57);events.push({kind:'hook'});}});
 assert.equal(stable(events.filter(e=>e.kind!=='hook')),stable(defaultEvents));assert(events.findIndex(e=>e.kind==='hook')<events.findIndex(e=>e.kind==='guards'));
});

test('LQR03 exact completed replay with stale session performs no logout reservation or delete',async()=>{
 const p=await resumedModel({session:true});const result=await p.f.cleanup.executeOwnedCleanup({adapter:p.f.adapter,runtimeAuthority:p.f.runtimeAuthority,runId:p.runId,inventoryDigest:p.m.plan.rolePlanDigest,resources:[p.resource]});
 assert.equal(result.status,'complete');assert.equal(p.effects.length,0);assert.equal(p.resource.session.token,undefined);
});

test('actual F3 does not hide completed-run ephemeral reservation absence behind VM authority',async t=>{
 const p=composedProtocol(t),row=p.state.sqlInventory.ownedPlans[0],completedAt=new Date().toISOString();
 p.state.sqlInventory.ownedRunPlans=[{run_id:p.plan.runId,plan_id:row.plan_id,plan_payload:p.plan,completed_at:completedAt}];
 p.state.sqlInventory.facets.qaOwnedRunReceipts=[{run_id:p.plan.runId,plan_id:row.plan_id,completed_at:completedAt,role_plan_digest:p.plan.rolePlanDigest,control_identity_digest:p.plan.controlIdentityDigest}];p.state.sqlInventory.counts.qaOwnedRunReceipts=1;
 const a=p.approval(),g=api.createRuntimeProvenanceGate({reader:p.reader,receipt:a});
 await assert.rejects(()=>g.assertBeforeWrite({scope:'qa-cleanup',operationId:id(80),inventoryDigest:a.payload.inventoryDigest}),/runtime_provenance_denied/);
 assert.equal(p.state.sqlInventory.facets.qaOwnedSources.length,0);
});
