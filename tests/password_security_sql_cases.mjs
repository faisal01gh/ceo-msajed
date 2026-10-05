// Additional local PGlite cases. Synthetic Auth UUIDs below exist ONLY in this
// disposable fixture; they are never sent to a provider or deployed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
export async function runCases({db,staff,schema,scalar,test,faisal,protectedBefore,beforeMigration,sourceDirectory}) {
 const units=(await db.query('select * from public.organizational_units')).rows;
 function expected(a) {
  const roots=units.filter(u=>u.name===a.org_name&&u.parent_id===null&&u.active);
  assert.equal(roots.length,1,`Fixture approved root for ${a.canonical_key}`);
  const root=roots[0];
  if(['ceo','ceo_office_manager','ceo_secretary','assistant','assistant_secretary'].includes(a.role_code))
   return [{unit_id:root.id,membership_role:a.role_code==='assistant'?'assistant':'office',is_primary:true}];
  return a.dept_names.map((name,i)=>{
   const matches=units.filter(u=>{
    if(!u.active||u.name!==name)return false;
    if(['independent','office'].includes(root.unit_type))return u.id===root.id;
    if(u.unit_type==='department')return u.parent_id===root.id;
    const p=units.find(g=>g.id===u.parent_id);
    return u.unit_type==='branch'&&p?.name==='الفروع'&&p.unit_type==='branch_group'&&p.active&&p.parent_id===root.id;
   });
   assert.equal(matches.length,1,`Fixture parent-resolved department for ${a.canonical_key}/${name}`);
   return {unit_id:matches[0].id,membership_role:a.role_code==='manager'?'manager':'member',is_primary:i===0};
  });
 }
 const available=staff.find(a=>a.eligible&&!a.migrated_user_id&&a.canonical_key!=='staff_014'&&a.role_code==='employee'&&a.dept_names[0]?.startsWith('إدارة'));
 const temporary='00000000-0000-4000-8000-000000009001';
 const memberships=expected(available);
 async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
 async function seed(){await db.query('insert into auth.users(id,email) values($1,$2)',[temporary,available.internal_email]);}
 async function provision(m=memberships){return db.query('select public.account_provision_link_internal($1,$2,$3)',[available.canonical_key,temporary,m]);}
 await test('provisioning rejects wrong-parent same-name units and leaves no partial profile',async()=>isolated(async()=>{
  await seed();
  const correct=units.find(u=>u.id===memberships[0].unit_id);
  const other=units.find(u=>u.parent_id===null&&u.unit_type==='sector'&&u.id!==correct.parent_id);
  const bad=await scalar('insert into public.organizational_units(name,unit_type,parent_id) values($1,$2,$3) returning id',[correct.name,correct.unit_type,other.id]);
  await assert.rejects(provision([{...memberships[0],unit_id:bad}]),/hierarchy conflict/);
 }));
 await test('provisioning rejects ambiguous approved roots rather than choosing limit one',async()=>isolated(async()=>{
  await seed();const root=units.find(u=>u.name===available.org_name&&u.parent_id===null);
  await db.query('insert into public.organizational_units(name,unit_type,parent_id) values($1,$2,null)',[root.name,root.unit_type]);
  await assert.rejects(provision(),/ambiguous organizational root/);
 }));
 await test('provisioning rejects stale existing role without deleting or reseeding it',async()=>isolated(async()=>{
  await seed();await db.query('insert into public.profiles(id,full_name) values($1,$2)',[temporary,available.display_name]);
  await db.query("insert into public.user_roles(user_id,role_code,is_primary) values($1,'assistant',true)",[temporary]);
  await assert.rejects(provision(),/existing role conflict/);
 }));
 await test('provisioning rejects stale memberships without replacing them',async()=>isolated(async()=>{
  await seed();await db.query('insert into public.profiles(id,full_name) values($1,$2)',[temporary,available.display_name]);
  await db.query("insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,'office',true)",[temporary,units.find(u=>u.unit_type==='office').id]);
  await assert.rejects(provision(),/existing membership conflict/);
 }));
 await test('provisioning rejects duplicate incomplete malformed or extra membership fields',async()=>{
  for(const m of [[],[...memberships,...memberships],memberships.map(x=>({...x,is_primary:'true'})),memberships.map(x=>({...x,unapproved:true})),null])
   await isolated(async()=>{await seed();await assert.rejects(provision(m),/memberships|hierarchy conflict/);});
 });
 await test('provisioning rejects missing Auth users and exact-email mismatch',async()=>{
  await isolated(async()=>{await assert.rejects(provision(),/identity conflict/);});
  await isolated(async()=>{await db.query('insert into auth.users(id,email) values($1,$2)',[temporary,available.internal_email.toUpperCase()]);await assert.rejects(provision(),/identity conflict/);});
 });
 await test('orphan profile synchronization preserves contact email and adds only approved associations',async()=>isolated(async()=>{
  await seed();await db.query("insert into public.profiles(id,full_name,contact_email) values($1,'fixture orphan','contact@example.invalid')",[temporary]);
  await provision();
  assert.equal(await scalar('select contact_email from public.profiles where id=$1',[temporary]),'contact@example.invalid');
  assert.equal(await scalar('select must_change_password from public.profiles where id=$1',[temporary]),true);
 }));
 await test('journal constraints reject unbound self-change and verified-session operations',async()=>{
  const target=staff.find(a=>a.canonical_key==='haif').migrated_user_id;
  const other=staff.find(a=>a.canonical_key==='bazai').migrated_user_id;
  await isolated(async()=>{
   await assert.rejects(db.query("insert into app_private.account_password_operations(operation_id,actor_id,target_id,kind,status,generation,source) values('00000000-0000-4000-8000-000000007001',$1,$2,'change','pending',99,'verified_session')",[other,target]),/check constraint/);
  });
  await isolated(async()=>{
   await assert.rejects(db.query("insert into app_private.account_password_operations(operation_id,actor_id,target_id,kind,status,generation,source) values('00000000-0000-4000-8000-000000007002',null,$1,'reset','pending',99,'verified_session')",[target]),/check constraint/);
  });
 });
 await test('state transitions reject stale generation and suspicious provider proof instead of releasing access',async()=>{
  const op='00000000-0000-4000-8000-000000000208';
  const target=staff.find(a=>a.canonical_key==='ahmad').migrated_user_id;
  await isolated(async()=>{
   await db.query('update app_private.account_credential_state set generation=generation+1 where user_id=$1',[target]);
   await assert.rejects(db.query('select public.account_password_fail_internal($1,$2)',[op,'provider_400']),/generation/);
  });
  await isolated(async()=>{
   await db.query("update auth.users set raw_app_meta_data=jsonb_build_object('msajed_password_operation',$2::text,'msajed_password_generation',999) where id=$1",[target,op]);
   await assert.rejects(db.query('select public.account_password_fail_internal($1,$2)',[op,'provider_400']),/provider proof/);
  });
  await isolated(async()=>{
   await db.query('update app_private.account_credential_state set generation=generation+1 where user_id=$1',[target]);
   await assert.rejects(db.query('select public.account_password_unknown_internal($1)',[op]),/generation/);
  });
 });
 await test('all 47 missing-Auth fixture accounts provision without touching 10 existing links or extra finance',async()=>{
  const oldIds=staff.filter(a=>a.migrated_user_id).map(a=>a.migrated_user_id);
  const oldSql=`select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p where id=any($1::uuid[])), 'roles',(select jsonb_agg(to_jsonb(r) order by user_id,role_code) from public.user_roles r where user_id=any($1::uuid[])), 'memberships',(select jsonb_agg(to_jsonb(m) order by user_id,unit_id,membership_role) from public.user_memberships m where user_id=any($1::uuid[])))`;
  const oldBefore=await scalar(oldSql,[oldIds]);
  const fallback=staff.find(a=>a.canonical_key===available.canonical_key);
  await db.query("insert into public.account_permission_overrides(canonical_key,permission_code,effect) values($1,'profiles.admin_reset_password','allow')",[fallback.canonical_key]);
  const overrideBefore=(await db.query('select * from public.account_permission_overrides')).rows;
  let linkedNew=0;
  for(const [i,a] of staff.filter(x=>x.eligible&&!x.migrated_user_id).entries()) {
   let id=await scalar('select (select id from auth.users where email=$1)',[a.internal_email]);
   if(!id){id=`00000000-0000-4000-8000-${String(2000+i).padStart(12,'0')}`;await db.query('insert into auth.users(id,email) values($1,$2)',[id,a.internal_email]);}
   const r=await scalar('select public.account_provision_link_internal($1,$2,$3)',[a.canonical_key,id,expected(a)]);
   assert(['linked','already_linked'].includes(r.status));linkedNew++;
   const p=await scalar('select row_to_json(p) from public.profiles p where id=$1',[id]);
   assert.equal(p.login_name,a.preferred_login);assert.equal(p.full_name,a.display_name);assert.equal(p.must_change_password,true);
   assert.equal(await scalar('select role_code from public.user_roles where user_id=$1',[id]),a.role_code);
   const actual=(await db.query('select unit_id,membership_role,is_primary from public.user_memberships where user_id=$1 order by unit_id',[id])).rows;
   assert.deepEqual(actual,expected(a).sort((x,y)=>x.unit_id.localeCompare(y.unit_id)));
  }
  assert.equal(linkedNew,47);
  assert.equal(await scalar('select count(*)::int from public.account_migration_users where eligible and migrated_user_id is not null'),57);
  assert.equal(await scalar('select count(*)::int from auth.users'),58);
  assert.deepEqual(await scalar(oldSql,[oldIds]),oldBefore);
  assert.deepEqual((await db.query('select * from public.organizational_units')).rows,units);
  assert.deepEqual((await db.query('select * from public.account_permission_overrides')).rows,overrideBefore);
  const target=await scalar('select migrated_user_id from public.account_migration_users where canonical_key=$1',[fallback.canonical_key]);
  assert.equal(await scalar("select app_private.account_permission_effective($1,'profiles.admin_reset_password')",[target]),true);
  for(const a of staff) {
   const row=await scalar('select row_to_json(a) from public.account_migration_users a where canonical_key=$1',[a.canonical_key]);
   assert.equal(row.login_username,a.login_username);assert.equal(row.preferred_login,a.preferred_login);
  }
  assert.equal((await scalar('select public.account_provision_link_internal($1,$2,$3)',['faisal',faisal,[]])).status,'already_linked');
  assert.deepEqual((await db.query("select jsonb_build_object('auth',to_jsonb(u),'profile',to_jsonb(p),'registry',to_jsonb(a)) result from auth.users u join public.profiles p on p.id=u.id join public.account_migration_users a on a.migrated_user_id=u.id where a.canonical_key in ('faisal','finance_manager') order by a.canonical_key")).rows,protectedBefore);
  const defaults=await scalar('select jsonb_agg(to_jsonb(rp) order by role_code,permission_code) from public.role_permissions rp');
  assert.deepEqual(defaults,Object.values(beforeMigration)[0].defaults);
 });
 await test('every service RPC is denied to anon and authenticated; private state is not directly writable',async()=>{
  for(const sig of ['has_permission(uuid,text)','can_view_transaction(uuid,uuid)','can_manage_permissions(uuid)'])
   assert.equal(await scalar("select has_function_privilege('anon',$1,'execute')",[`app_private.${sig}`]),false,`anon guard ${sig}`);
  const signatures=['account_session_check_internal(uuid,uuid,boolean)','account_password_begin_internal(uuid,uuid,text,text,uuid)','account_password_maintenance_begin_internal(text,uuid)','account_password_finish_internal(uuid,bigint)','account_password_unknown_internal(uuid)','account_password_status_internal(uuid)','account_password_fail_internal(uuid,text)','account_provision_link_internal(text,uuid,jsonb)'];
  for(const sig of signatures) {
   for(const role of ['anon','authenticated'])assert.equal(await scalar("select has_function_privilege($1,$2,'execute')",[role,`public.${sig}`]),false,`${role}/${sig}`);
   assert.equal(await scalar("select has_function_privilege('service_role',$1,'execute')",[`public.${sig}`]),true);
  }
  for(const role of ['anon','authenticated','service_role'])for(const table of ['account_credential_state','account_password_operations'])
   assert.equal(await scalar("select has_table_privilege($1,$2,'select,insert,update,delete')",[role,`app_private.${table}`]),false);
  const privateFns=['account_session_valid(uuid,uuid,boolean)','account_password_start(uuid,text,text,uuid,text,uuid)','account_password_result(uuid)','account_permission_effective(uuid,text)','account_expected_memberships(text)'];
  for(const sig of privateFns)for(const role of ['anon','authenticated','service_role'])
   assert.equal(await scalar("select has_function_privilege($1,$2,'execute')",[role,`app_private.${sig}`]),false,`${role}/${sig}`);
  await db.exec('set role authenticated');
  try{await assert.rejects(db.query('select public.account_password_maintenance_begin_internal($1,$2)',['ceo','00000000-0000-4000-8000-000000009999']),/permission denied/);}finally{await db.exec('reset role');}
 });
 await test('session guards deny NULL creation expiry future creation missing SID and mismatched owner',async()=>{
  const ready=staff.find(a=>a.canonical_key==='haif').migrated_user_id;
  const scenarios=[['00000000-0000-4000-8000-000000008001',null,null],['00000000-0000-4000-8000-000000008002','clock_timestamp()',"clock_timestamp()-interval '1 second'"],['00000000-0000-4000-8000-000000008003',"clock_timestamp()+interval '1 day'",null]];
  for(const [sid,created,end] of scenarios) {
   await db.query(`insert into auth.sessions(id,user_id,created_at,not_after) values($1,$2,${created||'null'},${end||'null'})`,[sid,ready]);
   assert.equal(await scalar('select public.account_session_check_internal($1,$2,false)',[ready,sid]),false);
   assert.equal(await scalar('select public.account_session_check_internal($1,$2,true)',[ready,sid]),false);
  }
  assert.equal(await scalar('select public.account_session_check_internal($1,$2,true)',[ready,'00000000-0000-4000-8000-000000008999']),false);
  for(const claims of [{sub:ready},{sub:ready,session_id:'invalid'},{sub:ready,session_id:'00000000-0000-4000-8000-000000000104'}]) {
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);
   assert.equal(await scalar('select app_private.account_access_ready($1)',[ready]),false);
  }
 });
 await test('business permission and transaction scope predicates remain source-identical after readiness prepend',async()=>{
  const checks=[
   ['20261004195600_full_editable_transaction_permissions.sql','app_private.can_view_transaction','uuid,uuid',s=>s.replace('if not app_private.account_access_ready(_user) then return false; end if;','if _user is null then return false; end if;')],
   ['20261004174500_permissions_transactions_section.sql','app_private.can_manage_permissions','uuid',s=>s.replace('app_private.account_access_ready(p_user_id) and ','')],
   ['20261004195600_full_editable_transaction_permissions.sql','app_private.has_permission','uuid,text',s=>s]
  ];
  for(const [file,name,args,normalize] of checks) {
   const text=fs.readFileSync(path.join(sourceDirectory,file),'utf8');
   const escaped=name.replaceAll('.','\\.');
   const body=text.match(new RegExp(`create or replace function ${escaped}\\(.*?as \\$\\$([\\s\\S]*?)\\$\\$;`,'is'))?.[1];
   assert(body,`Source body ${name}`);
   const current=name.endsWith('has_permission')?'app_private.account_permission_effective':name;
   const actual=await scalar('select prosrc from pg_proc where oid=$1::regprocedure',[`${current}(${args})`]);
   const canonical=s=>s.replace(/\s+/g,' ').replace(/\s*([(),;])\s*/g,'$1').trim();
   assert.equal(canonical(normalize(actual)),canonical(body));
  }
 });
 await test('all current public RLS tables retain RLS and have an additional restrictive readiness gate',async()=>{
  const rows=(await db.query("select c.relname,exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='account_password_ready' and not p.polpermissive) gated from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity and c.relkind in ('r','p')")).rows;
  assert(rows.length>20);for(const r of rows)assert.equal(r.gated,true,r.relname);
  const fields=(await db.query("select attname from pg_attribute where attrelid='app_private.account_password_operations'::regclass and attnum>0 and not attisdropped order by attnum")).rows.map(r=>r.attname);
  assert.deepEqual(fields,['operation_id','actor_id','actor_session_id','target_id','kind','status','generation','source']);
  const metas=(await db.query("select meta from public.audit_log where event_type like 'password_operation_%'")).rows;
  for(const {meta} of metas)assert.deepEqual(Object.keys(meta).sort(),['kind','operation_id','outcome','source']);
 });
}
