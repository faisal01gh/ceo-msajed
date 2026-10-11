// Native TEST: the exact positive begin that failed before trigger composition.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {createFinalComposedFixture as createPasswordGuardFixture} from './qa_final_composed_fixture.mjs';
const report={status:'RUNNING',remoteActions:0,checks:[]};let f;
try{
 f=await createPasswordGuardFixture({modulePath:process.env.QA_LOCAL_PG_MODULE,beforeGuards:async({db,actors})=>{await db.query("UPDATE public.user_roles SET role_code='ceo_office_manager' WHERE user_id=$1",[actors.ceo]);await db.query("UPDATE public.account_migration_users SET role_code='ceo_office_manager' WHERE migrated_user_id=$1",[actors.ceo]);}});
 const {db,actors,id,scalar}=f;report.target=db.connection;
 await db.exec('BEGIN');await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({role:'service_role'}),JSON.stringify({'x-qa-actor-user':actors.ceo,'x-qa-actor-sid':id(1004),'x-qa-candidate-handle':id(63002)})]);await db.exec('SET LOCAL ROLE service_role');
 const r=await scalar('SELECT public.account_password_begin_internal($1,$2,$3,$4,$5)',[actors.ceo,id(1004),'fixture_ceo','reset',id(63001)]);assert.equal(r.write_allowed,true);await db.exec('ROLLBACK');report.checks.push({name:'exact ordinary own-reset begin with Reference Guard and Durable Fence',status:'PASS'});report.status='PASS';
}catch(e){report.status='FAIL';report.error={message:e.message,code:e.code,where:e.where};process.exitCode=1;try{await f?.db.exec('ROLLBACK');}catch{}}
finally{await f?.db.close();fs.writeFileSync(process.env.QA_COMPOSITION_OUTPUT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
