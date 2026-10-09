import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createNativePermit,CONTRACT,sha256} from './gate.mjs';
import {createClient,runRound} from './transport.mjs';
export const REVIEWED_RUNTIME_FILES=Object.freeze(['native.mjs','gate.mjs','transport.mjs','metrics.mjs']);
export async function runNativeLoad(inputs) {
  // No CLI credentials, environment tokens, stored password files, refreshes, admin methods or arbitrary URLs.
  const permit=createNativePermit({...inputs,now:Date.now()});
  if(REVIEWED_RUNTIME_FILES.some(f=>!Object.hasOwn(permit.runnerHashes,f)))throw new Error('GATE_DENIED');
  for(const file of REVIEWED_RUNTIME_FILES){const actual=sha256(await readFile(new URL(file,import.meta.url)));if(actual!==permit.runnerHashes[file])throw new Error('GATE_DENIED');}
  const client=createClient({origin:permit.target.backend,permit,maxSockets:CONTRACT.total});
  const out={stage:'NativeProvider',sourceSHA:permit.sourceSHA,runId:permit.runId,approvalDigest:permit.approvalDigest,attestationDigest:permit.attestationDigest,contract:CONTRACT,ramps:[],final:null,accepted:false,mutationsPerformed:0,retries:0,stopReason:null};
  try {
    for(const n of [...CONTRACT.ramps,CONTRACT.requestsPerIdentity]) {
      if(Date.now()-inputs.attestation.payload.capturedAt>300000) {out.stopReason='FRESH_ATTESTATION_REQUIRED';break;}
      const r=await runRound({client,identities:permit.identities,requestsPerIdentity:n,roundId:n===50?'final':`ramp-${n}`});
      if(n===50)out.final=r;else out.ramps.push(r);
      if(r.http429||r.http5xx||r.errors||r.uncertainRequests){out.stopReason=r.http429?'OBSERVED_PROVIDER_429':r.http5xx?'OBSERVED_PROVIDER_5XX':'TRANSPORT_OR_IDENTITY_FAILURE';break;}
    }
    const f=out.final;out.accepted=!!f&&f.uniqueUIDs===50&&f.uniqueSIDs===50&&f.counters.transmitted===2500&&f.counters.bodyComplete===2500&&f.counters.terminal===2500&&f.errors===0&&f.uncertainRequests===0&&f.transportPeak===2500&&f.perIdentity.every(x=>x.attempts===50&&x.transmitted===50&&x.bodyComplete===50&&x.terminal===50);
    if(f&&!out.accepted&&!out.stopReason)out.stopReason='REQUESTED_TRANSPORT_PEAK_NOT_REACHED';
  }catch {out.stopReason='GATE_OR_RUN_FAILURE';}
  finally {out.drain=await client.close();if(out.drain.remainingClientRequests||out.drain.remainingClientSockets){out.accepted=false;out.stopReason='DRAIN_UNCONFIRMED';}}
  return out;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  console.error('NATIVE_PHASE_LOCKED: parent must import runNativeLoad with signed approval, fresh exact-target attestation and owned in-memory credentials. No network attempted.');process.exitCode=2;
}
