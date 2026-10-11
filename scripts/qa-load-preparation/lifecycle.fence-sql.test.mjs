// Native isolated SQL tracer. No HTTP or live provider is permitted.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {PGlite} from './lifecycle.fence-sql.pg.mjs';
const OUT='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/durable-deletion-fence/sql';
const sql=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const run=id(90001),source=id(91001),uid=id(94001),op=id(99001);
const report={stage:process.env.FENCE_PHASE||'RED',engine:'native PostgreSQL 17',checks:[],failures:[],noHTTP:true,noLiveActions:true};
fs.mkdirSync(OUT,{recursive:true});
const db=new PGlite();
async function guard(c=db){const prior=(await c.query("SELECT current_setting('role') role")).rows[0].role;await c.query('RESET ROLE;');await c.query(`DO $g$ BEGIN IF current_database()<>'qa_fence_tracer' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>52512 OR current_setting('listen_addresses')<>'127.0.0.1' OR current_setting('data_directory')<>'${OUT}/pgdata' OR EXISTS(SELECT 1 FROM pg_foreign_server) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE client_addr IS NOT NULL AND application_name<>'qa-fence-tracer' AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'fixture identity drift';END IF;END $g$;`);if(prior!=='none'){assert(['service_role','authenticated','anon'].includes(prior));await c.query('SET ROLE '+prior+';');}}
async function effect(s,c=db){await guard(c);return c.query(s);}
async function service(c=db){await effect(`SET ROLE service_role;SET request.jwt.claims='{"role":"service_role"}';SET request.headers='{}';`,c);}
async function rpc(name,args,c=db){return (await effect(`SELECT public.${name}(${args}) receipt`,c)).rows[0].receipt;}
async function denied(name,fn,codes=['42501','55000']){try{await fn();assert.fail('MISSING_DENIAL:'+name)}catch(e){assert(codes.includes(e.code),name+': '+e.message+' ['+e.code+']');report.checks.push({name,sqlstate:e.code});}}
try{
 await db.verified;await guard();report.identity=db.connection;
 await effect('DROP SCHEMA auth CASCADE;DROP SCHEMA app_private CASCADE;DROP SCHEMA public CASCADE;CREATE SCHEMA public;');
 await guard();const restore=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','52512','-U','postgres','-d','qa_fence_tracer','-v','ON_ERROR_STOP=1','-f',OUT+'/base.sql'],{encoding:'utf8',timeout:60000,maxBuffer:1048576});assert.equal(restore.status,0,restore.stderr);
 await effect('GRANT USAGE ON SCHEMA public TO PUBLIC;');
 for(const name of ['20261008019500_qa_delete_completion.sql','20261008020500_qa_password_frame_composition.sql']){
  const source=fs.readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
  await effect(source.replaceAll('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 }
 // Reconstruct the bounded real graph attachments omitted from the borrowed
 // predecessor fixture. This is not application of blocked activation200.
 for(const t of ['transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_participants','transaction_periods','transaction_history','transaction_requests','transaction_routes','notifications'])await effect(`CREATE TRIGGER qa_fence_fixture_central BEFORE INSERT OR UPDATE OR DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await effect(`CREATE TRIGGER qa_fence_fixture_capture BEFORE DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION app_private.qa_delete_capture();`);
 const m195=fs.readFileSync(new URL('../../supabase/migrations/20261008019500_qa_delete_completion.sql',import.meta.url),'utf8');
 await effect(/DO \$freeze\$[\s\S]*?END \$freeze\$;/.exec(m195)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await effect('SELECT app_private.qa_delete_catalog_closed();');
 report.checks.push({name:'pre-fence actual graph catalog positive'});
 const exists=(await db.query("select to_regclass('app_private.qa_owned_sources') t")).rows[0].t;
 if(!exists){
  await effect("BEGIN;ALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb NOT NULL DEFAULT '{}',ADD COLUMN created_at timestamptz,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN banned_until timestamptz,ADD COLUMN deleted_at timestamptz;");
  await effect(sql('owned-control.sql').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
  await effect('CREATE TRIGGER qa_owned_fixture_roles BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();CREATE TRIGGER qa_owned_fixture_memberships BEFORE INSERT OR UPDATE OR DELETE ON public.user_memberships FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();COMMIT;');
 }
 // Source-owner functions can be reapplied on this isolated tracer only.
 for(const def of sql('owned-control.sql').match(/CREATE FUNCTION[\s\S]*?\$\$;/g))await effect(def.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 // ORIGINAL predecessor FKs retained: native Auth CASCADE/SET NULL acceptance
 // must execute this exact catalog, never a constraint-removal fixture.
 report.originalFKs=(await db.query("SELECT conrelid::regclass::text child,confrelid::regclass::text parent,conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE contype='f' ORDER BY conrelid,conname")).rows;
 await effect("DO $r$ BEGIN CREATE ROLE qa_fixture_auth_gateway LOGIN NOINHERIT;EXCEPTION WHEN duplicate_object THEN NULL;END $r$;GRANT USAGE ON SCHEMA auth TO qa_fixture_auth_gateway;GRANT SELECT(id),DELETE ON auth.users TO qa_fixture_auth_gateway;");
 report.originalFKMetadata=(await db.query("SELECT to_jsonb(c) data FROM pg_constraint c WHERE contype='f' AND conrelid::regclass::text NOT LIKE 'app_private.qa_owned_%' ORDER BY oid")).rows;
 report.originalTableSecurity=(await db.query("SELECT oid,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace IN ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace) AND relkind='r' AND relname NOT LIKE 'qa_owned_%' ORDER BY oid")).rows;
 const fence=new URL('owned-deletion-fence.sql',import.meta.url);
 if(fs.existsSync(fence)&&!(await db.query("select to_regclass('app_private.qa_owned_deletions') t")).rows[0].t)await effect(sql('owned-deletion-fence.sql'));
 else for(const def of sql('owned-deletion-fence.sql').match(/CREATE FUNCTION[\s\S]*?\$\$;/g))await effect(def.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await effect("UPDATE app_private.qa_owned_native_anchor SET gateway_oid='qa_fixture_auth_gateway'::regrole;SET statement_timeout='120s';");
 // RED must fail an actual catalog behavior, not an import/file error.
 assert((await db.query("select to_regprocedure('public.qa_owned_delete_prepare_internal(uuid,uuid,uuid)') p")).rows[0].p,'MISSING_DURABLE_PREPARE_RPC');
 report.checks.push({name:'installed executable prepare ABI'});
 if(!(await db.query(`select 1 from app_private.qa_owned_sources where run_id='${run}'`)).rows.length){
  let proof=/const proof=`([\s\S]*?)`;/.exec(sql('lifecycle.native-sql.mjs'))[1];
  const start=proof.indexOf("  PERFORM set_config('role','service_role',true);ret:=public.qa_owned_dispose_internal");
  proof=proof.slice(0,start)+" END LOOP;\nEND $proof$;";
  await effect(proof);
 }
 await service();
 const receipt=await rpc('qa_owned_delete_prepare_internal',`'${run}','${source}','${op}'`);
 assert.equal(receipt.status,'delete_prepared');assert.equal(receipt.target_user_id,uid);assert.equal(receipt.generation,1);
 assert.deepEqual(await rpc('qa_owned_delete_prepare_internal',`'${run}','${source}','${op}'`),receipt);
 report.checks.push({name:'prepare committed exact receipt; idempotent same operation',receipt});
 await denied('second operation same target',()=>rpc('qa_owned_delete_prepare_internal',`'${run}','${source}','${id(99999)}'`));
 await denied('untrusted role',async()=>{await effect('RESET ROLE;SET request.jwt.claims=\'{"role":"authenticated"}\';');await rpc('qa_owned_delete_read_internal',`'${op}'`)});
 await service();
 const second=new PGlite();await second.verified;await guard(second);
 await effect('RESET ROLE;');
 // Simulate the HTTP-deferred interval only through separate producer SQL.
 for(const [name,s] of [
  ['native session UID',`INSERT INTO auth.sessions(id,user_id,created_at) VALUES('${id(98101)}','${uid}',now())`],
  ['private member run',`INSERT INTO app_private.qa_run_members(run_id,user_id,role_code,active) VALUES('${run}','${id(99980)}','employee',true)`],
  ['canonical alias',`INSERT INTO public.account_migration_aliases(alias,canonical_key,source,source_login,active) VALUES('fence-probe','owned-proof-1','fixture','fence-probe',true)`],
  ['public profile UPDATE before trusted branches',`UPDATE public.profiles SET full_name='BAD' WHERE id='${uid}'`],
  ['typed audit canonical',`INSERT INTO public.audit_log(actor_id,event_type,entity_type,entity_id,meta) VALUES('${uid}','profile_name_changed','account','owned-proof-1','{"name":"BAD","target_user_id":"${uid}"}')`]
 ])await denied(name,()=>effect(s,second));
 const idle=(await second.query(`select state,xact_start from pg_stat_activity where pid=${db.connection.pid}`)).rows[0];assert.equal(idle.state,'idle');assert.equal(idle.xact_start,null);
 report.checks.push({name:'separate producer connection while no controller transaction',controllerIdle:idle});
 await second.close();
 await service();await rpc('qa_owned_delete_transition_internal',`'${op}',1,'auth_delete_in_flight'`);await rpc('qa_owned_delete_transition_internal',`'${op}',1,'auth_delete_unknown'`);
 await denied('absence digest with Auth still present',()=>rpc('qa_owned_delete_absence_internal',`'${op}',1,'${uid}','${'a'.repeat(64)}'`));
 await denied('unknown cannot finalize',()=>rpc('qa_owned_delete_finalize_internal',`'${op}',1`));
 // Caller process reconnects; no retry DELETE and exact same op/generation survive.
 const restart=new PGlite();await restart.verified;await service(restart);
 assert.equal((await rpc('qa_owned_delete_read_internal',`'${op}'`,restart)).status,'auth_delete_unknown');await restart.close();
 report.checks.push({name:'crash/reconnect retains same operation, generation and fence'});
 await effect('RESET ROLE;');
 const protectedBefore=(await db.query('select app_private.qa_owned_protected_snapshot() snapshot')).rows[0].snapshot;
 await effect('RESET ROLE;');
 // Local-provider fixture ONLY: never an exported production RPC.
 await guard();const provider=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','52512','-U','qa_fixture_auth_gateway','-d','qa_fence_tracer','-v','ON_ERROR_STOP=1','-c',`DELETE FROM auth.users WHERE id='${uid}';`],{encoding:'utf8',timeout:20000});report.provider={exitCode:provider.status,stdout:provider.stdout,stderr:provider.stderr};assert.equal(provider.status,0,provider.stderr);
 assert.deepEqual((await db.query('select app_private.qa_owned_protected_snapshot() snapshot')).rows[0].snapshot,protectedBefore);
 report.checks.push({name:'protected classification stable after Auth absent'});
 await service();await denied('wrong UID proof',()=>rpc('qa_owned_delete_absence_internal',`'${op}',1,'${id(94002)}','${'a'.repeat(64)}'`));
 await rpc('qa_owned_delete_absence_internal',`'${op}',1,'${uid}','${'a'.repeat(64)}'`);
 await effect('BEGIN;');const completed=await rpc('qa_owned_delete_finalize_internal',`'${op}',1`);
 assert.equal(completed.status,'completed');await effect('ROLLBACK;');
 assert.equal((await rpc('qa_owned_delete_read_internal',`'${op}'`)).status,'db_finalize_pending');
 await effect('RESET ROLE;');
 assert.equal((await db.query(`SELECT count(*) n FROM public.profiles WHERE id='${uid}'`)).rows[0].n,0);
 await service();
 report.checks.push({name:'finalize rollback restores all effects and active fence'});
 const final=await rpc('qa_owned_delete_finalize_internal',`'${op}',1`);
 assert.equal(final.status,'completed');assert.deepEqual(await rpc('qa_owned_delete_finalize_internal',`'${op}',1`),final);
 await effect('RESET ROLE;');
 assert.equal((await db.query(`SELECT count(*) n FROM public.profiles WHERE id='${uid}'`)).rows[0].n,0);
 await effect('RESET ROLE;');
 assert.equal((await db.query(`SELECT count(*) n FROM app_private.qa_owned_frames`)).rows[0].n,0);
 assert.deepEqual((await db.query('select app_private.qa_owned_protected_snapshot() snapshot')).rows[0].snapshot,protectedBefore);
 report.checks.push({name:'atomic exact finalize, duplicate no effects, full protected snapshot unchanged'});
 report.finalFKMetadata=(await db.query("SELECT to_jsonb(c) data FROM pg_constraint c WHERE contype='f' AND conrelid::regclass::text NOT LIKE 'app_private.qa_owned_%' ORDER BY oid")).rows;assert.deepEqual(report.finalFKMetadata,report.originalFKMetadata);
 report.finalTableSecurity=(await db.query("SELECT oid,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace IN ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace) AND relkind='r' AND relname NOT LIKE 'qa_owned_%' ORDER BY oid")).rows;assert.deepEqual(report.finalTableSecurity,report.originalTableSecurity);
 report.checks.push({name:'all original FK metadata/actions/OIDs and table RLS/ACL/owner unchanged through composition and native deletion'});
 report.status='GREEN';
}catch(e){report.status='FAILED';report.failures.push({message:e.message,sqlstate:e.code||null,where:e.where||null});console.error(e);process.exitCode=1;
}finally{await db.close();fs.writeFileSync(OUT+'/'+report.stage+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
