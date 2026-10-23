import fs from 'node:fs';import assert from 'node:assert/strict';import {root,save,sha} from './common.mjs';import {runSetup} from './fixture/oracle-setup.mjs';let stage='setup';
const ident=x=>'"'+x.replaceAll('"','""')+'"';
async function snapshot(d){
 const funcs=(await d.query("select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' id, to_jsonb(p) metadata,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private','auth') order by 1")).rows;
 const catalog={};
 const queries={relations:"select to_jsonb(c) v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') order by c.oid",columns:"select to_jsonb(a) v from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') order by a.attrelid,a.attnum",policies:"select to_jsonb(p) v from pg_policy p order by oid",roles:"select to_jsonb(r) v from pg_roles r order by oid",memberships:"select to_jsonb(m) v from pg_auth_members m order by roleid,member",constraints:"select to_jsonb(c) v from pg_constraint c order by oid",indexes:"select to_jsonb(i) v from pg_index i order by indexrelid",triggers:"select to_jsonb(t) v from pg_trigger t order by oid",namespaces:"select to_jsonb(n) v from pg_namespace n order by oid",types:"select to_jsonb(t) v from pg_type t order by oid",defaults:"select to_jsonb(a) v from pg_attrdef a order by oid",defaultACL:"select to_jsonb(a) v from pg_default_acl a order by oid",settings:"select to_jsonb(s) v from pg_db_role_setting s order by setdatabase,setrole"};
 for(const [k,q] of Object.entries(queries))catalog[k]=(await d.query(q)).rows;
 const data={};const tables=(await d.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') and c.relkind in ('r','p') order by 1,2")).rows;
 for(const t of tables)data[t.schema+'.'+t.name]=(await d.query('select to_jsonb(t) v from '+ident(t.schema)+'.'+ident(t.name)+' t order by to_jsonb(t)::text collate "C"')).rows.map(r=>r.v);
 return {funcs,catalog,data};
}
const id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function focused(d){const cases=[];
 const modes=[['manager_old_allowed_direct_new_hidden',2,'direct','manager',true,false,false],['manager_ended_ordinary_new_hidden',2,'responsible','manager',false,false,false],['assistant_old_allowed_direct_new_hidden',3,'direct','assistant',true,false,false],['assistant_ended_ordinary_new_hidden',3,'responsible','assistant',false,false,false],['uuid_over_legacy_login',2,'responsible','manager',false,false,false,'uuid'],['legacy_login_fallback',2,'responsible','manager',true,true,false,'legacy'],['inactive_membership',2,'direct','manager',false,false,false,'inactive_member'],['inactive_unit',2,'direct','manager',false,false,false,'inactive_unit']];
 for(const [name,actor,oldType,visibility,visible,incoming,scope,special] of modes){stage='focused:'+name;await d.exec('savepoint focused');try{
  const unit=actor===3?202:204;
  await d.query('delete from public.transaction_assignment_targets where assignment_id=$1',[id(20001)]);
  await d.query('delete from public.transaction_assignment_users where assignment_id=$1',[id(20001)]);
  await d.query('delete from public.transaction_routes where transaction_id=$1',[id(10001)]);
  await d.query('update public.transactions set responsible_unit_id=$1,current_level=\'manager\' where id=$2',[id(unit),id(10001)]);
  await d.query("update public.transaction_assignments set assignment_type=$1,status='completed',completed_at=now(),unit_id=$2,visibility_scope=$3 where id=$4",[oldType,id(unit),visibility,id(20001)]);
  await d.query("insert into public.transaction_assignments(id,transaction_id,unit_id,assignment_type,directive,status,visibility_scope) values($1,$2,$3,'direct','Synthetic focused','active','assignee')",[id(990001),id(10001),id(unit)]);
  if(special==='uuid'||special==='legacy')await d.query('insert into public.transaction_assignment_targets(assignment_id,user_id,login_name,display_name) values($1,$2,$3,$4)',[id(990001),special==='uuid'?id(1):null,'synthetic_2','']);
  if(special==='inactive_member')await d.query('update public.user_memberships set active=false where user_id=$1',[id(actor)]);
  if(special==='inactive_unit')await d.query('update public.organizational_units set active=false where id=$1',[id(unit)]);
  const flags=(await d.query('select app_private.transaction_feedback_flags_with_context($1,$2,public.user_context_internal($1),false) data',[id(actor),id(10001)])).rows[0].data;
  assert.equal(flags.visible,visible,name+' visible');assert.equal(flags.incoming,incoming,name+' incoming');assert.equal(flags.scope,scope,name+' scope');
  await d.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id(actor),session_id:id(1000+actor),role:'authenticated'})]);
  await d.exec('set local role authenticated');let payload;try{payload=(await d.query('select public.list_my_transactions(p_page_size=>100) data')).rows[0].data;}finally{await d.exec('reset role');}
  const row=payload.rows.find(x=>x.id===id(10001));assert.equal(!!row,visible,name+' list visible');if(row)assert.equal(row.can_act,incoming,name+' can_act');
  cases.push({name,flags,row:row||null,total:payload.total,payload});
 }finally{await d.exec('rollback to savepoint focused');await d.exec('release savepoint focused');}}
 return cases;
}

const {PGlite}=await import((await import('./config.mjs')).engineURL);
const db=new PGlite();const report={status:'BLOCK'};
try{await runSetup(db,async d=>{await d.exec(fs.readFileSync((await import('./config.mjs')).migrationPaths[1],'utf8')+'\n'+fs.readFileSync((await import('./config.mjs')).migrationPaths[2],'utf8'));const before=await snapshot(d);const first=await focused(d);save('focused-before.json',first);assert.deepEqual(await snapshot(d),before);await d.exec(fs.readFileSync((await import('./config.mjs')).migrationPaths[3],'utf8'));const after=await snapshot(d);assert.deepEqual(after.catalog,before.catalog);assert.deepEqual(after.data,before.data);const second=await focused(d);save('focused-after.json',second);assert.deepEqual(second,first);assert.deepEqual(await snapshot(d),after);await d.exec(fs.readFileSync((await import('./config.mjs')).migrationPaths[3],'utf8'));assert.deepEqual(await snapshot(d),after);await d.exec(fs.readFileSync((await import('./config.mjs')).migrationPaths[2],'utf8'));assert.deepEqual(await snapshot(d),before);report.status='PASS';report.namedCases=second.map(x=>x.name);report.count=second.length;report.protectedCatalogAndAllFixtureDataRestored=true;report.idempotent=true;report.fullJSONEqual=true;save('protected-snapshot-before.json',before);save('protected-snapshot-after.json',after);});}catch(e){report.failure={stage,code:e.code,message:e.message,stack:e.stack};process.exitCode=2;}finally{await db.close();save('focused-result.json',report);console.log(JSON.stringify(report));}
