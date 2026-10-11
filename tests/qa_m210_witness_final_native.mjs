// TEST ONLY. Parent serial native entrypoint; NEVER run in offline/source-only repair.
// One owned fresh QA database and fresh manifest per case; no DATABASE/ROLE creation or schema reset.
// Parent creates/disposes the exact isolated database. Do not reuse a composed database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFinalComposedFixture} from './qa_final_composed_fixture.mjs';
import {harness,quote,sha,verifyManifest} from './qa_final_native_case_helpers.mjs';
export const caseNames=Object.freeze([
 'clean210',
 'body:transaction_revision_before','config:transaction_revision_before','acl:transaction_revision_before','owner:transaction_revision_before','trigger:transaction_revision_before',
 'body:transaction_child_revision_after','config:transaction_child_revision_after','acl:transaction_child_revision_after','owner:transaction_child_revision_after','trigger:transaction_child_revision_after',
 'fk','witness_missing','witness_config','witness_live_projection'
]);
const selected=process.env.QA_M210_WITNESS_CASE;
assert(caseNames.includes(selected),'select exactly one QA_M210_WITNESS_CASE from the source roster');
assert.equal(process.env.QA_WSL_HANDOFF,'AFTER_14_PARENT_SERIAL');
assert.match(process.env.QA_LOCAL_PG_DATABASE||'',/^qa_local_composed_[a-z0-9_]+$/);
assert(!Object.keys(process.env).some(k=>/^(SUPABASE|SERVICE_ROLE|PGPASSWORD)/i.test(k)),'no provider credentials');
const out=process.env.QA_DELETE_EVIDENCE;assert(out,'parent evidence directory required');
fs.mkdirSync(out,{recursive:true});
const reportPath=path.join(out,'M210_WITNESS_'+selected.replaceAll(':','_')+'.json');
assert(!fs.existsSync(reportPath),'fresh case report required');
assert(process.env.QA_LOCAL_MANIFEST&&!fs.existsSync(process.env.QA_LOCAL_MANIFEST),'fresh parent-owned manifest required');
const report={case:selected,status:'RUNNING',native:'PARENT_EXECUTION_ONLY',source_sql_executed:false,
 provider_calls:0,external_network_calls:0,production_actions:0,activation_ready:false,
 database:process.env.QA_LOCAL_PG_DATABASE,manifest_path:process.env.QA_LOCAL_MANIFEST};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));save();
