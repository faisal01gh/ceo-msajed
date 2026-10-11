// Dispose ONLY the first runner-owned cluster interrupted by tool timeout.
import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const F='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/durable-deletion-fence/integrated',dir=F+'/pgdata',bin='C:/Program Files/PostgreSQL/17/bin/',port='56611',db='qa_fence_integrated',report={};
const exec=(name,args)=>{const r=spawnSync(bin+name+'.exe',args,{encoding:'utf8',timeout:60000});if(r.status!==0)throw Object.assign(Error(name+' failed'),{diagnostic:{exitCode:r.status,stderr:r.stderr}});return r;};
let started=false;try{
 exec('pg_ctl',['-D',dir,'-l',F+'/interrupted-disposal-server.log','-o','-h 127.0.0.1 -p '+port,'-w','start']);started=true;
 const args=['-X','-w','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
 exec('psql',[...args,'-c',`DO $g$ BEGIN IF current_database()<>'postgres' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>${port} OR current_setting('data_directory')<>'${dir}' OR current_setting('listen_addresses')<>'127.0.0.1' OR EXISTS(SELECT 1 FROM pg_foreign_server) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE client_addr IS NOT NULL AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'wrong interrupted owned cluster';END IF;END $g$`]);
 exec('dropdb',['-h','127.0.0.1','-p',port,'-U','postgres','--if-exists',db]);const r=exec('psql',[...args,'-At','-c',`SELECT count(*) FROM pg_database WHERE datname='${db}'`]);assert.equal(r.stdout.trim(),'0');report.databaseCount=0;
}catch(e){report.error={message:e.message,diagnostic:e.diagnostic};process.exitCode=1;}
finally{if(started){exec('pg_ctl',['-D',dir,'-m','fast','-w','stop']);const r=spawnSync(bin+'pg_ctl.exe',['-D',dir,'status'],{encoding:'utf8',timeout:10000});assert.equal(r.status,3);report.serverStopped=true;}fs.writeFileSync(F+'/INTERRUPTED_CLUSTER_DISPOSAL.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
