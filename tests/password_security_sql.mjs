// Local PGlite fixture only: never connects to Supabase or validates live RLS.
// Run: node tests/password_security_sql.mjs <local-pglite-module> <snapshot-directory>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const migration = path.join(root, 'supabase/migrations/20261005200000_password_operations_and_safe_provisioning.sql');
const {PGlite} = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const snapshots = process.argv[3];
assert(snapshots, 'Pass the nonsecret physical-schema snapshot directory');
const staff = JSON.parse(fs.readFileSync(path.join(snapshots,'staff-preflight.json'),'utf8'));
const identities = JSON.parse(fs.readFileSync(path.join(snapshots,'auth-identities-preflight.json'),'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(snapshots,'schema-preflight.json'),'utf8'));
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key,email text unique,raw_app_meta_data jsonb default '{}'::jsonb);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz,not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 grant usage on schema auth to authenticated,service_role;
 grant execute on function auth.uid(),auth.jwt() to authenticated,service_role;
`);
const dir = path.join(root,'supabase/migrations');
const prior = fs.readdirSync(dir).filter(f=>f.endsWith('.sql') && f < '20261005200000' && f !== '20261003180502_migration_role_indexes.sql').sort();
// That legacy index-only migration references auth_migration_accounts, outside the physical snapshot.
// Repository foundation timestamp predates its indexes semantically, not lexically.
prior.splice(prior.indexOf('20261002_transactions_foundation.sql'),1);
prior.unshift('20261002_transactions_foundation.sql');
await db.exec('set check_function_bodies=off'); // Incomplete historical chain has forward function references.
for (const file of prior) {
 let sql=fs.readFileSync(path.join(dir,file),'utf8');
 // Two historical dump files lack their closing function semicolon. This is
 // fixture-only normalization, not a change to source or a chain replay proof.
 sql=sql.replace(/\$function\$\s*(?=revoke)/gi,'$function$;\n');
 try { await db.exec(sql); } catch(e) {console.error(`Fixture migration ${file}: ${e.message}`); process.exit(1);}
 if(file==='20261002_transactions_foundation.sql') {
  for(const i of identities) {
   await db.query('insert into auth.users(id,email) values($1,$2)',[i.id,i.email]);
   await db.query('insert into public.profiles(id,login_name,full_name) values($1,$2,$3)',[i.id,i.login_name,i.login_name]);
  }
 }
}
// Replace historical seed rows with the supplied read-only current registry snapshot.
await db.exec('delete from public.account_migration_aliases; delete from public.account_permission_overrides; delete from public.account_migration_users;');
for (const a of staff) {
 await db.query(`insert into public.account_migration_users(canonical_key,login_username,preferred_login,display_name,role_code,org_name,dept_names,internal_email,eligible,migrated_user_id,must_change_password) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[a.canonical_key,a.login_username,a.preferred_login,a.display_name,a.role_code,a.org_name,a.dept_names,a.internal_email,a.eligible,a.migrated_user_id,a.must_change_password]);
 if(a.migrated_user_id) {
  await db.query('update public.profiles set login_name=$2,full_name=$3,active=$4,must_change_password=$5 where id=$1',[a.migrated_user_id,a.preferred_login,a.display_name,a.profile_active,a.profile_must_change]);
  await db.query('insert into public.user_roles(user_id,role_code,is_primary) values($1,$2,true) on conflict do nothing',[a.migrated_user_id,a.role_code]);
 }
}
const faisal = '0a1df502-9232-4ef5-af2d-df585ad7f187';
const preserveSql=`select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p),'roles',(select jsonb_agg(to_jsonb(r) order by user_id,role_code) from public.user_roles r),'memberships',(select jsonb_agg(to_jsonb(m) order by user_id,unit_id,membership_role) from public.user_memberships m),'registry',(select jsonb_agg(to_jsonb(a) order by canonical_key) from public.account_migration_users a),'defaults',(select jsonb_agg(to_jsonb(rp) order by role_code,permission_code) from public.role_permissions rp))`;
const beforeMigration=(await db.query(preserveSql)).rows[0];
const protectedBefore=(await db.query("select jsonb_build_object('auth',to_jsonb(u),'profile',to_jsonb(p),'registry',to_jsonb(a)) result from auth.users u join public.profiles p on p.id=u.id join public.account_migration_users a on a.migrated_user_id=u.id where a.canonical_key in ('faisal','finance_manager') order by a.canonical_key")).rows;
const scalar = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
const claims = async (user,session) => db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session,role:'authenticated'})]);
let passed=0;
async function test(name,fn) {await fn(); passed++; console.log(`PASS ${name}`);}
try {
 await test('password security migration exists after username migration',async()=>assert(fs.existsSync(migration),'Missing password security SQL migration'));
 await db.exec('set check_function_bodies=on'); // New migration must compile with body checks enabled.
 await db.exec(fs.readFileSync(migration,'utf8'));
 await test('migration installation preserves all existing identities flags registry and role defaults',async()=>{
  assert.deepEqual((await db.query(preserveSql)).rows[0],beforeMigration);
  assert.equal(staff.filter(a=>a.eligible).length,57);
  assert.equal(staff.filter(a=>a.eligible&&a.migrated_user_id).length,10);
  assert.equal(staff.filter(a=>a.eligible&&!a.migrated_user_id).length,47);
  assert.equal(identities.length,11);
 });
 await test('snapshot Auth session fields are used without refresh timestamp assumptions',async()=>{
  for(const c of ['id','user_id','created_at','not_after']) assert(schema.some(x=>x.table_schema==='auth'&&x.table_name==='sessions'&&x.column_name===c));
  const target=staff.find(x=>x.canonical_key==='haif').migrated_user_id;
  const sid='00000000-0000-4000-8000-000000000101';
  await db.query("insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp()-interval '1 minute')",[sid,target]);
  assert.equal(await scalar('select public.account_session_check_internal($1,$2,false)',[target,sid]),false);
  assert.equal(await scalar('select public.account_session_check_internal($1,$2,true)',[target,sid]),true);
  assert.equal(await scalar('select public.account_session_check_internal($1,$2,true)',[faisal,sid]),false);
 });
 await test('forced bootstrap exposes only recovery state while business access remains denied',async()=>{
  const target=staff.find(a=>a.canonical_key==='haif').migrated_user_id;
  await claims(target,'00000000-0000-4000-8000-000000000101');
  await db.exec('set role authenticated');
  try{
   const p=await scalar('select public.my_profile()');
   assert.equal(p.must_change_password,true);assert.equal(p.can_edit_email,false);
   assert.equal(p.email,undefined);assert.equal(p.name,undefined);
   await assert.rejects(db.query('select public.list_my_transactions()'),/account unavailable/);
  }finally{await db.exec('reset role');}
 });
 await test('maintenance requires provider operation and generation proof before completion',async()=>{
  const op='00000000-0000-4000-8000-000000000201';
  const r=await scalar('select public.account_password_maintenance_begin_internal($1,$2)',['haif',op]);
  assert.equal(r.status,'pending'); assert.equal(r.generation,1);
  assert.equal(await scalar('select public.account_session_check_internal($1,$2,true)',[r.target_user_id,'00000000-0000-4000-8000-000000000101']),false);
  await assert.rejects(db.query('select public.account_password_finish_internal($1,$2)',[op,1]),/provider proof/);
  await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation',1) where id=$1",[r.target_user_id,op]);
  const done=await scalar('select public.account_password_finish_internal($1,$2)',[op,1]);
  assert.equal(done.status,'completed');
  assert.equal(await scalar('select must_change_password from public.profiles where id=$1',[r.target_user_id]),true);
  const audit=await scalar("select jsonb_build_object('actor',actor_id,'meta',meta) from public.audit_log where event_type='password_operation_completed' and entity_id=$1",[r.target_user_id]);
  assert.equal(audit.actor,null); assert.equal(audit.meta.source,'authorized_maintenance');
  assert.equal((await scalar('select public.account_password_finish_internal($1,$2)',[op,1])).status,'completed');
  assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='password_operation_completed' and entity_id=$1",[r.target_user_id]),1);
 });
 await test('uncertain provider outcome blocks every new operation without lease expiry',async()=>{
  const op='00000000-0000-4000-8000-000000000202';
  const r=await scalar('select public.account_password_maintenance_begin_internal($1,$2)',['bazai',op]);
  assert.equal((await scalar('select public.account_password_unknown_internal($1)',[op])).status,'uncertain');
  assert.equal((await scalar('select public.account_password_status_internal($1)',[op])).status,'uncertain');
  await assert.rejects(db.query('select public.account_password_maintenance_begin_internal($1,$2)',['bazai','00000000-0000-4000-8000-000000000203']),/unresolved/);
  await assert.rejects(db.query('select public.account_password_finish_internal($1,$2)',[op,2]),/generation/);
  await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation',2) where id=$1",[r.target_user_id,op]);
  await assert.rejects(db.query('select public.account_password_finish_internal($1,$2)',[op,1]),/provider proof/);
  await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation',1) where id=$1",[r.target_user_id,op]);
  assert.equal((await scalar('select public.account_password_finish_internal($1,$2)',[op,1])).status,'completed');
  assert.equal((await scalar('select public.account_password_unknown_internal($1)',[op])).status,'completed');
 });
 await test('forced self-change is identity-bound and revokes pre-completion sessions',async()=>{
  const target=staff.find(a=>a.canonical_key==='haif').migrated_user_id;
  const sid='00000000-0000-4000-8000-000000000102',op='00000000-0000-4000-8000-000000000204';
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[sid,target]);
  await assert.rejects(db.query('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[target,sid,'bazai','change',op]),/forbidden/);
  const r=await scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[target,sid,null,'change',op]);
  assert.equal(r.generation,2); assert.equal(r.target_user_id,target);
  await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation',2) where id=$1",[target,op]);
  await scalar('select public.account_password_finish_internal($1,$2)',[op,2]);
  assert.equal(await scalar('select must_change_password from public.profiles where id=$1',[target]),false);
  assert.equal(await scalar("select must_change_password from public.account_migration_users where canonical_key='haif'"),false);
  assert.equal(await scalar('select public.account_session_check_internal($1,$2,false)',[target,sid]),false);
  // A refresh does not replace auth.sessions.created_at; a newer token cannot bypass the cutoff.
  await claims(target,sid);
  assert.equal(await scalar('select app_private.account_access_ready($1)',[target]),false);
  const fresh='00000000-0000-4000-8000-000000000103';
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[fresh,target]);
  await claims(target,fresh);
  assert.equal(await scalar('select app_private.account_access_ready($1)',[target]),true);
  await claims(faisal,fresh);
  assert.equal(await scalar('select app_private.account_access_ready($1)',[target]),false);
 });
 await test('reset requires actual ready office-manager role plus effective permission',async()=>{
  const haif=staff.find(a=>a.canonical_key==='haif').migrated_user_id;
  const op='00000000-0000-4000-8000-000000000205',sid='00000000-0000-4000-8000-000000000104';
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[sid,faisal]);
  await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'profiles.admin_reset_password','allow')",[haif]);
  await assert.rejects(db.query('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[haif,'00000000-0000-4000-8000-000000000103','ceo','reset',op]),/forbidden/);
  await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'profiles.admin_reset_password','deny')",[faisal]);
  await assert.rejects(db.query('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[faisal,sid,'ceo','reset',op]),/forbidden/);
  await db.query("delete from public.user_permissions where user_id=$1 and permission_code='profiles.admin_reset_password'",[faisal]);
  await assert.rejects(db.query('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[faisal,sid,'faisal','reset',op]),/protected/);
  await assert.rejects(db.query('select public.account_password_maintenance_begin_internal($1,$2)',['faisal',op]),/protected/);
  await assert.rejects(db.query('select public.account_password_maintenance_begin_internal($1,$2)',['finance_manager',op]),/invalid account/);
  const r=await scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[faisal,sid,'ceo','reset',op]);
  assert.equal(r.status,'pending');
  assert.equal(await scalar('select must_change_password from public.profiles where id=$1',[r.target_user_id]),true);
  await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation',1) where id=$1",[r.target_user_id,op]);
  await scalar('select public.account_password_finish_internal($1,$2)',[op,1]);
  assert.equal(await scalar('select must_change_password from public.profiles where id=$1',[r.target_user_id]),true);
 });
 await test('all business access is readiness-gated without dropping source scope checks',async()=>{
  const target=staff.find(a=>a.canonical_key==='haif').migrated_user_id;
  const tx='00000000-0000-4000-8000-000000000301';
  await db.query("insert into public.transactions(id,number,title,created_by) values($1,'SQL-TEST','fixture-owned',$2)",[tx,target]);
  await claims(target,'00000000-0000-4000-8000-000000000103');
  assert.equal(await scalar('select app_private.can_view_transaction($1,$2)',[target,tx]),true);
  assert.equal(await scalar("select app_private.has_permission($1,'profiles.admin_reset_password')",[target]),true);
  await claims(target,'00000000-0000-4000-8000-000000000102');
  assert.equal(await scalar('select app_private.can_view_transaction($1,$2)',[target,tx]),false);
  assert.equal(await scalar("select app_private.has_permission($1,'profiles.admin_reset_password')",[target]),false);
  await assert.rejects(db.query('select public.list_my_transactions()'),/account unavailable/);
  await assert.rejects(db.query('select public.transaction_directory_my()'),/account unavailable/);
  await assert.rejects(db.query("select public.my_profile_set_email('fixture@example.invalid')"),/forbidden|account unavailable/);
  await db.exec('set role authenticated');
  try {
   assert.equal(await scalar('select count(*)::int from public.profiles'),0);
   assert.equal(await scalar('select count(*)::int from public.transactions'),0);
  } finally {await db.exec('reset role');}
  await claims(faisal,'00000000-0000-4000-8000-000000000104');
  assert.equal(await scalar('select app_private.can_manage_permissions($1)',[faisal]),true);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:faisal,session_id:'bad-sid'})]);
  assert.equal(await scalar('select app_private.can_manage_permissions($1)',[faisal]),false);
 });
 await test('duplicate self begin only recovers the original bound operation without replay permission',async()=>{
  const target=staff.find(a=>a.canonical_key==='rashid').migrated_user_id;
  const sid='00000000-0000-4000-8000-000000000105',op='00000000-0000-4000-8000-000000000206';
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[sid,target]);
  const args=[target,sid,'rashid','change',op];
  const first=await scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',args);
  assert.equal(first.write_allowed,true);
  const before=await scalar('select row_to_json(c) from app_private.account_credential_state c where user_id=$1',[target]);
  const dup=await scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',args);
  assert.equal(dup.write_allowed,false); assert.equal(dup.generation,first.generation);
  assert.deepEqual(await scalar('select row_to_json(c) from app_private.account_credential_state c where user_id=$1',[target]),before);
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',['00000000-0000-4000-8000-000000000106',target]);
  await assert.rejects(db.query('select public.account_password_begin_internal($1,$2,$3,$4,$5)',[target,'00000000-0000-4000-8000-000000000106','rashid','change',op]),/forbidden|identity conflict/);
  await scalar('select public.account_password_unknown_internal($1)',[op]);
  assert.equal((await scalar('select public.account_password_begin_internal($1,$2,$3,$4,$5)',args)).status,'uncertain');
  await assert.rejects(db.query('select public.account_password_fail_internal($1,$2)',[op,'provider_400']),/uncertain/);
 });
 await test('definite provider rejection records failed but leaves the account forced',async()=>{
  const op='00000000-0000-4000-8000-000000000207';
  const r=await scalar('select public.account_password_maintenance_begin_internal($1,$2)',['ahmad',op]);
  await assert.rejects(db.query('select public.account_password_fail_internal($1,$2)',[op,'unfiltered provider message']),/invalid error code/);
  const failed=await scalar('select public.account_password_fail_internal($1,$2)',[op,'provider_422']);
  assert.equal(failed.status,'failed'); assert.equal(failed.write_allowed,false);
  assert.equal(await scalar('select must_change_password from public.profiles where id=$1',[r.target_user_id]),true);
  await assert.rejects(db.query('select public.account_password_finish_internal($1,$2)',[op,1]),/generation/);
  assert.equal((await scalar('select public.account_password_maintenance_begin_internal($1,$2)',['ahmad','00000000-0000-4000-8000-000000000208'])).generation,2);
 });
 await test('provisioning links only the exact official Auth identity and approved memberships',async()=>{
  const a=staff.find(x=>x.eligible&&!x.migrated_user_id&&x.role_code==='employee'&&x.dept_names[0]?.startsWith('إدارة'));
  const user='00000000-0000-4000-8000-000000001001';
  await db.query('insert into auth.users(id,email) values($1,$2)',[user,a.internal_email]);
  const unit=await scalar('select u.id from public.organizational_units u join public.organizational_units r on r.id=u.parent_id where u.name=$1 and r.name=$2 and r.parent_id is null',[a.dept_names[0],a.org_name]);
  const m=[{unit_id:unit,membership_role:'member',is_primary:true}];
  await assert.rejects(db.query('select public.account_provision_link_internal($1,$2,$3)',[a.canonical_key,faisal,m]),/identity conflict/);
  const result=await scalar('select public.account_provision_link_internal($1,$2,$3)',[a.canonical_key,user,m]);
  assert.equal(result.status,'linked'); assert.equal(result.target_user_id,user);
  const p=await scalar('select row_to_json(p) from public.profiles p where id=$1',[user]);
  assert.equal(p.login_name,a.preferred_login); assert.equal(p.full_name,a.display_name); assert.equal(p.must_change_password,true);
  assert.equal(await scalar('select migrated_user_id from public.account_migration_users where canonical_key=$1',[a.canonical_key]),user);
  assert.equal(await scalar('select role_code from public.user_roles where user_id=$1',[user]),a.role_code);
  assert.equal((await scalar('select public.account_provision_link_internal($1,$2,$3)',[a.canonical_key,user,m])).status,'already_linked');
  assert.deepEqual(await scalar('select row_to_json(p) from public.profiles p where id=$1',[user]),p);
 });
 const {runCases}=await import('./password_security_sql_cases.mjs');
 await runCases({db,staff,schema,scalar,test,faisal,protectedBefore,beforeMigration,sourceDirectory:dir});
 console.log(`LOCAL FIXTURE: ${passed} tests passed; no cloud calls, no live RLS proof.`);
} finally {await db.close();}
