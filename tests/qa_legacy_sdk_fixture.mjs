// TEST ONLY. Isolated legacy SDK compatibility; never final Fence acceptance.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
export async function createLegacySdkFixture(options={}){
 const f=await createTransactionFeedbackFixture({...options,modulePath:path.resolve(import.meta.dirname,'qa_postgres_native_fixture.mjs')});assert.match(f.db.connection.database,/^qa_local_legacy_/);const{db,dir}=f;const adapter=fs.readFileSync(new URL('./qa_isolation_enforcement.mjs',import.meta.url),'utf8');const setup=adapter.slice(adapter.indexOf(' // Empty dependency relations:'),adapter.indexOf(' for(const [cohort,run]'));assert(setup.length>100);const catalog=process.env.QA_FROZEN_PREDECESSOR_CATALOG;assert(catalog&&fs.existsSync(catalog));const reader={...fs,readFileSync:(p,...a)=>fs.readFileSync(String(p)==='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/msajed-account-work/qa-live-catalog.json'?catalog:p,...a)};try{
 await new(Object.getPrototypeOf(async function(){}).constructor)('db','fs',setup)(db,reader);
 const names=['20261008010000_qa_isolation_prerequisites.sql','20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql'];for(const n of names)await db.exec(fs.readFileSync(path.join(dir,n),'utf8'));
 assert.equal((await db.query("SELECT to_regprocedure('app_private.qa_owned_fence_before_row()') IS NULL no_fence")).rows[0].no_fence,true);f.legacyCompatibilityOnly=true;return f;
 }catch(e){try{await db.exec('ROLLBACK');}catch{}await db.close();throw e;}
}
