// TEST ONLY. Run after the complete Password/Session/SDK prerequisite gate.
// Native transactional catalog mutations; rollback every mutation before the next.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {createFinalComposedFixture as createPasswordGuardFixture} from './qa_final_composed_fixture.mjs';
const report={status:'RUNNING',checks:[],remoteActions:0};let f;
const relation='app_private.account_credential_state';
const drop=`DROP TRIGGER qa_owned_deletion_fence ON ${relation};`;
const attach=(spec='BEFORE INSERT OR UPDATE OR DELETE',level='ROW',suffix='',name='qa_owned_deletion_fence',fn='app_private.qa_owned_fence_before_row',table=relation)=>`CREATE TRIGGER ${name} ${spec} ON ${table} FOR EACH ${level} ${suffix} EXECUTE FUNCTION ${fn}();`;
async function beginReset(){const {db,actors,id,scalar}=f;await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({role:'service_role'}),JSON.stringify({'x-qa-actor-user':actors.ceo,'x-qa-actor-sid':id(1004),'x-qa-candidate-handle':id(65002)})]);await db.exec('SET LOCAL ROLE service_role');return scalar('SELECT public.account_password_begin_internal($1,$2,$3,$4,$5)',[actors.ceo,id(1004),'fixture_ceo','reset',id(65001)]);}
async function reject(name,ddl){await f.db.exec('BEGIN');try{await f.db.exec(ddl);let error;try{await beginReset();}catch(e){error=e;}assert.ok(error,`${name}: password unexpectedly admitted`);assert.equal(error.code,'55000',`${name}: wrong rejection (${error.message})`);report.checks.push({name,status:'PASS',sqlstate:error.code});}finally{await f.db.exec('ROLLBACK');}}
try{
 f=await createPasswordGuardFixture({modulePath:process.env.QA_LOCAL_PG_MODULE,beforeGuards:async({db,actors})=>{await db.query("UPDATE public.user_roles SET role_code='ceo_office_manager' WHERE user_id=$1",[actors.ceo]);await db.query("UPDATE public.account_migration_users SET role_code='ceo_office_manager' WHERE migrated_user_id=$1",[actors.ceo]);}});
 await f.db.exec('BEGIN');try{assert.equal((await beginReset()).write_allowed,true);report.checks.push({name:'own-reset accepts exact reference/fence composition',status:'PASS'});}finally{await f.db.exec('ROLLBACK');}
 const cases=[
 ['fence missing',drop],
 ['same fence function on unapproved password relation',attach(undefined,undefined,'','qa_wrong_table_fence',undefined,'public.profiles')],
 ['wrong fence trigger name',drop+attach(undefined,undefined,'','qa_wrong_name')],
 ['wrong callback function',drop+attach(undefined,undefined,'',undefined,'app_private.qa_reference_guard_before_row')],
 ['AFTER instead of BEFORE',drop+attach('AFTER INSERT OR UPDATE OR DELETE')],
 ['STATEMENT instead of ROW',drop+attach(undefined,'STATEMENT')],
 ['missing INSERT event',drop+attach('BEFORE UPDATE OR DELETE')],
 ['missing UPDATE event',drop+attach('BEFORE INSERT OR DELETE')],
 ['missing DELETE event',drop+attach('BEFORE INSERT OR UPDATE')],
 ['unapproved extra TRUNCATE statement callback',attach('BEFORE TRUNCATE','STATEMENT','','qa_extra_truncate')],
 ['disabled fence',`ALTER TABLE ${relation} DISABLE TRIGGER qa_owned_deletion_fence`],
 ['replica-only fence',`ALTER TABLE ${relation} ENABLE REPLICA TRIGGER qa_owned_deletion_fence`],
 ['always-enabled fence',`ALTER TABLE ${relation} ENABLE ALWAYS TRIGGER qa_owned_deletion_fence`],
 ['WHEN condition',drop+attach('BEFORE UPDATE','ROW','WHEN (NEW.user_id IS NOT NULL)')],
 ['arguments',drop+attach().replace('qa_owned_fence_before_row();',"qa_owned_fence_before_row('unapproved');")],
 ['column-specific UPDATE',drop+attach('BEFORE UPDATE OF user_id')],
 ['unknown extra non-internal trigger',attach('BEFORE UPDATE','ROW','','qa_unknown_extra','app_private.qa_reference_guard_before_row')],
 ['wrong function owner','ALTER FUNCTION app_private.qa_owned_fence_before_row() OWNER TO authenticated'],
 ['wrong function ACL','GRANT EXECUTE ON FUNCTION app_private.qa_owned_fence_before_row() TO service_role'],
 ['wrong SECURITY DEFINER','ALTER FUNCTION app_private.qa_owned_fence_before_row() SECURITY INVOKER'],
 ['wrong search_path','ALTER FUNCTION app_private.qa_owned_fence_before_row() SET search_path TO public'],
 ['wrong callback definition',"CREATE OR REPLACE FUNCTION app_private.qa_owned_fence_before_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RETURN NEW;END$$"],
 ];
 for(const [name,ddl] of cases)await reject(name,ddl);
 for(const table of ['public.profiles','public.account_migration_users','public.audit_log']){
  const names=(await f.db.query("SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure AND NOT tgisinternal",[table])).rows;assert.equal(names.length,1);
  const quoted='"'+names[0].tgname.replaceAll('"','""')+'"';await reject(`reference guard remains mandatory on ${table}`,`DROP TRIGGER ${quoted} ON ${table}`);
 }
 // State-specific real prepare/dispatch/finalize/password-admission proof is the
 // separately gated native lifecycle suite, not synthetic fence rows in this test.
 report.status='PASS';report.passed=report.checks.length;
}catch(e){report.status='FAIL';report.error={message:e.message,code:e.code};process.exitCode=1;try{await f?.db.exec('ROLLBACK');}catch{}}
finally{await f?.db.close();if(process.env.QA_COMPOSITION_OUTPUT)fs.writeFileSync(process.env.QA_COMPOSITION_OUTPUT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
