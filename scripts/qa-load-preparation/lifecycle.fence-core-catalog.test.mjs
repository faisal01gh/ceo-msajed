import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {OUT,start,predecessor,controllers} from './lifecycle.fence-core-catalog.fixture.mjs';
const source=n=>fs.readFileSync(new URL(n,import.meta.url));const sha=x=>createHash('sha256').update(x).digest('hex');
const report={status:'RUNNING',cases:[],sourceHashes:{control:sha(source('./owned-control.sql')),fence:sha(source('./owned-deletion-fence.sql')),accepted200:sha(source('../../supabase/migrations/20261008020000_qa_isolation_enforcement.sql'))}};
const stop=await start();let db;try{
 const base=await predecessor();db=base.db;report.identity=db.connection;report.sourceInput='actual accepted200 bounded local section including canonical Core context + actual205; full200 activation stays 55000';
 const fkBefore=(await db.query("SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY oid),'[]') j FROM pg_constraint c WHERE contype='f'")).rows[0].j;
 fs.writeFileSync(OUT+'/NATIVE_SHAPES.json',JSON.stringify((await db.query(`SELECT c.oid,n.nspname||'.'||c.relname name,to_jsonb(c)-'oid'-'relfilenode'-'relpages'-'reltuples'-'relallvisible'-'reltoastrelid'-'reltype' relation,(SELECT jsonb_agg(jsonb_build_object('n',a.attnum,'name',a.attname,'type',a.atttypid,'typmod',a.atttypmod,'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text,'collation',a.attcollation) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0) columns,(SELECT coalesce(jsonb_agg(jsonb_build_object('type',contype,'key',conkey,'def',pg_get_constraintdef(oid)) ORDER BY contype,conkey),'[]') FROM pg_constraint WHERE conrelid=c.oid) constraints FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname||'.'||c.relname=ANY(ARRAY['app_private.qa_core_provision_context','public.workspace_versions','public.workspace_edits','public.migration_gate','public.legacy_archive','public.migration_receipts']) ORDER BY 2`)).rows,null,2));
 await controllers(db);await db.query('SELECT app_private.qa_owned_fence_catalog_closed()');report.cases.push({label:'canonical_context_full_source_install',status:'PASS'});
 const ctx='app_private.qa_core_provision_context';const oid=(await db.query(`SELECT '${ctx}'::regclass::oid oid`)).rows[0].oid;
 assert.equal((await db.query(`SELECT count(*) n FROM pg_trigger WHERE tgrelid=${oid} AND tgfoid='app_private.qa_owned_fence_before_row()'::regprocedure`)).rows[0].n,1);
 const negative=async(label,ddl,check='SELECT app_private.qa_owned_fence_catalog_closed()')=>{await db.exec('BEGIN');try{await db.exec(ddl);await assert.rejects(db.query(check),e=>e.code==='55000');report.cases.push({label,status:'PASS',sqlstate:'55000'});}finally{await db.exec('ROLLBACK');}};
 await negative('extra_column',`ALTER TABLE ${ctx} ADD COLUMN unapproved text`);
 await negative('native_type',`ALTER TABLE ${ctx} ALTER COLUMN sql_xid TYPE text USING sql_xid::text`);
 await negative('default',`ALTER TABLE ${ctx} ALTER COLUMN role_code SET DEFAULT 'employee'`);
 await negative('nullable',`ALTER TABLE ${ctx} ALTER COLUMN display_name DROP NOT NULL`);
 await negative('primary_key',`ALTER TABLE ${ctx} DROP CONSTRAINT qa_core_provision_context_pkey;ALTER TABLE ${ctx} ADD PRIMARY KEY(backend_pid,sql_xid,source_function,canonical_key)`);
 await negative('caller_acl',`GRANT SELECT ON ${ctx} TO service_role`);
 await negative('column_acl',`GRANT SELECT(login_name) ON ${ctx} TO authenticated`);
 await negative('public_acl',`GRANT INSERT ON ${ctx} TO PUBLIC`);
 await negative('owner',`ALTER TABLE ${ctx} OWNER TO service_role`);
 await negative('missing_native_fence',`DROP TRIGGER qa_owned_deletion_fence ON ${ctx}`);
 await negative('unknown_relation','CREATE TABLE app_private.unapproved_context(id integer)');
 await negative('test_observer_rejected','CREATE TABLE app_private.core_observed(op text,table_name text)');
 for(const name of ['legacy_archive','migration_gate','migration_receipts','workspace_edits','workspace_versions']){await negative('shape_'+name,`ALTER TABLE public.${name} ADD COLUMN unapproved text`);await negative('ACL_'+name,`GRANT SELECT ON public.${name} TO anon`);}

 await db.exec(`BEGIN;INSERT INTO app_private.qa_runs(run_id,phase,active,expires_at) VALUES('${base.id(7001)}','active',true,clock_timestamp()+interval '1 hour');
 INSERT INTO app_private.qa_owned_sources(run_id,source_id,source,create_operation,creation_receipt,user_id) VALUES('${base.id(7001)}','${base.id(7002)}','{"canonicalKey":"catalog-owned","loginAlias":"catalog-owned","email":"catalog-owned@fixture.invalid"}','${base.id(7003)}','${base.id(7004)}','${base.id(7005)}');
 INSERT INTO app_private.qa_owned_deletions(operation_id,run_id,source_id,target_user_id,canonical_key,generation,status,ownership_receipt_digest,protected_snapshot_digest) VALUES('${base.id(7006)}','${base.id(7001)}','${base.id(7002)}','${base.id(7005)}','catalog-owned',1,'delete_prepared',repeat('0',64),repeat('0',64));
 INSERT INTO app_private.qa_owned_deletion_fences VALUES('${base.id(7005)}','catalog-owned','${base.id(7001)}','${base.id(7006)}',1);COMMIT;`);
 const probe=async(label,statement,expected)=>{await db.exec('BEGIN');try{if(!label.startsWith('core_private'))await db.exec(`SET ROLE service_role;SET request.jwt.claims='{"role":"service_role"}';SET request.headers='{"x-qa-actor-user":"${base.actors.employee}","x-qa-actor-sid":"${base.id(1001)}"}';`);if(expected)await assert.rejects(db.exec(statement),e=>e.code==='42501'&&e.message.startsWith('durable owned deletion fence rejects dependency'));else await db.exec(statement);report.cases.push({label,status:'PASS',sqlstate:expected?'42501':null});}finally{await db.exec('ROLLBACK');}};
 await probe('workspace_ordinary_positive',`INSERT INTO public.workspace_edits VALUES('ceo:state',1,'${base.id(7201)}','ordinary','[{"value":{"target_user":"${base.actors.employee}"}}]',now())`,false);
 await probe('workspace_actor_fenced',`INSERT INTO public.workspace_edits VALUES('ceo:state',1,'${base.id(7201)}','catalog-owned','[]',now())`,true);
 await probe('workspace_nested_uid_fenced',`INSERT INTO public.workspace_edits VALUES('ceo:state',1,'${base.id(7201)}','ordinary','[{"value":{"target_user":"${base.id(7005)}"}}]',now())`,true);
 await probe('legacy_nested_key_fenced',`INSERT INTO public.legacy_archive VALUES('profiles','ordinary','{"nested":{"canonical_key":"catalog-owned"}}',NULL,now())`,true);
 await probe('core_private_context_fenced',`INSERT INTO app_private.qa_core_provision_context VALUES(pg_backend_pid(),pg_current_xact_id(),'public.account_provision_link_internal(text,uuid,jsonb)'::regprocedure,'catalog-owned','${base.id(7005)}','catalog-owned','display','employee','[]')`,true);

 const coreOID=(await db.query("SELECT 'public.account_provision_link_internal(text,uuid,jsonb)'::regprocedure::oid oid")).rows[0].oid;
 const coreMemberships=(await db.query("SELECT app_private.account_expected_memberships('staff_057') m")).rows[0].m;
 await db.exec(`BEGIN;SET ROLE service_role;SET request.jwt.claims='{"role":"service_role"}';SET request.headers='{}';`);
 try{const linked=(await db.query(`SELECT public.account_provision_link_internal('staff_057','${base.id(7401)}','${JSON.stringify(coreMemberships).replaceAll("'","''")}'::jsonb) receipt`)).rows[0].receipt;assert.equal(linked.status,'linked');report.cases.push({label:'actual_ordinary_core_source_oid_positive',status:'PASS',sourceOID:coreOID});}finally{await db.exec('ROLLBACK');}
 assert.equal((await db.query('SELECT count(*) n FROM app_private.qa_core_provision_context')).rows[0].n,0);
 await probe('workspace_actual_producer_positive',`SELECT public.commit_workspace_edit('ceo:state',0,'${base.id(7501)}','ordinary','[{"value":{"target_user":"${base.actors.employee}"}}]')`,false);
 await probe('workspace_actual_producer_nested_fenced',`SELECT public.commit_workspace_edit('ceo:state',0,'${base.id(7501)}','ordinary','[{"value":{"target_user":"${base.id(7005)}"}}]')`,true);

 await db.exec(`BEGIN;SET ROLE service_role;SET request.jwt.claims='{"role":"service_role"}';SET request.headers='{"x-qa-actor-user":"${base.actors.employee}","x-qa-actor-sid":"${base.id(1001)}"}';INSERT INTO public.workspace_edits VALUES('ceo:state',1,'${base.id(7601)}','ordinary','[]',now());COMMIT;RESET ROLE;`);
 await probe('workspace_update_nested_fenced',`UPDATE public.workspace_edits SET operations='[{"value":{"run_id":"${base.id(7001)}"}}]' WHERE request_id='${base.id(7601)}'`,true);
 await probe('legacy_ordinary_positive',`INSERT INTO public.legacy_archive VALUES('profiles','ordinary','{"nested":{"canonical_key":"ordinary"}}',NULL,now())`,false);
 await negative('sequence_options',`ALTER SEQUENCE public.migration_receipts_id_seq INCREMENT BY 2`);
 await negative('sequence_acl',`GRANT SELECT ON SEQUENCE public.migration_receipts_id_seq TO service_role`);
 const fkAfter=(await db.query("SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY oid),'[]') j FROM pg_constraint c WHERE contype='f' AND conrelid NOT IN (SELECT oid FROM pg_class WHERE relname LIKE 'qa_owned_%')")).rows[0].j;assert.deepEqual(fkAfter,fkBefore);report.originalFKsPreserved=true;
 report.status='GREEN';report.failures=0;
}catch(e){report.status='RED';report.error={code:e.code||null,message:e.message,where:e.where};process.exitCode=1;}finally{if(db){await db.exec('ROLLBACK');await db.close();}stop();fs.writeFileSync(OUT+'/REPORT.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
