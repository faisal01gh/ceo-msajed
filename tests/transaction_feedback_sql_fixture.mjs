// Network-free PGlite predecessor fixture. All Auth identities/sessions are synthetic.
// Historical semantic order/DDL delimiter normalizations and the excluded real-account
// repair are fixture-only: this is NOT proof of replaying the complete migration chain.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export const DEFAULT_PGLITE_MODULE='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/password-security-sql/node_modules/@electric-sql/pglite/dist/index.js';
export async function createTransactionFeedbackFixture({modulePath=DEFAULT_PGLITE_MODULE,applyFoundation=true}={}){
const root=path.resolve(import.meta.dirname,'..');
const dir=path.join(root,'supabase/migrations');
const filename='20261006193000_transaction_custody_read_state.sql';
const {PGlite}=await import(pathToFileURL(path.resolve(modulePath)).href);
const db=new PGlite();
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actors={employee:id(1),manager:id(2),assistant:id(3),ceo:id(4),secretary:id(5),otherAssistant:id(6),otherSecretary:id(7),stranger:id(8)};
const unit={root:id(101),dept:id(102),otherRoot:id(103),otherDept:id(104)};
const tx=id(201);
const claims=async user=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:id(1000+Number(user.slice(-12))),role:'authenticated'})]);
try{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key,email text unique,raw_app_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz,not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 grant usage on schema auth to authenticated,service_role;
 grant execute on function auth.uid(),auth.jwt() to authenticated,service_role;
 set check_function_bodies=off;`);
 // Historical fixture-only normalizations inherited from password_security_sql.mjs:
 // semantic foundation order, absent auth_migration_accounts index file, and two
 // unterminated dump function delimiters. Prior files are NEVER changed.
 const prior=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<filename&&f!=='20261003180502_migration_role_indexes.sql').sort();
 prior.splice(prior.indexOf('20261002_transactions_foundation.sql'),1);
 prior.unshift('20261002_transactions_foundation.sql');
 for(const file of prior){
  let sql=fs.readFileSync(path.join(dir,file),'utf8').replace(/\$function\$\s*(?=revoke)/gi,'$function$;\n');
  // Exclude the historical hardcoded real-account role/membership repair.
  // This is predecessor-shape setup, not an account replay.
  if(file==='20261004174500_permissions_transactions_section.sql') sql=sql.replace(/update public\.account_migration_users[\s\S]*?(?=create or replace function)/,'');
  try{await db.exec(sql);}catch(e){throw new Error(`Fixture ${file}: ${e.message}`);}
 }
 // Synthetic local identities only; no registry/profile snapshot, password, or token files.
 for(const [key,user] of Object.entries(actors)){
  const role=key==='secretary'||key==='otherSecretary'?'assistant_secretary':key==='otherAssistant'?'assistant':key==='stranger'?'employee':key;
  await db.query('insert into auth.users(id,email) values($1,$2)',[user,`${key}@fixture.invalid`]);
  await db.query('insert into public.profiles(id,login_name,full_name,must_change_password) values($1,$2,$3,false)',[user,key,`${key} display`]);
  await db.query('insert into public.user_roles(user_id,role_code,is_primary) values($1,$2,true)',[user,role]);
  await db.query(`insert into public.account_migration_users(canonical_key,login_username,preferred_login,display_name,role_code,org_name,dept_names,internal_email,eligible,migrated_user_id,must_change_password) values($1,$1,$1,$2,$3,'fixture root',ARRAY['fixture dept'],$4,true,$5,false)`,[ `fixture_${key.toLowerCase()}`,`${key} display`,role,`${key}@fixture.invalid`,user]);
  await db.query('insert into app_private.account_credential_state(user_id) values($1)',[user]);
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[id(1000+Number(user.slice(-12))),user]);
 }
 // Preserve a 57+8 identity-shaped fixture without reading or replaying any live identity.
 // These 57 deliberately unready synthetic staff profiles are never login-test actors.
 for(let n=1;n<=57;n++){
  const uid=id(8000+n);
  await db.query('insert into auth.users(id,email) values($1,$2)',[uid,`synthetic-staff-${n}@fixture.invalid`]);
  await db.query("insert into public.profiles(id,login_name,full_name,active,must_change_password) values($1,$2,$2,false,true)",[uid,`synthetic_staff_${n}`]);
  await db.query("insert into public.user_roles(user_id,role_code,is_primary) values($1,'employee',true)",[uid]);
 }
 await db.query("insert into public.user_permissions(user_id,permission_code,effect) values($1,'transactions.create','deny'),($2,'transactions.ceo_view','allow')",[actors.stranger,actors.otherAssistant]);
 await db.query("insert into public.account_permission_overrides(canonical_key,permission_code,effect) values('fixture_stranger','transactions.ceo_view','allow')");
 await db.exec(`insert into public.organizational_units(id,name,unit_type,parent_id) values('${unit.root}','fixture root','sector',null),('${unit.dept}','fixture dept','department','${unit.root}'),('${unit.otherRoot}','other root','sector',null),('${unit.otherDept}','other dept','department','${unit.otherRoot}');`);
 for(const [key,uid,mr] of [['employee',unit.dept,'member'],['manager',unit.dept,'manager'],['assistant',unit.root,'assistant'],['secretary',unit.root,'office'],['otherAssistant',unit.otherRoot,'assistant'],['otherSecretary',unit.otherRoot,'office'],['stranger',unit.otherDept,'member']]) await db.query('insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,$3,true)',[actors[key],uid,mr]);
 await db.query(`insert into public.transactions(id,number,title,created_by,created_by_name,responsible_user_id,responsible_login_name,responsible_name,responsible_unit_id,current_level) values($1,'FIX-001','synthetic custody',$2,'employee',$2,'employee','employee display',$3,'employee')`,[tx,actors.employee,unit.dept]);
 await claims(actors.employee);
 const preserveSql=`select jsonb_build_object(
 'auth',(select jsonb_agg(to_jsonb(x) order by id) from auth.users x),
 'sessions',(select jsonb_agg(to_jsonb(x) order by id) from auth.sessions x),
 'profiles',(select jsonb_agg(to_jsonb(x) order by id) from public.profiles x),
 'roles',(select jsonb_agg(to_jsonb(x) order by user_id,role_code) from public.user_roles x),
 'memberships',(select jsonb_agg(to_jsonb(x) order by user_id,unit_id,membership_role) from public.user_memberships x),
 'units',(select jsonb_agg(to_jsonb(x) order by id) from public.organizational_units x),
 'registry',(select jsonb_agg(to_jsonb(x) order by canonical_key) from public.account_migration_users x),
 'overrides',(select jsonb_agg(to_jsonb(x) order by user_id,permission_code) from public.user_permissions x),
 'canonical_overrides',(select jsonb_agg(to_jsonb(x) order by canonical_key,permission_code) from public.account_permission_overrides x),
 'credentials',(select jsonb_agg(to_jsonb(x) order by user_id) from app_private.account_credential_state x),
 'password_operations',(select jsonb_agg(to_jsonb(x) order by operation_id) from app_private.account_password_operations x),
 'transactions',(select jsonb_agg(to_jsonb(x)-'activity_revision' order by id) from public.transactions x))`;
 const preserved=await scalar(preserveSql);
 const defaults=(await db.query('select role_code,permission_code from public.role_permissions order by role_code,permission_code')).rows;
 await db.exec('set check_function_bodies=on');
 if(applyFoundation) await db.exec(fs.readFileSync(path.join(dir,filename),'utf8'));
 return {db,scalar,id,actors,unit,tx,claims,preserved,defaults,preserveSql,dir};
}catch(e){await db.close();throw e;}
}
