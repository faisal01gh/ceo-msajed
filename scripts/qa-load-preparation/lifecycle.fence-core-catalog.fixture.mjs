// TEST ONLY. Disposable native PostgreSQL 17; no real credentials or providers.
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {createTransactionFeedbackFixture} from '../../tests/qa_isolation_fixture.mjs';
import {gatewayMetadataSQL} from './lifecycle.fence-gateway.metadata.mjs';
export const OUT='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/durable-deletion-fence/core-catalog';
const BIN='C:/Program Files/PostgreSQL/17/bin/';
export async function start(){
 fs.mkdirSync(OUT,{recursive:true});const dir=OUT+'/pgdata';assert(!fs.existsSync(dir),'refuse reuse of any cluster');
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 process.env.QA_CORE_CATALOG_DB='qa_fence_core_catalog';process.env.QA_CORE_CATALOG_PORT=String(port);process.env.QA_CORE_CATALOG_DIR=dir;
 const run=(name,args)=>{const r=spawnSync(BIN+name+'.exe',args,{encoding:'utf8',timeout:30000});fs.appendFileSync(OUT+'/CLUSTER.log',(r.stdout||'')+(r.stderr||''));assert.equal(r.status,0,name+' '+r.stderr);};
 run('initdb',['-D',dir,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
 run('pg_ctl',['-D',dir,'-l',OUT+'/postgres.log','-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
 run('createdb',['-h','127.0.0.1','-p',String(port),'-U','postgres',process.env.QA_CORE_CATALOG_DB]);
 return ()=>run('pg_ctl',['-D',dir,'-m','fast','-w','stop']);
}
export const sql=n=>fs.readFileSync(new URL('../../supabase/migrations/'+n,import.meta.url),'utf8');
export async function predecessor(){
 const base=await createTransactionFeedbackFixture({modulePath:path.resolve(import.meta.dirname,'lifecycle.fence-core-catalog.pg.mjs')});const db=base.db;
 for(const n of ['20261008010000_qa_isolation_prerequisites.sql','20261008015000_qa_password_transport.sql','20261008018000_qa_rest_provenance.sql','20261008018500_qa_core_rest_admission.sql','20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql'])await db.exec(sql(n));
 await db.exec(`CREATE TABLE public.workspace_versions(scope text primary key,revision bigint not null default 0);
 CREATE TABLE public.workspace_edits(scope text not null,revision bigint not null,request_id uuid not null,actor text not null,operations jsonb not null,created_at timestamptz not null default now(),unique(scope,request_id));
 CREATE TABLE public.migration_gate(id integer primary key,token_hash text not null,expires_at timestamptz not null,enabled boolean not null default false);
 CREATE TABLE public.legacy_archive(source_table text not null,source_key text not null,payload jsonb not null,row_hash text,imported_at timestamptz not null default now(),primary key(source_table,source_key));
 CREATE TABLE public.migration_receipts(id bigint generated always as identity,source_table text not null,batch_count integer not null,received_at timestamptz not null default now());
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_versions,public.workspace_edits,public.migration_gate,public.legacy_archive,public.migration_receipts TO service_role;
 GRANT USAGE ON SEQUENCE public.migration_receipts_id_seq TO service_role;
 INSERT INTO public.workspace_versions VALUES('ceo:state',0);`);
 await db.exec(`INSERT INTO public.organizational_units(id,name,unit_type,parent_id) SELECT '${base.id(7402)}','الإدارة المالية','independent',NULL WHERE NOT EXISTS(SELECT 1 FROM public.organizational_units WHERE name='الإدارة المالية' AND unit_type='independent' AND parent_id IS NULL AND active);INSERT INTO auth.users(id,email) VALUES('${base.id(7401)}','core-catalog@fixture.invalid');
 INSERT INTO public.account_migration_users(canonical_key,login_username,preferred_login,display_name,role_code,org_name,dept_names,internal_email,eligible,must_change_password) VALUES('staff_057','core-catalog','core-catalog','Core catalog','employee','الإدارة المالية',ARRAY['الإدارة المالية'],'core-catalog@fixture.invalid',true,true) ON CONFLICT(canonical_key) DO UPDATE SET login_username=EXCLUDED.login_username,preferred_login=EXCLUDED.preferred_login,display_name=EXCLUDED.display_name,role_code=EXCLUDED.role_code,org_name=EXCLUDED.org_name,dept_names=EXCLUDED.dept_names,internal_email=EXCLUDED.internal_email,eligible=true,migrated_user_id=NULL,must_change_password=true;`);
 const m=sql('20261008020000_qa_isolation_enforcement.sql');await assert.rejects(db.exec(m),e=>e.code==='55000');await db.exec('ROLLBACK');
 await db.exec('SET check_function_bodies=off');
 await db.exec(m.split('-- BEGIN LOCAL VERIFIABLE SECTION\n')[1].split('-- END LOCAL VERIFIABLE SECTION')[0]);await db.exec('SET check_function_bodies=on');await db.exec(sql('20261008020500_qa_password_frame_composition.sql'));
 for(const t of ['profiles','user_roles','user_memberships','account_migration_users','audit_log','notifications','transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods'])await db.exec(`CREATE TRIGGER qa_fixture_reference BEFORE INSERT OR UPDATE OR DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row()`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await db.exec(`CREATE TRIGGER qa_fixture_capture BEFORE DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION app_private.qa_delete_capture()`);
 await db.exec(/DO \$freeze\$[\s\S]*?END \$freeze\$;/.exec(sql('20261008019500_qa_delete_completion.sql'))[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await db.exec(`GRANT USAGE ON SCHEMA public TO PUBLIC;
 ALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb NOT NULL DEFAULT '{}',ADD COLUMN created_at timestamptz,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN banned_until timestamptz,ADD COLUMN deleted_at timestamptz;
 CREATE TABLE auth.refresh_tokens(id bigint PRIMARY KEY,session_id uuid REFERENCES auth.sessions(id));
 CREATE ROLE qa_fixture_auth_gateway LOGIN NOINHERIT;GRANT USAGE ON SCHEMA auth TO qa_fixture_auth_gateway;GRANT SELECT(id),DELETE ON auth.users TO qa_fixture_auth_gateway;`);
 // All five canonical prerequisites remain installed with their actual shared guards.
 return base;
}
export async function controllers(db){await db.exec(fs.readFileSync(new URL('./owned-control.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('./owned-deletion-fence.sql',import.meta.url),'utf8'));await db.exec(`UPDATE app_private.qa_owned_native_anchor SET gateway_oid='qa_fixture_auth_gateway'::regrole;UPDATE app_private.qa_owned_native_anchor a SET gateway_metadata=${gatewayMetadataSQL('a')};UPDATE app_private.qa_owned_native_anchor SET catalog_digest=app_private.qa_owned_native_catalog_digest();`);}
