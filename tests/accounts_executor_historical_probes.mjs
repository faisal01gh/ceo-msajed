// Historical independently authored probes, replayed by the implementing agent.
// This replay is local evidence, NOT Parent independent approval.
// Network prohibited by preload; generated candidates never logged or persisted.
import {fixture,OP,uuid} from './accounts_executor_fixture.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
const report=[];
const ack=c=>({acknowledged:true,operation_id:OP,target_user_id:c.target_user_id});
const drift=(f,field)=>{
 if(field==='auth_metadata')f.users.find(u=>u.email==='person-11@msajed.local').user_metadata.outside_change=true;
 else if(field==='registry')f.rows[11].profile_must_change=false;
 else if(field==='profile')f.projections.get('person_11').profile.full_name+=' outside-change';
 else f.projections.get('person_11').roles[0].role_code='outside-change';
};
for(const mode of ['initial','disconnect-recovery','late-recovery'])for(const field of ['profile','roles','auth_metadata','registry']){
 const f=await fixture(['person_10','person_11']);let recovery=mode==='initial',firstStarted=false,release,drifted=false;const sends=[];
 const held=new Promise(r=>release=r);
 const deliver=async c=>{
  sends.push({key:c.canonical_key,recovery,drift_already_present:drifted});
  if(!recovery)return {transmitted:true};
  if(c.canonical_key==='person_10'){
   firstStarted=true;
   if(mode==='late-recovery')await held;
   else{drift(f,field);drifted=true;}
  }
  return ack(c);
 };
 const runner=f.build({deliver});const initial=await runner.run();let final=initial;
 if(mode!=='initial'){
  recovery=true;const attempt=runner.deliverPending();
  if(mode==='late-recovery'){while(!firstStarted)await tick();drift(f,field);drifted=true;release();}
  final=await attempt;
 }
 const unsafeSecondSend=sends.some(x=>x.recovery && x.key==='person_11' && x.drift_already_present);
 report.push({probe:'per-send completed identity revalidation',mode,field,initial_status:initial.status,final_status:final.status,unsafe_second_send:unsafeSecondSend,pending:runner.pendingCount(),send_events:sends});
 runner.finalize('destroy');
}
for(const field of ['profile','roles','auth_metadata','registry']){
 const f=await fixture(['person_10','person_11']);let recovery=false,sends=0;
 const runner=f.build({deliver:async c=>{sends++;return recovery?ack(c):{transmitted:true};}});
 await runner.run();const before=sends;drift(f,field);recovery=true;const result=await runner.deliverPending();
 report.push({probe:'drift before disconnected recovery denies any send',field,status:result.status,additional_sends:sends-before,pending:runner.pendingCount()});runner.finalize('destroy');
}
for(const phase of ['CREATE','link']){
 const f=await fixture();let release,entered=false,settled=false;const held=new Promise(r=>release=r);
 if(phase==='CREATE'){
  const original=f.port.auth.createUser;
  f.port.auth.createUser=async p=>{entered=true;await held;try{return await original(p);}finally{settled=true;}};
 }else{
  const original=f.port.linkCanonical;
  f.port.linkCanonical=async p=>{entered=true;await held;try{return await original(p);}finally{settled=true;}};
 }
 const runner=f.build({deadlineMs:100});const result=await runner.run();const pendingBefore=runner.pendingCount();
 let destroyRefused=false;try{runner.finalize('destroy');}catch{destroyRefused=true;}
 const pendingAfter=runner.pendingCount(),unsettledAtDestroy=entered && !settled;
 release();await tick();await tick();
 report.push({probe:'actual provider mutation I/O custody',phase,status:result.status,blocked_code:result.blocked?.code,pending_before_destroy:pendingBefore,destroy_refused:destroyRefused,underlying_io_unsettled_at_destroy:unsettledAtDestroy,pending_after_destroy:pendingAfter,provider_settled_after_release:settled,provider_user_exists_after_release:f.users.some(u=>u.email==='person-10@msajed.local'),profile_linked_after_release:f.rows[10].migrated_user_id!==null,delivery_sends:f.delivered.length});
}
for(const kind of ['valid','wrong operation','wrong UID']){
 const f=await fixture();let release,exposed,sends=0;const held=new Promise(r=>release=r);
 const runner=f.build({deadlineMs:100,deliver:async c=>{exposed=c;sends++;return held;}});
 const result=await runner.run();const concurrent=await runner.deliverPending();let destroyRefused=false;try{runner.finalize('destroy');}catch{destroyRefused=true;}
 const before=runner.pendingCount();release({acknowledged:true,operation_id:kind==='wrong operation'?uuid(333):OP,target_user_id:kind==='wrong UID'?uuid(334):exposed.target_user_id});await tick();
 report.push({probe:'actual delivery I/O custody and exact late ACK',kind,status:result.status,concurrent_status:concurrent.status,destroy_refused:destroyRefused,sends,pending_before_settlement:before,pending_after_settlement:runner.pendingCount(),candidate_cleared:exposed.password===null});runner.finalize('destroy');
}
console.log(JSON.stringify({evidence_type:'actual copied source and copied actual synthetic fixture; custom transport callbacks; NET denied; no native operations',probe_count:report.length,results:report},null,2));
