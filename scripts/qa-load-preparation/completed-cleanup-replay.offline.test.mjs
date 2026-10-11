import '../../tests/accounts_executor_deny_network.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as api from '../qa-runtime-provenance.mjs';
import {composedProtocol,installCompletedApiModel} from './completed-cleanup-replay.fixture.mjs';
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=v=>createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const pg=v=>Array.isArray(v)?'['+v.map(pg).join(', ')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>JSON.stringify(k)+': '+pg(v[k])).join(', ')+'}':JSON.stringify(v);
function completed(t){
 const f=composedProtocol(t),i=f.state.sqlInventory,row=i.ownedPlans[0],at=new Date().toISOString(),originalApproval=f.approval();
 i.ownedRunPlans=[{run_id:f.plan.runId,plan_id:row.plan_id,plan_payload:f.plan,completed_at:at}];
 i.facets.qaOwnedRunReceipts=[{run_id:f.plan.runId,plan_id:row.plan_id,completed_at:at,role_plan_digest:f.plan.rolePlanDigest,control_identity_digest:f.plan.controlIdentityDigest}];i.counts.qaOwnedRunReceipts=1;
 i.facets.qaOwnedDeletions=f.plan.resources.map((s,n)=>{
 const root={operation_id:id(9000000+n),generation:1,target_user_id:id(9100000+n),source_oid:f.state.ownedMetadata.functions.find(x=>x.identity==='app_private.qa_owned_native_root()').oid,gateway_oid:'22',backend_pid:123,sql_xid:'456',effect:'DELETE',closure:'all_exact_native_effects_observed',projection_digest:hash('auth '+n)};
 const d={operation_id:root.operation_id,run_id:s.runId,source_id:s.sourceId,target_user_id:root.target_user_id,canonical_key:s.canonicalKey,generation:1,status:'completed',ownership_receipt_digest:hash(pg({run:s.runId,source:s.sourceId,uid:root.target_user_id,canonical:s.canonicalKey,create_operation:s.createOperation,creation_receipt:s.receiptId,get_digest:root.projection_digest})),protected_snapshot_digest:hash('protected'),prepared_at:at,auth_readback_digest:hash('official absence '+n),absence_observed_at:at,native_root_receipt:root};
 d.completed_receipt=Object.fromEntries(['operation_id','run_id','target_user_id','canonical_key','generation','status','ownership_receipt_digest','protected_snapshot_digest','prepared_at','auth_readback_digest'].map(k=>[k,d[k]]));Object.assign(d.completed_receipt,{db_absent:true,auth_absent:true});return d;
 });i.counts.qaOwnedDeletions=57;
 const d=i.facets.qaOwnedDeletions[0];
 const request={runId:d.run_id,sourceId:d.source_id,operationId:d.operation_id,generation:d.generation,uid:d.target_user_id,canonicalKey:d.canonical_key,rolePlanDigest:f.plan.rolePlanDigest,ownershipReceiptDigest:d.ownership_receipt_digest,protectedSnapshotDigest:d.protected_snapshot_digest,authAbsenceDigest:d.auth_readback_digest,terminalReceiptDigest:hash(d.completed_receipt),nativeRootDigest:hash(d.native_root_receipt),finalCleanupDigest:hash(i.facets.qaOwnedDeletions.map(d=>({sourceId:d.source_id,receipt:d.completed_receipt,nativeRoot:d.native_root_receipt})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId,'en')))};
 f.state.completionUnfiltered=true;f.state.completionCounters={passwordFrames:0,sqlOperationFrames:0,coreFrames:0,ownedPasswordOperations:0};
 f.state.hook=null;f.state.sqlRead=()=>{throw Error('raw inventory is not an F3 read capability');};
 installCompletedApiModel(f);return {...f,approval:()=>originalApproval,request,read:async()=>api.createCompletedReplayGate({reader:f.reader,receipt:originalApproval,retainedPlan:f.retainedPlan,retainedMetadata:f.retainedMetadata}).readCompleted(request)};
}
test('Genuine F3 completed zero-source read returns already_completed',async t=>{
 const f=completed(t);assert.equal(typeof api.createCompletedReplayGate,'function','dedicated read-only gate missing');assert.equal((await f.read()).status,'already_completed');
});

