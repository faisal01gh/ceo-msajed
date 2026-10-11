// TEST ONLY. Separate psql child; no owner adapter query while reader is open.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {TARGET} from './qa_postgres_native_fixture.mjs';
import {parseCompletedReadQuery,pgJsonbText,pgJsonbDigest} from '../scripts/qa-load-preparation/completed-read-api.mjs';
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const envAllowlist=()=>Object.fromEntries(['PATH','SystemRoot','WINDIR','LOCALAPPDATA','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function child(sql){
 assert.equal(process.env.QA_WSL_HANDOFF,'AFTER_14_PARENT_SERIAL');
 const args=['-X','-q','-At','--no-password','-v','ON_ERROR_STOP=1','-h',TARGET.host,'-p',String(TARGET.port),'-U','postgres','-d',TARGET.database];
 const wsl=process.platform==='win32';
 const executable=wsl?'C:/Windows/System32/wsl.exe':'/usr/lib/postgresql/16/bin/psql';
 const argv=wsl?['-d',process.env.QA_COMPLETED_WSL_DISTRO||'Ubuntu','--','/usr/bin/env','-i','PATH=/usr/bin:/bin','LANG=C.UTF-8','PGPASSFILE=/dev/null','PGCONNECT_TIMEOUT=5','PGSSLMODE=disable','PGGSSENCMODE=disable','/usr/lib/postgresql/16/bin/psql',...args]:args;
 const r=spawnSync(executable,argv,{input:Buffer.from(sql,'utf8'),env:{...envAllowlist(),LANG:'C.UTF-8',PGPASSFILE:'/dev/null',PGCONNECT_TIMEOUT:'5',PGSSLMODE:'disable',PGGSSENCMODE:'disable'},timeout:90000,maxBuffer:32*1024*1024,windowsHide:true});
 if(r.error)throw r.error;
 assert.equal(r.status,0,'separate native reader failed: '+r.stderr?.toString('utf8'));
 return r.stdout.toString('utf8').trim().split(/\r?\n/).filter(Boolean);
}
function preflight(d){
 const ownerPid=d.connection?.pid;assert(Number.isSafeInteger(ownerPid)&&ownerPid>0&&d.connection.role==='postgres'&&!d.wire.pending);
 assert.match(TARGET.database,/^qa_local_composed_[a-z0-9_]+$/);
 return `DO $identity$ BEGIN
 IF current_database()<>${quote(TARGET.database)} OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>51771 OR current_setting('data_directory')<>${quote(TARGET.dataDirectory)} OR current_setting('listen_addresses')<>'127.0.0.1' OR current_user<>'postgres' OR session_user<>'postgres' OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_server) OR version() NOT LIKE 'PostgreSQL 16.%' THEN RAISE EXCEPTION 'exact reader target denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=${ownerPid} AND datname=${quote(TARGET.database)} AND usename='postgres' AND application_name='qa-fence-integrated' AND client_addr='127.0.0.1'::inet AND state='idle' AND xact_start IS NULL) OR EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid() AND pid<>${ownerPid}) THEN RAISE EXCEPTION 'exact registered primary-owner backend denied'; END IF;
 END $identity$;`;
}
export async function readAsActualRole(d,query,{trustedDrift=''}={}){
 parseCompletedReadQuery(query);
 // trustedDrift is produced only by the fixture's closed drift builder.
 assert(trustedDrift===''||trustedDrifts.has(trustedDrift));
 const sql=`BEGIN;SET LOCAL statement_timeout='60s';SET LOCAL lock_timeout='5s';SET LOCAL search_path='';${preflight(d)}\n${trustedDrift}\nSET LOCAL ROLE supabase_read_only_user;SET TRANSACTION READ ONLY;
 SELECT pg_catalog.row_to_json(r)::text FROM (${query.slice(0,-1)}) r;
 ROLLBACK;`;
 const lines=child(sql);assert.equal(lines.length,1);const row=JSON.parse(lines[0]);
 // Observed outside SECURITY DEFINER: never fill readRole from configuration.
 assert.equal(row.caller.session_user,'postgres');assert.equal(row.caller.current_user,'supabase_read_only_user');assert.equal(row.caller.transaction_read_only,'on');
 return [row];
}
const trustedDrifts=new Set();
export function registerTrustedFixtureDrift(sql){
 assert(typeof sql==='string'&&sql.length>0&&!/COMMIT|GRANT|ALTER ROLE|CREATE FUNCTION/i.test(sql));
 if(/REVOKE/i.test(sql))assert(/^ALTER TABLE app_private\.(qa_owned_approved_plans|qa_owned_run_receipts) OWNER TO anon;REVOKE ALL ON TABLE app_private\.\1 FROM PUBLIC,anon,postgres;DO \$owner\$/i.test(sql.trim())&&(sql.match(/REVOKE/gi)||[]).length===1,'only exact rolled-back owner-empty-ACL fixture revocation');
 trustedDrifts.add(sql);return sql;
}
export async function checkJsonbParityAsActualRole(d,values){
 for(const v of values){const text=pgJsonbText(v),b=Buffer.from(JSON.stringify(v),'utf8').toString('base64');
  const q=`SELECT pg_catalog.jsonb_build_object('text',j::text,'digest',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(j::text,'UTF8')),'hex'),'session_user',session_user,'current_user',current_user,'transaction_read_only',pg_catalog.current_setting('transaction_read_only'))::text FROM (SELECT pg_catalog.convert_from(pg_catalog.decode('${b}','base64'),'UTF8')::jsonb j) x;`;
  const lines=child(`BEGIN;SET LOCAL search_path='';${preflight(d)}SET LOCAL ROLE supabase_read_only_user;SET TRANSACTION READ ONLY;${q}ROLLBACK;`);assert.equal(lines.length,1);const r=JSON.parse(lines[0]);assert.equal(r.text,text);assert.equal(r.digest,pgJsonbDigest(v));assert.equal(r.current_user,'supabase_read_only_user');assert.equal(r.session_user,'postgres');assert.equal(r.transaction_read_only,'on');
 }
 return {status:'PASS',values:values.length,independentNativeJsonb:true};
}
// Every expected denied effect is recovered with an exact rollback savepoint.
export async function readonlyMutationDenials(d,probes){
 assert(Array.isArray(probes)&&probes.length>0);const results=[];
 for(const {name,sql}of probes){assert(typeof sql==='string'&&!/COMMIT|ROLLBACK|GRANT|ALTER ROLE/i.test(sql));
  const script=`BEGIN;SET LOCAL search_path='';${preflight(d)}SET LOCAL ROLE supabase_read_only_user;SET TRANSACTION READ ONLY;SAVEPOINT denied_effect;
 \\set ON_ERROR_STOP off
 \\set VERBOSITY sqlstate
 ${sql};
 \\set observed_sqlstate :SQLSTATE
 ROLLBACK TO SAVEPOINT denied_effect;
 \\set ON_ERROR_STOP on
 SELECT pg_catalog.jsonb_build_object('name',${quote(name)},'sqlstate',:'observed_sqlstate','session_user',session_user,'current_user',current_user,'transaction_read_only',pg_catalog.current_setting('transaction_read_only'))::text;
 ROLLBACK;`;
  const lines=child(script);assert.equal(lines.length,1);const r=JSON.parse(lines[0]);assert(['42501','25006'].includes(r.sqlstate),name+' did not prove privilege/read-only rejection: '+r.sqlstate);assert.equal(r.current_user,'supabase_read_only_user');assert.equal(r.session_user,'postgres');assert.equal(r.transaction_read_only,'on');results.push(r);
 }
 return results;
}
