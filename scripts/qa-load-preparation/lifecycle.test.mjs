import test from 'node:test';
import assert from 'node:assert/strict';
import * as cleanup from './cleanup.mjs';
import {compileOwnedPopulation,OWNED_ROLES} from './owned-lifecycle.mjs';
import {fixture,id} from './lifecycle.test-fixture.mjs';
const protectedUIDs=Array.from({length:65},(_,i)=>id(i+1));
const protectedCanonicalKeys=Array.from({length:65},(_,i)=>'protected-'+i);
function population(){const runId=id(700),digest='a'.repeat(64);return {runId,rolePlanDigest:digest,protectedUIDs,protectedCanonicalKeys,resources:Array.from({length:57},(_,i)=>({runId,kind:i<50?'owned-load-qa':'owned-role-e2e',sourceId:id(10000+i),canonicalKey:'synthetic-owned-'+i,loginAlias:'synthetic-alias-'+i,email:'synthetic-'+i+'@fixture.invalid',role:i<50?'employee':OWNED_ROLES[i-50],rolePlanDigest:digest,memberships:[{unit_id:id(701),membership_role:'fixture-approved-binding',is_primary:true}]}))};}
function marker(i=0){return {run_id:id(700),source_id:id(10000+i),operation_id:id(20000+i),receipt_id:id(25000+i),canonical_key:'synthetic-owned-'+i,kind:i<50?'owned-load-qa':'owned-role-e2e'};}
async function create(f,i=0){return f.adapter.createOwned({email:'synthetic-'+i+'@fixture.invalid',password:'SyntheticOnly!Aa2',marker:marker(i)});}


test('cleanup exposes a fail-closed asynchronous native admission boundary',()=>{
  assert.equal(typeof cleanup.executeOwnedCleanup,'function');
});

test('native cleanup rejects a caller-forged provenance handle and planner booleans',async()=>{
  await assert.rejects(cleanup.executeOwnedCleanup({runtimeGate:{assertBeforeWrite:async()=>true},resources:[{createdThisRun:true}]}),/RUNTIME_PROVENANCE_REQUIRED/);
});

test('owned lifecycle exposes the official adapter and validated 50-plus-seven population compiler',async()=>{
  const lifecycle=await import('./owned-lifecycle.mjs').catch(()=>({}));
  assert.equal(typeof lifecycle.compileOwnedPopulation,'function');
  assert.equal(typeof lifecycle.runOwnedNativeLifecycle,'function');
  const adapter=await import('./official-owned-adapter.mjs').catch(()=>({}));
  assert.equal(typeof adapter.createOfficialOwnedQAAdapter,'function');
});

test('population is exactly fifty plus the seven current roles with independent sources',()=>{
 const p=compileOwnedPopulation(population());assert.deepEqual(p.counts,{load:50,roleE2E:7,total:57});assert.equal(new Set(p.resources.map(r=>r.sourceId)).size,57);assert.equal(p.nativeApproval,false);
});
for(const [name,mutate] of [
 ['missing approved unit binding',p=>p.resources[0].memberships=[]],
 ['duplicate source',p=>p.resources[1].sourceId=p.resources[0].sourceId],
 ['duplicate email',p=>p.resources[1].email=p.resources[0].email],
 ['missing separate role',p=>p.resources[50].kind='owned-load-qa'],
 ['protected canonical identity',p=>p.resources[0].canonicalKey=p.protectedCanonicalKeys[0]],
 ['invented role',p=>p.resources[50].role='invented'],
 ['stale role plan',p=>p.resources[0].rolePlanDigest='b'.repeat(64)],
])test('population rejects '+name,()=>{const p=population();mutate(p);assert.throws(()=>compileOwnedPopulation(p));});

test('accepted Core bootstrap rejection occurs before any provider action',async()=>{
 const f=await fixture();const p=compileOwnedPopulation(population());const r=await f.lifecycle.runOwnedNativeLifecycle({adapter:f.adapter,runtimeGate:f.gate,population:p});
 assert.equal(r.status,'blocked');assert.equal(r.code,'OWNED_QA_BOOTSTRAP_BRIDGE_REQUIRED');assert.equal(f.state.calls.length,0);assert.equal(f.state.sql.length,1);assert.match(f.state.sql[0].text,/pg_get_functiondef/);assert.match(f.state.sql[0].text,/account_provision_link_internal/);
});

