// Real prerequisite/SQL integration; PGlite Auth/session transport remains synthetic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const migration=path.resolve(import.meta.dirname,'../supabase/migrations/20261008020000_qa_isolation_enforcement.sql');
export async function installAndRegister({db,manifest,fixture}) {
 const sql=fs.readFileSync(migration,'utf8');
 assert.match(sql,/qa_enforcement_not_ready/); // Never mistake the bounded section for deployable enforcement.
 // Install the actual owned prerequisite migration, never replacement helpers.
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261008010000_qa_isolation_prerequisites.sql',import.meta.url),'utf8'));
 // Empty dependency relations: columns from the frozen read-only catalog.
 // Indexes here are local mechanics prerequisites, not native catalog proof.
 await db.exec(`CREATE TABLE public.workspace_versions(scope text primary key,revision bigint not null default 0);
 CREATE TABLE public.workspace_edits(scope text not null,revision bigint not null,request_id uuid not null,actor text not null,operations jsonb not null,created_at timestamptz not null default now(),unique(scope,request_id));
 CREATE TABLE public.migration_gate(id integer primary key,token_hash text not null,expires_at timestamptz not null,enabled boolean not null default false);
 CREATE TABLE public.legacy_archive(source_table text not null,source_key text not null,payload jsonb not null,row_hash text,imported_at timestamptz not null default now(),primary key(source_table,source_key));
 CREATE TABLE public.migration_receipts(id bigint generated always as identity,source_table text not null,batch_count integer not null,received_at timestamptz not null default now());
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_versions,public.workspace_edits,public.migration_gate,public.legacy_archive,public.migration_receipts TO service_role;
 GRANT USAGE ON SEQUENCE public.migration_receipts_id_seq TO service_role;
 INSERT INTO public.workspace_versions VALUES('ceo:state',0);`);
 // Restore only missing frozen definitions from the read-only catalog receipt.
 const frozenCatalog=JSON.parse(fs.readFileSync('C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/msajed-account-work/qa-live-catalog.json','utf8')).groups.functions;
 for(const f of frozenCatalog) {
  const found=(await db.query('select to_regprocedure($1) oid',[`${f.schema}.${f.name}(${f.identity_args.split(',').map(a=>a.trim().replace(/^\w+\s+/, '')).join(',')})`])).rows[0].oid;
  if(!found) {
   // Frozen missing bodies reference relations absent in this predecessor.
   // Preserve actual definitions, not invented dependency functions.
   await db.exec('set check_function_bodies=off');
   await db.exec(f.definition);
   await db.exec('set check_function_bodies=on');
   await db.exec(`ALTER FUNCTION ${f.schema}.${f.name}(${f.identity_args.split(',').map(a=>a.trim().replace(/^\w+\s+/, '')).join(',')}) OWNER TO ${f.owner}; REVOKE ALL ON FUNCTION ${f.schema}.${f.name}(${f.identity_args.split(',').map(a=>a.trim().replace(/^\w+\s+/, '')).join(',')}) FROM PUBLIC,anon,authenticated,service_role;`);
   if(f.service_execute) await db.exec(`GRANT EXECUTE ON FUNCTION ${f.schema}.${f.name}(${f.identity_args.split(',').map(a=>a.trim().replace(/^\w+\s+/, '')).join(',')}) TO service_role;`);
  }
 }
 for(const [cohort,run] of Object.entries(manifest.runIds)) await db.query("insert into app_private.qa_runs(run_id,phase,active,expires_at) values($1,'active',true,clock_timestamp()+interval '1 hour')",[run]);
 for(const a of manifest.accounts.filter(a=>a.cohort!=='ordinary')) {
  const run=manifest.runIds[a.cohort];
  await db.query("insert into app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class,run_id,owned_creation_operation,owned_creation_receipt_id) values($1,$2,$2,'current_owned_QA',$3,$4,$5)",[a.uid,a.name,run,fixture.id(91000+Number(a.uid.slice(-12))),fixture.id(95000+Number(a.uid.slice(-12)))]);
  if(a.operational_member && a.state!=='public_membership_missing') await db.query('insert into app_private.qa_run_members(run_id,user_id,role_code,active) values($1,$2,$3,$4)',[run,a.uid,a.role,a.state==='active']);
 }
 for(const t of manifest.transactions.filter(t=>t.cohort!=='ordinary')) await db.query('insert into app_private.qa_transaction_manifest(transaction_id,run_id,owned_creation_operation) values($1,$2,$3)',[t.uid,manifest.runIds[t.cohort],fixture.id(99000+Number(t.uid.slice(-12)))]);
 // Fixture-only prerequisite: executive office membership from committed registry
 // migration. Existing eight remain ordinary, never inferred as owned by naming.
 let office=fixture.id(99001);
 const approved=fs.readFileSync(new URL('../supabase/migrations/20261004210000_full_staff_registry_profiles.sql',import.meta.url),'utf8');
 assert.ok(approved.includes("a.role_code in ('ceo','ceo_office_manager','ceo_secretary')"));
 const approvedOffices=(await db.query("select id from public.organizational_units where name='مكتب الرئيس التنفيذي' and unit_type='office' and parent_id is null and active")).rows;
 assert.ok(approvedOffices.length<=1,'ambiguous approved office fixture');
 if(approvedOffices.length)office=approvedOffices[0].id;
 else await db.query("insert into public.organizational_units(id,name,unit_type,parent_id) values($1,'مكتب الرئيس التنفيذي','office',null)",[office]);
 await db.query("insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,'office',true)",[fixture.actors.ceo,office]);
 // All newly shaped active executive actors use the approved office prerequisite;
 // negative inactive/missing fixtures are not repaired into operational membership.
 for(const a of manifest.accounts.filter(a=>a.origin==='new-synthetic-only' && a.state==='active' && ['ceo','ceo_office_manager','ceo_secretary'].includes(a.role))) {
  await db.query('delete from public.user_memberships where user_id=$1',[a.uid]);
  await db.query("insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,'office',true)",[a.uid,office]);
 }
 const abi=JSON.parse(fs.readFileSync('C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-isolation-prereq-evidence/ABI.json','utf8'));
 for(const f of abi.functions) {
  const observed=(await db.query(`select pg_get_function_identity_arguments(p.oid) args,pg_get_function_arguments(p.oid) defaults,pg_get_function_result(p.oid) result,p.provolatile volatility,p.prosecdef security_definer,p.proconfig config,r.rolname owner,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname=$1 and p.proname=$2`,[f.schema,f.name])).rows;
  assert.equal(observed.length,1,'ambiguous prerequisite '+f.name);
  assert.deepEqual(observed[0],{args:f.identity_args,defaults:f.arguments,result:f.result,volatility:f.volatility,security_definer:f.security_definer,config:f.config,owner:f.owner,acl:f.acl},'prerequisite ABI drift '+f.name);
 }

 const metadataSql=`SELECT p.oid::text,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_arguments(p.oid) defaults,pg_get_function_result(p.oid) result,p.proowner::text,p.proacl::text,p.prosecdef,p.provolatile,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private') ORDER BY p.oid`;
 const snapshot=async()=>{
  const tables=(await db.query("SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('auth','public','app_private') ORDER BY 1,2")).rows;
  const rows={};
  for(const t of tables) rows[t.schema+'.'+t.name]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) value FROM "${t.schema}"."${t.name}" x`)).rows[0].value;
  return rows;
 };
 const before=(await db.query(metadataSql)).rows;
 const definitionSql="SELECT p.oid::text,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private') ORDER BY p.oid";
 const definitionsBefore=(await db.query(definitionSql)).rows;
 const dataBefore=await snapshot();
 // Approved new transient relation must remain empty, including denied effects.
 dataBefore['app_private.qa_core_provision_context']=[];
 // The complete migration MUST remain blocked before any effect.
 await assert.rejects(db.exec(sql),e=>e.code==='55000');
 await db.exec('rollback');
 assert.deepEqual(await snapshot(),Object.fromEntries(Object.entries(dataBefore).filter(([k])=>k!=='app_private.qa_core_provision_context')),'activation barrier allowed effects');
 const section=sql.split('-- BEGIN LOCAL VERIFIABLE SECTION\n')[1]?.split('-- END LOCAL VERIFIABLE SECTION')[0];
 assert.ok(section,'bounded section missing');
 await db.exec(section);
 const after=(await db.query(metadataSql)).rows;
 const map=new Map(after.map(x=>[x.oid,x]));
 for(const row of before) assert.deepEqual(map.get(row.oid),row,'existing ABI/OID/ACL changed: '+row.proname);
 assert.deepEqual(await snapshot(),dataBefore,'migration changed application data');
 const modifiedNames=new Set(['mark_transaction_seen_current','my_profile_set_email_current','admin_set_account_name_current','permissions_admin_set','permissions_admin_set_account','transaction_reply_raise_internal','next_transaction_number','transaction_feedback_flags','transaction_directory_current','commit_workspace_edit','ingest_legacy_batch','account_provision_link_internal']);
 const definitionsAfter=new Map((await db.query(definitionSql)).rows.map(x=>[x.oid,x.definition]));
 for(const row of before) if(!modifiedNames.has(row.proname)) assert.equal(definitionsAfter.get(row.oid),definitionsBefore.find(x=>x.oid===row.oid).definition,'unapproved function body changed');
 // Real mutating leaf and whole-data zero-effect checks; fixture dependency is explicit.
 const a=manifest.accounts.find(a=>a.cohort==='A'&&a.role==='employee'&&a.state==='active');
 const foreign=manifest.transactions.find(t=>t.cohort==='B');
 const own=manifest.transactions.find(t=>t.cohort==='A'&&t.kind==='employee');
 await fixture.claims(a.uid);
 const deniedBefore=await snapshot();
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select public.mark_my_transaction_seen($1,0)',[foreign.uid]),e=>e.code==='42501');
 await db.exec('reset role');
 assert.deepEqual(await snapshot(),deniedBefore,'denied leaf wrote data');
 await db.exec('set role authenticated');
 const seen=(await db.query('select public.mark_my_transaction_seen($1,0) value',[own.uid])).rows[0].value;
 assert.equal(seen.ok,true,'same-run leaf must retain existing authorization');
 await db.exec('reset role');
 await db.query('delete from app_private.transaction_read_state where transaction_id=$1 and user_id=$2',[own.uid,a.uid]);
 await db.exec(section);
 for(const row of before) assert.deepEqual(new Map((await db.query(metadataSql)).rows.map(x=>[x.oid,x])).get(row.oid),row);
 {
  await db.exec('begin');
  assert.equal((await db.query("select revision from public.workspace_versions where scope='ceo:state'")).rows[0].revision,0);
  const ordinary=manifest.accounts.find(a=>a.cohort==='ordinary'&&a.role==='ceo'&&a.origin==='new-synthetic-only');
  const setService=async(a)=>{await db.exec('reset role');await fixture.claims(a.uid);await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({role:'service_role'}),JSON.stringify({'x-qa-actor-user':a.uid,'x-qa-actor-sid':fixture.id(1000+Number(a.uid.slice(-12)))})]);await db.exec('set role service_role');};
  await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers','{}',false)");
  await db.exec('set role service_role');
  await db.exec('savepoint deny_workspace');
  await assert.rejects(db.query('select public.commit_workspace_edit($1,$2,$3,$4,$5)',['ceo:state',0,fixture.id(78001),'fixture',JSON.stringify([{fixture:true}])]),e=>e.code==='42501');
  await db.exec('rollback to deny_workspace');
  await db.exec('savepoint deny_import');
  await assert.rejects(db.query('insert into public.migration_receipts(source_table,batch_count) values($1,0)',['fixture']),e=>e.code==='42501');
  await db.exec('rollback to deny_import;savepoint deny_import_rpc');
  await assert.rejects(db.query('select public.ingest_legacy_batch($1,$2,$3)',['fixture','profiles',JSON.stringify([])]),e=>e.code==='42501');
  await db.exec('rollback to deny_import_rpc');
  await setService(a);
  await db.exec('savepoint deny_qa');
  await assert.rejects(db.query('select public.commit_workspace_edit($1,$2,$3,$4,$5)',['ceo:state',0,fixture.id(78002),'fixture',JSON.stringify([{fixture:true}])]),e=>e.code==='42501');
  await db.exec('rollback to deny_qa');
  await setService(ordinary);
  const workspace=(await db.query('select public.commit_workspace_edit($1,$2,$3,$4,$5) value',['ceo:state',0,fixture.id(78003),'fixture',JSON.stringify([{fixture:true}])])).rows[0].value;
  assert.equal(workspace.committed,true);
  await db.exec('savepoint ordinary_import_disabled');
  await assert.rejects(db.query('select public.ingest_legacy_batch($1,$2,$3)',['fixture','profiles',JSON.stringify([])]),e=>e.code==='42501');
  await db.exec('rollback to ordinary_import_disabled');
  await db.exec('reset role');
  assert.equal((await db.query('select revision from public.workspace_versions')).rows[0].revision,1);
  await db.exec('rollback');
  console.log(JSON.stringify({independent_surfaces:{workspace_positive:true,missing_actor_denied:true,qa_shared_workspace_denied:true,direct_receipt_no_actor_denied:true},native_acceptance:false}));
 }
 // Read closure must bind the actual local session, not UID-only readiness.
 await db.exec('begin');
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:a.uid,session_id:fixture.id(77999)})]);
 await db.exec('set role authenticated');
 assert.equal((await db.query('select count(*)::int count from public.profiles')).rows[0].count,0,'fabricated SID exposed profiles');
 await db.exec('reset role');
 const qaCeo=manifest.accounts.find(x=>x.cohort==='A'&&x.role==='ceo_office_manager'&&x.state==='active');
 await fixture.claims(qaCeo.uid);await db.exec('set role authenticated');
 assert.equal((await db.query('select count(*)::int count from public.user_permissions where user_id=$1',[fixture.actors.stranger])).rows[0].count,0,'foreign user permission exposed');
 await db.exec('reset role;rollback');
 // Named Core management route: local synthetic Auth UID, exact committed
 // canonical source and canonical expected membership; never an app actor SID.
 await db.exec('begin');
 await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers','{}',false)");
 await db.exec('set role service_role;savepoint deny_unapproved_core');
 await assert.rejects(db.query('select public.account_provision_link_internal($1,$2,$3)',['fixture_stranger',fixture.actors.stranger,JSON.stringify([])]),e=>e.code==='42501');
 await db.exec('rollback to deny_unapproved_core;reset role');
 const coreUid=fixture.id(78010);
 const source=(await db.query("select internal_email from public.account_migration_users where canonical_key='ceo'")).rows[0];
 await db.query('insert into auth.users(id,email) values($1,$2)',[coreUid,source.internal_email]);
 const coreMemberships=(await db.query("select app_private.account_expected_memberships('ceo') value")).rows[0].value;
 // Local consumer adapter exercises the real Core predicate inside real
 // link-trigger writes. It is NOT the separate REST fragment or native evidence.
 await db.exec(`create function app_private.fixture_core_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not coalesce(app_private.qa_core_provision_row_allowed(TG_RELID,TG_OP,case when TG_OP='UPDATE' then to_jsonb(OLD) else null end,to_jsonb(NEW)),false) then raise exception 'fixture Core origin denied' using errcode='42501';end if;return NEW;end$$;`);
 for(const table of ['profiles','user_roles','user_memberships','account_migration_users']) await db.exec(`create trigger fixture_core_origin before insert or update on public.${table} for each row execute function app_private.fixture_core_guard()`);
 await db.exec('savepoint deny_no_core_frame');
 await assert.rejects(db.query('insert into public.profiles(id,login_name,full_name) values($1,$2,$2)',[coreUid,'untrusted']),e=>e.code==='42501');
 await db.exec('rollback to deny_no_core_frame');
 await db.exec('savepoint deny_raw_owner');
 await assert.rejects(db.query('select public.account_provision_link_internal($1,$2,$3)',['ceo',coreUid,JSON.stringify(coreMemberships)]),e=>e.code==='42501');
 await db.exec('rollback to deny_raw_owner;set role service_role');
 const linked=(await db.query('select public.account_provision_link_internal($1,$2,$3) value',['ceo',coreUid,JSON.stringify(coreMemberships)])).rows[0].value;
 assert.equal(linked.status,'linked');
 const replay=(await db.query('select public.account_provision_link_internal($1,$2,$3) value',['ceo',coreUid,JSON.stringify(coreMemberships)])).rows[0].value;
 assert.equal(replay.status,'already_linked');
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int count from app_private.qa_core_provision_context')).rows[0].count,0);
 await db.exec('rollback');
 console.log(JSON.stringify({core_management:{unapproved_key_denied:true,raw_owner_denied:true,original_source_linked:true,replay_preserved:true,context_cleaned:true},native_acceptance:false}));
 const frozen=JSON.parse(fs.readFileSync('C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/msajed-account-work/qa-live-catalog.json','utf8')).groups.functions;
 const frozenPresent=frozen.filter(f=>before.some(r=>r.nspname===f.schema&&r.proname===f.name&&r.args===f.identity_args)).length;
 // Publish exact local ABI for the separately owned REST consumer. This does
 // NOT approve attachment, Native readiness, or the separate QA Core path.
 const addedAbi=(await db.query(`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,p.provolatile volatility,p.prosecdef security_definer,p.proconfig config,r.rolname owner,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where p.proname in ('qa_core_provision_row_allowed','qa_enforcement_shared_write_guard') order by 1,2`)).rows;
 const artifact='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-enforcement-integration-evidence';
 fs.mkdirSync(artifact,{recursive:true});
 fs.writeFileSync(path.join(artifact,'ABI.json'),JSON.stringify({status:'LOCAL_VERIFIED_ATTACHMENT_AND_FOCUSED_REVIEW_REQUIRED',native_acceptance:false,functions:addedAbi,core_context_columns:(await db.query("select column_name,data_type,is_nullable from information_schema.columns where table_schema='app_private' and table_name='qa_core_provision_context' order by ordinal_position")).rows,rest_consumer_requirement:'Before qa_verified_write_actor, accept ONLY coalesce(qa_core_provision_row_allowed(TG_RELID,TG_OP,case when TG_OP=\'UPDATE\' then to_jsonb(OLD) else NULL end,to_jsonb(NEW)),false); otherwise retain full existing guard. Only named original57 Core link constructs/clears this separate private pid+xid+functionOID frame; QA provisioning remains denied.',password_abi_observed:'20261008015000 in_progress_local_only; not imported',rest_abi_observed:'unavailable; fragment source exists but not imported',new_storage_review_required:true},null,2));
 console.log(JSON.stringify({bounded_section:true,frozen_catalog_functions_present:frozenPresent,frozen_catalog_functions_total:frozen.length,existing_metadata_rows:before.length,data_neutral:true,foreign_leaf_denied_zero_writes:true,same_run_leaf_allowed:true,native_acceptance:false,production_prerequisite:true}));
}
