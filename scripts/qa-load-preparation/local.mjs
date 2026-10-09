import assert from 'node:assert/strict';
import {createFixtureServer} from './fixture-server.mjs';
import {createClient,runRound} from './transport.mjs';
import {CONTRACT,sha256} from './gate.mjs';
export async function exerciseLocal() {
  const s=await createFixtureServer();const c=createClient({origin:s.origin,localChallenge:s.challenge,maxSockets:2500});
  const control=createClient({origin:s.origin,localChallenge:s.challenge,maxSockets:50});let capped;
  const call=async(identity,path,body=null,client=control)=>client.request({identity,path,method:body?'POST':'GET',body,capture:true});
  let result;
  try {
    const handshake=await call(null,'/handshake');assert.equal(handshake.row.status,200);assert.equal(handshake.body.challenge,s.challenge);assert.equal(handshake.body.runId,s.runId);assert.equal(handshake.body.instanceAddress,'127.0.0.1');assert.equal(handshake.body.port,Number(new URL(s.origin).port));
    const proofs=await Promise.all(s.identities.map(x=>call(x,'/identity')));
    for(let i=0;i<50;i++){const p=proofs[i];assert.equal(p.row.status,200);assert.equal(p.body.uid,s.identities[i].uid);assert.equal(p.body.sid,s.identities[i].sid);assert.equal(p.body.runId,s.runId);assert.equal(p.body.kind,'owned-load-qa');}
    const roles=[];
    for(const owned of s.roleIdentities) {
      let x={...owned};let checks=0;
      const login=await call(null,'/login',{username:x.username,password:x.password});assert.equal(login.row.status,200);assert.equal(login.body.uid,x.uid);assert.equal(login.body.mustChangePassword,true);Object.assign(x,{sid:login.body.sid,accessToken:login.body.accessToken});checks++;
      const forced=await call(x,'/permissions');assert.equal(forced.row.status,403);assert.equal(forced.body.code,'CHANGE_REQUIRED');checks++;
      const stale={...x};const change=await call(x,'/forced-change',{password:'A9!'+x.password});assert.equal(change.row.status,200);assert.equal(change.body.mustChangePassword,false);assert.notEqual(change.body.sid,x.sid);Object.assign(x,{sid:change.body.sid,accessToken:change.body.accessToken});const old=await call(stale,'/session');assert.equal(old.row.status,401);checks++;
      const perm=await call(x,'/permissions');assert.equal(perm.row.status,200);assert.equal(perm.body.role,x.role);assert.ok(perm.body.permissions.includes('fixture.read_owned'));checks++;
      const visible=await call(x,'/transactions');assert.equal(visible.row.status,200);assert.ok(visible.body.rows.every(r=>r.owner===x.uid&&r.runId===s.runId));assert.equal(visible.body.foreignRows,0);checks++;
      const allowed=await call(x,'/allowed');assert.equal(allowed.row.status,200);assert.equal(allowed.body.owner,x.uid);checks++;
      const denied=await call(x,'/denied');assert.equal(denied.row.status,403);assert.equal(denied.body.writeIntents,0);checks++;
      const notif=await call(x,'/notifications');assert.equal(notif.row.status,200);assert.ok(notif.body.rows.every(n=>n.owner===x.uid&&n.read_at===null));checks++;
      const session=await call(x,'/session');assert.equal(session.row.status,200);assert.equal(session.body.sid,x.sid);checks++;
      const logout=await call(x,'/logout',{});assert.equal(logout.row.status,200);const absent=await call(x,'/session');assert.equal(absent.row.status,401);checks++;x.password=null;x.accessToken=null;
      roles.push({role:owned.role,stage:'LocalHTTPFixture',checks,passed:checks,nativeAcceptance:false});
    }
    const round=async(requestsPerIdentity,roundId,client=c,barrier=true)=>{
      s.configureRound(roundId,requestsPerIdentity,{barrier});const out=await runRound({client,identities:s.identities,requestsPerIdentity,roundId,localAdmissionProof:barrier?(count=>s.waitReceived(roundId,count)):null});
      const rb=await call(null,`/readback?round=${roundId}`);assert.equal(rb.row.status,200);assert.equal(rb.body.runId,s.runId);assert.equal(rb.body.challengeDigest,sha256(s.challenge));out.serverReadback=rb.body.round;
      assert.equal(out.counters.transmitted,50*requestsPerIdentity);assert.equal(out.counters.bodyComplete,50*requestsPerIdentity);assert.equal(out.counters.terminal,50*requestsPerIdentity);assert.equal(out.errors,0);assert.equal(out.uncertainRequests,0);
      assert.equal(out.serverReadback.uniqueRequests,50*requestsPerIdentity);assert.equal(out.serverReadback.bodyResponsesFinished,50*requestsPerIdentity);assert.equal(out.serverReadback.active,0);assert.equal(out.serverReadback.ownershipErrors,0);assert.equal(out.serverReadback.perIdentity.length,50);assert.ok(out.serverReadback.perIdentity.every(x=>x.count===requestsPerIdentity));
      if(barrier){assert.equal(out.transportPeak,50*requestsPerIdentity);assert.equal(out.serverReadback.peak,50*requestsPerIdentity);}
      return out;
    };
    const ramps=[];for(const n of CONTRACT.ramps)ramps.push(await round(n,`ramp-${n}`));
    const final=await round(50,'final');
    // Independent arithmetic reimplementation checks actual measured row durations, never fixture constants.
    const measured=final.rows.map(x=>x.terminalAt-x.attemptedAt).sort((a,b)=>a-b);const p={avg:measured.reduce((a,b)=>a+b,0)/measured.length,min:measured[0],max:measured.at(-1),p50:measured[1249],p95:measured[2374],p99:measured[2474]};for(const [k,v]of Object.entries(p))assert.equal(final.latencyMs[k],v);
    capped=createClient({origin:s.origin,localChallenge:s.challenge,maxSockets:7});const capacityControl=await round(50,'capacity-control',capped,false);assert.ok(capacityControl.transportPeak<=7);assert.ok(capacityControl.transportPeak<final.transportPeak);
    const cleanup=await s.cleanupOwned();const readback=await call(null,'/readback');assert.equal(readback.row.status,200);assert.equal(readback.body.ownedRemaining,0);assert.equal(readback.body.protectedUnchanged,true);
    result={stage:'LocalHTTPFixture',runId:s.runId,nativeAcceptance:false,realPostgreSQLAcceptance:'NOT_EXECUTED_BY_THIS_RUNNER',providerAcceptance:'NOT_EXECUTED',targetCalls:0,
      handshake:{origin:s.origin,stage:'LocalHTTPFixture',runId:s.runId,challengeDigest:sha256(s.challenge),readbackVerified:true},identityProof:{uniqueUIDs:new Set(proofs.map(p=>p.body.uid)).size,uniqueSIDs:new Set(proofs.map(p=>p.body.sid)).size,ownershipReadback:true,synthetic:true},roles,ramps,final,capacityControl,percentileArithmetic:{recomputedFromMeasuredTimes:true,nearestRankIndices:[1249,2374,2474],...p},cleanup};
  } finally {
    const clients=[c,control,...(capped?[capped]:[])];const drains=await Promise.all(clients.map(x=>x.close()));const serverDrain=await s.close();
    if(result)result.drain={remainingClientSockets:drains.reduce((a,d)=>a+d.remainingClientSockets,0),remainingClientRequests:drains.reduce((a,d)=>a+d.remainingClientRequests,0),...serverDrain};
  }
  return result;
}