test('official SDK boundaries exercise 57 synthetic UID/SID pairs, never claim the missing native manifest journey',async()=>{
 const f=await fixture();const pairs=[];
 for(let i=0;i<57;i++){
  const envelope=await create(f,i),persisted=await f.adapter.readAuth(envelope.id);assert.equal(persisted.id,envelope.id);assert.equal(persisted.user_metadata.source_id,marker(i).source_id);
  const session=await f.adapter.loginOwned({email:persisted.email,password:'SyntheticOnly!Aa2',uid:persisted.id});pairs.push([session.uid,session.sid]);
  const checked=await f.adapter.testOwnedRead(session);assert.equal(checked.readListPassed,true);assert.equal(checked.nativeRoleE2EAccepted,false);
  await f.adapter.disposeOwnedSession(session);await f.adapter.deleteOwnedAuth(session.uid);await f.adapter.assertAuthAbsent(session.uid);
 }
 assert.equal(new Set(pairs.map(p=>p[0])).size,57);assert.equal(new Set(pairs.map(p=>p[1])).size,57);
 assert.equal(f.state.users.size,0);assert.equal(f.state.sessions.size,0);assert.equal(f.state.calls.filter(c=>c.method==='DELETE').length,57);
 assert.equal(f.state.calls.filter(c=>c.path==='/auth/v1/logout').length,57);assert.equal(f.state.calls.filter(c=>c.path==='/auth/v1/admin/users'&&c.method==='POST').length,57);
 assert.ok(f.state.gates.every(x=>['qa-create','qa-session','qa-cleanup'].includes(x.scope)));
});

test('official create envelope email mismatch fails closed',async()=>{const f=await fixture({fault:{createEnvelopeEmail:true}});await assert.rejects(create(f),/CREATE_ENVELOPE_MISMATCH/);assert.equal(f.state.calls.filter(c=>c.method==='POST').length,1);});
test('fresh official GET UID mismatch fails closed',async()=>{const f=await fixture({fault:{getUIDMismatch:true}});const created=await create(f);await assert.rejects(f.adapter.readAuth(created.id),/OFFICIAL_GET_IDENTITY_MISMATCH/);assert.equal(f.state.calls.filter(c=>c.method==='DELETE').length,0);});
test('omitted native SID cannot establish ownership or authorize logout',async()=>{const f=await fixture({fault:{omitSID:true}});const created=await create(f);await assert.rejects(f.adapter.loginOwned({uid:created.id,email:created.email,password:'SyntheticOnly!Aa2'}),/NATIVE_SESSION_REQUIRED/);assert.equal(f.state.calls.filter(c=>c.path==='/auth/v1/logout').length,0);});
test('failed official delete is not absence or automatic retry',async()=>{const f=await fixture({fault:{deleteFailed:true}});const created=await create(f);await assert.rejects(f.adapter.deleteOwnedAuth(created.id),/OFFICIAL_RESPONSE_UNVERIFIED/);assert.equal(f.state.calls.filter(c=>c.method==='DELETE').length,1);assert.equal(f.state.users.size,1);});
test('delete acknowledgement with persisted GET still present fails readback',async()=>{const f=await fixture({fault:{deleteStillPresent:true}});const created=await create(f);await f.adapter.deleteOwnedAuth(created.id);await assert.rejects(f.adapter.assertAuthAbsent(created.id),/OFFICIAL_AUTH_STILL_PRESENT/);assert.equal(f.state.calls.filter(c=>c.method==='DELETE').length,1);});

test('exact composite SQL delete preserves the neighboring tuple and checks absence',async()=>{
 const f=await fixture();const row={user_id:id(1000),unit_id:id(701),membership_role:'member',active:true};const other={...row,unit_id:id(702)};
 f.state.rows.set('public.user_memberships',{pk:['user_id','unit_id','membership_role'],rows:[row,other]});
 const receipt={surface:'public.user_memberships',pk:{user_id:row.user_id,unit_id:row.unit_id,membership_role:row.membership_role},row_digest:f.hash(row)};
 await f.adapter.deleteExact({receipt,row});assert.deepEqual(f.state.rows.get(receipt.surface).rows,[other]);
 const deletion=f.state.sql.find(s=>s.text.includes('/*qa-owned:exact-delete*/'));assert.match(deletion.text,/"membership_role"=\$1 AND t\."unit_id"=\$2 AND t\."user_id"=\$3/);assert.match(deletion.text,/to_jsonb\(t\)=\$4::jsonb/);assert.equal(f.state.gates.at(-1).scope,'qa-cleanup');
});
test('partial composite key cannot dispatch deletion',async()=>{const f=await fixture();f.state.rows.set('public.user_memberships',{pk:['user_id','unit_id','membership_role'],rows:[]});await assert.rejects(f.adapter.deleteExact({receipt:{surface:'public.user_memberships',pk:{user_id:id(1000)},row_digest:'a'.repeat(64)},row:{}}),/INCOMPLETE_COMPOSITE_KEY/);assert.equal(f.state.sql.filter(s=>s.text.includes('exact-delete')).length,0);});
test('business records are never a SQL delete surface',async()=>{const f=await fixture();await assert.rejects(f.adapter.deleteExact({receipt:{surface:'public.transactions',pk:{id:id(1000)}},row:{}}),/DELETE_SURFACE_DENIED/);assert.equal(f.state.sql.length,0);});

