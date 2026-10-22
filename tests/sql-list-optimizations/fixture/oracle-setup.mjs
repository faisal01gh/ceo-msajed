// UNEXECUTED OWNED SYNTHETIC PGLITE SOURCE HARNESS. No native transport or process creation.
// Parent must supply an already connected, separately authorized disposable EMPTY
// native database client. Never use production or an identity/business database.
// All generated fixture DDL/DML is rolled back. No install or native command here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalShape,buildShape,sha} from './shape.mjs';
import {repoRoot as root,packageRoot} from '../config.mjs';
const native=packageRoot+'/fixture/frozen',pins=[{"file":"BEFORE_NATIVE_app_private_account_permission_effective.sql","sha256":"9ceed04a16e31ec16e224134bebdf4fa5515394aefc8c7bfc1d6df7881385175","bytes":837},{"file":"BEFORE_NATIVE_app_private_list_transactions_current.sql","sha256":"2f847228d9386770dbab25b1074a69877ab9f77b0c908bba0c4ff10279e5b9d9","bytes":1552},{"file":"BEFORE_NATIVE_app_private_transaction_feedback_flags.sql","sha256":"a35f97c40d3d358c6ba3bdb2121750275a417d1f7e02409ae0f78988630812a5","bytes":11280},{"file":"BEFORE_NATIVE_list_my_transactions.sql","sha256":"9946a90d00cb0e4a1d67dd321293fad9b371d1d257b2e60456dd33554873c973","bytes":716},{"file":"BEFORE_NATIVE_public_list_transactions_internal.sql","sha256":"d059bba046f481dd55bfff5b9d7800a4d426a7c14b7e1faccf42fc537afcb1b8","bytes":9437},{"file":"BEFORE_NATIVE_public_user_context_internal.sql","sha256":"a393c2a67e78b7217f95de17da611b41b63a28684ae3e75b55e26a1c12d00389","bytes":1501}];
export async function runSetup(client, hook){
 const db={query:(sql,args)=>client.query(sql,args),exec:sql=>client.exec(sql)};
 const id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const roles=['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'];
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const claims=async n=>db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id(n),session_id:id(1000+n),role:'authenticated'})]);
 for(const pin of pins)assert.equal(sha(fs.readFileSync(native+'/'+pin.file)),pin.sha256,'frozen source pin '+pin.file);
 assert.equal(Number(await scalar("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') and c.relkind in ('r','p')")),0,'EMPTY disposable fixture database required');
 for(const name of ['anon','authenticated','service_role'])assert.equal(Number(await scalar('select count(*) from pg_roles where rolname=$1',[name])),0,'fresh disposable cluster roles required');
 const result={kind:'SYNTHETIC_PGLITE_SOURCE_OFFLINE',sourcePins:pins,executed:true,loadAcceptance:'FAILED',samples:[],regressionRed:false};
 await db.exec('begin');
 try {
 await buildShape(db,canonicalShape(root));
 for(const pin of pins.filter(p=>p.file.endsWith('.sql')))await db.exec(fs.readFileSync(native+'/'+pin.file,'utf8'));
 const current553=fs.readFileSync(root+'/supabase/migrations/20261013190200_list_requester_context.sql','utf8');
 assert.equal(sha(current553),'553cd6dcc1ed5e0a76feb33f8e1c6b5ed8f488f8156e22e0aff2553373c67c4c');
 await db.exec(current553);
 // Generated catalog/grants are fixture inputs, never copied identities or business rows.
 for(const role of roles)await db.query('insert into public.roles(code,name_ar) values($1,$1)',[role]);
 const permissions=['transactions.create','transactions.view_all','transactions.act_all','transactions.close','transactions.assign_sector','transactions.assign_cross_sector','transactions.transfer_assistant','transactions.reply_raise','profiles.edit_email'];
 for(const permission of permissions)await db.query('insert into public.permissions(code,name_ar) values($1,$1)',[permission]);
 for(const role of roles)for(const permission of ['transactions.create',...(role.startsWith('ceo')?['transactions.view_all','transactions.act_all']:[])])await db.query('insert into public.role_permissions values($1,$2)',[role,permission]);
 await db.query("insert into public.organizational_units(id,name,unit_type,parent_id) values($1,'Synthetic sector','sector',null),($2,'Synthetic department','department',$1),($3,'Other sector','sector',null),($4,'Other department','department',$3)",[id(201),id(202),id(203),id(204)]);
 for(let n=1;n<=80;n++){
  const role=roles[(n-1)%7],login=`synthetic_${n}`,org=n%2?'Synthetic sector':'Other sector',dept=n%2?'Synthetic department':'Other department';
  await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),login+'@fixture.invalid']);
  await db.query('insert into public.profiles(id,login_name,full_name,must_change_password) values($1,$2,$3,false)',[id(n),login,`Synthetic staff ${n}`]);
  await db.query('insert into public.user_roles(user_id,role_code,is_primary) values($1,$2,true)',[id(n),role]);
  await db.query('insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,$3,true)',[id(n),id((role==='assistant'||role==='assistant_secretary')?(n%2?201:203):(n%2?202:204)),role==='assistant'?'assistant':role==='manager'?'manager':role==='assistant_secretary'?'office':'member']);
  await db.query('insert into public.account_migration_users(canonical_key,preferred_login,display_name,role_code,org_name,dept_names,internal_email,migrated_user_id,must_change_password,login_username) values($1,$1,$2,$3,$4,$5,$6,$7,false,$1)',[login,`Synthetic staff ${n}`,role,org,[dept],login+'@fixture.invalid',id(n)]);
  await db.query('insert into app_private.account_credential_state(user_id) values($1)',[id(n)]);
  await db.query("insert into auth.sessions(id,user_id,created_at) values($1,$2,now()-interval '1 minute')",[id(1000+n),id(n)]);
 }
 for(let n=1;n<=120;n++){
  const actor=(n-1)%80+1,status=n%9===0?'closed':n%11===0?'cancelled':'open';
  await db.query(`insert into public.transactions(id,number,title,subject,created_by,created_by_name,responsible_user_id,responsible_login_name,responsible_name,responsible_unit_id,current_level,status,closed_at,created_at,due_at,workflow_started,activity_revision)
    values($1,$2,$3,'Synthetic only',$4,$5,$4,$6,$5,$7,$8,$9,case when $9='closed' then timestamptz '2026-10-12' end,timestamptz '2026-10-01'+($10%3)*interval '1 day',timestamptz '2026-10-03',true,2)`,[id(10000+n),`SYN-${String(n).padStart(4,'0')}`,n%2?'Synthetic alpha':'Synthetic beta',id(actor),`Synthetic staff ${actor}`,`synthetic_${actor}`,id(n%2?202:204),n%3?'manager':'assistant',status,n]);
  await db.query('insert into public.transaction_periods(transaction_id,cycle_no,started_at) values($1,1,$2)',[id(10000+n),'2026-10-01T00:00:00Z']);
  const aid=id(20000+n);
  await db.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,directive,status,visibility_scope) values($1,$2,$3,$4,'Synthetic assignment','active',$5)",[aid,id(10000+n),id(n%2?202:204),n%5?'responsible':'direct',n%10?'manager_assistant':'assignee']);
  await db.query("insert into public.transaction_assignment_targets(assignment_id,user_id,login_name,display_name) values($1,$2,$3,$4)",[aid,id(actor),`synthetic_${actor}`,`Synthetic staff ${actor}`]);
  for(let j=1;j<=24;j++)await db.query("insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_login_name,to_user_id,to_login_name,status,created_at) values($1,$2,$3,$4,$5,$6,$7,'completed',timestamptz '2026-10-02'+($8%4)*interval '1 hour')",[id(30000+n*30+j),id(10000+n),j%4?'raise':'ceo_view',id(actor),`synthetic_${actor}`,id(j%3===0?4:actor),`synthetic_${j%3===0?4:actor}`,j]);
  if(n%2===0)await db.query('insert into app_private.transaction_read_state(transaction_id,user_id,seen_revision) values($1,$2,$3)',[id(10000+n),id(5),n%4?1:2]);
 }
 await db.exec("update public.transactions set last_activity_at='2026-10-03',updated_at='2026-10-03'");
 for(let n=1;n<=80;n++)if(n!==5)for(let t=1;t<=6;t++)await db.query('insert into app_private.transaction_read_state(transaction_id,user_id,seen_revision) values($1,$2,1)',[id(10000+t),id(n)]);
 for(let n=1;n<=800;n++)await db.query("insert into app_private.account_password_operations(operation_id,actor_id,actor_session_id,target_id,kind,status,generation,source) values($1,$2,$3,$4,'reset','completed',$5,'verified_session')",[id(100000+n),id((n%80)+1),id(1000+(n%80)+1),id(((n+1)%80)+1),n]);
 await db.exec('analyze');

 return await hook(client);
 } finally { await db.exec('rollback'); }
}
