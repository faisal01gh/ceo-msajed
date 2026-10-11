import '../../tests/accounts_executor_deny_network.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as api from '../qa-runtime-provenance.mjs';
import {pgJsonbDigest,parseCompletedReadQuery,COUNTERS,completedApiBodyDigest} from './completed-read-api.mjs';
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:stable(v)).digest('hex');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const provenanceSource=readFileSync(new URL('../../tests/qa_runtime_provenance.mjs',import.meta.url),'utf8');
const fixtureBody=provenanceSource.slice(provenanceSource.indexOf('function fixture(t,'),provenanceSource.indexOf("test('authentic signed approval"));
const protocolModule=await import('data:text/javascript;base64,'+Buffer.from(`
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {execFileSync} from 'node:child_process';
const scratch=${JSON.stringify(process.env.QA_PROVENANCE_SCRATCH||'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch')};
const api=await import(${JSON.stringify(new URL('../qa-runtime-provenance.mjs',import.meta.url).href)});
const {OWNED_CONTROL_INVENTORY_FACETS,OWNED_CONTROL_FUNCTION_SPECS}=await import(${JSON.stringify(new URL('./owned-attestation.mjs',import.meta.url).href)});
const stable=v=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
const hash=v=>createHash('sha256').update(v).digest('hex');
${fixtureBody.replace("  writeFileSync(join(root,'.gitattributes')","  mkdirSync(join(root,'supabase','migrations'),{recursive:true});writeFileSync(join(root,"+JSON.stringify('supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql')+"),readFileSync(new URL("+JSON.stringify(new URL('../../supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql',import.meta.url).href)+")));\n  writeFileSync(join(root,'.gitattributes')").replaceAll("new URL('../scripts/qa-load-preparation/'+name,import.meta.url)","new URL(name,"+JSON.stringify(new URL('./',import.meta.url).href)+")").replaceAll("new URL('../scripts/qa-load-preparation/owned-control.sql',import.meta.url)","new URL("+JSON.stringify(new URL('./owned-control.sql',import.meta.url).href)+")").replaceAll("new URL('../scripts/qa-load-preparation/'+n,import.meta.url)","new URL(n,"+JSON.stringify(new URL('./',import.meta.url).href)+")")}
export {fixture};`).toString('base64'));
export function composedProtocol(t){
 const f=protocolModule.fixture(t,{owned:true}),row=f.state.sqlInventory.ownedPlans[0],p=row.payload;
 f.state.ownedMetadata.nativeCatalogDigest=pgJsonbDigest(f.state.ownedMetadata.nativeCatalog);f.state.ownedIdentityDigest=pgJsonbDigest(f.state.ownedMetadata.controlIdentity);p.controlIdentityDigest=f.state.ownedIdentityDigest;
 f.state.sqlInventory.facets.qaOwnedNativeAnchor[0].catalog_digest=f.state.ownedMetadata.nativeCatalogDigest;
 f.state.sqlInventory.facets.qaOwnedPlans[0].control_identity_digest=p.controlIdentityDigest;
 p.resources.forEach((r,i)=>{r.sourceId=id(8100000+i);r.createOperation=id(8200000+i);r.receiptId=id(8300000+i);});
 p.rolePlanDigest=hash({resources:p.resources.map(({rolePlanDigest,...r})=>r),units:p.units});p.resources.forEach(r=>r.rolePlanDigest=p.rolePlanDigest);
 row.signature=f.envelope(p,'QA-OWNED-ROLEPLAN-v1').signature;
 f.state.sqlInventory.facets.qaOwnedPlans[0].role_plan_digest=p.rolePlanDigest;
 const approval=()=>{const a=f.approval();a.payload.operationId=id(80);return f.envelope(a.payload,'QA-PROVENANCE-APPROVAL-v1');};
 const pin=JSON.parse(readFileSync(f.pinPath));
 const ownedControl={planId:row.plan_id,runId:p.runId,identityDigest:p.controlIdentityDigest,rolePlanDigest:p.rolePlanDigest,reviewerPublicKey:pin.publicKey,signedPlan:{payload:stable(p),signature:row.signature}};
 return {...f,approval,ownedControl,plan:p};
}

