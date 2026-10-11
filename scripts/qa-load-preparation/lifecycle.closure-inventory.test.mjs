// Bounded current-source regressions. PostgreSQL effects always roll back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {compileOwnedPopulation,OWNED_ROLES} from './owned-lifecycle.mjs';
const OUT='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/final-owned-closure';
const original=fs.readFileSync(new URL('./lifecycle.native-sql.mjs',import.meta.url),'utf8');
const guard=/const guard=`([\s\S]*?)`;/.exec(original)[1];
const owned=()=>fs.readFileSync(new URL('./owned-control.sql',import.meta.url),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const setup=`ALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb NOT NULL DEFAULT '{}',ADD COLUMN created_at timestamptz,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN banned_until timestamptz,ADD COLUMN deleted_at timestamptz;
CREATE TRIGGER qa_owned_fixture_roles BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();
CREATE TRIGGER qa_owned_fixture_memberships BEFORE INSERT OR UPDATE OR DELETE ON public.user_memberships FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();`;
function pg(name,body){
 const script='BEGIN;\n'+guard+'\n'+setup+'\n'+owned()+'\n'+body+'\nROLLBACK;';
 const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','51771','-U','postgres','-d','qa_isolation_step3_integrated_20261009','-v','ON_ERROR_STOP=1','-A','-t'],{input:script,encoding:'utf8',timeout:120000,maxBuffer:1048576});
 fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(OUT+'/'+name+'.json',JSON.stringify({exitCode:r.status,stdout:r.stdout,stderr:r.stderr},null,2));assert.equal(r.status,0,r.stderr);
}
test('unknown foreign-schema non-FK catalog denies before mutation',()=>pg('unknown-nonfk',`
CREATE SCHEMA unowned_probe;CREATE TABLE unowned_probe.refs(canonical_key text);
DO $p$ BEGIN BEGIN PERFORM app_private.qa_owned_catalog_closed(); RAISE EXCEPTION 'MISSING_GLOBAL_CATALOG_DENIAL'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL;END;END $p$;`));

test('SQL denies omitted existing nonowned Auth UID before run preparation',()=>{
 let proof=/const proof=`([\s\S]*?)`;/.exec(original)[1];
 proof=proof.replace("'protectedUIDs',protected,", "'protectedUIDs',(protected-0)||jsonb_build_array('00000000-0000-4000-8000-999999999999'),");
 proof=proof.slice(0,proof.indexOf(" ret:=public.qa_owned_preflight_internal"))+`
 BEGIN PERFORM public.qa_owned_preflight_internal(plan,run);RAISE EXCEPTION 'MISSING_EXACT_PROTECTED_DENIAL';EXCEPTION WHEN SQLSTATE '42501' THEN NULL;END;
 PERFORM set_config('role','none',true);
 IF EXISTS(SELECT 1 FROM app_private.qa_owned_run_receipts) THEN RAISE EXCEPTION 'mutated';END IF;
END $proof$;`;
 pg('protected-omission',proof);
});


test('actual PG 50+7 terminal mechanics retain complete fresh partially linked protected mapping',()=>pg('terminal-mechanics',/const proof=`([\s\S]*?)`;/.exec(original)[1]));
test('closure itself rejects other-schema composite incoming FK before deletion',()=>pg('foreign-composite',`
CREATE SCHEMA unowned_probe;
CREATE TABLE unowned_probe.refs(user_id uuid,role_code text,FOREIGN KEY(user_id,role_code) REFERENCES public.user_roles(user_id,role_code));
INSERT INTO app_private.qa_owned_approved_plans VALUES('00000000-0000-4000-8000-000000009998','{}','TEST-NOT-AUTHORITY',repeat('a',64),repeat('b',64),clock_timestamp()+interval '1 hour');
DO $p$ BEGIN BEGIN PERFORM app_private.qa_owned_closure('00000000-0000-4000-8000-000000009998','00000000-0000-4000-8000-000000009997');RAISE EXCEPTION 'MISSING_GLOBAL_CLOSURE_DENIAL';EXCEPTION WHEN SQLSTATE '55000' THEN NULL;END;END $p$;`));


test('unsupported external Auth DELETE window denies before CREATE dispatch',()=>{
 let proof=/const proof=`([\s\S]*?)`;/.exec(original)[1];
 const mark="  PERFORM set_config('role','none',true);\n  INSERT INTO auth.users";
 const gate=`  IF i=1 THEN BEGIN PERFORM public.qa_owned_create_preflight_internal(run,src,op,receipt,j->>'email');RAISE EXCEPTION 'MISSING_PROVIDER_WINDOW_DENIAL';EXCEPTION WHEN SQLSTATE '55000' THEN NULL;END;END IF;\n`;
 proof=proof.replace(mark,gate+mark);pg('provider-window',proof);
});


for(const [name,ddl] of [
 ['storage-foreign',`CREATE SCHEMA storage;CREATE TABLE storage.objects(owner uuid REFERENCES auth.users(id));INSERT INTO storage.objects VALUES(uid);`],
 ['other-schema-composite',`CREATE SCHEMA external_refs;CREATE TABLE external_refs.refs(user_id uuid,role_code text,FOREIGN KEY(user_id,role_code) REFERENCES public.user_roles(user_id,role_code));INSERT INTO external_refs.refs VALUES(uid,j->>'role');`]
])test(name+' reference denies disposal with zero Auth DELETE attempts and unchanged rows',()=>{
 let proof=/const proof=`([\s\S]*?)`;/.exec(original)[1];
 const mark="  PERFORM set_config('role','service_role',true);ret:=public.qa_owned_dispose_internal(run,src);";
 const injected=`  IF i=1 THEN
   ${ddl}
   foreign_before:=jsonb_build_object('protected',app_private.qa_owned_protected_snapshot(),'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY receipt_id) FROM app_private.qa_owned_resources r),'source',(SELECT jsonb_agg(to_jsonb(s) ORDER BY source_id) FROM app_private.qa_owned_sources s));
   PERFORM set_config('role','service_role',true);
   BEGIN PERFORM public.qa_owned_dispose_internal(run,src);RAISE EXCEPTION 'MISSING_FOREIGN_DISPOSAL_DENIAL';EXCEPTION WHEN SQLSTATE '55000' THEN NULL;END;
   PERFORM set_config('role','none',true);
   foreign_after:=jsonb_build_object('protected',app_private.qa_owned_protected_snapshot(),'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY receipt_id) FROM app_private.qa_owned_resources r),'source',(SELECT jsonb_agg(to_jsonb(s) ORDER BY source_id) FROM app_private.qa_owned_sources s));
   IF foreign_before IS DISTINCT FROM foreign_after THEN RAISE EXCEPTION 'denied cleanup changed exact snapshot';END IF;
   IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=uid) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid) OR (SELECT count(*) FROM app_private.qa_owned_resources WHERE run_id=run AND source_id=src AND disposed_at IS NULL)<>7 OR EXISTS(SELECT 1 FROM app_private.qa_owned_frames) THEN RAISE EXCEPTION 'foreign-denied disposal changed data';END IF;
   ${name==='storage-foreign'?'DROP TABLE storage.objects;DROP SCHEMA storage;':'DROP TABLE external_refs.refs;DROP SCHEMA external_refs;'}
  END IF;\n`;
 proof=proof.replace('i integer;', 'i integer;foreign_before jsonb;foreign_after jsonb;').replace(mark,injected+mark);pg(name,proof);
});
test('extra existing Auth UID and unlinked current registry rows require exact fresh plan',()=>{
 let proof=/const proof=`([\s\S]*?)`;/.exec(original)[1];
 proof=proof.replace('BEGIN\n SELECT jsonb_agg',`BEGIN
 INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-8000-000000088888','protected-extra@fixture.invalid');
 SELECT jsonb_agg`);
 pg('actual-extra-inventory',proof);
});
for(const field of ['protectedUIDs','protectedCanonicalKeys'])test('projection denies duplicate '+field,()=>{const p=population();p[field].push(p[field][0]);assert.throws(()=>compileOwnedPopulation(p));});

const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
function population(){const runId=id(700),rolePlanDigest='a'.repeat(64);return {runId,rolePlanDigest,protectedUIDs:Array.from({length:18},(_,i)=>id(i+1)),protectedCanonicalKeys:Array.from({length:66},(_,i)=>'current-canonical-'+i),resources:Array.from({length:57},(_,i)=>({runId,kind:i<50?'owned-load-qa':'owned-role-e2e',sourceId:id(10000+i),canonicalKey:'synthetic-owned-'+i,loginAlias:'synthetic-alias-'+i,email:'synthetic-'+i+'@fixture.invalid',role:i<50?'employee':OWNED_ROLES[i-50],rolePlanDigest,memberships:[{unit_id:id(701),membership_role:'member',is_primary:true}]}))};}
test('partial existing Auth inventory is accepted without inventing unlinked staff UIDs',()=>{const p=population();const r=compileOwnedPopulation(p);assert.deepEqual(r.counts,{load:50,roleE2E:7,total:57});assert.deepEqual(r.protectedUIDs,p.protectedUIDs);assert.deepEqual(r.protectedCanonicalKeys,p.protectedCanonicalKeys);});