const expectedStop=Object.assign(Error('expected atomic M210 predecessor rejection verified'),{code:'QA_M210_EXPECTED_REJECTION_VERIFIED'});
const witness=async db=>({
 metadata:(await db.query("SELECT oid,pg_get_functiondef(oid) definition,proowner,proacl::text,proconfig,provolatile,prosecdef,prosrc FROM pg_proc WHERE oid=to_regprocedure('app_private.qa_delete_revision_abi_expected()')")).rows,
 value:(await db.query("SELECT CASE WHEN to_regprocedure('app_private.qa_delete_revision_abi_expected()') IS NULL THEN NULL ELSE (SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('app_private.qa_delete_revision_abi_expected()')) END source")).rows
});
// Exact retained195 expression, read from approved source rather than an invented catalog projection.
const projection=dir=>{
 const original=fs.readFileSync(path.join(dir,'20261008019500_qa_delete_completion.sql'),'utf8');
 const freeze=original.slice(original.indexOf('DO $freeze$'));
 const matches=[...freeze.matchAll(/ SELECT jsonb_build_object\('functions',[^\r\n]+ INTO expected;/g)];
 assert.equal(matches.length,1);return matches[0][0].replace(/ INTO expected;$/,'');
};
let f,before,cleanWitness,cleanCatalog,cleanRows;
const beforeGuards=async fixture=>{
 const {db,dir}=fixture;const h=harness(fixture);
 report.target=db.connection;report.m210_sha256=sha(fs.readFileSync(path.join(dir,'20261008021000_qa_owned_fence_composition.sql')));
 cleanWitness=await witness(db);cleanCatalog=await h.catalog();cleanRows=await h.snapshot();
 assert.equal(cleanWitness.metadata.length,1,'real original195 witness must exist before mutation');
 assert.equal(await fixture.scalar('SELECT '+projection(dir).trim().replace(/^SELECT /,'')+' IS NOT DISTINCT FROM app_private.qa_delete_revision_abi_expected()'),true,'native baseline equals retained195 witness');
 if(selected==='clean210')return;
 const [kind,callback]=selected.split(':');
 if(callback){
  assert(['transaction_revision_before','transaction_child_revision_after'].includes(callback));
  const signature='app_private.'+callback+'()';
  const rows=(await db.query('SELECT oid,prosrc,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows;
  assert.equal(rows.length,1);const p=rows[0];
  if(kind==='body'){
   assert(p.definition.includes(p.prosrc));
   await db.exec(p.definition.replace(p.prosrc,p.prosrc+'\n-- trusted native TEST predecessor body drift\n'));
  }else if(kind==='config')await db.exec('ALTER FUNCTION '+signature+' SET search_path=public');
  else if(kind==='acl')await db.exec('GRANT EXECUTE ON FUNCTION '+signature+' TO authenticated');
  else if(kind==='owner')await db.exec('ALTER FUNCTION '+signature+' OWNER TO authenticated');
  else if(kind==='trigger'){
   const triggers=(await db.query('SELECT tgrelid::regclass::text relation,tgname FROM pg_trigger WHERE tgfoid=$1::regprocedure AND NOT tgisinternal AND tgenabled=$2 ORDER BY oid',[signature,'O'])).rows;
   assert(triggers.length>0,'existing canonical revision trigger required');
   const t=triggers[0];report.mutated_trigger=t;
   await db.exec('ALTER TABLE '+t.relation+' DISABLE TRIGGER '+quote(t.tgname));
  }else throw Error('unknown mutation kind');
 }else if(kind==='fk'){
  const fk=(await db.query("SELECT conrelid::regclass::text relation,conname,condeferrable FROM pg_constraint WHERE conrelid='public.transaction_actions'::regclass AND contype='f' AND conname='transaction_actions_assignment_id_fkey'")).rows;
  assert.equal(fk.length,1);report.mutated_fk=fk[0];
  await db.exec('ALTER TABLE '+fk[0].relation+' ALTER CONSTRAINT '+quote(fk[0].conname)+(fk[0].condeferrable?' NOT DEFERRABLE':' DEFERRABLE INITIALLY DEFERRED'));
 }else if(kind==='witness_missing')await db.exec('DROP FUNCTION app_private.qa_delete_revision_abi_expected()');
 else if(kind==='witness_config')await db.exec('ALTER FUNCTION app_private.qa_delete_revision_abi_expected() SET search_path=public');
 else if(kind==='witness_live_projection'){
  // Same ABI/owner/private ACL but a live native refresher: must not be accepted as a literal witness.
  await db.exec("CREATE OR REPLACE FUNCTION app_private.qa_delete_revision_abi_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $test_live_witness$"+projection(dir)+'$test_live_witness$;');
 }else throw Error('unknown mutation');
 before={catalog:await h.catalog(),data:await h.snapshot(),witness:await witness(db)};
 assert.notDeepEqual(before.catalog,cleanCatalog,'chosen native mutation must actually alter its intended catalog');
 assert.deepEqual(before.data,cleanRows,'trusted TEST drift must not change fixture data');
 // Exercise the actual unchanged entrypoint bytes at the exact after205/before210 hook.
 // Manual negative apply is necessary to read back this same target before fixture cleanup;
 // the private sentinel prevents the fixture from applying210 a second time.
 let rejection;
 report.source_sql_executed=true;
 try{
  await assert.rejects(db.exec(fs.readFileSync(path.join(dir,'20261008021000_qa_owned_fence_composition.sql'),'utf8')),
   e=>{rejection=e;return e.code==='55000'&&e.message.startsWith('qa210 retained195 revision');});
 }finally{await db.exec('ROLLBACK');}
 assert.deepEqual(await h.catalog(),before.catalog);
 assert.deepEqual(await h.snapshot(),before.data);
 assert.deepEqual(await witness(db),before.witness);
 report.rejection={code:rejection.code,message:rejection.message,where:rejection.where};
 report.unchanged_catalog=true;report.unchanged_data=true;report.unchanged_existing_witness=true;
 report.catalog_before_sha256=sha(JSON.stringify(before.catalog));
 report.catalog_after_sha256=sha(JSON.stringify(await h.catalog()));
 report.data_before_sha256=sha(JSON.stringify(before.data));
 report.data_after_sha256=sha(JSON.stringify(await h.snapshot()));
 report.rejected_before_install_and_witness_replacement=true;save();
 throw expectedStop;
};
try{
 try{f=await createFinalComposedFixture({beforeGuards});}
 catch(e){if(e!==expectedStop)throw e;assert.notEqual(selected,'clean210');}
 if(selected==='clean210'){
  assert(f,'clean original fixture must fully compose');await verifyManifest(f);
  report.source_sql_executed=true;
  const h=harness(f);await h.closed();await h.zero();
  assert.deepEqual(await witness(f.db),cleanWitness,'no revision witness change was authorized or necessary');
  const after=await h.snapshot();for(const [table,rows] of Object.entries(cleanRows))assert.deepEqual(after[table],rows,'existing fixture data '+table);
  report.clean210_composed=true;report.unchanged_existing_witness=true;report.unchanged_existing_data=true;
  report.manifest=f.manifest;
 }else{
  const manifest=JSON.parse(fs.readFileSync(process.env.QA_LOCAL_MANIFEST,'utf8'));
  assert.equal(manifest.status,'SETUP_FAILED');assert.equal(manifest.error.code,expectedStop.code);
  assert(!manifest.entries.some(e=>e.name==='20261008021000_qa_owned_fence_composition.sql'),'negative install was not recorded as applied');
  report.manifest=manifest;report.expected_setup_stop=true;
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure={message:e.message,code:e.code,where:e.where,stack:e.stack};process.exitCode=1;}
finally{
 if(f){try{await f.db.exec('ROLLBACK;RESET ROLE');await f.db.close();}catch(e){report.status='FAIL';report.cleanup_failure={message:e.message,code:e.code};process.exitCode=1;}}
 save();console.log(JSON.stringify({case:selected,status:report.status,report:reportPath,rejection:report.rejection||null,failure:report.failure||null}));
}