test('partial unknown mutation retains physical custody and durable no-retry across a new worker',async()=>{
 let release;const held=new Promise(resolve=>release=resolve);const f=await fixture({fault:{holdFetch:held}});
 const opts={adapter:f.adapter,runtimeGate:f.gate,inventoryDigest:'a'.repeat(64),deadlineMs:20};const io=new f.OwnedIO(opts);const operation={runId:id(700),operationId:id(20000),scope:'qa-create',resourceKey:'synthetic-owned-0'};
 await assert.rejects(io.write(operation,()=>create(f)),/OWNED_MUTATION_QUARANTINED/);
 assert.equal(io.snapshot().pending,1);assert.equal(f.state.operations.get(id(700)+id(20000)).state,'unknown');assert.equal(f.state.calls.length,1);
 const next=new f.OwnedIO(opts);await assert.rejects(next.write(operation,()=>create(f)));assert.equal(f.state.calls.length,1);
 release();for(let i=0;i<50&&io.snapshot().pending;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(io.snapshot().pending,0);const durable=f.state.operations.get(id(700)+id(20000));assert.equal(durable.state,'unknown');assert.equal(durable.actual,'fulfilled');assert.equal(durable.history.some(h=>h.state==='unknown'),true);assert.equal(await f.adapter.readPending(id(700)),1);
 assert.equal(f.state.calls.filter(c=>c.method==='POST').length,1);
});

test('cleanup refuses a caller-created mutation adapter even at the offline branded provenance seam',async()=>{
 const f=await fixture();await assert.rejects(f.cleanup.executeOwnedCleanup({runtimeGate:f.gate,adapter:{deleteOwnedAuth:async()=>{throw new Error('must not dispatch');}}}),/OFFICIAL_OWNED_ADAPTER_REQUIRED/);assert.equal(f.state.calls.length,0);
});
test('cleanup refuses missing legitimate disposal bridge before sessions, SQL mutations or Auth deletes',async()=>{
 const f=await fixture();await assert.rejects(f.cleanup.executeOwnedCleanup({runtimeGate:f.gate,adapter:f.adapter}),/OWNED_QA_DISPOSAL_BRIDGE_REQUIRED/);assert.equal(f.state.calls.length,0);assert.equal(f.state.sql.length,0);
});

test('actual official noResolveJson logout retains custody until the physical body is consumed',async()=>{
 let release;const held=new Promise(resolve=>release=resolve),f=await fixture({fault:{holdLogoutBody:held}});const u=await create(f);const s=await f.adapter.loginOwned({uid:u.id,email:u.email,password:'SyntheticOnly!Aa2'});
 const io=new f.OwnedIO({adapter:f.adapter,runtimeGate:f.gate,inventoryDigest:'a'.repeat(64),deadlineMs:20});
 await assert.rejects(io.write({runId:id(700),operationId:id(20001),scope:'qa-session',resourceKey:s.sid},()=>f.adapter.disposeOwnedSession(s)),/OWNED_MUTATION_QUARANTINED/);
 assert.equal(io.snapshot().pending,1);assert.equal(f.state.sql.some(q=>q.text.includes('session-absence')),false);assert.equal(f.state.calls.filter(c=>c.path==='/auth/v1/logout').length,1);
 release();for(let i=0;i<50&&io.snapshot().pending;i++)await new Promise(r=>setTimeout(r,5));assert.equal(io.snapshot().pending,0);assert.equal(f.state.operations.get(id(700)+id(20001)).state,'unknown');assert.equal(f.state.sessions.size,0);
});

test('reservation acknowledgement timeout cannot be mistaken for provider dispatch or retried after restart',async()=>{
 let release;const held=new Promise(resolve=>release=resolve),f=await fixture({fault:{holdReservationAck:held}});const opts={adapter:f.adapter,runtimeGate:f.gate,inventoryDigest:'a'.repeat(64),deadlineMs:20},op={runId:id(700),operationId:id(20002),scope:'qa-create',resourceKey:'synthetic-owned-0'},io=new f.OwnedIO(opts);
 await assert.rejects(io.write(op,()=>create(f)),/OWNED_IO_UNSETTLED/);assert.equal(io.snapshot().pending,1);assert.equal(f.state.calls.length,0);release();for(let i=0;i<50&&io.snapshot().pending;i++)await new Promise(r=>setTimeout(r,5));
 const next=new f.OwnedIO(opts);await assert.rejects(next.write(op,()=>create(f)));assert.equal(f.state.calls.length,0);assert.equal(await f.adapter.readPending(id(700)),1);
});

test('transport exceptions are sanitized before actual SDK logging; capture never serializes a credential',async()=>{
 const sentinel='candidate-'+crypto.randomUUID(),f=await fixture({fault:{rejectTransport:sentinel}});let publicError;
 try{await create(f);}catch(e){publicError=e.message;}
 const logsContain=JSON.stringify(f.state.logs,(_,v)=>v instanceof Error?{message:v.message}:v).includes(sentinel);
 assert.equal(typeof publicError==='string'&&!publicError.includes(sentinel),true);assert.equal(logsContain,false);assert.equal(f.state.calls.filter(c=>c.method==='POST').length,1);
});

test('a fresh provenance rejection prevents the physical mutation',async()=>{
 const f=await fixture({fault:{provenanceDenied:true}});await assert.rejects(create(f),/runtime_provenance_denied/);assert.equal(f.state.calls.length,0);
});
