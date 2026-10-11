// TEST ONLY: inject platform timers through the existing VM fixture fault DI.
// No product hook, source rewriting, real network, or production timeout change.
import assert from 'node:assert/strict';
export function explicitDeadline(delay=120){
 let next=0;const timers=new Map();
 const set=(fn,ms,...args)=>{if(ms!==delay)return setTimeout(fn,ms,...args);const handle={testDeadline:++next};timers.set(handle,{fn,args});return handle;};
 const clear=handle=>{if(handle?.testDeadline)timers.delete(handle);else clearTimeout(handle);};
 return {timers:{setTimeout:set,clearTimeout:clear},fireCallerDeadline(){const [handle,timer]=timers.entries().next().value||[];assert(handle,'caller deadline was not registered');timers.delete(handle);timer.fn(...timer.args);},pendingTimers:()=>timers.size};
}
export function deleteBarrier(){
 let entered,release;const deleteEntered=new Promise(r=>entered=r),releaseDelete=new Promise(r=>release=r);let admitted=false,released=false;
 return {deleteEntered,holdBefore:releaseDelete,signalEntered(){assert(!admitted,'duplicate physical DELETE admission');admitted=true;entered();},releaseDelete(){assert(admitted,'release must follow actual DELETE admission');assert(!released,'duplicate release');released=true;release();},snapshot:()=>({admitted,released,pending:admitted&&!released})};
}
export async function controlledTimeout({h,d,p,index,kind='late-success'}){
 const clock=explicitDeadline(),gate=deleteBarrier(),r=p.plan.resources[index],base=Number(p.plan.runId.slice(-12)),uid=h.id(base+1000+index),args={runId:p.plan.runId,sourceId:r.sourceId,operationId:h.id(base+3000+index),generation:1};
 const events=[];const modes=new Map([[uid,{deleteEntered:gate.signalEntered,holdBefore:gate.holdBefore,keepPresent:['late-failure','unknown-present'].includes(kind),lateFailure:kind==='late-failure',lostResponse:kind.startsWith('unknown-')}]]);
 const f=await h.runtime(p,{modes,events,fault:{timers:clock.timers}});
 const prepared=await f.adapter.prepareOwnedDeletion(args);assert.equal(prepared.status,'delete_prepared');assert.equal(prepared.target_user_id,uid);assert.equal(prepared.generation,1);assert.match(prepared.ownership_receipt_digest,/^[a-f0-9]{64}$/);assert.match(prepared.protected_snapshot_digest,/^[a-f0-9]{64}$/);
 const fence=()=>h.scalar(d,'SELECT count(*) FROM app_private.qa_owned_deletion_fences WHERE target_user_id=$1',[uid]);assert.equal(await fence(),1);
 const co=f.createDeletionCoordinator({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,deadlineMs:120});const caller=co.resume(args);
 // No time advances while SQL preparation/dispatch admission is in progress.
 await Promise.race([gate.deleteEntered,caller.then(x=>{throw Error('caller settled before explicit DELETE admission: '+x.status);})]);
 assert.deepEqual(gate.snapshot(),{admitted:true,released:false,pending:true});assert.equal(co.snapshot().pending,1);
 const beforeFinalize=events.filter(x=>x.path==='/rest/v1/rpc/qa_owned_delete_finalize_internal').length;
 clock.fireCallerDeadline();const timed=await caller;
 assert.equal(timed.status,'auth_delete_unknown');assert.equal(co.snapshot().history[0].state,'timed_out');assert.equal(co.snapshot().history[0].actual,'pending');assert.equal(co.snapshot().pending,1);assert(gate.snapshot().pending);assert.equal(await fence(),1);assert(await f.readUser(uid));assert.equal(await h.scalar(d,'SELECT count(*) FROM app_private.qa_account_manifest WHERE user_id=$1',[uid]),1);
 assert.equal(events.filter(x=>x.method==='DELETE').length,1);assert.equal(events.filter(x=>x.path==='/rest/v1/rpc/qa_owned_delete_finalize_internal').length,beforeFinalize);
 assert.equal((await co.resume(args)).status,'auth_delete_unknown');assert.equal(events.filter(x=>x.method==='DELETE').length,1);
 await assert.rejects(f.adapter.dispatchOwnedDeletion(timed));assert.equal(events.filter(x=>x.method==='DELETE').length,1);
 const pendingState={boundedWaiter:'timed_out',actualTransport:'pending',coordinatorPending:co.snapshot().pending,pendingReceipt:timed.status,quarantine:{fence:true,redispatchDenied:true},finalizeCalls:beforeFinalize};
 gate.releaseDelete();await co.drain();assert.equal(co.snapshot().pending,0);assert.equal(events.filter(x=>x.method==='DELETE').length,1);
 const lateReceipt=await f.adapter.readOwnedDeletion(args);const auth=await f.adapter.readDeletionAuthAbsence(lateReceipt);
 if(['late-success','unknown-absent'].includes(kind)){assert.equal(lateReceipt.status,'completed');assert.equal(auth.absent,true);assert.equal(await fence(),0);}else{
  assert.equal(lateReceipt.status,'auth_delete_unknown');assert.equal(auth.absent,false);assert.equal(await fence(),1);assert.equal(events.filter(x=>x.path==='/rest/v1/rpc/qa_owned_delete_finalize_internal').length,beforeFinalize);
  // Exact trusted TEST provider-owner completion, not a second SDK DELETE.
  await f.deleteRoot(uid);const recovered=await co.resume(args);assert.equal(recovered.status,'completed');assert.equal(events.filter(x=>x.method==='DELETE').length,1);assert.equal(await fence(),0);
 }
 const finalize=events.findIndex(x=>x.path==='/rest/v1/rpc/qa_owned_delete_finalize_internal');assert(finalize>=0);assert(events.slice(0,finalize).some(x=>x.method==='GET'&&x.path==='/auth/v1/admin/users/'+uid));
 return {kind,operation_id:args.operationId,generation:1,pendingState,lateReceiptStatus:lateReceipt.status,lateActual:co.snapshot().history[0].actual,finalStatus:(await f.adapter.readOwnedDeletion(args)).status,deleteDispatches:events.filter(x=>x.method==='DELETE').length,finalizeOnlyAfterReadback:true,remainingTimers:clock.pendingTimers()};
}
