// TEST ONLY: existing parent-owned WSL PostgreSQL SELECT-mechanics transport.
// Import is inert. No cluster/database lifecycle or product activation hooks.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,realpathSync,statSync,rmSync,existsSync} from 'node:fs';
import {join,posix} from 'node:path';

const HANDOFF='AFTER_14_PARENT_SERIAL';
const HOST='127.0.0.1';
const PORT=51771;
const DATA='/home/faisal/ceo-msajed-qa-checkpoints/2026-10-09-durable-fence-blocked/run-wsl-20261009/pgdata';
const SCRATCH='/home/faisal/ceo-msajed-qa-checkpoints/2026-10-09-durable-fence-blocked/run-wsl-20261009/scratch';
const PSQL='/usr/lib/postgresql/16/bin/psql';

// Validate exact parent receipt inputs before any process/SQL invocation. Do not
// normalize a bad identifier/path or inherit libpq retargeting/credentials.
function parentTarget(env){
 assert.equal(env.QA_PROVENANCE_WSL_PARENT,HANDOFF,'explicit parent-only provenance handoff required');
 assert(!Object.keys(env).some(k=>/^(SUPABASE|SERVICE_ROLE|PGPASSWORD)/i.test(k)),'credential-free local test environment required');
 assert.match(env.QA_LOCAL_PG_DATABASE??'',/^qa_local_legacy_[a-z0-9_]+$/,'exact fresh parent-owned legacy database required');
 assert(!/[^a-z0-9_]/.test(env.QA_LOCAL_PG_DATABASE),'literal database identifier required');
 assert((env.QA_LOCAL_PG_DATABASE??'').length<=63,'PostgreSQL database identifier must not truncate');
 assert.equal(env.QA_LOCAL_PG_HOST,HOST,'exact parent loopback host required');
 assert.equal(env.QA_LOCAL_PG_PORT,String(PORT),'exact parent fixture port required');
 assert.equal(env.PGDATA,DATA,'exact QA-owned parent data directory required');
 const expectedPG={PGDATA:DATA,PGHOST:HOST,PGHOSTADDR:HOST,PGPORT:String(PORT),PGDATABASE:env.QA_LOCAL_PG_DATABASE,PGUSER:'postgres'};
 for(const key of Object.keys(env).filter(k=>/^PG/i.test(k))){
  assert(Object.hasOwn(expectedPG,key),'inherited libpq option is not permitted: '+key);
  assert.equal(env[key],expectedPG[key],'parent libpq receipt mismatch: '+key);
 }
 const checkedScratchPath=path=>{
  assert(typeof path==='string'&&(path===SCRATCH||path.startsWith(SCRATCH+'/')),'QA Linux scratch custody required');
  assert.equal(posix.normalize(path),path,'scratch path must be canonical');
  assert(!path.includes('\0')&&!path.includes('\\'),'Linux scratch path required');
  return path;
 };
 const scratch=checkedScratchPath(env.QA_PROVENANCE_SCRATCH);
 const evidenceDir=env.QA_PROVENANCE_EVIDENCE_DIR===undefined?null:checkedScratchPath(env.QA_PROVENANCE_EVIDENCE_DIR);
 return Object.freeze({host:HOST,port:PORT,database:env.QA_LOCAL_PG_DATABASE,data:DATA,listen:HOST,scratch,evidenceDir});
}

// Every launch receives this same-session, read-only identity gate first. The
// supplied fixture SQL cannot run after any identity/foreign/client mismatch.
function identityGate(target){
 return `DO $qa_provenance_identity$ BEGIN
 IF current_database() IS DISTINCT FROM '${target.database}'
 OR current_user IS DISTINCT FROM 'postgres'
 OR session_user IS DISTINCT FROM 'postgres'
 OR pg_catalog.host(pg_catalog.inet_server_addr()) IS DISTINCT FROM '${HOST}'
 OR pg_catalog.host(pg_catalog.inet_client_addr()) IS DISTINCT FROM '${HOST}'
 OR pg_catalog.inet_server_port() IS DISTINCT FROM ${PORT}
 OR pg_catalog.current_setting('data_directory') IS DISTINCT FROM '${DATA}'
 OR pg_catalog.current_setting('listen_addresses') IS DISTINCT FROM '${HOST}'
 OR pg_catalog.current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_server)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_catalog.pg_backend_pid())
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('native_fixture_gateway','supabase_read_only_user'))<>2
 THEN RAISE EXCEPTION 'qa_provenance_parent_identity_denied' USING ERRCODE='42501';
 END IF;
 END; $qa_provenance_identity$;`;
}

