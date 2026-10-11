// TEST ONLY. Preserves step1-composed (3) + step1-four (4) behavioral cases.
// One official final factory; no old migrations, graph-function or manual guard replay.
import assert from 'node:assert/strict';
import {runGroup,seedManagerOwnership,sha} from './qa_final_native_case_helpers.mjs';
const names=[
 'legitimate owned populated graph single DELETE commits',
 'exact deleted graph and zero committed private context',
 'all unrelated rows across full 40-table snapshot unchanged',
 'deferred completion occurs only after all exact dependent rows are absent',
 'non-targeted owned QA and full protected forty-table state remain unchanged',
 'ordinary unowned target is rejected atomically without protected-state mutation',
 'assignment SET NULL survivor and its action versions and notes are preserved'
];
await runGroup({group:'STEP1_FINAL_NATIVE',names,beforeGuards:async f=>{
 const {db,id,actors}=f,root=id(9201),assign=id(9202),action=id(9203),control=id(9411);
 await seedManagerOwnership(f,id(9301),[root,control]);
 // Preserve the old synthetic graph and native FK actions before official210.
 for(const [r,number]of [[root,'STEP1-OWNED'],[control,'TIMING-UNTOUCHED']])await db.query("INSERT INTO public.transactions(id,number,title,created_by) VALUES($1,$2,'synthetic',$3)",[r,number,actors.manager]);
 for(const [a,r,act,v,n]of [[assign,root,action,id(9205),id(9206)],[id(9422),control,id(9423),id(9425),id(9426)]]){
  await db.query("INSERT INTO public.transaction_assignments(id,transaction_id,assignment_type,created_by) VALUES($1,$2,'direct',$3)",[a,r,actors.manager]);
  if(r===root){await db.query('INSERT INTO public.transaction_assignment_users VALUES($1,$2)',[a,actors.manager]);await db.query("INSERT INTO public.transaction_assignment_targets(id,assignment_id,user_id,login_name,display_name) VALUES($1,$2,$3,'fixture_manager','synthetic')",[id(9204),a,actors.manager]);}
  await db.query("INSERT INTO public.transaction_actions(id,transaction_id,assignment_id,actor_id,actor_name,action_text) VALUES($1,$2,$3,$4,'synthetic','synthetic')",[act,r,a,actors.manager]);
  await db.query("INSERT INTO public.transaction_action_versions(id,action_id,version_no,actor_id,body) VALUES($1,$2,1,$3,'synthetic')",[v,act,actors.manager]);
  await db.query("INSERT INTO public.transaction_action_notes(id,transaction_id,action_id,actor_name,note) VALUES($1,$2,$3,'synthetic','synthetic')",[n,r,act]);
 }
 // Test transport only, before final source catalog freeze: least CRUD on exact
 // producer relations, not GRANT ALL, private tables, or sequence SELECT.
 await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON public.transactions,public.transaction_assignments,public.transaction_assignment_users,public.transaction_assignment_targets,public.transaction_actions,public.transaction_action_versions,public.transaction_action_notes TO service_role;');
},run:async(f,h,check,report)=>{
 const {db,scalar,id}=f,root=id(9201),assign=id(9202),action=id(9203),control=id(9411);
 const targets=[['transactions','id',root],['transaction_assignments','id',assign],['transaction_assignment_users','assignment_id',assign],['transaction_assignment_targets','assignment_id',assign],['transaction_actions','id',action],['transaction_action_versions','action_id',action],['transaction_action_notes','action_id',action]];
 const inventory=async()=>{await h.reset();const o={};for(const [t,k,v]of targets)o[t]=await scalar(`SELECT count(*)::int FROM public.${t} WHERE ${k}=$1`,[v]);return o;};
 await h.closed();const before=await h.snapshot(),beforeCatalog=await h.catalog();report.receipts={};const receipts=report.receipts;
 receipts.inventory_before=await inventory();assert(Object.values(receipts.inventory_before).every(n=>n===1));receipts.before_digest=sha(JSON.stringify(before));
 const removed=new Set([root,assign,action,id(9204),id(9205),id(9206)]);
 const assertProtected=async()=>{const after=await h.snapshot();assert.equal(Object.keys(before).length,await scalar("SELECT count(*)::int FROM pg_tables WHERE schemaname IN ('public','app_private','auth')"));assert.deepEqual(Object.keys(after),Object.keys(before));for(const t of Object.keys(before))assert.deepEqual(after[t],before[t].filter(x=>!removed.has(x.row.id)&&!removed.has(x.row.assignment_id)&&!removed.has(x.row.action_id)),t);assert.deepEqual(await h.catalog(),beforeCatalog);return after;};
 await check(names[0],async()=>{
  await h.actor();await db.exec('BEGIN');assert.deepEqual((await db.query('DELETE FROM public.transactions WHERE id=$1 RETURNING id',[root])).rows,[{id:root}]);
  receipts.after_cascade_before_commit=await inventory();assert(Object.values(receipts.after_cascade_before_commit).every(n=>n===0));
  receipts.private_context_before_commit=await scalar('SELECT count(*)::int FROM app_private.qa_sql_operation_context');assert.equal(receipts.private_context_before_commit,7);
  receipts.completion_attachment=(await db.query("SELECT tgdeferrable,tginitdeferred,tgenabled FROM pg_trigger WHERE tgrelid='app_private.qa_sql_operation_context'::regclass AND tgfoid='app_private.qa_delete_complete_context()'::regprocedure AND tgname='qa_delete_context_completion'")).rows;
  assert.deepEqual(receipts.completion_attachment,[{tgdeferrable:true,tginitdeferred:true,tgenabled:'O'}]);await h.actor();await db.exec('COMMIT');
  receipts.after_commit=await inventory();receipts.private_context_after_commit=await scalar('SELECT count(*)::int FROM app_private.qa_sql_operation_context');assert.equal(receipts.private_context_after_commit,0);
  return {single_delete:true,native_commit:true,positive_under_final_native_catalog:true};
 });
 await check(names[1],async()=>{assert(Object.values(await inventory()).every(n=>n===0));await h.zero();});
 await check(names[2],async()=>{const after=await assertProtected();receipts.after_digest=sha(JSON.stringify(after));return {full_table_count:Object.keys(before).length,baseline_taken_after_final_setup:true};});
 await check(names[3],async()=>{assert(Object.values(receipts.after_cascade_before_commit).every(n=>n===0));assert.equal(receipts.private_context_before_commit,7);assert.equal(receipts.private_context_after_commit,0);assert(Object.values(receipts.after_commit).every(n=>n===0));assert.deepEqual(receipts.completion_attachment,[{tgdeferrable:true,tginitdeferred:true,tgenabled:'O'}]);return {observed_during_actual_delete_transaction:true};});
 await check(names[4],async()=>{await assertProtected();assert.equal(await scalar('SELECT count(*)::int FROM public.transactions WHERE id=$1',[control]),1);});
 await check(names[5],async()=>{await h.reset();await db.exec('BEGIN');const denial=await h.deny(async()=>{await h.actor();await db.query('DELETE FROM public.transactions WHERE id=$1',[f.tx]);});await db.exec('ROLLBACK');assert.equal(await scalar('SELECT count(*)::int FROM public.transactions WHERE id=$1',[f.tx]),1);return denial;});
 await check(names[6],async()=>{
  const state=await h.snapshot();await h.actor();await db.exec('BEGIN');assert.deepEqual((await db.query('DELETE FROM public.transaction_assignments WHERE id=$1 RETURNING id',[id(9422)])).rows,[{id:id(9422)}]);await h.actor();await db.exec('COMMIT');await h.reset();
  assert.equal(await scalar('SELECT count(*)::int FROM public.transaction_actions WHERE id=$1 AND assignment_id IS NULL',[id(9423)]),1);
  for(const [t,n]of [['transaction_action_versions',9425],['transaction_action_notes',9426]])assert.equal(await scalar(`SELECT count(*)::int FROM public.${t} WHERE id=$1`,[id(n)]),1);
  const after=await h.snapshot();for(const [t,rows]of Object.entries(state)){
   if(t==='public.transaction_assignments')assert.deepEqual(after[t],rows.filter(x=>x.row.id!==id(9422)));
   else if(t==='public.transaction_actions')assert.deepEqual(after[t],rows.map(x=>x.row.id===id(9423)?{row:{...x.row,assignment_id:null}}:x));
   else if(t==='public.transactions'){const normalize=r=>r.map(x=>{const row={...x.row};if(row.id===control)for(const k of ['activity_revision','last_activity_at','updated_at'])delete row[k];return {row};});assert.deepEqual(normalize(after[t]),normalize(rows));}
   else assert.deepEqual(after[t],rows,t);
  }
  await h.zero();assert.deepEqual(await h.catalog(),beforeCatalog);return {native_setnull:true,versions_and_notes_preserved:true,positive_under_final_native_catalog:true};
 });
}});
