// Real subprocess: actual autocommit SQL + current SDK/coordinator.
import fs from 'node:fs';import {runtime,rpc,connect} from './lifecycle.fence-integrated.fixture.mjs';
const [planPath,action,argsJSON]=process.argv.slice(2),p=JSON.parse(fs.readFileSync(planPath,'utf8')),args=JSON.parse(argsJSON),f=await runtime(p);
let result;if(action==='prepare')result=await f.adapter.prepareOwnedDeletion(args);
else if(action==='claim'){const r=await f.adapter.readOwnedDeletion(args);result=await f.adapter.transitionOwnedDeletion(r,'auth_delete_in_flight');}
else if(action==='delete-lost'){const r=await f.adapter.readOwnedDeletion(args);await f.deleteRoot(r.target_user_id);result={status:'physical-delete-committed-response-lost',operation_id:r.operation_id,generation:r.generation};}
else if(action==='absence'){const r=await f.adapter.readOwnedDeletion(args),proof=await f.adapter.readDeletionAuthAbsence(r);if(!proof.absent)throw Error('actual independent GET still present');result=await f.adapter.recordOwnedDeletionAbsence(r,proof.readbackDigest);}
else if(action==='finalize-fail'){const d=await connect();try{await d.exec(`BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.jwt.claims='{"role":"service_role"}';SET LOCAL request.headers='{}'`);await d.query('SELECT public.qa_owned_delete_finalize_internal($1,$2)',[args.operationId,1]);await d.query("SELECT 1/0");}catch(e){if(e.code!=='22012')throw e;await d.exec('ROLLBACK');result=await f.adapter.readOwnedDeletion(args);}finally{await d.close();}}
else if(action==='resume')result=await f.createDeletionCoordinator({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,deadlineMs:10000}).resume(args);
else throw Error('undeclared child action');
console.log(JSON.stringify({pid:process.pid,action,result,deleteDispatches:f.events.filter(x=>x.method==='DELETE').length}));
