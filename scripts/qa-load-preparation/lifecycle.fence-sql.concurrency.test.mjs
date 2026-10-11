// Supplemental native counterexamples after the first RED/GREEN tracer.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {PGlite} from './lifecycle.fence-sql.pg.mjs';
import {OUT,guard,effect,service,rpc} from './lifecycle.fence-sql.harness.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const db=new PGlite(),connections=[db];const report={phase:process.env.FENCE_PHASE||'CONCURRENCY',checks:[],failures:[],nativeActivation:false,noHTTP:true};
async function connect(){const c=new PGlite();connections.push(c);await c.verified;await guard(c);return c;}
async function outcome(p){try{return {value:await p}}catch(e){return {code:e.code,message:e.message}}}
async function waiting(pid){for(let i=0;i<80;i++){const r=(await db.query(`SELECT wait_event,state FROM pg_stat_activity WHERE pid=${pid}`)).rows[0];if(r?.wait_event==='advisory')return r;await new Promise(r=>setTimeout(r,15));}throw Error('NO_OBSERVED_ADVISORY_WAIT:'+pid);}
try{
 await db.verified;await guard(db);await service(db);
 // Establish both stronger-isolation snapshots before Prepare commits.
 const repeat=await connect(),serial=await connect(),writer=await connect();
 for(const [c,level] of [[repeat,'REPEATABLE READ'],[serial,'SERIALIZABLE']]){await effect(`BEGIN ISOLATION LEVEL ${level};SELECT count(*) FROM app_private.qa_owned_deletion_fences;`,c);}
 await effect('BEGIN;',writer);await writer.query('SELECT count(*) FROM app_private.qa_owned_deletion_fences;');
 await effect('BEGIN;',db);
 await effect(`SELECT pg_advisory_xact_lock(hashtextextended('${id(94003)}',704927));`,db);
 await guard(writer);
 const write=outcome(writer.query(`INSERT INTO auth.sessions(id,user_id,created_at) VALUES('${id(98403)}','${id(94003)}',now())`));
 await effect('RESET ROLE;',db);
 report.checks.push({name:'READ COMMITTED producer began before prepare and actually waited',wait:await waiting(writer.connection.pid)});
 await service(db);
 const prepared=await rpc('qa_owned_delete_prepare_internal',`'${id(90001)}','${id(91003)}','${id(99303)}'`,db);assert.equal(prepared.status,'delete_prepared');
 await effect('COMMIT;',db);
 const denied=await write;assert.equal(denied.code,'42501',JSON.stringify(denied));await writer.query('ROLLBACK;');
 report.checks.push({name:'post-advisory-wait READ COMMITTED observed new committed fence',sqlstate:denied.code});
 for(const [c,level] of [[repeat,'REPEATABLE READ'],[serial,'SERIALIZABLE']]){
  const denied=await outcome(c.query(`INSERT INTO auth.sessions(id,user_id,created_at) VALUES('${id(level==='SERIALIZABLE'?98503:98603)}','${id(94003)}',now())`));
  assert.equal(denied.code,'40001',JSON.stringify(denied));await c.query('ROLLBACK;');report.checks.push({name:level+' stale snapshot cannot miss committed fence',sqlstate:denied.code});
 }
 // Inverse interleaving: a writer owns the UID lock before prepare admission.
 await effect('BEGIN;',writer);await effect(`INSERT INTO auth.sessions(id,user_id,created_at) VALUES('${id(98404)}','${id(94004)}',now())`,writer);
 await guard(db);const prepare=outcome(db.query(`SELECT public.qa_owned_delete_prepare_internal('${id(90001)}','${id(91004)}','${id(99304)}')`));
 // Inspector must not reuse the busy controller connection.
 const observer=await connect();let seen=false;for(let i=0;i<80;i++){if((await observer.query(`SELECT wait_event FROM pg_stat_activity WHERE pid=${db.connection.pid}`)).rows[0]?.wait_event==='advisory'){seen=true;break;}await new Promise(r=>setTimeout(r,15));}assert(seen,'prepare must wait for pre-existing writer');
 await effect('COMMIT;',writer);const blocked=await prepare;assert.equal(blocked.code,'42501',JSON.stringify(blocked));
 await effect('RESET ROLE;',db);assert.equal((await db.query(`SELECT count(*) n FROM app_private.qa_owned_deletion_fences WHERE target_user_id='${id(94004)}'`)).rows[0].n,0);
 report.checks.push({name:'writer committed first: prepare fresh closure denied without new operation',sqlstate:blocked.code});
 await effect(`DELETE FROM auth.sessions WHERE id='${id(98404)}'`,writer);
 // Closed-catalog coverage must be executable, not merely trigger-count prose.
 await effect('SELECT app_private.qa_owned_fence_catalog_closed();',db);
 const coverage=(await db.query(`SELECT c.oid::regclass::text surface,CASE WHEN EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure) THEN 'central-first' ELSE 'same-fence-native-trigger' END coverage FROM pg_class c WHERE c.oid=ANY(app_private.qa_owned_fence_surfaces()) ORDER BY c.oid`)).rows;
 report.coverage=coverage;
 await effect('BEGIN;',db);await effect('ALTER TABLE auth.sessions DISABLE TRIGGER qa_owned_deletion_fence;',db);
 const missing=await outcome(db.query('SELECT app_private.qa_owned_fence_catalog_closed();'));assert.equal(missing.code,'55000');await db.query('ROLLBACK;');report.checks.push({name:'disabled/missing-trigger catalog counterexample denied',sqlstate:missing.code});
 // This must preserve the existing graph catalog positive as well.
 await effect('SELECT app_private.qa_delete_catalog_closed();',db);
 report.checks.push({name:'existing graph catalog positive preserved'});
 report.status='GREEN';
}catch(e){report.status='FAILED';report.failures.push({message:e.message,code:e.code,where:e.where});console.error(e);process.exitCode=1;
}finally{for(const c of connections)await c.close();fs.writeFileSync(OUT+'/'+report.phase+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
