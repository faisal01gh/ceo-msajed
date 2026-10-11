// Mandatory durable cases: actual native SQL and SDK, no outer HTTP transaction.
import fs from 'node:fs';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {controlledTimeout} from './lifecycle.fence-timeout-latch.fixture.mjs';
export async function cases({h,d,F,check,report,before,baseId=800000,finalNativeRestart=false}){
 const p=await h.makePlan(d,baseId),f=await h.runtime(p),runId=p.plan.runId,resources=p.plan.resources;fs.writeFileSync(F+'/cases-plan.json',JSON.stringify(p));
 await f.adapter.prepareOwnedRun();
 // Actual current bootstrap/test sources seed only approved local resources.
 for(let i=0;i<57;i++){
  const r=resources[i],uid=h.id(baseId+1000+i),sid=h.id(baseId+2000+i);
  await h.rpc('qa_owned_operation_internal',{p_run:runId,p_operation:r.createOperation,p_scope:'create',p_key:r.sourceId,p_state:'reserved',p_actual:'pending'});
  await h.rpc('qa_owned_operation_internal',{p_run:runId,p_operation:r.createOperation,p_scope:'create',p_key:r.sourceId,p_state:'dispatched',p_actual:'pending'});
  await d.query("INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data,created_at,email_confirmed_at) VALUES($1,$2,$3::jsonb,'{\"provider\":\"email\"}',clock_timestamp(),clock_timestamp())",[uid,r.email,{run_id:runId,source_id:r.sourceId,operation_id:r.createOperation,receipt_id:r.receiptId}]);
  await h.rpc('qa_owned_operation_internal',{p_run:runId,p_operation:r.createOperation,p_scope:'create',p_key:r.sourceId,p_state:'completed',p_actual:'fulfilled'});
  await f.adapter.readAuth(uid);await f.adapter.linkOwned({runId,sourceId:r.sourceId,canonicalKey:r.canonicalKey,uid,memberships:r.memberships});
  await d.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES($1,$2,clock_timestamp())',[sid,uid]);await h.rpc('qa_owned_test_internal',{p_run:runId,p_source:r.sourceId,p_sid:sid});await d.query('DELETE FROM auth.sessions WHERE id=$1',[sid]);
  r.uid=uid;r.sid=sid;r.deleteOperationId=h.id(baseId+3000+i);r.deleteGeneration=1;
 }
 const args=i=>({runId,sourceId:resources[i].sourceId,operationId:resources[i].deleteOperationId,generation:1});
 const read=i=>f.adapter.readOwnedDeletion(args(i)),count=async(s,a=[])=>h.scalar(d,s,a),fence=i=>count('SELECT count(*) FROM app_private.qa_owned_deletion_fences WHERE target_user_id=$1',[resources[i].uid]);
 const deny=async(name,fn)=>{let e;try{await fn();}catch(x){e=x;}assert(e,name+' unexpectedly allowed');assert(['42501','55000','23503'].includes(e.code),name+': '+e.code);return {name,sqlstate:e.code};};
 const producer=await h.connect();try{
  const r=await f.adapter.prepareOwnedDeletion(args(0));assert.equal(r.status,'delete_prepared');assert.equal(await fence(0),1);
  const ins=await deny('separate native SID INSERT after prepare',()=>producer.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES($1,$2,now())',[h.id(809001),resources[0].uid]));
  const canonical=await deny('exact canonical alias INSERT',()=>producer.query("INSERT INTO public.account_migration_aliases(alias,canonical_key,source,source_login,active) VALUES('integrated-ref',$1,'fixture','integrated-ref',true)",[resources[0].canonicalKey]));
  const run=await deny('exact run dependency INSERT',()=>producer.query("INSERT INTO app_private.qa_run_members(run_id,user_id,role_code,active) VALUES($1,$2,'employee',true)",[runId,h.id(809002)]));check(1,'UID/canonical/run postprepare separate producer denials',{receipt:r,denials:[ins,canonical,run]});
  let releaseBody,start;const held=new Promise(resolve=>releaseBody=resolve),entered=new Promise(resolve=>start=resolve);f.modes.set(resources[0].uid,{holdBody:held,started:start});
  const co=f.createDeletionCoordinator({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,deadlineMs:10000});const task=co.resume(args(0));await Promise.race([entered,task.then(r=>{throw Error('held SDK transport settled before admission: '+r.status);})]);
  const heldIns=await deny('native SID while actual SDK body held',()=>producer.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES($1,$2,now())',[h.id(809003),resources[0].uid]));
  const update=await deny('existing ordinary transaction UPDATE adds fenced UID',()=>producer.query('UPDATE public.transactions SET responsible_user_id=$1 WHERE id=$2',[resources[0].uid,h.id(201)]));check(2,'actual SDK response body held + native separate producer',{denial:heldIns});check(3,'existing row UPDATE adds UID during SDK HTTP',{denial:update});assert.equal(await fence(0),1);check(13,'native Auth cascade occurred but SDK body and independent GET not settled; fence retained');releaseBody();const completed=await task;assert.equal(completed.status,'completed');assert.equal(await fence(0),0);check(4,'normal actual SDK DELETE+strict GET then actual SQL finalize',{receipt:completed});
  const beforeDuplicate=await h.primarySnapshot(d);assert.deepEqual(await f.adapter.finalizeOwnedDeletion(completed),completed);assert.deepEqual(await h.primarySnapshot(d),beforeDuplicate);check(8,'exact duplicate finalize returns receipt without effects');
  for(const [i,kind,caseId] of [[1,'unknown-present',5],[2,'late-success',6],[10,'late-failure',5],[11,'unknown-absent',6]]){
   const outcome=await controlledTimeout({h,d,p,index:i,kind});
   check(caseId,'explicit DELETE admission, controlled caller timeout and '+kind,{outcome});
  }
  // Foreign drift is trusted fixture-owner injection with installed guards intact.
  const prepared=await f.adapter.prepareOwnedDeletion(args(3));const flight=await f.adapter.transitionOwnedDeletion(prepared,'auth_delete_in_flight');await f.adapter.dispatchOwnedDeletion(flight);const proof=await f.adapter.readDeletionAuthAbsence(flight);const dbPending=await f.adapter.recordOwnedDeletionAbsence(flight,proof.readbackDigest);
  const auditTriggers=(await d.query("SELECT oid,tgname,tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND NOT tgisinternal ORDER BY oid")).rows;
  assert(auditTriggers.length>0&&auditTriggers.every(x=>x.tgenabled==='O'));
  try{for(const t of auditTriggers)await d.exec('ALTER TABLE public.audit_log DISABLE TRIGGER "'+t.tgname+'"');
   await d.query("INSERT INTO public.audit_log(actor_id,event_type,entity_type,entity_id,meta) VALUES($1,'profile_name_changed','account','trusted-fixture-drift',$2::jsonb)",[h.id(1),{name:'fixture drift',target_user_id:resources[3].uid}]);
  }finally{for(const t of auditTriggers)await d.exec('ALTER TABLE public.audit_log ENABLE TRIGGER "'+t.tgname+'"');}
  assert.deepEqual((await d.query("SELECT oid,tgname,tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND NOT tgisinternal ORDER BY oid")).rows,auditTriggers);
  await assert.rejects(f.adapter.finalizeOwnedDeletion(dbPending));assert.equal(await fence(3),1);check(9,'unreceipted trusted fixture-owner audit reference rejects finalize with fence retained');
  // Only exact owner-injected drift row is removed, never unknown product records.
  try{for(const t of auditTriggers)await d.exec('ALTER TABLE public.audit_log DISABLE TRIGGER "'+t.tgname+'"');await d.query("DELETE FROM public.audit_log WHERE entity_id='trusted-fixture-drift'");}finally{for(const t of auditTriggers)await d.exec('ALTER TABLE public.audit_log ENABLE TRIGGER "'+t.tgname+'"');}
  assert.equal((await f.adapter.finalizeOwnedDeletion(dbPending)).status,'completed');
  for(const uid of [h.id(1),h.id(8057)]){await assert.rejects(f.adapter.prepareOwnedDeletion({runId,sourceId:uid,operationId:h.id(809900)}));}check(10,'protected synthetic UID + synthetic faisal canonical cannot enter owned deletion');
  // Independent real process restart sequence, no journal model/file CAS.
  // Final native test releases both owned idle SQL clients before subprocess
  // restart: no cross-process preflight exclusion and no outer transaction.
  if(finalNativeRestart){await producer.close();await d.close();}
  const childPath=fileURLToPath(new URL(finalNativeRestart?'./lifecycle.fence-final.child.mjs':'./lifecycle.fence-integrated.child.mjs',import.meta.url));
  const child=(i,action)=>{const r=spawnSync(process.execPath,['--experimental-vm-modules',childPath,F+'/cases-plan.json',action,JSON.stringify(args(i))],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);const receipt=JSON.parse(r.stdout.trim().split('\n').at(-1));report.childProcesses??=[];report.childProcesses.push(receipt);return receipt;};
  for(const [i,stage] of [[4,'prepare'],[5,'inflight'],[6,'lostresponse'],[7,'dbpending'],[8,'finalizefail'],[9,'completed']]){
   child(i,'prepare');if(stage!=='prepare')child(i,'claim');if(['lostresponse','dbpending','finalizefail','completed'].includes(stage))child(i,'delete-lost');if(['dbpending','finalizefail','completed'].includes(stage))child(i,'absence');if(stage==='finalizefail')child(i,'finalize-fail');if(stage==='completed')child(i,'resume');
   let result=child(i,'resume');if(stage==='inflight'){assert.equal(result.result.status,'auth_delete_in_flight');assert.equal(result.deleteDispatches,0);await f.deleteRoot(resources[i].uid);result=child(i,'resume');}assert.equal(result.result.status,'completed');assert.equal(result.result.operation_id,args(i).operationId);assert.equal(result.result.generation,1);if(stage!=='prepare')assert.equal(result.deleteDispatches,0);check(7,'fresh subprocess resume after '+stage,{pid:result.pid,receipt:result.result,deleteDispatches:result.deleteDispatches});
  }
  if(finalNativeRestart)d=await h.connect();
  // Cleanup current source handles both completed and never-prepared sources.
  const remaining=resources.map((r,i)=>i<12?{...r}:{sourceId:r.sourceId,uid:r.uid});const cleaned=await f.cleanup.executeOwnedCleanup({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,runId,resources:remaining,inventoryDigest:p.plan.rolePlanDigest,deadlineMs:10000});assert.equal(cleaned.status,'complete');assert.equal(cleaned.exactOwnedAbsent,57);await f.adapter.completeOwnedRun();check(12,'actual current cleanup entrypoint all57 returns terminal zero',{cleanup:cleaned});
  assert.deepEqual(await h.primarySnapshot(d),before);check(11,'protected full snapshots unchanged after mandatory cases');
  const receipts=await count("SELECT jsonb_agg(to_jsonb(x)) FROM app_private.qa_owned_deletions x WHERE run_id=$1",[runId]);assert.equal(receipts.length,57);assert(!/password|access_token|refresh_token|servicekey|authorization|headers/i.test(JSON.stringify(receipts)));check(14,'actual persisted mandatory-run receipts nonsensitive');
 }finally{await producer.close();if(finalNativeRestart)await d.close();}
}
