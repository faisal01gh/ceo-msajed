// TEST ONLY. Synthetic SQL state, not native PostgreSQL/cascade acceptance.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {hash} from './official-owned-adapter.mjs';
import {fixture,id} from './lifecycle.test-fixture.mjs';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});
export async function setup({hold,exists=false,sqlFailure=false,initial='new',foreign=false,deadlineMs=1000,readbackMode='normal',deleteError=false,stateFile,authorityFault={},holdDeleteBody,ownedCascade=false}={}){
 const runId=id(1),sourceId=id(2),operationId=id(3),uid=id(4);let present=initial==='db_finalize_pending'||initial==='completed'?false:true;
 const snapshot={functions:[]},identityDigest='c'.repeat(64);
 const resources=Array.from({length:57},(_,i)=>({canonicalKey:i?'fixture-owned-'+i:'fixture-owned',createOperation:id(10000+i),displayName:'fixture',email:'fixture-'+i+'@example.invalid',kind:'owned-load-qa',loginAlias:'fixture-'+i,memberships:[],receiptId:id(20000+i),role:'employee',runId,sourceId:i?id(30000+i):sourceId}));
 const units=[],rolePlanDigest=hash({resources,units});resources.forEach(r=>r.rolePlanDigest=rolePlanDigest);
 const plan={controlIdentityDigest:identityDigest,protectedCanonicalKeys:['faisal'],protectedUIDs:[id(500)],resources,rolePlanDigest,runId,sourceHash:createHash('sha256').update(readFileSync(new URL('./owned-control.sql',import.meta.url))).digest('hex'),units,sourceHashes:Object.fromEntries(['owned-control.sql','owned-deletion-fence.sql'].map(n=>[n,createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex')]))};
 const payload=JSON.stringify(plan),{publicKey,privateKey}=generateKeyPairSync('ed25519');
 const ownedControl={planId:id(20),runId,identityDigest,rolePlanDigest,reviewerPublicKey:publicKey.export({type:'spki',format:'pem'}),signedPlan:{payload,signature:sign(null,Buffer.from('QA-OWNED-ROLEPLAN-v1\n'+payload),privateKey).toString('base64')}};
 const cascadeEffects=[];
 const calls=[],receipts=[],writes=[];let row=initial==='new'?null:{operation_id:operationId,run_id:runId,target_user_id:uid,canonical_key:'fixture-owned',generation:1,status:initial,ownership_receipt_digest:'a'.repeat(64),protected_snapshot_digest:'b'.repeat(64),prepared_at:'2026-10-09T00:00:00Z',auth_readback_digest:null};
 let deleteCalls=0;if(stateFile&&existsSync(stateFile)){const persisted=JSON.parse(readFileSync(stateFile,'utf8'));row=persisted.row;present=persisted.present;deleteCalls=persisted.deleteCalls;}
 const persist=()=>{if(stateFile)writeFileSync(stateFile,JSON.stringify({row,present,deleteCalls}));};
 const transport=async(input,init={})=>{const u=new URL(String(input)),method=init.method||'GET';assert.equal(u.origin,'https://movzojtnkkmdsjhmlgtq.supabase.co');calls.push({method,path:u.pathname});
  if(u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1),a=JSON.parse(init.body);if(name==='qa_owned_identity_snapshot_internal')return response({digest:identityDigest,snapshot});writes.push({name,args:a});
   if(name==='qa_owned_delete_prepare_internal'){assert.equal(a.p_source,sourceId);if(!row)row={operation_id:operationId,run_id:runId,target_user_id:uid,canonical_key:'fixture-owned',generation:1,status:'delete_prepared',ownership_receipt_digest:'a'.repeat(64),protected_snapshot_digest:'b'.repeat(64),prepared_at:'2026-10-09T00:00:00Z',auth_readback_digest:null};}
   else if(name==='qa_owned_delete_transition_internal'){if(row.status!==(a.p_status==='auth_delete_in_flight'?'delete_prepared':'auth_delete_in_flight'))return response({message:'CAS denied'},403);row.status=a.p_status;}
   else if(name==='qa_owned_delete_absence_internal'){assert.equal(present,false);assert.equal(a.p_uid,uid);row.status='db_finalize_pending';row.auth_readback_digest=a.p_readback_digest;}
   else if(name==='qa_owned_delete_finalize_internal'){if(sqlFailure)return response({message:'fixture finalize rejected'},403);assert.equal(present,false);assert.equal(row.status,'db_finalize_pending');row.status='completed';row.db_absent=true;row.auth_absent=true;}
   else assert.equal(name,'qa_owned_delete_read_internal');
   const out={...row,...(foreign?{run_id:id(999)}:{})};receipts.push(out);persist();return response(out);
  }
  assert.equal(u.pathname,'/auth/v1/admin/users/'+uid);
  if(method==='DELETE'){deleteCalls++;persist();assert.equal(row.status,'auth_delete_in_flight');assert.deepEqual(JSON.parse(init.body),{should_soft_delete:false});if(hold)await hold;if(deleteError)throw new Error('PRIVATE_TRANSPORT_SENTINEL');if(!exists)present=false;if(ownedCascade)cascadeEffects.push('exact-owned-profile-cascade','exact-owned-credential-cascade','exact-owned-registry-set-null');persist();if(holdDeleteBody)return new Response(new ReadableStream({start(controller){holdDeleteBody.then(()=>{controller.enqueue(new TextEncoder().encode('{}'));controller.close();});}}),{status:200,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});return response({});}
  if(readbackMode==='null200')return response({user:null},200);
  if(readbackMode==='wrong404')return response({code:'not_authorized',msg:'not authorized'},404);
  return present?response({id:uid,email:'private-fixture@example.invalid',user_metadata:{private:'NEVER_PERSIST'}}):response({code:'user_not_found',msg:'User not found'},404);
 };
 const f=await fixture({fault:authorityFault,providerTransport:transport,nativeFactory:true,ownedControl,ownedMetadataHash:hash({controlIdentity:snapshot,classification:'synthetic-full-primary-model'}),ownedControllerIdentityDigest:identityDigest});
 const coordinator=f.createDeletionCoordinator({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,deadlineMs});
 return {f,coordinator,authorityFault,cascadeEffects,runId,sourceId,operationId,uid,calls,receipts,writes,state:()=>row,setAbsent:()=>{present=false;}};
}
