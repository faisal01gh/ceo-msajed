// Bounded native SQL control tests. No provider/target network permitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const SQL=new URL('./owned-control.sql',import.meta.url);
const pg='C:/Program Files/PostgreSQL/17/bin/psql.exe';
const base=['-X','-w','-h','127.0.0.1','-p','51771','-U','postgres','-d','qa_isolation_step3_integrated_20261009','-v','ON_ERROR_STOP=1','-A','-t'];
const query=sql=>spawnSync(pg,[...base,'-c',sql],{encoding:'utf8',timeout:30000});
const identity=`SELECT jsonb_build_object('database',current_database(),'address',host(inet_server_addr()),'port',inet_server_port(),'pid',pg_backend_pid(),'datadir',current_setting('data_directory'),'listen',current_setting('listen_addresses'),'foreign_servers',(SELECT count(*)::int FROM pg_foreign_server),'other_clients',(SELECT count(*)::int FROM pg_stat_activity WHERE client_addr IS NOT NULL AND pid<>pg_backend_pid()));`;
test('new private native closure mechanism exists independently of old Core/password frames',()=>{
 const r=query('BEGIN READ ONLY;'+identity+'COMMIT;');assert.equal(r.status,0,r.stderr);
 const i=JSON.parse(r.stdout.split(/\r?\n/).find(l=>l.startsWith('{')));
 assert.equal(i.database,'qa_isolation_step3_integrated_20261009');assert.equal(i.address,'127.0.0.1');assert.equal(i.port,51771);assert.equal(i.listen,'127.0.0.1');assert.equal(i.foreign_servers,0);assert.equal(i.other_clients,0);assert.equal(i.datadir.replaceAll('\\','/'),'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-local-postgres-ordering/data');assert(i.pid>0);
 const sql=fs.readFileSync(SQL,'utf8');assert.match(sql,/CREATE TABLE app_private\.qa_owned_frames\b/,'separately-owned native frame is missing');
});
test('new service-only bootstrap/disposal sources are operational definitions, not the staff Link RPC',()=>{
 const sql=fs.readFileSync(SQL,'utf8');
 assert.match(sql,/CREATE FUNCTION public\.qa_owned_bootstrap_internal\(/,'owned bootstrap source is missing');
 assert.match(sql,/CREATE FUNCTION public\.qa_owned_dispose_internal\(/,'owned disposal source is missing');
});
