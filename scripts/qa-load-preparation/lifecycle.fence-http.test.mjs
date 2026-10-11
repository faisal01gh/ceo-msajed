// BOUNDED OFFLINE: real pinned SDK + actual JS; synthetic SQL CAS, NOT native FK acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture,id} from './lifecycle.test-fixture.mjs';
import {setup} from './lifecycle.fence-http.fixture.mjs';
test('coordinator rejects a generic SDK adapter even with an authority-shaped VM handle',async()=>{const f=await fixture();assert.throws(()=>f.createDeletionCoordinator({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority}),/DURABLE_DELETION_AUTHORITY_REQUIRED/);});

test('prepare committed before one-shot official DELETE; absence before SQL finalize',async()=>{
 const x=await setup();const result=await x.coordinator.execute({runId:x.runId,sourceId:x.sourceId,operationId:x.operationId});
 assert.equal(result.status,'completed');assert.equal(result.target_user_id,x.uid);assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);
 assert.deepEqual(x.writes.filter(w=>!w.name.endsWith('_read_internal')).map(w=>w.name),['qa_owned_delete_prepare_internal','qa_owned_delete_transition_internal','qa_owned_delete_absence_internal','qa_owned_delete_finalize_internal']);
 assert.equal(x.coordinator.snapshot().pending,0);assert(!JSON.stringify([result,x.receipts,x.writes]).includes('NEVER_PERSIST'));
});

test('caller deadline retains physical DELETE custody; restart while user exists never retries',async()=>{
 let release;const hold=new Promise(r=>release=r);const x=await setup({hold,exists:true,deadlineMs:25});
 const result=await Promise.race([x.coordinator.execute(x),new Promise((_,reject)=>setTimeout(()=>reject(new Error('deadline missing')),500))]);
 assert.equal(result.status,'auth_delete_unknown');assert.equal(x.coordinator.snapshot().pending,1);
 const next=x.f.createDeletionCoordinator({adapter:x.f.adapter,runtimeAuthority:x.f.runtimeAuthority,deadlineMs:1000});
 assert.equal((await next.resume(x)).status,'auth_delete_unknown');assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);
 release();await x.coordinator.drain();assert.equal(x.coordinator.snapshot().pending,0);assert.equal(x.state().status,'auth_delete_unknown');
 assert(!x.writes.some(w=>w.name==='qa_owned_delete_finalize_internal'));
});
test('late physical success is reconciled only with official absence and SQL proof',async()=>{
 let release;const x=await setup({hold:new Promise(r=>release=r),deadlineMs:25});
 assert.equal((await x.coordinator.execute(x)).status,'auth_delete_unknown');release();await x.coordinator.drain();
 assert.equal(x.state().status,'completed');assert.equal(x.coordinator.snapshot().pending,0);assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);
});


test('cleanup defines its coordinator before dispatch and retires the control DB-first entrypoint',()=>{
 const source=readFileSync(new URL('./cleanup.mjs',import.meta.url),'utf8');assert.match(source,/const deletion=createDeletionCoordinator/);
 const adapter=readFileSync(new URL('./official-owned-adapter.mjs',import.meta.url),'utf8');assert.match(adapter,/async disposeOwnedSQL[\s\S]*?DURABLE_DELETION_COORDINATOR_REQUIRED/);
});

test('cleanup and lifecycle use the durable coordinator, not DB-dispose then Auth DELETE',()=>{
 for(const name of ['cleanup.mjs','owned-lifecycle.mjs']){
  const source=readFileSync(new URL('./'+name,import.meta.url),'utf8');
  assert.match(source,/createDeletionCoordinator/);assert.doesNotMatch(source,/adapter\.(?:disposeOwnedSQL|deleteOwnedAuth|verifyOwnedAbsence)\(/);
 }
 const source=readFileSync(new URL('./official-owned-adapter.mjs',import.meta.url),'utf8');assert.match(source,/preflightOwnedDeletion/);
});


for(const initial of ['delete_prepared','auth_delete_in_flight','auth_delete_unknown','db_finalize_pending'])test('recover exact operation/generation from '+initial,async()=>{
 const x=await setup({initial});if(initial==='auth_delete_in_flight'||initial==='auth_delete_unknown')x.setAbsent();
 const result=await x.coordinator.resume({...x,generation:1});assert.equal(result.status,'completed');assert.equal(result.operation_id,x.operationId);assert.equal(result.generation,1);
 assert.equal(x.calls.filter(c=>c.method==='DELETE').length,initial==='delete_prepared'?1:0);
});
test('duplicate finalization returns the same completed receipt without another provider call',async()=>{
 const x=await setup();const first=await x.coordinator.execute(x);const n=x.calls.length;
 const next=x.f.createDeletionCoordinator({adapter:x.f.adapter,runtimeAuthority:x.f.runtimeAuthority});const second=await next.resume({...x,generation:1});
 assert.deepEqual(second,first);assert.equal(x.calls.slice(n).filter(c=>c.path.startsWith('/auth/')).length,0);assert.equal(x.writes.filter(w=>w.name==='qa_owned_delete_finalize_internal').length,1);
});
test('finalize SQL failure retains db_finalize_pending; never repeat DELETE',async()=>{
 const x=await setup({sqlFailure:true});assert.equal((await x.coordinator.execute(x)).status,'db_finalize_pending');
 await x.coordinator.resume({...x,generation:1});assert.equal(x.state().status,'db_finalize_pending');assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);assert.equal(x.coordinator.snapshot().pending,0);
});
for(const readbackMode of ['null200','wrong404'])test('reject non-absence official protocol '+readbackMode,async()=>{
 const x=await setup({readbackMode});assert.notEqual((await x.coordinator.execute(x)).status,'completed');assert(!x.writes.some(w=>w.name==='qa_owned_delete_finalize_internal'));
});
for(const [name,change] of [['faisal',r=>r.canonical_key='faisal'],['protected UID',r=>r.target_user_id=id(500)]])test('protected readback denies '+name+' before destructive finalization',async()=>{
 const x=await setup({initial:'db_finalize_pending'});change(x.state());await x.coordinator.resume({...x,generation:1});assert.equal(x.calls.filter(c=>c.method==='DELETE').length,0);assert(!x.writes.some(w=>w.name==='qa_owned_delete_finalize_internal'));
});

