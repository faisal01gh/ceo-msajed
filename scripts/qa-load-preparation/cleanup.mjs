import {sha256} from './gate.mjs';
const deny=()=>{throw new Error('CLEANUP_DENIED');};
export function planCleanup({runId,protectedUIDs,protectedSnapshotDigest,resources}) {
  if(!runId||!Array.isArray(protectedUIDs)||!Array.isArray(resources)||!resources.length||!/^[0-9a-f]{64}$/.test(protectedSnapshotDigest))deny();
  const seen=new Set();const exact=[];
  for(const r of resources) {
    if(!r||typeof r.surface!=='string'||typeof r.key!=='string'||!r.key||!r.ownerUID||r.runId!==runId||r.createdThisRun!==true||r.dependenciesVerified!==true||r.foreignReferences!==0||protectedUIDs.includes(r.ownerUID)||protectedUIDs.includes(r.key)||!/^[0-9a-f]{64}$/.test(r.createReceiptDigest)||!/^[0-9a-f]{64}$/.test(r.persistedReadbackDigest))deny();
    const tuple=JSON.stringify([r.surface,r.key]);if(seen.has(tuple))deny();seen.add(tuple);exact.push({...r});
  }
  const payload={stage:'CleanupPlanOnly',runId,protectedSnapshotDigest,resources:exact,scope:'exact immutable receipt keys only; no prefix scans, cascades, blanket logout or business-record restoration',mutationsPerformed:0};
  return Object.freeze({...payload,inventoryDigest:sha256(JSON.stringify(payload))});
}
export function verifyCleanupReadback(plan,{protectedSnapshotDigest,remainingKeys,pendingOperations,openSessions}) {
  if(!plan||plan.stage!=='CleanupPlanOnly'||plan.protectedSnapshotDigest!==protectedSnapshotDigest||pendingOperations!==0||openSessions!==0||!remainingKeys||typeof remainingKeys!=='object')throw new Error('CLEANUP_READBACK_DENIED');
  for(const r of plan.resources)if(!Object.hasOwn(remainingKeys,r.surface)||!Array.isArray(remainingKeys[r.surface])||remainingKeys[r.surface].includes(r.key))throw new Error('CLEANUP_READBACK_DENIED');
  return {passed:true,inventoryDigest:plan.inventoryDigest,exactOwnedKeysAbsent:plan.resources.length,protectedUnchanged:true,pendingOperations:0,ownedOpenSessions:0};
}
