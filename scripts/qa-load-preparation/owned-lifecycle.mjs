import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDeletionCoordinator} from './owned-deletion-coordinator.mjs';
import {isAccountRuntimeAuthority} from '../accounts-official-reset.mjs';
import {isRuntimeProvenanceGate} from '../qa-runtime-provenance.mjs';
import {UUID,DIGEST,requireOwned,OwnedIO} from './owned-io.mjs';
import {isOfficialOwnedQAAdapter,isNativeOwnedQAAdapter} from './official-owned-adapter.mjs';
export const OWNED_ROLES=Object.freeze(JSON.parse(readFileSync(new URL('./JOURNEYS.json',import.meta.url),'utf8')).roles.map(x=>x.role));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};

// Projection validation is NOT approval or ownership. Every native effect needs
// a fresh authentic F3 gate and server-approved role/unit plan readback.
export function compileOwnedPopulation({runId,resources,protectedUIDs,protectedCanonicalKeys,rolePlanDigest}={}){
 requireOwned(UUID.test(runId)&&DIGEST.test(rolePlanDigest)&&Array.isArray(resources)&&resources.length===57,'OWNED_POPULATION_DENIED');
 requireOwned(Array.isArray(protectedUIDs)&&new Set(protectedUIDs).size===protectedUIDs.length&&protectedUIDs.every(x=>UUID.test(x))&&Array.isArray(protectedCanonicalKeys)&&protectedCanonicalKeys.length>=57&&new Set(protectedCanonicalKeys).size===protectedCanonicalKeys.length&&protectedCanonicalKeys.every(x=>typeof x==='string'&&x.length>0),'PROTECTED_INVENTORY_REQUIRED');
 const keys=new Set(),emails=new Set(),sources=new Set(),aliases=new Set();
 const load=resources.filter(x=>x.kind==='owned-load-qa'),roles=resources.filter(x=>x.kind==='owned-role-e2e');
 requireOwned(load.length===50&&roles.length===7&&new Set(roles.map(x=>x.role)).size===7&&OWNED_ROLES.every(r=>roles.some(x=>x.role===r)),'OWNED_POPULATION_DENIED');
 for(const r of resources){
  requireOwned(r&&r.runId===runId&&UUID.test(r.sourceId)&&!sources.has(r.sourceId)&&typeof r.canonicalKey==='string'&&r.canonicalKey.length>0&&!keys.has(r.canonicalKey)&&!protectedCanonicalKeys.includes(r.canonicalKey)&&typeof r.email==='string'&&r.email.length>0&&!emails.has(r.email)&&typeof r.loginAlias==='string'&&r.loginAlias.length>0&&!aliases.has(r.loginAlias)&&OWNED_ROLES.includes(r.role)&&Array.isArray(r.memberships)&&r.memberships.length>0&&r.rolePlanDigest===rolePlanDigest,'OWNED_SOURCE_OR_ROLE_PLAN_DENIED');
  // No manufactured business-unit hierarchy or role-to-membership template.
  for(const m of r.memberships)requireOwned(m&&Object.keys(m).sort().join(',')==='is_primary,membership_role,unit_id'&&UUID.test(m.unit_id)&&typeof m.membership_role==='string'&&m.membership_role.length>0&&typeof m.is_primary==='boolean','APPROVED_CURRENT_UNIT_BINDING_REQUIRED');
  keys.add(r.canonicalKey);emails.add(r.email);sources.add(r.sourceId);aliases.add(r.loginAlias);
 }
 return freeze({stage:'UntrustedOwnedPopulationProjection',runId,rolePlanDigest,resources:structuredClone(resources),protectedUIDs:structuredClone(protectedUIDs),protectedCanonicalKeys:structuredClone(protectedCanonicalKeys),counts:{load:50,roleE2E:7,total:57},nativeApproval:false});
}