for(const key of ['runId','sourceId','operationId','generation','uid','canonicalKey','rolePlanDigest','ownershipReceiptDigest','protectedSnapshotDigest','authAbsenceDigest','terminalReceiptDigest','nativeRootDigest','finalCleanupDigest'])test('Genuine F3 rejects requested drift '+key,async t=>{
 const f=completed(t);f.request[key]=key==='generation'?2:key.endsWith('Id')||key==='uid'?id(9900000):key==='canonicalKey'?'foreign': 'f'.repeat(64);await assert.rejects(f.read,/runtime_provenance_denied/);
});
for(const key of ['passwordFrames','sqlOperationFrames','coreFrames','ownedPasswordOperations'])test('Genuine F3 missing counter DENY '+key,async t=>{const f=completed(t);delete f.state.completionCounters[key];await assert.rejects(f.read,/runtime_provenance_denied/);});
for(const key of ['passwordFrames','sqlOperationFrames','coreFrames','ownedPasswordOperations'])test('Genuine F3 nonzero counter DENY '+key,async t=>{const f=completed(t);f.state.completionCounters[key]=1;await assert.rejects(f.read,/runtime_provenance_denied/);});
test('Genuine F3 repeated completed replay immutable safe DTO and zero mutation',async t=>{
 const f=completed(t),a=await f.read(),b=await f.read();assert.deepEqual(a,b);assert(Object.isFrozen(a));assert.equal(f.state.sqlInventory.facets.qaOwnedSources.length,0);
 for(const c of f.state.calls){if(c.method==='POST'){assert(new URL(c.url).pathname.endsWith('/database/query/read-only'));assert(c.body.query.includes('public.qa_completed_cleanup_replay_read('));}else assert.equal(c.method,'GET');}
 assert.equal(/password|token|secret|service/i.test(JSON.stringify(a)),false);
});
test('Genuine F3 completed-only brand cannot be promoted to write',async t=>{
 const f=completed(t),g=api.createCompletedReplayGate({reader:f.reader,receipt:f.approval(),retainedPlan:f.retainedPlan,retainedMetadata:f.retainedMetadata});assert(api.isCompletedReplayGate(g));assert.equal(api.isNativeCompletedReplayGate(g),false);assert.equal(api.isRuntimeProvenanceGate(g),false);assert.equal(api.isCompletedReplayGate({...g}),false);assert.equal(g.assertBeforeWrite,undefined);const a=await g.readCompleted(f.request);assert.equal(api.isRuntimeProvenanceGate(a),false);
 const old=api.createRuntimeProvenanceGate({reader:f.reader,receipt:f.approval()});await assert.rejects(()=>old.assertBeforeWrite({scope:'qa-cleanup',operationId:f.approval().payload.operationId,inventoryDigest:f.approval().payload.inventoryDigest}),/runtime_provenance_denied/);
});
for(const state of ['prepared','delete_prepared','auth_delete_in_flight','auth_delete_unknown','db_finalize_pending'])test('Genuine F3 incomplete zero-source state DENY '+state,async t=>{const f=completed(t);f.state.sqlInventory.facets.qaOwnedDeletions[0].status=state;await assert.rejects(f.read,/runtime_provenance_denied/);});
for(const kind of ['terminal','root','plan-signature','run-incomplete','missing-terminal','foreign-terminal','protected-metadata','reappearance','session','fence','pending','role-plan-unit','raw-source','revoked'])test('Genuine F3 retained proof DENY '+kind,async t=>{
 const f=completed(t),i=f.state.sqlInventory,d=i.facets.qaOwnedDeletions[0];
 if(kind==='terminal')d.completed_receipt.generation=2;
 if(kind==='root')d.native_root_receipt.projection_digest='f'.repeat(64);
 if(kind==='plan-signature')i.ownedPlans[0].signature='A'.repeat(86)+'==';
 if(kind==='run-incomplete')i.ownedRunPlans[0].completed_at=null;
 if(kind==='missing-terminal'){i.facets.qaOwnedDeletions.pop();i.counts.qaOwnedDeletions--;}
 if(kind==='foreign-terminal')d.run_id=id(9999999);
 if(kind==='protected-metadata')f.state.ownedMetadata.columns[0].required=false;
 if(kind==='reappearance'){i.facets.profiles.push({id:d.target_user_id,login_name:'x',full_name:'x',active:true,must_change_password:true});i.counts.profiles++;}
 if(kind==='session'){i.facets.sessions.push({id:id(99999),user_id:d.target_user_id,created_at:new Date().toISOString(),not_after:null});i.counts.sessions++;}
 if(kind==='fence'){i.facets.qaOwnedDeletionFences.push({target_user_id:d.target_user_id,canonical_key:d.canonical_key,run_id:d.run_id,operation_id:d.operation_id,generation:1});i.counts.qaOwnedDeletionFences++;}
 if(kind==='pending'){i.facets.qaOwnedOperations.push({run_id:d.run_id,operation_id:id(999),scope:'cleanup',resource_key:d.source_id,state:'unknown',actual:'pending',history:[],reserved_at:new Date().toISOString()});i.counts.qaOwnedOperations++;}
 if(kind==='role-plan-unit')i.ownedUnits[0].name='drift';
 if(kind==='raw-source')i.ownedPlans[0].payload.sourceHashes['owned-control.sql']='f'.repeat(64);
 if(kind==='revoked')f.state.revoked=true;
 await assert.rejects(f.read,/runtime_provenance_denied/);
});
test('Genuine F3 requires unfiltered proof for supplemental frame tables',async t=>{const f=completed(t);delete f.state.completionUnfiltered;await assert.rejects(f.read,/runtime_provenance_denied/);});
test('Genuine F3 detects Edge drift during its final frontend await',async t=>{
 const f=completed(t);let frontends=0;
 f.state.hook=req=>{if(new URL(req.url).hostname==='api.cloudflare.com'&&++frontends===2)f.state.edges[0].version++;};
 await assert.rejects(f.read,/runtime_provenance_denied/);
});
test('Genuine F3 API integration forbids all raw private/inventory SQL',async t=>{
 const f=completed(t);await f.read();
 const sql=f.state.calls.filter(c=>c.method==='POST').map(c=>c.body.query);
 assert(sql.length>0);assert(sql.every(q=>q.includes('public.qa_completed_cleanup_replay_read(')),'completed replay still calls broad/raw selectors');
});
test('Genuine F3 pure facade accepts branded read gate only',async t=>{
 const f=completed(t);let module;try{module=await import('./completed-cleanup-replay.mjs');}catch{}assert.equal(typeof module?.replayCompletedCleanup,'function','pure facade missing');
 const gate=api.createCompletedReplayGate({reader:f.reader,receipt:f.approval(),retainedPlan:f.retainedPlan,retainedMetadata:f.retainedMetadata});assert.equal((await module.replayCompletedCleanup({gate,request:f.request})).status,'already_completed');await assert.rejects(()=>module.replayCompletedCleanup({gate:{readCompleted:async()=>({status:'already_completed'})},request:f.request}));
});