// Closed allowlist; no spreading process.env, credential variables, service
// selection, provider keys or caller PGOPTIONS. Private HOME + a nonexistent
// passfile prevent ambient password-file lookup; -w also forbids prompting.
function psqlEnvironment(dir){
 return {
  PATH:'/usr/lib/postgresql/16/bin:/usr/bin:/bin',LANG:'C',LC_ALL:'C',HOME:dir,
  TMPDIR:dir,TEMP:dir,TMP:dir,PGAPPNAME:'qa-provenance-select-mechanics',
  PGCONNECT_TIMEOUT:'5',PGSSLMODE:'disable',PGGSSENCMODE:'disable',
  PGPASSFILE:join(dir,'no-password-file'),PGSYSCONFDIR:dir,
 };
}

// Source-level preflight runs before any offline fixture creates files. It is
// configuration/filesystem validation ONLY, with no psql/SQL or temp creation.
export function validateParentOwnedProvenanceEnvironment(){
 const target=parentTarget(process.env);
 assert.equal(process.platform,'linux','existing-local provenance runs inside WSL only');
 assert.equal(realpathSync(target.scratch),target.scratch,'scratch symlink escapes are forbidden');
 assert(statSync(target.scratch).isDirectory(),'existing parent scratch directory required');
 if(target.evidenceDir!==null){
  assert.equal(realpathSync(target.evidenceDir),target.evidenceDir,'evidence directory symlink escapes are forbidden');
  assert(statSync(target.evidenceDir).isDirectory(),'existing parent evidence directory required');
 }
 assert.equal(realpathSync(PSQL),PSQL,'only the installed PostgreSQL 16 psql is permitted');
 assert(statSync(PSQL).isFile(),'installed psql required');
 return target;
}

export function createParentOwnedProvenanceFixture(){
 const target=validateParentOwnedProvenanceEnvironment();
 const dir=mkdtempSync(join(target.scratch,'provenance-parent-select-'));
 let finished=false;
 const query=sql=>{
  assert(!finished,'temporary fixture custody already finished');
  assert.equal(typeof sql,'string');assert(sql.trim(),'fixture SQL required');
  assert.deepEqual(parentTarget(process.env),target,'parent receipt changed during fixture');
  assert.equal(realpathSync(target.scratch),target.scratch,'scratch custody drift');
  assert.equal(realpathSync(dir),dir,'temporary fixture custody drift');
  if(target.evidenceDir!==null)assert.equal(realpathSync(target.evidenceDir),target.evidenceDir,'evidence directory custody drift');
  assert.equal(realpathSync(PSQL),PSQL,'installed psql custody drift');
  return execFileSync(PSQL,['-X','-w','-q','-t','-A','-h',target.host,'-p',String(target.port),'-U','postgres','-d',target.database,'-v','ON_ERROR_STOP=1'],{
   encoding:'utf8',input:identityGate(target) + '\n' + sql,timeout:30000,
   stdio:['pipe','pipe','pipe'],env:psqlEnvironment(dir),
  }).trim();
 };
 return Object.freeze({query,port:target.port,data:target.data,database:target.database,dir,
  finish(){
   // Files ONLY. roleCustody.finish() belongs to the original test's t.after;
   // the parent retains/disposes its exact database and unchanged QA cluster.
   finished=true;
   if(existsSync(dir)){
    assert.equal(realpathSync(target.scratch),target.scratch,'cleanup scratch custody drift');
    assert.equal(realpathSync(dir),dir,'cleanup temporary fixture custody drift');
    rmSync(dir,{recursive:true,force:true});
   }
   assert.equal(existsSync(dir),false,'owned temporary files remain');
   return {temporaryFilesRemoved:true,fixtureDatabaseDisposition:'parent custody',qaClusterUntouched:true};
  },
 });
}
