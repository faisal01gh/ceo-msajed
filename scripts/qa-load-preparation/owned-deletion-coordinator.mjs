import {isAccountRuntimeAuthority} from '../accounts-official-reset.mjs';
import {isNativeOwnedQAAdapter} from './official-owned-adapter.mjs';
import {UUID,requireOwned} from './owned-io.mjs';
// Independent committed RPCs only. Caller deadline never cancels physical HTTP.
export function createDeletionCoordinator({adapter,runtimeAuthority,deadlineMs=5000}={}){
 requireOwned(isNativeOwnedQAAdapter(adapter)&&isAccountRuntimeAuthority(runtimeAuthority),'DURABLE_DELETION_AUTHORITY_REQUIRED');
 requireOwned(Number.isSafeInteger(deadlineMs)&&deadlineMs>0&&deadlineMs<=60000,'DELETION_DEADLINE_REQUIRED');
 const active=new Map(),custody=new Set(),history=[];
 const bind=(r,a)=>adapter.bindOwnedDeletionResource(r,a).receipt;
 const own=p=>{custody.add(p);const done=p.then(()=>custody.delete(p),()=>custody.delete(p));globalThis.EdgeRuntime?.waitUntil?.(done);return p;};
 async function unknown(e){try{let r=bind(await adapter.readOwnedDeletion({operationId:e.args.operationId}),e.args);if(e.claimed&&r.status==='auth_delete_in_flight')r=await adapter.transitionOwnedDeletion(r,'auth_delete_unknown');e.receipt=r;return r;}catch{return {status:'pending',operation_id:e.args.operationId,unknown:true,fenceRetained:true};}}
 async function reconcile(e,r){
  if(r.status==='completed'){requireOwned(r.db_absent===true&&r.auth_absent===true,'DELETION_COMPLETION_UNVERIFIED');return r;}
  const proof=await adapter.readDeletionAuthAbsence(r);if(!proof.absent)return unknown(e);
  if(r.status!=='db_finalize_pending')r=await adapter.recordOwnedDeletionAbsence(r,proof.readbackDigest);e.receipt=r;
  const done=await adapter.finalizeOwnedDeletion(r);requireOwned(done.db_absent===true&&done.auth_absent===true,'DELETION_COMPLETION_UNVERIFIED');return done;
 }
 async function work(e,resume){
  let r=bind(await (resume?adapter.readOwnedDeletion({operationId:e.args.operationId}):adapter.prepareOwnedDeletion(e.args)),e.args);e.receipt=r;
  if(r.status==='delete_prepared'){
   if(e.expired)return r;
   try{r=await adapter.transitionOwnedDeletion(r,'auth_delete_in_flight');e.claimed=true;e.receipt=r;}catch{return unknown(e);}
   if(e.expired)return unknown(e);
   try{await adapter.dispatchOwnedDeletion(r);e.event.actual='fulfilled';}catch{e.event.actual='rejected';r=await unknown(e);if(r.status==='pending')return r;}
  }
  return reconcile(e,r);
 }
 function start(args,resume){
  requireOwned(UUID.test(args?.runId)&&UUID.test(args?.operationId)&&UUID.test(args?.sourceId),'DELETION_IDENTITY_REQUIRED');
  const old=active.get(args.operationId);if(old){requireOwned(old.args.runId===args.runId&&old.args.sourceId===args.sourceId&&old.args.generation===args.generation&&old.args.uid===args.uid,'DELETION_BINDING_DENIED');return old.caller;}
  const e={args:{runId:args.runId,sourceId:args.sourceId,operationId:args.operationId,generation:args.generation,uid:args.uid},expired:false,event:{operation_id:args.operationId,state:'started',actual:'pending'}};
  // Synchronous process reservation, then durable SQL CAS for other processes.
  active.set(args.operationId,e);history.push(e.event);
  const physical=own(Promise.resolve().then(()=>work(e,resume)).catch(()=>unknown(e)));
  e.caller=new Promise(resolve=>{
   const timer=setTimeout(()=>{e.expired=true;e.event.state='timed_out';const marking=own(unknown(e));let t;
    Promise.race([marking,new Promise(r=>{t=setTimeout(()=>r({status:'pending',operation_id:args.operationId,unknown:true,fenceRetained:true}),deadlineMs);})]).then(r=>{clearTimeout(t);resolve(r);});
   },deadlineMs);
   physical.then(r=>{clearTimeout(timer);if(!e.expired){e.event.state='settled';resolve(r);}active.delete(args.operationId);});
  });return e.caller;
 }
 return Object.freeze({execute:args=>start(args,false),resume:args=>start(args,true),snapshot:()=>({pending:custody.size,history:history.map(x=>({...x}))}),drain:()=>Promise.allSettled([...custody])});
}

