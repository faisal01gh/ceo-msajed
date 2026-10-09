import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
const m = await import('./metrics.mjs').catch(() => ({}));
const g = await import('./gate.mjs').catch(() => ({}));
const digest = x => createHash('sha256').update(x).digest('hex');
function fixtureGate() {
  const {publicKey,privateKey}=generateKeyPairSync('ed25519'); const now=Date.now(); const runId='local-gate-test';
  const uuid = i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
  const sourceSHA='717375eee1e99d558af80eca91a7ea7e829edd20'; const runnerHashes={'native.mjs':digest('fixture-source')};
  const approval={purpose:'native-qa-load',gate:'APPROVED',independentReviewer:true,sourceSHA,runnerHashes,issuedAt:now,expiresAt:now+90000,evidenceDigest:digest('independent-local-isolation-proof')};
  const envelope = payload=>({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')});
  const identities=Array.from({length:50},(_,i)=>{const uid=uuid(i+1),sid=uuid(i+1001);const claims={sub:uid,session_id:sid,iss:'https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1',role:'authenticated',exp:Math.floor(now/1000)+600};return {uid,sid,runId,kind:'owned-load-qa',accessToken:`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`,apiKey:['sb','publishable','fixture_in_memory'].join('_')};});
  const ownership=identities.map((x,i)=>({uid:x.uid,sidDigest:digest(x.sid),canonicalKey:`owned-${i}`,runId,kind:'owned-load-qa',createdThisRun:true,nativeAuthReadback:true,nativeSessionReadback:true,profileReady:true,createReceiptDigest:digest(`create-${i}`),persistedGETReceiptDigest:digest(`get-${i}`)}));
  const target={purpose:'fresh-native-load-target',projectRef:'movzojtnkkmdsjhmlgtq',frontend:'https://ceo-msajed.pages.dev',backend:'https://movzojtnkkmdsjhmlgtq.supabase.co',sourceSHA,runId,capturedAt:now,expiresAt:now+90000,isolationReceiptDigest:digest(JSON.stringify(approval)),staffUIDs:Array.from({length:57},(_,i)=>uuid(i+5001)),legacyQAUIDs:Array.from({length:8},(_,i)=>uuid(i+6001)),faisalUID:uuid(5001),protectedSnapshotDigest:digest('protected57and8'),ownership,readOnlyAction:'list',nativeRouteReviewed:true};
  return {approval:envelope(approval),attestation:envelope(target),identities,trust:{publicKey,sourceSHA,runnerHashes},now,envelope};
}
test('native gate fails closed for absent approval, stale target, duplicate SID and protected identity',()=>{
  assert.equal(typeof g.createNativePermit,'function','native approval gate is missing');
  const f=fixtureGate(); const permit=g.createNativePermit(f); assert.equal(g.isNativePermit(permit),true); assert.equal(g.isNativePermit({approved:true}),false);
  assert.throws(()=>g.createNativePermit({...f,approval:null}),/GATE_DENIED/);
  const stale=structuredClone(f.attestation.payload);stale.capturedAt=f.now-600001; assert.throws(()=>g.createNativePermit({...f,attestation:f.envelope(stale)}),/GATE_DENIED/);
  const ids=f.identities.map(x=>({...x}));ids[1].sid=ids[0].sid;assert.throws(()=>g.createNativePermit({...f,identities:ids}),/GATE_DENIED/);
  const protectedTarget=structuredClone(f.attestation.payload);protectedTarget.staffUIDs[0]=f.identities[0].uid;protectedTarget.faisalUID=f.identities[0].uid;assert.throws(()=>g.createNativePermit({...f,attestation:f.envelope(protectedTarget)}),/GATE_DENIED/);
});
const cleanupModule=await import('./cleanup.mjs').catch(() => ({}));
test('cleanup inventory rejects unproven or protected resources and exact readback verifies absence',()=>{
  assert.equal(typeof cleanupModule.planCleanup,'function','exact cleanup planner is missing');
  const input={runId:'run',protectedUIDs:['staff','legacy-qa'],protectedSnapshotDigest:digest('protected'),resources:[{surface:'auth.users',key:'owned-uid',ownerUID:'owned-uid',runId:'run',createdThisRun:true,createReceiptDigest:digest('create'),persistedReadbackDigest:digest('readback'),dependenciesVerified:true,foreignReferences:0}]};
  const plan=cleanupModule.planCleanup(input);assert.equal(plan.resources.length,1);
  assert.throws(()=>cleanupModule.planCleanup({...input,resources:[{...input.resources[0],createdThisRun:false}]}),/CLEANUP_DENIED/);
  assert.throws(()=>cleanupModule.planCleanup({...input,resources:[{...input.resources[0],ownerUID:'staff'}]}),/CLEANUP_DENIED/);
  assert.throws(()=>cleanupModule.verifyCleanupReadback(plan,{protectedSnapshotDigest:input.protectedSnapshotDigest,remainingKeys:{'auth.users':['owned-uid']},pendingOperations:0,openSessions:0}),/CLEANUP_READBACK_DENIED/);
  assert.equal(cleanupModule.verifyCleanupReadback(plan,{protectedSnapshotDigest:input.protectedSnapshotDigest,remainingKeys:{'auth.users':[]},pendingOperations:0,openSessions:0}).passed,true);
});
const fixtureServerModule=await import('./fixture-server.mjs');
const transport=await import('./transport.mjs');
test('actual HTTP 429/503, incomplete bodies, deadlines and disconnects are separately accounted',async()=>{
  const s=await fixtureServerModule.createFixtureServer();const c=transport.createClient({origin:s.origin,localChallenge:s.challenge,deadlines:{requestMs:400,bodyMs:100,drainMs:300,roundMs:1000}});
  try {const paths=['/fault/429','/fault/503','/fault/body','/fault/request','/fault/disconnect'];const rows=(await Promise.all(paths.map(path=>c.request({identity:s.identities[0],path})))).map(x=>x.row);const out=m.summarize(rows,{startedAt:rows[0].attemptedAt,endedAt:Math.max(...rows.map(x=>x.terminalAt)),transportPeak:c.stats().peak});assert.equal(out.http429,1);assert.equal(out.http5xx,1);assert.equal(out.timeouts,2);assert.equal(out.uncertainRequests,3);assert.equal(out.counters.bodyComplete,2);assert.equal(out.counters.terminal,5);assert.equal(out.errorRate,1);assert.equal(rows[2].error,'BODY_TIMEOUT');assert.equal(rows[3].error,'REQUEST_TIMEOUT');assert.equal(rows[4].error,'NETWORK_ERROR');}finally{assert.equal((await c.close()).remainingClientSockets,0);assert.equal((await s.close()).remainingServerSockets,0);}
});
test('local transport rejects an external target before connecting and preserves sanitized denial',()=>{
  assert.throws(()=>transport.createClient({origin:'https://movzojtnkkmdsjhmlgtq.supabase.co',localChallenge:'fixture-only'}),/TRANSPORT_DENIED/);
  assert.throws(()=>transport.createClient({origin:'http://localhost:1234',localChallenge:'fixture-only'}),/TRANSPORT_DENIED/);
});
const native=await import('./native.mjs').catch(()=>({}));
test('native executable fails closed before network without signed reviewed inputs',async()=>{
  assert.equal(typeof native.runNativeLoad,'function','native later-phase executable is missing');
  await assert.rejects(()=>native.runNativeLoad({}),/GATE_DENIED/);
});
test('native route permits only reviewed list reads; alternate targets and writes are rejected before I/O',async()=>{
  const f=fixtureGate();const permit=g.createNativePermit(f);const x=permit.identities[0];
  assert.throws(()=>transport.createClient({origin:'https://ceo-msajed.pages.dev',permit}),/TRANSPORT_DENIED/);
  const c=transport.createClient({origin:g.TARGET.backend,permit});try{
    assert.throws(()=>c.request({identity:x,path:'/functions/v1/transactions-api',method:'POST',body:{action:'delete_hard',app:'new',token:x.accessToken}}),/REQUEST_DENIED/);
    assert.throws(()=>c.request({identity:x,path:'/auth/v1/user',method:'GET'}),/REQUEST_DENIED/);
    const hashes=Object.fromEntries(native.REVIEWED_RUNTIME_FILES.map(k=>[k,digest('not-real-runtime')]));const a={...f.approval.payload,runnerHashes:hashes};const t={...f.attestation.payload,isolationReceiptDigest:digest(JSON.stringify(a))};
    await assert.rejects(()=>native.runNativeLoad({...f,trust:{...f.trust,runnerHashes:hashes},approval:f.envelope(a),attestation:f.envelope(t)}),/GATE_DENIED/);
  }finally{assert.equal((await c.close()).remainingClientSockets,0);}
});
test('native gate rejects tampered signature, wrong project, missing ownership and privileged key',()=>{
  const f=fixtureGate();const a=structuredClone(f.approval);a.payload.gate='NOT_APPROVED';assert.throws(()=>g.createNativePermit({...f,approval:a}),/GATE_DENIED/);
  const t=structuredClone(f.attestation.payload);t.projectRef='wrong-new-target';assert.throws(()=>g.createNativePermit({...f,attestation:f.envelope(t)}),/GATE_DENIED/);
  const t2=structuredClone(f.attestation.payload);t2.ownership[0].createdThisRun=false;assert.throws(()=>g.createNativePermit({...f,attestation:f.envelope(t2)}),/GATE_DENIED/);
  const ids=f.identities.map(x=>({...x}));ids[0].apiKey=`e30.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.fixture`;assert.throws(()=>g.createNativePermit({...f,identities:ids}),/GATE_DENIED/);
});
test('native read serialization is fixed to main app=new and cannot inherit a mutating toJSON',()=>{
  assert.equal(typeof transport.serializeNativeRead,'function','fixed native serialization is missing');
  const token=['synthetic','memory','only'].join('-');const bytes=transport.serializeNativeRead({accessToken:token});const parsed=JSON.parse(bytes);assert.equal(parsed.action,'list');assert.equal(parsed.app,'new');assert.equal(parsed.page,1);assert.equal(parsed.page_size,10);assert.equal(parsed.tab,'all');assert.equal(parsed.token===token,true);
});
test('ownership markers must be explicit own properties, not inherited claims',()=>{
  const f=fixtureGate();const t={...f.attestation.payload,ownership:f.attestation.payload.ownership.map(o=>({...o}))};const first=t.ownership[0];delete first.createdThisRun;Object.setPrototypeOf(first,{createdThisRun:true});assert.throws(()=>g.createNativePermit({...f,attestation:f.envelope(t)}),/GATE_DENIED/);
});
const local = await import('./local.mjs').catch(() => ({}));
test('real loopback HTTP validates ownership, releases 2500 transports, measures drain and seven role journeys', {timeout:180000}, async()=>{
  assert.equal(typeof local.exerciseLocal,'function','real HTTP fixture runner is missing');
  const out=await local.exerciseLocal();
  assert.equal(out.stage,'LocalHTTPFixture'); assert.equal(out.final.uniqueUIDs,50); assert.equal(out.final.uniqueSIDs,50);
  for(const k of ['attempts','enqueued','transmitted','bodyComplete','terminal'])assert.equal(out.final.counters[k],2500,k);
  assert.equal(out.final.transportPeak,2500); assert.equal(out.final.serverReadback.peak,2500);
  assert.equal(out.final.serverReadback.uniqueRequests,2500); assert.equal(out.final.serverReadback.ownershipErrors,0);
  assert.ok(out.final.perIdentity.every(x=>x.attempts===50&&x.transmitted===50&&x.bodyComplete===50&&x.terminal===50));
  assert.equal(out.final.errors,0); assert.equal(out.final.uncertainRequests,0);
  assert.equal(out.capacityControl.counters.transmitted,2500); assert.ok(out.capacityControl.transportPeak<=7);
  assert.equal(out.roles.length,7); assert.ok(out.roles.every(x=>x.checks===10&&x.passed===10));
  assert.equal(out.drain.remainingClientSockets,0); assert.equal(out.drain.remainingServerSockets,0);
  assert.equal(out.cleanup.ownedRemaining,0); assert.equal(out.cleanup.protectedUnchanged,true);
});
test('nearest-rank arithmetic and measured lifecycle denominator', () => {
  assert.equal(typeof m.summarize, 'function', 'measured lifecycle summarizer is missing');
  const rows = Array.from({length:100}, (_,i) => ({uid:`u${i%50}`, sidDigest:`s${i%50}`, attemptedAt:0, enqueuedAt:0, transmittedAt:1, bodyCompleteAt:i+2, terminalAt:i+2, status:200, error:null, uncertain:false}));
  const out = m.summarize(rows, {startedAt:0, endedAt:101, transportPeak:100});
  assert.equal(out.latencyMs.avg, 51.5); assert.equal(out.latencyMs.min, 2); assert.equal(out.latencyMs.max,101);
  assert.equal(out.latencyMs.p50,51); assert.equal(out.latencyMs.p95,96); assert.equal(out.latencyMs.p99,100);
  assert.equal(out.throughputTerminalPerSecond,100/0.101);
  assert.equal(out.counters.transmitted,100); assert.equal(out.uniqueUIDs,50); assert.equal(out.uniqueSIDs,50);
});
