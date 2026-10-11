// Bounded durable journal mechanics only, not provider/native authorization.
// Uses actual new table/operation/service definitions in two separate psql
// processes. No Core/Guard/RLS body is installed or changed by this probe.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const OUT='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/finding2-completion';
fs.mkdirSync(OUT,{recursive:true});
const sql=fs.readFileSync(new URL('./owned-control.sql',import.meta.url),'utf8');
const chunk=name=>{const start=sql.indexOf('CREATE TABLE '+name+'(')>=0?sql.indexOf('CREATE TABLE '+name+'('):sql.indexOf('CREATE TABLE '+name+' (');assert(start>=0);return sql.slice(start,sql.indexOf('\n);',start)+3);};
const fn=name=>{const start=sql.indexOf('CREATE FUNCTION '+name+'(');assert(start>=0);return sql.slice(start,sql.indexOf('\nEND $$;',start)+9);};
const guard=`DO $g$ BEGIN IF current_database()<>'qa_isolation_step3_integrated_20261009' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>51771 OR current_setting('listen_addresses')<>'127.0.0.1' OR current_setting('data_directory')<>'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-local-postgres-ordering/data' OR EXISTS(SELECT 1 FROM pg_foreign_server) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE client_addr IS NOT NULL AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'wrong owned database';END IF;END $g$;`;
const run='00000000-0000-4000-8000-000000088101',source='00000000-0000-4000-8000-000000088102',op='00000000-0000-4000-8000-000000088103',receipt='00000000-0000-4000-8000-000000088104';
const base=['-X','-w','-h','127.0.0.1','-p','51771','-U','postgres','-d','qa_isolation_step3_integrated_20261009','-v','ON_ERROR_STOP=1'];
const call=(name,body)=>{const path=OUT+'/'+name+'.sql';fs.writeFileSync(path,'\\set ON_ERROR_STOP on\n'+body);const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',[...base,'-f',path],{encoding:'utf8',timeout:30000,maxBuffer:1048576});fs.writeFileSync(OUT+'/'+name+'.stdout.txt',r.stdout||'');fs.writeFileSync(OUT+'/'+name+'.stderr.txt',r.stderr||'');return r;};
let setupCommitted=false;const receipts=[];
try{
 const setup=`BEGIN;${guard}${chunk('app_private.qa_owned_operations')}${chunk('app_private.qa_owned_sources')}
 ALTER TABLE app_private.qa_owned_operations ADD COLUMN reserved_at timestamptz NOT NULL DEFAULT clock_timestamp();
 ALTER TABLE app_private.qa_owned_operations OWNER TO postgres;ALTER TABLE app_private.qa_owned_sources OWNER TO postgres;
 REVOKE ALL ON app_private.qa_owned_operations,app_private.qa_owned_sources FROM PUBLIC,anon,authenticated,service_role;
 ${fn('app_private.qa_owned_service')}${fn('public.qa_owned_operation_internal')}
 REVOKE ALL ON FUNCTION app_private.qa_owned_service() FROM PUBLIC,anon,authenticated,service_role;
 REVOKE ALL ON FUNCTION public.qa_owned_operation_internal(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.qa_owned_operation_internal(uuid,uuid,text,text,text,text) TO service_role;
 INSERT INTO app_private.qa_runs(run_id,phase,active,expires_at) VALUES('${run}','prepared',false,clock_timestamp()+interval '1 hour');
 INSERT INTO app_private.qa_owned_sources(run_id,source_id,source,create_operation,creation_receipt) VALUES('${run}','${source}','{"fixture_only":true}','${op}','${receipt}');
 SELECT set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('request.headers','{}',true);SET LOCAL ROLE service_role;
 SELECT public.qa_owned_operation_internal('${run}','${op}','create','${source}','reserved','pending');
 SELECT public.qa_owned_operation_internal('${run}','${op}','create','${source}','dispatched','pending');
 SELECT public.qa_owned_operation_internal('${run}','${op}','create','${source}','unknown','pending');
 SELECT public.qa_owned_operation_internal('${run}','${op}','create','${source}','completed','fulfilled');
 RESET ROLE;COMMIT;`;
 const first=call('RESTART_WRITER',setup);assert.equal(first.status,0,first.stderr);setupCommitted=true;receipts.push({phase:'writer committed then exited',exitCode:first.status});
 const second=call('RESTART_READER',`BEGIN;${guard}
 DO $proof$ DECLARE o app_private.qa_owned_operations%rowtype; BEGIN SELECT * INTO STRICT o FROM app_private.qa_owned_operations WHERE run_id='${run}' AND operation_id='${op}';IF o.state<>'unknown' OR o.actual<>'fulfilled' OR jsonb_array_length(o.history)<>4 THEN RAISE EXCEPTION 'journal did not survive real process exit';END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);PERFORM set_config('request.headers','{}',true);PERFORM set_config('role','service_role',true);
 BEGIN PERFORM public.qa_owned_operation_internal('${run}','${op}','create','${source}','reserved','pending');RAISE EXCEPTION 'replay unexpectedly allowed';EXCEPTION WHEN unique_violation THEN NULL;END;
 PERFORM set_config('role','none',true);RAISE NOTICE 'DURABLE_RESTART_NO_RETRY_PASS';END $proof$;ROLLBACK;`);
 assert.equal(second.status,0,second.stderr);assert.match(second.stderr,/DURABLE_RESTART_NO_RETRY_PASS/);receipts.push({phase:'new psql process read durable unknown/fulfilled and denied replay',exitCode:second.status});
}catch(e){process.exitCode=1;receipts.push({phase:'failure',message:e.message});}
finally{
 if(setupCommitted){const cleanup=call('RESTART_CLEANUP',`BEGIN;${guard}
 DELETE FROM app_private.qa_owned_operations WHERE run_id='${run}' AND operation_id='${op}';
 DELETE FROM app_private.qa_owned_sources WHERE run_id='${run}' AND source_id='${source}';
 DELETE FROM app_private.qa_runs WHERE run_id='${run}';
 DROP FUNCTION public.qa_owned_operation_internal(uuid,uuid,text,text,text,text);DROP FUNCTION app_private.qa_owned_service();
 DROP TABLE app_private.qa_owned_operations;DROP TABLE app_private.qa_owned_sources;COMMIT;
 BEGIN READ ONLY;SELECT CASE WHEN EXISTS(SELECT 1 FROM app_private.qa_runs WHERE run_id='${run}') OR to_regclass('app_private.qa_owned_operations') IS NOT NULL OR to_regclass('app_private.qa_owned_sources') IS NOT NULL OR to_regprocedure('public.qa_owned_operation_internal(uuid,uuid,text,text,text,text)') IS NOT NULL THEN 'FAIL' ELSE 'ABSENT' END;COMMIT;`);
 if(cleanup.status!==0){process.exitCode=1;receipts.push({phase:'cleanup failure',exitCode:cleanup.status,message:cleanup.stderr});}else receipts.push({phase:'exact fixture cleanup and absence readback',exitCode:cleanup.status});}
 fs.writeFileSync(OUT+'/DURABLE_RESTART.json',JSON.stringify({nativeAuthorization:0,providerMutations:0,mechanicsOnly:true,realSeparateProcesses:2,actualWholeLifecycleRestartClaimed:false,receipts},null,2));console.log(JSON.stringify({status:process.exitCode?'FAIL':'PASS_NATIVE_DURABLE_JOURNAL',receipts}));
}
