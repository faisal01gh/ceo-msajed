// Actual intercepted Edge PATCHes -> actual local PostgreSQL custody/list.
// Synthetic Auth only. Not native provider/Auth/deployed acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createTransactionFeedbackFixture} from './transaction_feedback_sql_fixture.mjs';
const root=path.resolve(import.meta.dirname,'..');
const run=spawnSync('deno',['test','--cached-only','--allow-env','--allow-read','tests/transaction_feedback_edge_test.ts'],{cwd:root,encoding:'utf8',maxBuffer:1024*1024});
assert.equal(run.status,0,'actual intercepted Edge gate failed: '+run.stdout+'\n'+run.stderr);
const line=run.stdout.split(/\r?\n/).find(x=>x.startsWith('__OWNERSHIP_SQL_BRIDGE__'));
assert.ok(line,'actual handler did not emit ownership PATCH witness');
const witness=JSON.parse(line.slice('__OWNERSHIP_SQL_BRIDGE__'.length));
assert.deepEqual(witness.patches.map(x=>x.action),['change_responsible_unit','change_responsible','decide_request']);
const {db,scalar,id,actors,unit,tx,claims,dir}=await createTransactionFeedbackFixture();
let checked=0,negativeControls=0;
try{
 const uid=witness.targetId,sid='50000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users(id,email) values($1,$2)',[uid,'bridge-target@fixture.invalid']);
 await db.query('insert into public.profiles(id,login_name,full_name,must_change_password) values($1,$2,$3,false)',[uid,'fixture_target','مسؤول تجريبي']);
 await db.query("insert into public.user_roles(user_id,role_code,is_primary) values($1,'manager',true)",[uid]);
 await db.query(`insert into public.account_migration_users(canonical_key,login_username,preferred_login,display_name,role_code,org_name,dept_names,internal_email,eligible,migrated_user_id,must_change_password) values('fixture_bridge_target','fixture_bridge_target','fixture_target','مسؤول تجريبي','manager','fixture root',ARRAY['bridge dept'],'bridge-target@fixture.invalid',true,$1,false)`,[uid]);
 await db.query('insert into app_private.account_credential_state(user_id) values($1)',[uid]);
 await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[sid,uid]);
 await db.query("insert into public.organizational_units(id,name,unit_type,parent_id) values($1,'bridge dept','department',$2)",[witness.unit,unit.root]);
 await db.query("insert into public.user_memberships(user_id,unit_id,membership_role,is_primary) values($1,$2,'manager',true)",[uid,witness.unit]);
 const allowed=new Set(['responsible_unit_id','responsible_user_id','responsible_login_name','responsible_name','updated_at','last_activity_at']);
 async function exercise(patch){
  await db.exec('begin');
  try{
   // Previous responsible is not the creator: a stale UUID cannot hide behind creator visibility.
   await db.query(`update public.transactions set created_by=$2,responsible_user_id=$3,responsible_login_name='employee',responsible_name='employee display',responsible_unit_id=$4,current_level='manager',workflow_started=false where id=$1`,[tx,actors.assistant,actors.employee,witness.unit]);
   const entries=Object.entries(patch);assert.ok(entries.every(([k])=>allowed.has(k)),'unexpected actual PATCH column');
   const columns=entries.map(([key],i)=>`"${key}"=$${i+2}`).join(',');
   await db.query(`update public.transactions set ${columns} where id=$1`,[tx,...entries.map(([,v])=>v)]);
   const t=await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tx]);
   const f=await scalar('select public.transaction_feedback_flags_internal($1,$2)',[uid,tx]);
   assert.equal(f.incoming,true,'target_not_incoming');
   assert.equal(t.responsible_user_id,uid);assert.equal(t.responsible_login_name,'fixture_target');assert.equal(t.responsible_name,'مسؤول تجريبي');
   assert.equal((await scalar('select public.transaction_feedback_flags_internal($1,$2)',[actors.employee,tx])).incoming,false,'old UUID kept incoming');
   assert.deepEqual(f.current_assignees,['مسؤول تجريبي']);
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,session_id:sid,role:'authenticated'})]);
   await db.exec('set local role authenticated');
   const list=await scalar("select public.list_my_transactions('incoming')");await db.exec('reset role');
   assert.ok(list.rows.some(r=>r.id===tx),'actual authenticated target incoming list omitted PATCH result');
  }finally{await db.exec('rollback');}
 }
 for(const item of witness.patches){
  // Negative control removes only the synchronized UUID, reproducing the reported bug.
  const broken={...item.patch};delete broken.responsible_user_id;
  await assert.rejects(exercise(broken),/target_not_incoming/);negativeControls++;
  await exercise(item.patch);checked++;console.log('PASS actual Edge PATCH -> SQL: '+item.action);
 }
 // Export an unaltered real SQL receipt for the actual renderer's consumer probe.
 await db.exec(fs.readFileSync(path.join(dir,'20261006194500_transaction_assistant_reply.sql'),'utf8'));
 const source=id(301),operation=id(401),response='الرد المعتمد للاختبار';
 await db.query(`update public.transactions set created_by=$2,responsible_user_id=$2,responsible_login_name='fixture_manager',responsible_name='manager display',current_level='assistant',close_level='assistant',workflow_started=true where id=$1`,[tx,actors.manager]);
 await db.query(`insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,from_role,from_login_name,from_name,to_user_id,to_login_name,to_name,status) values($1,$2,'raise',$3,'manager','fixture_manager','manager display',$4,'assistant','assistant display','completed')`,[source,tx,actors.manager,actors.assistant]);
 const transaction=await scalar('select to_jsonb(t) from public.transactions t where id=$1',[tx]);
 const receipt=await scalar('select public.transaction_reply_raise_internal($1,$2,$3,$4,$5,$6)',[actors.assistant,id(1003),tx,source,response,operation]);
 assert.equal(receipt.transaction_id,tx);assert.equal(receipt.source_route_id,source);assert.equal(receipt.operation_id,operation);assert.equal(receipt.actor_user_id,actors.assistant);assert.equal(receipt.target_user_id,actors.manager);
 const replay=await scalar('select public.transaction_reply_raise_internal($1,$2,$3,$4,$5,$6)',[actors.assistant,id(1003),tx,source,response,operation]);
 assert.equal(replay.replayed,true);assert.equal(replay.reply_route_id,receipt.reply_route_id);
 await claims(actors.assistant);await db.exec('set role authenticated');
 let profile;
 try{profile=await scalar('select public.my_profile()');}finally{await db.exec('reset role');}
 assert.equal(profile.ok,true);assert.equal(profile.user_id,actors.assistant);assert.equal(profile.must_change_password,false);
 const artifact=path.resolve(process.argv[2]||'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/transaction-feedback-parity/sql-receipt.json');
 fs.mkdirSync(path.dirname(artifact),{recursive:true});fs.writeFileSync(artifact,JSON.stringify({transaction,response,profile,receipt,replay},null,2)+'\n','utf8');
 console.log(JSON.stringify({checked,negativeControls,actualSqlReceipt:artifact,network:'none; SDK fetch entirely intercepted',evidence:'actual handler payload -> normalized local SQL; not cloud/auth E2E'}));
}finally{await db.close();}