// Deterministic closed API protocol MODEL only, never a native SQL result.
export function installCompletedApiModel(f){
 const initial=f.state.sqlInventory.ownedPlans[0];
 f.retainedPlan={planId:initial.plan_id,envelope:{payload:structuredClone(initial.payload),signature:initial.signature},expiresAt:initial.expires_at};
 f.retainedMetadata=structuredClone(f.state.ownedMetadata);
 const legacy=f.state.sqlRead;
 f.state.sqlRead=q=>{
  if(!q.startsWith('WITH args AS (SELECT pg_catalog.convert_from'))return legacy(q);
  const {request:a,expected:e}=parseCompletedReadQuery(q),i=f.state.sqlInventory,row=i.ownedPlans[0],plan=row.payload,ds=i.facets.qaOwnedDeletions;
  let proof=null;
  try{
   api.inventorySnapshotDigest(i);
   const d=ds.find(d=>d.run_id===a.runId&&d.source_id===a.sourceId&&d.operation_id===a.operationId&&d.generation===a.generation&&d.target_user_id===a.uid&&d.canonical_key===a.canonicalKey);if(!d)throw Error('missing terminal');
   const counts=Object.fromEntries(COUNTERS.map(k=>[k,0])),mapping={ownedSources:'qaOwnedSources',ownedOperations:'qaOwnedOperations',ownedResources:'qaOwnedResources',ownedFrames:'qaOwnedFrames',closureEmpty:'qaOwnedClosureEmpty',nativeFrames:'qaOwnedNativeFrames',fences:'qaOwnedDeletionFences',qaRuns:'qa_runs',qaAccounts:'qa_accounts',qaMembers:'qa_members',qaTransactions:'qa_transactions',sessions:'sessions',targetAuth:'auth_users'};
   for(const[k,v]of Object.entries(mapping))counts[k]=i.counts[v];
   for(const k of ['passwordFrames','sqlOperationFrames','coreFrames'])counts[k]=f.state.completionCounters[k];counts.passwordOperations=f.state.completionCounters.ownedPasswordOperations;
   counts.pending=ds.filter(d=>d.status!=='completed').length;
   if(f.state.completionUnfiltered!==true||Object.values(counts).some(n=>n!==0))throw Error('not zero');
   if(ds.length!==57||i.ownedRunPlans.length!==1||!i.ownedRunPlans[0].completed_at||stable(i.ownedRunPlans[0].plan_payload)!==stable(plan)||i.ownedRunPlans[0].run_id!==plan.runId)throw Error('run');
   if(!plan.units.every(u=>i.ownedUnits.some(v=>stable(u)===stable(v))))throw Error('units');
   for(const r of plan.resources){const t=ds.find(d=>d.source_id===r.sourceId&&d.canonical_key===r.canonicalKey&&d.run_id===r.runId);if(!t||t.status!=='completed'||plan.protectedUIDs.includes(t.target_user_id)||plan.protectedCanonicalKeys.includes(t.canonical_key))throw Error('terminal');
    const ownership=pgJsonbDigest({run:r.runId,source:r.sourceId,uid:t.target_user_id,canonical:r.canonicalKey,create_operation:r.createOperation,creation_receipt:r.receiptId,get_digest:t.native_root_receipt.projection_digest});if(ownership!==t.ownership_receipt_digest)throw Error('ownership');
    for(const k of ['profiles','user_roles','memberships','user_permissions','credential_state','qa_accounts','qa_members'])if(i.facets[k].some(v=>v.id===t.target_user_id||v.user_id===t.target_user_id))throw Error('reappeared');
   }
   const final=ds.map(d=>({sourceId:d.source_id,receipt:d.completed_receipt,nativeRoot:d.native_root_receipt})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId,'en'));
   const actual={rolePlanDigest:plan.rolePlanDigest,approvedPlanDigestPg:pgJsonbDigest(plan),signatureDigest:hash(row.signature),signingKeyHash:row.signing_key_hash,metadataDigestPg:pgJsonbDigest(f.state.ownedMetadata),controlIdentityDigest:f.state.ownedIdentityDigest,ownershipReceiptDigest:d.ownership_receipt_digest,protectedSnapshotDigest:d.protected_snapshot_digest,authAbsenceDigest:d.auth_readback_digest,terminalReceiptDigest:hash(d.completed_receipt),nativeRootDigest:hash(d.native_root_receipt),finalCleanupDigest:hash(final),apiBodyDigest:completedApiBodyDigest(f.root)};
   if(stable(actual)!==stable(e))throw Error('digest');
   proof={version:1,status:'already_completed',run_id:d.run_id,source_id:d.source_id,operation_id:d.operation_id,generation:d.generation,target_user_id:d.target_user_id,canonical_key:d.canonical_key,plan_id:row.plan_id,approved_plan_digest_pg:actual.approvedPlanDigestPg,signature_digest:actual.signatureDigest,signing_key_hash:actual.signingKeyHash,role_plan_digest:actual.rolePlanDigest,source_hashes:plan.sourceHashes,control_identity_digest:actual.controlIdentityDigest,metadata_digest_pg:actual.metadataDigestPg,native_catalog_digest:f.state.ownedMetadata.nativeCatalogDigest,proof_source_digest:actual.apiBodyDigest,ownership_receipt_digest:d.ownership_receipt_digest,creation_projection_digest:d.native_root_receipt.projection_digest,protected_snapshot_digest:d.protected_snapshot_digest,current_protected_digest:d.protected_snapshot_digest,auth_absence_digest:d.auth_readback_digest,current_auth_absence_digest:d.auth_readback_digest,terminal_receipt_digest_pg:pgJsonbDigest(d.completed_receipt),native_root_digest_pg:pgJsonbDigest(d.native_root_receipt),terminal_receipt_digest_js:hash(d.completed_receipt),native_root_digest_js:hash(d.native_root_receipt),final_cleanup_digest_pg:pgJsonbDigest(final),final_cleanup_digest_js:hash(final),completion_counters:counts,unfiltered:true,resource_count:57};
   proof.current_final_readback_digest_pg=pgJsonbDigest(proof);
  }catch{}
  return [{caller:{session_user:'postgres',current_user:'supabase_read_only_user',transaction_read_only:'on',public_usage:true,private_usage:false,auth_usage:false},metadata:structuredClone(f.state.metadata),postgres_version:f.state.postgresVersion,proof}];
 };
 return f;
}

