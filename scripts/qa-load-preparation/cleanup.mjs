import {sha256} from './gate.mjs';
import {isRuntimeProvenanceGate} from '../qa-runtime-provenance.mjs';
import {isOfficialOwnedQAAdapter,isNativeOwnedQAAdapter} from './official-owned-adapter.mjs';
import {isAccountRuntimeAuthority} from '../accounts-official-reset.mjs';
import {OwnedIO,UUID,requireOwned} from './owned-io.mjs';
import {randomUUID} from 'node:crypto';
import {createDeletionCoordinator} from './owned-deletion-coordinator.mjs';

// This native admission boundary is deliberately blocked while the accepted
// Core/private Guards have no legitimate owned-QA bootstrap/disposal source.
// The official adapter implements actual exact SDK/SQL mutations, but a planner
// boolean, caller callback or an unreviewed private-frame writer cannot admit
// them. Do not label this component a completed native cleanup executor.
export async function executeOwnedCleanup({runtimeGate,runtimeAuthority,adapter,runId,resources,inventoryDigest,deadlineMs=5000}={}) {
  if(!isRuntimeProvenanceGate(runtimeGate)&&!isAccountRuntimeAuthority(runtimeAuthority))throw new Error('RUNTIME_PROVENANCE_REQUIRED');
  if(!isOfficialOwnedQAAdapter(adapter))throw new Error('OFFICIAL_OWNED_ADAPTER_REQUIRED');
  await adapter.preflightOwnedCleanup();
  requireOwned(isNativeOwnedQAAdapter(adapter)&&isAccountRuntimeAuthority(runtimeAuthority)&&UUID.test(runId)&&Array.isArray(resources)&&resources.length>0&&resources.length<=57,'NATIVE_OWNED_CLEANUP_REQUIRED');
  const io=new OwnedIO({adapter,runtimeGate,runtimeAuthority,inventoryDigest,deadlineMs});const proofs=[];
  const deletion=createDeletionCoordinator({adapter,runtimeAuthority,deadlineMs});
  const seen=new Set();
  for(const r of resources){
   requireOwned(UUID.test(r.sourceId)&&UUID.test(r.uid)&&!seen.has(r.uid),'OWNED_EXACT_DISPOSITION_DENIED');seen.add(r.uid);
   if(!r.deleteOperationId){const current=await io.read('exact-disposition',()=>adapter.readOwnedDisposition({runId,sourceId:r.sourceId,uid:r.uid}));requireOwned(current.state==='tested','OWNED_EXACT_DISPOSITION_DENIED');}
   const args={runId,sourceId:r.sourceId,uid:r.uid,operationId:r.deleteOperationId||randomUUID(),generation:r.deleteGeneration};
   const step=(scope,work)=>io.write({runId,operationId:randomUUID(),scope,resourceKey:r.sourceId},work);
   try{
    // Bind durable receipt to the unique signed source and exact requested UID
    // BEFORE logout/reservation/delete, even after ephemeral source disposal.
    let resumed;
    if(r.deleteOperationId){requireOwned(Number.isSafeInteger(r.deleteGeneration)&&r.deleteGeneration>0,'OWNED_DELETION_BINDING_DENIED');resumed=await io.read('deletion-binding',async()=>adapter.bindOwnedDeletionResource(await adapter.readOwnedDeletion(args),args));}
    if(r.session){requireOwned(r.session.uid===r.uid,'OWNED_SESSION_IDENTITY_DENIED');if(resumed?.receipt.status!=='completed')await step('logout',()=>adapter.disposeOwnedSession(r.session));}
    requireOwned(io.snapshot().pending===0&&!io.snapshot().quarantined,'OWNED_IO_UNSETTLED');
    const receipt=await (r.deleteOperationId?deletion.resume(args):deletion.execute(args));
    if(receipt.status!=='completed')return {status:'pending',exactOwnedAbsent:proofs.length,proofs,deletion:receipt,pending:deletion.snapshot().pending,nativeApproval:false};
    const bound=adapter.bindOwnedDeletionResource(receipt,args);
    proofs.push({uid:bound.uid,sourceId:bound.sourceId,operationId:receipt.operation_id,generation:receipt.generation,absent:true});
   }finally{if(r.session)r.session.token=undefined;}
  }
  return {status:'complete',exactOwnedAbsent:proofs.length,proofs,pending:io.snapshot().pending,nativeApproval:false};
}
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
