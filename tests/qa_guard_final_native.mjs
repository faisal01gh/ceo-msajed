// TEST ONLY. Exact six frozen guard-probes under the official final composition.
// Disabled-canonical-fence counterexamples are always rolled back before acceptance.
import assert from 'node:assert/strict';
import {runGroup,quote,sha} from './qa_final_native_case_helpers.mjs';
const tables=['app_private.qa_core_provision_context','public.legacy_archive','public.migration_gate','public.migration_receipts','public.workspace_edits','public.workspace_versions'];
const names=tables.map(table=>'actualSourceCatalogRejectsDisabledCanonicalFence:'+table);
await runGroup({group:'GUARD_FINAL_NATIVE',names,run:async(f,h,check,report)=>{
 const {db}=f;await h.closed();const initial=await h.catalog(),initialRows=await h.snapshot();report.counterexamples=[];
 for(const table of tables)await check('actualSourceCatalogRejectsDisabledCanonicalFence:'+table,async()=>{
  await h.reset();const before=await h.catalog(),beforeRows=await h.snapshot();
  const attachments=(await db.query("SELECT to_jsonb(t) attachment FROM pg_trigger t WHERE tgrelid=$1::regclass AND tgfoid='app_private.qa_owned_fence_before_row()'::regprocedure AND NOT tgisinternal",[table])).rows;
  assert.equal(attachments.length,1,table+' real source fence attached');const g=attachments[0].attachment;
  assert.equal(g.tgenabled,'O');assert.equal(g.tgtype,31);assert.equal(g.tgdeferrable,false);assert.equal(g.tginitdeferred,false);assert.equal(g.tgqual,null);assert.equal(g.tgnargs,0);assert.deepEqual(g.tgattr,[]);
  await db.exec('BEGIN');let error;try{
   await db.exec(`ALTER TABLE ${table} DISABLE TRIGGER ${quote(g.tgname)}`);
   const disabled=(await db.query('SELECT tgenabled FROM pg_trigger WHERE oid=$1',[g.oid])).rows;assert.deepEqual(disabled,[{tgenabled:'D'}]);
   try{await db.query('SELECT app_private.qa_owned_fence_catalog_closed()');}catch(e){error=e;}
   assert.equal(error?.code,'55000',table+' must reject exact disabled canonical fence');
  }finally{await db.exec('ROLLBACK');}
  assert.deepEqual((await db.query('SELECT to_jsonb(t) attachment FROM pg_trigger t WHERE oid=$1',[g.oid])).rows,attachments,'exact attachment restored transactionally');
  assert.deepEqual(await h.catalog(),before);assert.deepEqual(await h.snapshot(),beforeRows);await h.closed();
  const receipt={relation:table,trigger:g.tgname,trigger_oid:g.oid,sqlstate:error.code,message:error.message,exact_attachment_restored:true,catalog_before_sha256:sha(JSON.stringify(before)),catalog_after_sha256:sha(JSON.stringify(await h.catalog()))};report.counterexamples.push(receipt);return receipt;
 });
 assert.deepEqual(await h.catalog(),initial);assert.deepEqual(await h.snapshot(),initialRows);await h.zero();
 report.classification='actual official-final SQL/native catalog disabled-canonical-fence counterexamples; not root producer/provider acceptance';
}});
