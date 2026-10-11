// TEST ONLY. Closed, rolled-back owner drift; restore exact original guards BEFORE API.
import assert from 'node:assert/strict';
import {registerTrustedFixtureDrift} from './qa_completed_read_native_reader.mjs';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const ident=s=>'"'+s.replaceAll('"','""')+'"';
export async function trustedDriftCases(d,request,plan,retainedMetadata){
 const r=request,u=q(r.uid)+'::uuid',op=q(r.operationId)+'::uuid',run=q(r.runId)+'::uuid',source=q(r.sourceId)+'::uuid',canonical=q(r.canonicalKey);
 const exactTables=['auth.users','auth.sessions','public.profiles','app_private.qa_owned_deletions','app_private.qa_owned_deletion_fences','app_private.qa_owned_sources','app_private.qa_owned_operations','app_private.qa_owned_resources','app_private.qa_runs','app_private.account_password_operations','app_private.qa_password_frames','app_private.qa_sql_operation_context','app_private.qa_core_provision_context','app_private.qa_owned_frames','app_private.qa_owned_native_frames'];
 const guards=(await d.query("SELECT n.nspname||'.'||c.relname AS surface,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal ORDER BY t.oid")).rows.filter(t=>exactTables.includes(t.surface));assert(guards.every(t=>t.tgenabled==='O'));
 const arm=(tables,sql)=>{
  assert(tables.every(t=>exactTables.includes(t)));const selected=guards.filter(t=>tables.includes(t.surface));
  const alter=(t,verb)=>'ALTER TABLE '+t.surface.split('.').map(ident).join('.')+' '+verb+' TRIGGER '+ident(t.tgname)+';';
  const prefix=selected.map(t=>alter(t,'DISABLE')).join('\n'),suffix=selected.map(t=>alter(t,'ENABLE')).join('\n');
  // IDs, definitions and original enabled mode were captured from exact current catalog.
  return registerTrustedFixtureDrift(prefix+'\n'+sql+'\n'+suffix);
 };
 const targetAuth=`INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data,created_at,email_confirmed_at) VALUES(${u},${q(plan.resources.find(s=>s.sourceId===r.sourceId).email)},'{}','{}',clock_timestamp(),clock_timestamp());`;
 const runRow=`INSERT INTO app_private.qa_runs(run_id,phase,active,expires_at) VALUES(${run},'cleaning',false,clock_timestamp()+interval '1 hour');`;
 const native=retainedMetadata.functions.find(f=>f.identity==='app_private.qa_owned_native_root()');assert(native&&/^\d+$/.test(native.oid));
 const entries=[
 ['terminal receipt tampered',['app_private.qa_owned_deletions'],`UPDATE app_private.qa_owned_deletions SET completed_receipt=jsonb_set(completed_receipt,'{generation}','2') WHERE operation_id=${op};`],
 ['fresh protected digest drift',['public.profiles'],"UPDATE public.profiles SET full_name=full_name||' trusted drift' WHERE id=(SELECT id FROM public.profiles ORDER BY id LIMIT 1);"],
 ['owned Auth reappeared',['auth.users'],targetAuth],
 ['owned profile resource reappeared',['auth.users','public.profiles'],targetAuth+`INSERT INTO public.profiles(id,login_name,full_name) VALUES(${u},${canonical},'trusted reappearance');`],
 ['target session remaining',['auth.users','auth.sessions'],targetAuth+`INSERT INTO auth.sessions(id,user_id,created_at) VALUES('00000000-0000-4000-8000-000099000001',${u},clock_timestamp());`],
 ['pending retained operation',['app_private.qa_owned_deletions'],`UPDATE app_private.qa_owned_deletions SET status='auth_delete_unknown' WHERE operation_id=${op};`],
 ['fence remaining',['app_private.qa_owned_deletion_fences'],`INSERT INTO app_private.qa_owned_deletion_fences(target_user_id,canonical_key,run_id,operation_id,generation) VALUES(${u},${canonical},${run},${op},${r.generation});`],
 ['source reservation reappeared',['app_private.qa_runs','app_private.qa_owned_sources'],runRow+`INSERT INTO app_private.qa_owned_sources(run_id,source_id,source,create_operation,creation_receipt) VALUES(${run},${source},'{}','00000000-0000-4000-8000-000099000002','00000000-0000-4000-8000-000099000003');`],
 ['pending reservation remaining',['app_private.qa_runs','app_private.qa_owned_operations'],runRow+`INSERT INTO app_private.qa_owned_operations(run_id,operation_id,scope,resource_key,state,actual,history) VALUES(${run},'00000000-0000-4000-8000-000099000004','cleanup',${canonical},'unknown','pending','[]');`],
 ['owned receipt resource reappeared',['app_private.qa_runs','app_private.qa_owned_operations','app_private.qa_owned_resources'],runRow+`INSERT INTO app_private.qa_owned_operations(run_id,operation_id,scope,resource_key,state,actual,history) VALUES(${run},'00000000-0000-4000-8000-000099000004','create',${canonical},'completed','fulfilled','[]');INSERT INTO app_private.qa_owned_resources(receipt_id,run_id,create_operation,source_id,owner_uid,canonical_key,kind,surface,pk,row_digest,auth_get_digest,full_row,table_oid,effect_sequence) VALUES('00000000-0000-4000-8000-000099000009',${run},'00000000-0000-4000-8000-000099000004',${source},${u},${canonical},'owned-load-qa','public.profiles',jsonb_build_object('id',${u}),repeat('f',64),repeat('f',64),jsonb_build_object('id',${u}),'public.profiles'::regclass,1);`],
 ['password operation remaining',['auth.users','app_private.account_password_operations'],targetAuth+`INSERT INTO app_private.account_password_operations(operation_id,target_id,kind,status,generation,source) VALUES('00000000-0000-4000-8000-000099000005',${u},'reset','pending',1,'authorized_maintenance');`],
 ['password frame remaining',['app_private.qa_password_frames'],`INSERT INTO app_private.qa_password_frames(backend_pid,sql_xid,entry_oid,operation_id,phase,actor_uid,actor_sid,target_uid,canonical_key,generation,kind,control,native_created_at) VALUES(pg_backend_pid(),pg_current_xact_id(),${native.oid},${op},'dispatch',${u},'00000000-0000-4000-8000-000099000006',${u},${canonical},1,'reset','{}',clock_timestamp());`],
 ['SQL frame remaining',['app_private.qa_sql_operation_context'],`INSERT INTO app_private.qa_sql_operation_context(backend_pid,sql_xid,operation_id,table_oid,old_key,actor_uid,actor_sid,run_id,operation_mode,root_transaction_ids,parent_ids,old_references) VALUES(pg_backend_pid(),pg_current_xact_id(),${op},'public.profiles'::regclass,jsonb_build_object('id',${u}),${u},'00000000-0000-4000-8000-000099000007',${run},'owned_cleanup',ARRAY[${op}],'{}','{}');`],
 ['Core frame remaining',['app_private.qa_core_provision_context'],`INSERT INTO app_private.qa_core_provision_context(backend_pid,sql_xid,source_function,canonical_key,target_user,login_name,display_name,role_code,expected_memberships) VALUES(pg_backend_pid(),pg_current_xact_id(),${native.oid},${canonical},${u},'trusted','trusted','employee','[]');`],
 ['owned frame remaining',['app_private.qa_owned_frames'],`INSERT INTO app_private.qa_owned_frames(backend_pid,sql_xid,source_oid,run_id,source_id,phase) VALUES(pg_backend_pid(),pg_current_xact_id(),${native.oid},${run},${source},'dispose');`],
 ['native frame remaining',[],`INSERT INTO app_private.qa_owned_native_frames(backend_pid,sql_xid,operation_id,generation,source_oid,gateway_oid,root_uid,root_state) VALUES(pg_backend_pid(),pg_current_xact_id(),${op},${r.generation},${native.oid},${Number(retainedMetadata.gateway.role.oid)},${u},'admitted');`],
 ];
 for(const anchor of ['qa_owned_approved_plans','qa_owned_run_receipts']){
  const sql=`ALTER TABLE app_private.${anchor} OWNER TO anon;REVOKE ALL ON TABLE app_private.${anchor} FROM PUBLIC,anon,postgres;DO $owner$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private' AND c.relname='${anchor}' AND r.rolname='anon' AND c.relacl IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(c.relacl))) THEN RAISE EXCEPTION 'empty ACL anchor owner drift not applied'; END IF;END $owner$;`;
  entries.push(['empty ACL anchor owner drift '+anchor,[],sql]);
 }
 return entries.map(([name,tables,sql])=>({name,sql:arm(tables,sql),restoredGuardCount:guards.filter(t=>tables.includes(t.surface)).length}));
}
export async function mutationProbeCases(d){
 const primitives=['qa_owned_delete_prepare_internal','qa_owned_delete_transition_internal','qa_owned_delete_absence_internal','qa_owned_delete_finalize_internal','qa_owned_operation_internal','qa_owned_prepare_internal','qa_owned_dispose_internal','qa_owned_complete_internal','account_password_begin_internal','account_password_finish_internal','account_password_dispatch_internal'];
 const rows=(await d.query("SELECT p.proname,to_jsonb((SELECT array_agg(pg_catalog.format_type(t,NULL) ORDER BY ord) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(t,ord))) types FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid")).rows.filter(r=>primitives.includes(r.proname));
 for(const required of ['qa_owned_delete_prepare_internal','qa_owned_delete_finalize_internal','qa_owned_operation_internal','qa_owned_prepare_internal','qa_owned_dispose_internal','qa_owned_complete_internal','account_password_begin_internal','account_password_finish_internal'])assert(rows.some(r=>r.proname===required),'original mutation ABI missing: '+required);
 const probes=[{name:'INSERT',sql:"INSERT INTO public.profiles(id,login_name,full_name) VALUES('00000000-0000-4000-8000-000099000008','readonly-denied','readonly-denied')"},{name:'UPDATE',sql:"UPDATE public.profiles SET full_name='readonly-denied' WHERE false"},{name:'DELETE',sql:'DELETE FROM public.profiles WHERE false'},{name:'auth delete',sql:'DELETE FROM auth.users WHERE false'},{name:'session deletion/logout SQL seam',sql:'DELETE FROM auth.sessions WHERE false'}];
 for(const row of rows){assert(/^[a-z_]+$/.test(row.proname)&&row.types.every(t=>/^[a-z0-9_\[\] ]+$/.test(t)));probes.push({name:row.proname,sql:'SELECT public.'+row.proname+'('+row.types.map(t=>'NULL::'+t).join(',')+')'});}
 return probes;
}
