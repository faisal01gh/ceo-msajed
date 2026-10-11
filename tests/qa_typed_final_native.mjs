// TEST ONLY. Official final-native installation, preserving typed-composed's 19 behaviors.
// Retire predecessor RED/body-diff/reapply:190/205 are already installed once.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runGroup,seedManagerOwnership,verifyManifest,sha,quote,migrationNames} from './qa_final_native_case_helpers.mjs';
const names=[
 'activation_barrier_retained',
 'installed190_exact_source_definition_ABI',
 'installed_manifest_once_and_readonly_stability','final_dispatcher_closed_catalog_source_bound',
 'actual_Edge_history_created','prose_not_identity','unknown_extra_actionable','unknown_event',
 'foreign_actor_login','foreign_target_alias','exact_login_targets','same_QA_typed_producer_positive',
 'foreign_QA_target_alias','foreign_QA_root','foreign_QA_canonical_key','canonical_key_profile_audit_positive',
 'dynamic_supporting_unresolved','missing_native_SID','normal_notifications_full_PATCH',
 'forced_normal_service_audit_denied','stale_normal_service_audit_denied','readiness_not_weakened'
];
// Preserve the barrier plus18 producer/readiness checks (19 retained checks).
// Replace only the three predecessor RED/body-diff/reapply experiments.
const retired=[
 {name:'baseline_known_created_audit',replacement:'installed190_exact_source_definition_ABI',reason:'final schema already contains190; an expected predecessor RED is invalid'},
 {name:'one_body_only_ABI_OID_ACL_owner_defaults_columns_security_unchanged',replacement:'final_dispatcher_closed_catalog_source_bound',reason:'no predecessor installation/body-diff experiment under final composition'},
 {name:'idempotent_non_activating',replacement:'installed_manifest_once_and_readonly_stability',reason:'do not reapply190 or205 to a final one-shot manifest'}
];
await runGroup({group:'TYPED_FINAL_NATIVE',names,retired,beforeGuards:async f=>{
 const {db,id,actors}=f,qaTx=id(70002);
 // Preserve the original typed fixture's explicit profile-login alias prerequisite.
 // Registry login_username stays fixture_* and remains the manifest identity.
 await db.exec('UPDATE public.account_migration_users a SET preferred_login=p.login_name FROM public.profiles p WHERE p.id=a.migrated_user_id');
 await seedManagerOwnership(f,id(70001),[qaTx]);
 await db.query("INSERT INTO public.transactions(id,number,title,created_by,responsible_user_id,responsible_login_name,responsible_name,responsible_unit_id,current_level) VALUES($1,'QA-TYPED','fixture',$2,$2,'manager','display',$3,'manager')",[qaTx,actors.manager,f.unit.dept]);
 // Minimal direct SQL transport privileges from the original synthetic fixture,
 // before official210 freezes catalog metadata. No private/canonical-control ACL,
 // TRUNCATE/REFERENCES/TRIGGER grants, or sequence SELECT are introduced.
 await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON public.transactions,public.audit_log,public.transaction_history,public.notifications TO service_role;GRANT USAGE ON SEQUENCE public.audit_log_id_seq,public.transaction_history_id_seq TO service_role;');
},run:async(f,h,check,report)=>{
 const {db,scalar,id,actors,dir,tx}=f,qaTx=id(70002);const read=n=>fs.readFileSync(path.join(dir,n),'utf8');
 const beforeCatalog=await h.catalog(),beforeSourceChecks=await h.snapshot();
 await check('activation_barrier_retained',async()=>{await verifyManifest(f);const entry=f.manifest.entries.find(x=>x.name===migrationNames[6]&&x.kind==='full');assert.equal(entry.status,'blocked_by_activation_guard');return {full200:'blocked_by_activation_guard',barrier_sha256:entry.barrier_sha256,immutable_source_sha256:entry.source_sha256,no_replay:true};});
 await check('installed190_exact_source_definition_ABI',async()=>{
  const migration=read(migrationNames[4]);const source=/AS \$\$([\s\S]*?)\$\$;/.exec(migration)?.[1];assert(source,'exact190 function body missing');
  const rows=(await db.query("SELECT p.oid::text,p.prosrc,pg_get_functiondef(p.oid) definition,pg_get_function_identity_arguments(p.oid) identity,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,p.proowner='postgres'::regrole owner_ok,p.prosecdef,p.provolatile,to_jsonb(p.proconfig) proconfig,p.proisstrict,p.proparallel,p.prokind,p.proleakproof,p.procost::integer procost,p.prorows::integer prorows,p.prosupport=0 support_ok,l.lanname language,p.pronargs,p.pronargdefaults,to_jsonb(p.proargnames) proargnames,to_jsonb(p.proargmodes) argmodes,to_jsonb(p.proallargtypes) allargtypes,p.proargtypes=ARRAY['oid'::regtype::oid,'jsonb'::regtype::oid,'oid[]'::regtype::oid]::oidvector types_ok,NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor<>'postgres'::regrole OR a.grantee<>'postgres'::regrole OR a.privilege_type<>'EXECUTE') private_acl_ok FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='app_private.qa_row_references(oid,jsonb,oid[])'::regprocedure")).rows;
  assert.equal(rows.length,1);const r=rows[0];assert.equal(r.prosrc.replaceAll('\r\n','\n'),source.replaceAll('\r\n','\n'));
  assert.deepEqual(Object.fromEntries(Object.entries(r).filter(([k])=>!['oid','prosrc','definition'].includes(k))),{identity:'p_table oid, p_row jsonb, p_seen oid[]',arguments:"p_table oid, p_row jsonb, p_seen oid[] DEFAULT '{}'::oid[]",result:'jsonb',owner_ok:true,prosecdef:true,provolatile:'v',proconfig:['search_path=""'],proisstrict:false,proparallel:'u',prokind:'f',proleakproof:false,procost:100,prorows:0,support_ok:true,language:'plpgsql',pronargs:3,pronargdefaults:1,proargnames:['p_table','p_row','p_seen'],argmodes:null,allargtypes:null,types_ok:true,private_acl_ok:true});
  report.installed190={source_sha256:sha(migration),native_oid:r.oid,definition:r.definition,source_body_sha256:sha(source)};return {source_exact:true,ABI_owner_ACL_defaults_exact:true,no_DDL_replay:true};
 });
 await check('installed_manifest_once_and_readonly_stability',async()=>{await verifyManifest(f);assert.equal(f.manifest.entries.filter(x=>x.name===migrationNames[4]).length,1);assert.equal(f.manifest.entries.filter(x=>x.name===migrationNames[7]).length,1);assert.deepEqual(await h.snapshot(),beforeSourceChecks);assert.deepEqual(await h.catalog(),beforeCatalog);return {installed190_count:1,installed205_count:1,source_assertions_readonly:true};});
 await check('final_dispatcher_closed_catalog_source_bound',async()=>{
  await h.closed();const body=await scalar("SELECT prosrc FROM pg_proc WHERE oid='app_private.qa_reference_guard_before_row()'::regprocedure");
  for(const callback of ['qa_owned_fence_check','qa_owned_native_consume','qa_pw_consume','qa_owned_consume','qa_core_provision_row_allowed','qa_verified_write_actor','qa_row_references','qa_reference_validate'])assert(body.includes('app_private.'+callback),callback);
  for(const t of ['audit_log','transaction_history','notifications','transactions']){
   const guards=(await db.query("SELECT tgtype,tgenabled,tgdeferrable,tginitdeferred,tgqual IS NULL unfiltered,tgnargs,tgattr=''::int2vector no_columns,tgisinternal FROM pg_trigger WHERE tgrelid=$1::regclass AND tgfoid='app_private.qa_reference_guard_before_row()'::regprocedure",['public.'+t])).rows;
   assert.deepEqual(guards,[{tgtype:31,tgenabled:'O',tgdeferrable:false,tginitdeferred:false,unfiltered:true,tgnargs:0,no_columns:true,tgisinternal:false}]);
  }
  assert.deepEqual((await db.query("SELECT has_sequence_privilege('service_role','public.migration_receipts_id_seq','USAGE') can_use,has_sequence_privilege('service_role','public.migration_receipts_id_seq','SELECT') can_select")).rows,[{can_use:true,can_select:false}]);
  assert.deepEqual(await h.catalog(),beforeCatalog);return {positive_calls_require_final_native_catalog:true,canonical_receipt_sequence_usage_only:true};
 });
 const edge=fs.readFileSync(path.join(dir,'../functions/transactions-api/index.ts'),'utf8');
 const start=edge.indexOf('async function history('),end=edge.indexOf('async function txRow(',start);assert(start>=0&&end>start);
 const historySource=edge.slice(start,end),signature='txId:string,event:string,who:Who,detail:string,meta:any={}';assert(historySource.includes(signature));
 const historyBody=historySource.replace(signature,'txId,event,who,detail,meta={}');
 report.history_source={path:'supabase/functions/transactions-api/index.ts',file_sha256:sha(edge),extracted_sha256:sha(historySource),parameter_types_erased_only:true,transport:'real native SQL insert results; no network or fabricated API output'};
 const inserts=[];
 const history=new Function('db',historyBody+';return history;')({from:table=>({insert:async row=>{try{const result=await h.insert(table,row);assert.equal(result.rows.length,1);inserts.push({table,row:result.rows[0]});return {...result,error:null};}catch(error){return {error};}}})});
 const who={user_id:actors.employee,login_name:'employee',display_name:'employee display',role:'employee'};
 const positiveHistory=async(name,root,event,actorWho,meta={},detail='text')=>check(name,async()=>{const offset=inserts.length;await h.actor(actorWho.user_id);await history(root,event,actorWho,detail,meta);await h.reset();const written=inserts.slice(offset);assert.deepEqual(written.map(x=>x.table),['transaction_history','audit_log']);for(const {table,row}of written){const actual=(await db.query(`SELECT to_jsonb(t) row FROM public.${quote(table)} t WHERE id=$1`,[row.id])).rows;assert.deepEqual(actual,[{row}]);assert.equal(row.event_type,event);assert.equal(table==='audit_log'?row.entity_id:row.transaction_id,root);assert.equal(row.actor_id,actorWho.user_id);}await h.zero();await h.closed();return {actual_source_helper:true,native_insert_count:written.length,positive_under_final_native_catalog:true};});
 const negative=async(name,fn)=>check(name,()=>h.deny(fn));
 await db.exec('BEGIN');
 await positiveHistory('actual_Edge_history_created',tx,'created',who,{},'prose with unrelated UUID '+actors.manager);
 await positiveHistory('prose_not_identity',tx,'subject_changed',who,{old_subject:actors.manager,new_subject:'text'});
 await negative('unknown_extra_actionable',async()=>{await h.actor(actors.employee);await history(tx,'created',who,'text',{target_user_id:actors.manager});});
 await negative('unknown_event',async()=>{await h.actor(actors.employee);await history(tx,'invented_event',who,'text');});
 await negative('foreign_actor_login',async()=>{await h.actor(actors.employee);await h.insert('audit_log',{actor_id:actors.employee,event_type:'created',entity_type:'transaction',entity_id:tx,meta:{actor_login:'manager',actor_name:'text',actor_role:'employee'}});});
 await negative('foreign_target_alias',async()=>{await h.actor(actors.employee);await history(tx,'directive_employee',who,'text',{targets:['missing_alias'],unit:'display'});});
 await positiveHistory('exact_login_targets',tx,'directive_employee',who,{targets:['employee'],unit:'display'});
 await positiveHistory('same_QA_typed_producer_positive',qaTx,'directive_employee',{user_id:actors.manager,login_name:'manager',display_name:'display',role:'manager'},{targets:['manager'],unit:'display'});
 await negative('foreign_QA_target_alias',async()=>{await h.actor(actors.employee);await history(tx,'directive_employee',who,'text',{targets:['manager'],unit:'display'});});
 await negative('foreign_QA_root',async()=>{await h.actor(actors.employee);await history(qaTx,'created',who,'text');});
 await negative('foreign_QA_canonical_key',async()=>{await h.actor(actors.employee);await h.insert('audit_log',{actor_id:actors.employee,event_type:'profile_name_changed',entity_type:'account',entity_id:'fixture_manager',meta:{name:'display',target_user_id:actors.manager}});});
 await check('canonical_key_profile_audit_positive',async()=>{await h.actor(actors.employee);const row=(await h.insert('audit_log',{actor_id:actors.employee,event_type:'profile_name_changed',entity_type:'account',entity_id:'fixture_employee',meta:{name:'display',target_user_id:actors.employee}})).rows[0];await h.reset();assert.deepEqual((await db.query('SELECT to_jsonb(t) row FROM public.audit_log t WHERE id=$1',[row.id])).rows,[{row}]);return {native_guarded_row:true,producer_scope:'SQL admin_set_account_name_current audit row schema (not RPC/Edge request E2E)'};});
 await negative('dynamic_supporting_unresolved',async()=>{await h.actor(actors.employee);await history(tx,'assistant_scope_route',who,'text',{responsible_targets:['employee'],supporting:[]});});
 await negative('missing_native_SID',async()=>{await h.actor(actors.employee,null);await history(tx,'created',who,'text');});
 await check('normal_notifications_full_PATCH',async()=>{
  await h.actor(actors.employee);const row=(await h.insert('notifications',{user_id:actors.employee,target_login_name:'employee',event_type:'fixture',title:'ordinary'})).rows[0];
  const patched=(await db.query("UPDATE public.notifications SET title='full PATCH',body='text',read_at=clock_timestamp() WHERE id=$1 RETURNING to_jsonb(notifications.*) row",[row.id])).rows[0].row;assert.equal(patched.title,'full PATCH');assert.equal(patched.body,'text');assert.notEqual(patched.read_at,null);
  await h.reset();assert.deepEqual((await db.query('SELECT to_jsonb(t) row FROM public.notifications t WHERE id=$1',[row.id])).rows,[{row:patched}]);const {title,body,read_at,...unchanged}=patched;const {title:oldTitle,body:oldBody,read_at:oldRead,...original}=row;assert.deepEqual(unchanged,original);return {full_PATCH_readback:true,read_at_schema_preserved:true,positive_under_final_native_catalog:true};
 });
 const readinessBaseline=await h.snapshot();const driftEvidence=[];
 const readiness=async(name,table,sql)=>check(name,async()=>{
  const before=await h.snapshot(),catalog=await h.catalog();await db.exec('SAVEPOINT readiness_drift');let receipt;
  try{
   await h.reset();const guards=(await db.query("SELECT to_jsonb(t) attachment FROM pg_trigger t WHERE tgrelid=$1::regclass AND NOT tgisinternal AND tgfoid IN ('app_private.qa_reference_guard_before_row()'::regprocedure,'app_private.qa_owned_fence_before_row()'::regprocedure)",[table])).rows;assert.equal(guards.length,1,'one exact trusted fixture drift guard');const g=guards[0].attachment;assert.equal(g.tgenabled,'O');assert.equal(g.tgtype,31);assert.equal(g.tgqual,null);assert.equal(g.tgnargs,0);assert.deepEqual(g.tgattr,[]);
   await db.exec(`ALTER TABLE ${table} DISABLE TRIGGER ${quote(g.tgname)}`);
   try{await db.query(sql,[actors.employee]);}finally{await db.exec(`ALTER TABLE ${table} ENABLE TRIGGER ${quote(g.tgname)}`);}
   assert.deepEqual((await db.query('SELECT to_jsonb(t) attachment FROM pg_trigger t WHERE oid=$1',[g.oid])).rows,guards,'restore exact guard BEFORE tested call');await h.closed();assert.deepEqual(await h.catalog(),catalog);
   receipt=await h.deny(async()=>{await h.actor(actors.employee);await history(tx,'created',who,'text');});
   driftEvidence.push({name,attachment_restored_before_call:true,sqlstate:receipt.sqlstate});
  }finally{await db.exec('ROLLBACK TO SAVEPOINT readiness_drift;RELEASE SAVEPOINT readiness_drift');}
  assert.deepEqual(await h.snapshot(),before,'transactional readiness baseline restore');assert.deepEqual(await h.catalog(),catalog);return {...receipt,exact_guard_restored_before_call:true,baseline_restored_by_transactional_rollback:true};
 });
 await readiness('forced_normal_service_audit_denied','public.profiles','UPDATE public.profiles SET must_change_password=true WHERE id=$1');
 await readiness('stale_normal_service_audit_denied','app_private.account_credential_state','UPDATE app_private.account_credential_state SET session_valid_after=clock_timestamp() WHERE user_id=$1');
 await check('readiness_not_weakened',async()=>{assert.equal(driftEvidence.length,2);assert(driftEvidence.every(x=>x.sqlstate==='42501'&&x.attachment_restored_before_call));assert.deepEqual(await h.snapshot(),readinessBaseline);assert.deepEqual(await h.catalog(),beforeCatalog);await h.closed();await h.zero();return {profiles_and_credentials_baseline_exact:true,permanent_guard_disabling:false};});
 await h.reset();await db.exec('COMMIT');await h.zero();assert.deepEqual(await h.catalog(),beforeCatalog);
 report.covered_producers=['actual current Edge history helper -> native guarded history/audit SQL','SQL canonical profile audit row schema','normal notification full PATCH'];report.uncovered_producers=['actual Edge request handlers/provider SDK','dynamic supporting/source-origin remains rejected'];
}});
