import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
const out=process.env.QA_DELETE_EVIDENCE;
const {db,scalar,id,actors,dir}=await createTransactionFeedbackFixture({modulePath:process.env.QA_DELETE_ADAPTER});
const tables=['transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods','notifications'];
const results=[],receipts={};
const test=async(name,fn)=>{try{await fn();results.push({name,status:'Passed'})}catch(e){results.push({name,status:'Failed',code:e.code,reason:e.message,where:e.where});throw e}};
const reset=()=>db.exec('reset role');
const bind=async(u=actors.employee)=>{await reset();await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:u,session_id:id(1000+Number(u.slice(-12))),role:'service_role'}),JSON.stringify({'x-qa-actor-user':u,'x-qa-actor-sid':id(1000+Number(u.slice(-12)))})]);await db.exec('set role service_role')};
const snapshot=async()=>{await reset();const o={};for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth') order by 1,2")).rows)o[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(t) row from "${t.schemaname}"."${t.tablename}" t order by to_jsonb(t)::text`)).rows;return o};
try{
 for(const n of ['10000_qa_isolation_prerequisites','18000_qa_rest_provenance','18500_qa_core_rest_admission','19000_qa_typed_producer_references','19500_qa_delete_completion'])await db.exec(fs.readFileSync(dir+'/202610080'+n+'.sql','utf8'));
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role');
 await db.exec('update public.account_migration_users a set preferred_login=p.login_name from public.profiles p where p.id=a.migrated_user_id');
 for(const t of tables)await db.exec(`create trigger graph_reference before insert or update or delete on public.${t} for each row execute function app_private.qa_reference_guard_before_row()`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await db.exec(`create trigger graph_capture before delete on public.${t} for each row execute function app_private.qa_delete_capture()`);
 receipts.target=db.connection;
 await test('G3 missing actual capture attachment rejects before any effect',async()=>{
  const before=await snapshot();await db.exec('begin;drop trigger graph_capture on public.transactions');await bind();let code;try{await db.query('delete from public.transactions where id=$1',[id(201)])}catch(e){code=e.code}await db.exec('rollback');assert.equal(code,'55000');assert.deepEqual(await snapshot(),before)
 });
}catch(e){try{await db.exec('rollback;reset role')}catch{};if(!results.some(x=>x.status==='Failed'))results.push({name:'setup',status:'Failed',code:e.code,reason:e.message,where:e.where});process.exitCode=1}
finally{fs.writeFileSync(out+'/MATRIX_'+process.env.QA_GRAPH_MODE+'.json',JSON.stringify({results,receipts,counts:Object.fromEntries(['Passed','Failed','Skipped','XFail'].map(s=>[s,results.filter(x=>x.status===s).length]))},null,2));console.log(JSON.stringify(results));await db.close()}