// Executable fail-closed entrypoint, not a plan promoted to native approval. The
// accepted Core function rejects these QA keys. There is currently no legitimate
// owned bootstrap creator. Do not strand Auth identities by CREATE-then-discover.
export async function runOwnedNativeLifecycle({adapter,runtimeGate,runtimeAuthority,population,privateCandidates,deadlineMs=5000}={}){
 requireOwned(isRuntimeProvenanceGate(runtimeGate)||isAccountRuntimeAuthority(runtimeAuthority),'RUNTIME_PROVENANCE_REQUIRED');
 requireOwned(isOfficialOwnedQAAdapter(adapter)&&population?.stage==='UntrustedOwnedPopulationProjection','OFFICIAL_OWNED_ADAPTER_REQUIRED');
 try{await adapter.preflightOwnedBootstrap({population});}catch{
  return {status:'blocked',code:'OWNED_QA_BOOTSTRAP_BRIDGE_REQUIRED',load:50,roleE2E:7,resourcesCreated:0,testsExecuted:0,providerMutations:0,nativeApproval:false};
 }
 requireOwned(isNativeOwnedQAAdapter(adapter)&&isAccountRuntimeAuthority(runtimeAuthority),'NATIVE_OWNED_ADAPTER_REQUIRED');
 requireOwned(privateCandidates instanceof Map&&privateCandidates.size===57&&population.resources.every(r=>typeof privateCandidates.get(r.sourceId)==='string'&&UUID.test(r.createOperation)&&UUID.test(r.receiptId)),'PRIVATE_CANDIDATE_SOURCE_REQUIRED');
 const io=new OwnedIO({adapter,runtimeGate,runtimeAuthority,inventoryDigest:population.rolePlanDigest,deadlineMs});
 const deletion=createDeletionCoordinator({adapter,runtimeAuthority,deadlineMs});
 const proofs=[];let created=0,tested=0,cleaned=0;
 await io.read('preflight',()=>adapter.preflightOwnedBootstrap({population}));
 await io.read('prepare-owned-run',()=>adapter.prepareOwnedRun());
 for(const r of population.resources){
  let password=privateCandidates.get(r.sourceId),session=null;
  const step=(scope,work,operationId=randomUUID())=>io.write({runId:population.runId,operationId,scope,resourceKey:r.sourceId},work);
  try{
   const marker={run_id:population.runId,source_id:r.sourceId,operation_id:r.createOperation,receipt_id:r.receiptId,canonical_key:r.canonicalKey,kind:r.kind};
   const envelope=await step('create',()=>adapter.createOwned({email:r.email,password,marker}),r.createOperation);created++;
   const persisted=await io.read('persisted-official-get',()=>adapter.readAuth(envelope.id));
   requireOwned(persisted.id===envelope.id&&persisted.email===r.email&&persisted.user_metadata?.run_id===marker.run_id&&persisted.user_metadata?.source_id===marker.source_id&&persisted.user_metadata?.operation_id===marker.operation_id&&persisted.user_metadata?.receipt_id===marker.receipt_id,'OWNED_PERSISTED_CREATE_PROOF_DENIED');
   await step('link',()=>adapter.linkOwned({runId:population.runId,sourceId:r.sourceId,canonicalKey:r.canonicalKey,uid:persisted.id,memberships:r.memberships}));
   session=await step('login',()=>adapter.loginOwned({email:r.email,password,uid:persisted.id}));
   await io.read('run-manifest-readback',()=>adapter.persistRunManifest({runId:population.runId,uid:persisted.id,canonicalKey:r.canonicalKey,loginAlias:r.loginAlias,role:r.role,operationId:r.createOperation,receiptId:r.receiptId}));
   const proof=await step('test',()=>adapter.testOwnedBounded({runId:population.runId,sourceId:r.sourceId,session}));tested++;
   await step('logout',()=>adapter.disposeOwnedSession(session));session.token=undefined;session=null;
   requireOwned(io.snapshot().pending===0&&!io.snapshot().quarantined,'OWNED_IO_UNSETTLED');
   const receipt=await deletion.execute({runId:population.runId,sourceId:r.sourceId,operationId:randomUUID()});
   if(receipt.status!=='completed')return {status:'pending',resourcesCreated:created,testsExecuted:tested,resourcesCleaned:cleaned,deletion:receipt,pending:deletion.snapshot().pending,nativeApproval:false};
   cleaned++;
   proofs.push({sourceId:r.sourceId,uid:persisted.id,sid:proof.sid,role:proof.role,absent:true});
  }catch{
   // Preserve unknown durable custody; never repeat CREATE/link/provider deletes.
   // A verified owned session alone may be disposed even when a test fails.
   if(session&&io.snapshot().pending===0){try{await adapter.disposeOwnedSession(session);}catch{}}
   return {status:'quarantined',resourcesCreated:created,testsExecuted:tested,resourcesCleaned:cleaned,unknown:true,nativeApproval:false};
  }finally{password=undefined;if(session)session.token=undefined;privateCandidates.delete(r.sourceId);}
 }
 const terminal=await io.read('complete-owned-run',()=>adapter.completeOwnedRun());
 requireOwned(proofs.length===57&&new Set(proofs.map(p=>p.uid)).size===57&&new Set(proofs.map(p=>p.sid)).size===57,'OWNED_57_UNIQUENESS_DENIED');
 return {status:'complete',load:50,roleE2E:7,resourcesCreated:created,testsExecuted:tested,resourcesCleaned:cleaned,proofs,terminal,nativeApproval:false};
}