test('foreign run and foreign generation cannot finalize or dispatch',async()=>{
 for(const args of [{runId:id(999)},{generation:9}]){const x=await setup({initial:'db_finalize_pending'});await x.coordinator.resume({...x,...args});assert.equal(x.calls.filter(c=>c.method==='DELETE').length,0);assert(!x.writes.some(w=>w.name==='qa_owned_delete_finalize_internal'));}
});
test('CAS loser is read-only and cannot poison the winning in-flight fence',async()=>{
 const x=await setup({initial:'auth_delete_in_flight'});const before=x.writes.length;
 await x.coordinator.resume({...x,generation:1});
 assert.equal(x.state().status,'auth_delete_in_flight');assert.equal(x.writes.slice(before).filter(w=>w.name==='qa_owned_delete_transition_internal').length,0);
});

test('separate process-local coordinators share durable CAS and dispatch at most once',async()=>{
 const x=await setup();const other=x.f.createDeletionCoordinator({adapter:x.f.adapter,runtimeAuthority:x.f.runtimeAuthority});
 await Promise.all([x.coordinator.execute(x),other.execute(x)]);assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);
});
test('rejected physical response leaves unknown and sanitizes all public evidence',async()=>{
 const x=await setup({deleteError:true});const result=await x.coordinator.execute(x);assert.equal(result.status,'auth_delete_unknown');
 assert(!JSON.stringify([result,x.coordinator.snapshot(),x.f.state.logs,x.writes,x.receipts]).includes('PRIVATE_TRANSPORT_SENTINEL'));assert.equal(x.coordinator.snapshot().pending,0);
});

test('deferred physical response body permits owned provider effects but no unconfirmed explicit SQL finalization',async()=>{
 let release;const x=await setup({holdDeleteBody:new Promise(r=>release=r),ownedCascade:true,deadlineMs:25});
 const unknown=await x.coordinator.execute(x);assert.equal(unknown.status,'auth_delete_unknown');assert.equal(x.coordinator.snapshot().pending,1);
 assert.deepEqual(x.cascadeEffects,['exact-owned-profile-cascade','exact-owned-credential-cascade','exact-owned-registry-set-null']);
 assert(!x.writes.some(w=>w.name==='qa_owned_delete_absence_internal'||w.name==='qa_owned_delete_finalize_internal'));
 release();await x.coordinator.drain();assert.equal(x.state().status,'completed');assert.equal(x.calls.filter(c=>c.method==='DELETE').length,1);assert.equal(x.coordinator.snapshot().pending,0);
});

test('authority drift after physical DELETE cannot issue absence/finalize writes',async()=>{
 let release;const authorityFault={};const x=await setup({hold:new Promise(r=>release=r),deadlineMs:25,authorityFault});
 await x.coordinator.execute(x);authorityFault.provenanceDenied=true;release();await x.coordinator.drain();
 assert.notEqual(x.state().status,'completed');assert(!x.writes.some(w=>w.name==='qa_owned_delete_absence_internal'||w.name==='qa_owned_delete_finalize_internal'));assert.equal(x.coordinator.snapshot().pending,0);
});

test('fresh child processes resume every durable stage without credentials or blind retry',()=>{
 const root=process.env.QA_FENCE_HTTP_SCRATCH||'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/durable-deletion-fence/http/process-state';mkdirSync(root,{recursive:true});
 for(const status of ['delete_prepared','auth_delete_in_flight','auth_delete_unknown','db_finalize_pending','completed']){
  const file=root+'/'+status+'.json';writeFileSync(file,JSON.stringify({row:{operation_id:id(3),run_id:id(1),target_user_id:id(4),canonical_key:'fixture-owned',generation:1,status,ownership_receipt_digest:'a'.repeat(64),protected_snapshot_digest:'b'.repeat(64),prepared_at:'2026-10-09T00:00:00Z',auth_readback_digest:null,...(status==='completed'?{db_absent:true,auth_absent:true}:{})},present:status==='delete_prepared',deleteCalls:0}));
  const run=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./lifecycle.fence-http.child.mjs',import.meta.url)),file],{encoding:'utf8',timeout:5000});
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim());assert.equal(result.status,'completed');assert.equal(result.generation,1);assert.equal(result.deleteCalls,status==='delete_prepared'?1:0);
  const again=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./lifecycle.fence-http.child.mjs',import.meta.url)),file],{encoding:'utf8',timeout:5000});assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout.trim()).deleteCalls,result.deleteCalls);rmSync(file);
 }
});

test('dispatch requires a private one-shot SQL-CAS ticket, not a copied receipt',async()=>{
 const x=await setup({initial:'auth_delete_in_flight'});
 await assert.rejects(x.f.adapter.dispatchOwnedDeletion({...x.state()}),/DISPATCH/);
 assert.equal(x.calls.filter(c=>c.method==='DELETE').length,0);
});

