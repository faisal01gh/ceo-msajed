// Owned disposable native PG role-proof fixture, not full cascade acceptance.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gatewayMetadataSQL} from './lifecycle.fence-gateway.metadata.mjs';
const OUT='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/durable-deletion-fence/gateway';
const phase=process.env.GATEWAY_PHASE||'GREEN';
const source=fs.readFileSync(new URL('owned-deletion-fence.sql',import.meta.url),'utf8');
const sha=createHash('sha256').update(source).digest('hex');
const fixture=path.join(OUT,'gatewayfixture',phase.toLowerCase()+'-'+Date.now());
fs.mkdirSync(fixture,{recursive:true});
const bin='C:/Program Files/PostgreSQL/17/bin/';
const cmd=(exe,args)=>spawnSync(bin+exe+'.exe',args,{encoding:'utf8',timeout:60000,maxBuffer:4194304});
const listener=net.createServer();await new Promise((yes,no)=>{listener.on('error',no);listener.listen(0,'127.0.0.1',yes)});const port=listener.address().port;await new Promise(yes=>listener.close(yes));assert(![52512,51771].includes(port));
const data=path.join(fixture,'pgdata').replaceAll('\\','/');
const report={phase,sourceHash:sha,scope:'isolated actual native gateway + catalog role proof; not full native cascade acceptance',checks:[],noProviderActions:true,noHTTP:true};
let started=false;
const args=['-X','-w','-h','127.0.0.1','-p',String(port),'-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-A','-t'];
const identity=`DO $guard$ BEGIN IF current_database()<>'postgres' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>${port} OR current_setting('data_directory')<>'${data}' OR current_setting('listen_addresses')<>'127.0.0.1' OR EXISTS(SELECT 1 FROM pg_foreign_server) THEN RAISE EXCEPTION 'wrong isolated fixture';END IF;END $guard$;`;
const raw=(sql,user='postgres')=>{const checked=cmd('psql',[...args,'-U','postgres','-c',identity]);assert.equal(checked.status,0,checked.stderr);return cmd('psql',[...args,'-U',user,'-c',sql]);};
function q(sql,user='postgres'){const r=raw(sql,user);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function deny(name,sql,code='55000',user='postgres'){const r=raw(sql,user);assert.notEqual(r.status,0,name+' unexpectedly accepted');assert(r.stderr.includes(code),name+': '+r.stderr);report.checks.push({name,sqlstate:code});}
const pin=role=>q(`UPDATE app_private.qa_owned_native_anchor a SET gateway_oid='${role}'::regrole;UPDATE app_private.qa_owned_native_anchor a SET gateway_metadata=${gatewayMetadataSQL('a')};UPDATE app_private.qa_owned_native_anchor SET catalog_digest=app_private.qa_owned_native_catalog_digest();`);
try{
 let r=cmd('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);assert.equal(r.status,0,r.stderr);
 r=cmd('pg_ctl',['-D',data,'-l',path.join(fixture,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start']);assert.equal(r.status,0,r.stderr);started=true;
 q(`CREATE SCHEMA auth;CREATE SCHEMA app_private;CREATE ROLE qa_gateway LOGIN NOINHERIT NOCREATEROLE NOREPLICATION;CREATE ROLE qa_rogue LOGIN NOINHERIT CREATEROLE NOREPLICATION;CREATE ROLE qa_group NOLOGIN;CREATE ROLE service_role NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE anon NOLOGIN;GRANT USAGE ON SCHEMA app_private TO qa_gateway,qa_rogue,service_role;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE auth.sessions(id uuid PRIMARY KEY);CREATE TABLE public.profiles(id uuid PRIMARY KEY);CREATE TABLE public.user_roles(id uuid PRIMARY KEY);CREATE TABLE public.user_memberships(id uuid PRIMARY KEY);CREATE TABLE public.account_migration_users(id uuid PRIMARY KEY);CREATE TABLE app_private.account_credential_state(id uuid PRIMARY KEY);CREATE TABLE app_private.qa_owned_native_frames(id integer);
 ${source.match(/CREATE TABLE app_private\.qa_owned_native_anchor[\s\S]*?;/)[0]}
 ALTER TABLE app_private.qa_owned_native_anchor ADD COLUMN IF NOT EXISTS gateway_metadata jsonb;
 ${source.match(/CREATE FUNCTION app_private\.qa_owned_native_catalog_digest\(\)[\s\S]*?\$\$;/)[0]}
 ${source.match(/CREATE FUNCTION app_private\.qa_owned_native_gateway\(\)[\s\S]*?\$\$;/)[0]}
 REVOKE ALL ON app_private.qa_owned_native_anchor FROM PUBLIC,qa_gateway,qa_rogue,service_role,authenticated,anon;
 INSERT INTO app_private.qa_owned_native_anchor(id,gateway_oid,catalog_digest) VALUES(1,NULL,'unattested');`);
 pin('qa_gateway');const nativeOid=q('SELECT app_private.qa_owned_native_gateway();','qa_gateway');assert(/^\d+$/.test(nativeOid));report.checks.push({name:'reviewed NOCREATEROLE baseline actual gateway accepted',oid:Number(nativeOid)});
 // TEST-only drift: never changes an external provider role.
 q('ALTER ROLE qa_gateway CREATEROLE;');deny('false-to-true drift without new installer approval','SELECT app_private.qa_owned_native_gateway();');
 pin('qa_gateway');
 const official=q('SELECT app_private.qa_owned_native_gateway();','qa_gateway');assert.equal(official,nativeOid);report.checks.push({name:'installer-reviewed official-style CREATEROLE gateway accepted',oid:Number(official)});
 if(phase==='RED')throw Error('EXPECTED_RED_DID_NOT_FAIL');
 const digest=q('SELECT catalog_digest FROM app_private.qa_owned_native_anchor;');
 q('ALTER ROLE qa_gateway NOCREATEROLE;');deny('true-to-false attribute drift','SELECT app_private.qa_owned_native_gateway();');assert.notEqual(q('SELECT app_private.qa_owned_native_catalog_digest();'),digest);q('ALTER ROLE qa_gateway CREATEROLE;');
 for(const [name,change,restore] of [['inherit','INHERIT','NOINHERIT'],['connection limit','CONNECTION LIMIT 4','CONNECTION LIMIT -1'],['createdb','CREATEDB','NOCREATEDB'],['superuser','SUPERUSER','NOSUPERUSER'],['replication','REPLICATION','NOREPLICATION']]){q('ALTER ROLE qa_gateway '+change+';');deny(name+' metadata drift','SELECT app_private.qa_owned_native_gateway();');q('ALTER ROLE qa_gateway '+restore+';');}
 q("ALTER ROLE qa_gateway SET search_path TO auth;");deny('role configuration drift','SELECT app_private.qa_owned_native_gateway();');q('ALTER ROLE qa_gateway RESET search_path;');
 q('GRANT qa_group TO qa_gateway;');deny('outgoing membership drift','SELECT app_private.qa_owned_native_gateway();');pin('qa_gateway');assert.equal(q('SELECT app_private.qa_owned_native_gateway();','qa_gateway'),nativeOid);report.checks.push({name:'installer-reviewed exact nonempty NOINHERIT membership accepted'});q('REVOKE qa_group FROM qa_gateway;');deny('membership removal drift','SELECT app_private.qa_owned_native_gateway();');pin('qa_gateway');
 q('GRANT qa_gateway TO qa_rogue;');deny('incoming member drift','SELECT app_private.qa_owned_native_gateway();');q('REVOKE qa_gateway FROM qa_rogue;');
 q("UPDATE app_private.qa_owned_native_anchor SET gateway_metadata=jsonb_set(gateway_metadata,'{role,rolcreaterole}','false');");deny('anchor metadata tamper even with current catalog digest','SELECT app_private.qa_owned_native_gateway();');pin('qa_gateway');
 deny('application caller cannot update installer anchor',"UPDATE app_private.qa_owned_native_anchor SET gateway_metadata='{}';",'42501','qa_gateway');
 deny('service JWT cannot update installer anchor',"SET ROLE service_role;SET request.jwt.claims='{\"role\":\"supabase_auth_admin\"}';UPDATE app_private.qa_owned_native_anchor SET gateway_metadata='{}';",'42501');
 q('UPDATE app_private.qa_owned_native_anchor SET gateway_oid=\'qa_rogue\'::regrole;');deny('gateway OID replacement rejects old anchor','SELECT app_private.qa_owned_native_gateway();');pin('qa_gateway');
 q("UPDATE app_private.qa_owned_native_anchor SET catalog_digest=repeat('0',64);");deny('catalog digest tamper','SELECT app_private.qa_owned_native_gateway();');pin('qa_gateway');
 q("UPDATE app_private.qa_owned_native_anchor SET gateway_metadata=NULL;");deny('missing metadata fail closed','SELECT app_private.qa_owned_native_gateway();');pin('qa_gateway');
 // Exercise the exact identity predicate already present in actual ROOT, without
 // pretending this bounded fixture has native receipt/FK closure acceptance.
 assert(source.includes("session_user::regrole::oid<>gateway OR current_setting('role')<>'none'"));
 const predicate="session_user::regrole::oid<>app_private.qa_owned_native_gateway() OR current_setting('role')<>'none'";
 assert.equal(q(`SELECT NOT (${predicate});`,'qa_gateway'),'t');
 assert.equal(q(`SET request.jwt.claims='{\"role\":\"supabase_auth_admin\"}';SELECT (${predicate});`,'qa_rogue').split('\n').at(-1),'t');
 assert.equal(q(`SET request.jwt.claims='{\"role\":\"supabase_auth_admin\"}';SELECT (${predicate});`,'postgres').split('\n').at(-1),'t');
 assert.equal(q(`SET ROLE qa_gateway;SELECT (${predicate});`,'postgres').split('\n').at(-1),'t');
 report.checks.push({name:'actual ROOT identity predicate accepts exact SESSION_USER with role none; rogue/JWT/SET ROLE mismatch denies',scope:'predicate only, not full root execution'});
 // Actual ROOT denial executes the production callback, not a mock predicate.
 q(source.match(/CREATE TABLE app_private\.qa_owned_deletions\([\s\S]*?\n\);/)[0]+source.match(/CREATE TABLE app_private\.qa_owned_deletion_fences\([\s\S]*?\n\);/)[0]+`CREATE TABLE app_private.qa_owned_sources(source_id uuid,run_id uuid,auth_projection jsonb);`+source.match(/CREATE FUNCTION app_private\.qa_owned_native_root\(\)[\s\S]*?\$\$;/)[0]+`CREATE TRIGGER qa_owned_auth_root BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION app_private.qa_owned_native_root();GRANT USAGE ON SCHEMA auth TO qa_gateway,qa_rogue;GRANT SELECT(id),DELETE ON auth.users TO qa_gateway,qa_rogue;`);
 const uid='00000000-0000-4000-8000-000000000001',op='00000000-0000-4000-8000-000000000002';
 q(`INSERT INTO auth.users VALUES('${uid}');INSERT INTO app_private.qa_owned_deletions(operation_id,run_id,source_id,target_user_id,canonical_key,generation,status,ownership_receipt_digest,protected_snapshot_digest) VALUES('${op}','${op}','${op}','${uid}','gateway-proof',1,'auth_delete_in_flight',repeat('a',64),repeat('b',64));INSERT INTO app_private.qa_owned_deletion_fences VALUES('${uid}','gateway-proof','${op}','${op}',1);`);pin('qa_gateway');
 deny('actual native ROOT rejects rogue session JWT before effects',`SET request.jwt.claims='{"role":"supabase_auth_admin"}';DELETE FROM auth.users WHERE id='${uid}';`,'42501','qa_rogue');
 deny('actual native ROOT rejects owner JWT before effects',`SET request.jwt.claims='{"role":"supabase_auth_admin"}';DELETE FROM auth.users WHERE id='${uid}';`,'42501');
 deny('actual native ROOT rejects SET ROLE gateway without SESSION_USER OID',`SET ROLE qa_gateway;DELETE FROM auth.users WHERE id='${uid}';`,'42501');
 assert.equal(q(`SELECT count(*) FROM auth.users WHERE id='${uid}';`),'1');
 q(`CREATE FUNCTION auth.qa_unreviewed_callback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD;END $$;CREATE TRIGGER qa_unreviewed_callback BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.qa_unreviewed_callback();`);
 deny('actual ROOT rejects unapproved callback catalog',`DELETE FROM auth.users WHERE id='${uid}';`,'55000','qa_gateway');q('DROP TRIGGER qa_unreviewed_callback ON auth.users;DROP FUNCTION auth.qa_unreviewed_callback();');assert.equal(q(`SELECT count(*) FROM auth.users WHERE id='${uid}';`),'1');
 report.checks.push({name:'real ROOT denials preserve Auth row; positive native cascade not rerun'});
 report.anchor=JSON.parse(q('SELECT to_jsonb(a) FROM app_private.qa_owned_native_anchor a;'));
 report.status='GREEN';
}catch(e){report.status=phase==='RED'?'RED':'FAILED';report.error=e.message;process.exitCode=1;console.error(e.message);}
finally{if(started){const r=cmd('pg_ctl',['-D',data,'-m','fast','-w','stop']);report.clusterStopped=r.status===0;if(r.status!==0)process.exitCode=1;}report.identity={database:'postgres',host:'127.0.0.1',port,dataDirectory:data};fs.writeFileSync(path.join(OUT,phase+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
