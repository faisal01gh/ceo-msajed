// Stable service-RPC ABI. Each call settles its own SQL transaction; callers
// must never wrap an HTTP operation in a SQL connection/transaction lease.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST=/^[0-9a-f]{64}$/;
export const DELETION_FENCE_ABI=1;
export const DELETION_FENCE_STATES=Object.freeze(['delete_prepared','auth_delete_in_flight','auth_delete_unknown','db_finalize_pending','completed']);
const uuid=v=>{if(typeof v!=='string'||!UUID.test(v))throw new TypeError('exact UUID required');return v;};
const generation=v=>{if(!Number.isSafeInteger(v)||v<1)throw new TypeError('exact positive generation required');return v;};
export function createDeletionFenceSQL(transport){
 if(typeof transport?.rpc!=='function')throw new TypeError('service RPC transport required');
 async function call(name,args,expected={}){
  const r=await transport.rpc(name,Object.freeze(args));if(r?.error)throw r.error;
  const j=r?.data;
  if(!j||typeof j!=='object'||Array.isArray(j)||!DELETION_FENCE_STATES.includes(j.status)||!UUID.test(j.operation_id)||!UUID.test(j.target_user_id)||!UUID.test(j.run_id)||!Number.isSafeInteger(j.generation)||j.generation<1||!DIGEST.test(j.ownership_receipt_digest)||!DIGEST.test(j.protected_snapshot_digest)||typeof j.canonical_key!=='string'||typeof j.prepared_at!=='string')throw new Error('invalid durable deletion SQL receipt');
  for(const [k,v] of Object.entries(expected))if(j[k]!==v)throw new Error('SQL receipt binding mismatch: '+k);
  const allowed=new Set(['operation_id','run_id','target_user_id','canonical_key','generation','status','ownership_receipt_digest','protected_snapshot_digest','prepared_at','auth_readback_digest','db_absent','auth_absent']);
  if(Object.keys(j).some(k=>!allowed.has(k)))throw new Error('unexpected SQL receipt field');
  return Object.freeze({...j});
 }
 return Object.freeze({
  async prepare({runId,sourceId,operationId}){return call('qa_owned_delete_prepare_internal',{p_run:uuid(runId),p_source:uuid(sourceId),p_operation:uuid(operationId)},{run_id:runId,operation_id:operationId});},
  async transition({operationId,generation:g,status}){if(!['auth_delete_in_flight','auth_delete_unknown'].includes(status))throw new TypeError('explicit dispatch/unknown transition required');return call('qa_owned_delete_transition_internal',{p_operation:uuid(operationId),p_generation:generation(g),p_status:status},{operation_id:operationId,generation:g,status});},
  async absence({operationId,generation:g,targetUserId,readbackDigest}){if(typeof readbackDigest!=='string'||!DIGEST.test(readbackDigest))throw new TypeError('nonsensitive official readback digest required');return call('qa_owned_delete_absence_internal',{p_operation:uuid(operationId),p_generation:generation(g),p_uid:uuid(targetUserId),p_readback_digest:readbackDigest},{operation_id:operationId,generation:g,target_user_id:targetUserId,status:'db_finalize_pending'});},
  async finalize({operationId,generation:g}){return call('qa_owned_delete_finalize_internal',{p_operation:uuid(operationId),p_generation:generation(g)},{operation_id:operationId,generation:g,status:'completed'});},
  async read({operationId}){return call('qa_owned_delete_read_internal',{p_operation:uuid(operationId)},{operation_id:operationId});}
 });
}
