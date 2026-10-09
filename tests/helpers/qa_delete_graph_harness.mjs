import assert from 'node:assert/strict';
export function graphHarness(db,scalar,id,actors){
 const reset=()=>db.exec('reset role');
 const bind=async(u=actors.employee)=>{await reset();await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:u,session_id:id(1000+Number(u.slice(-12))),role:'service_role'}),JSON.stringify({'x-qa-actor-user':u,'x-qa-actor-sid':id(1000+Number(u.slice(-12)))})]);await db.exec('set role service_role')};
 const snapshot=async()=>{await reset();const o={};for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth') order by 1,2")).rows)o[t.schemaname+'.'+t.tablename]=(await db.query(`select to_jsonb(t) row from "${t.schemaname}"."${t.tablename}" t order by to_jsonb(t)::text`)).rows;return o};
 const abi=async()=>(await db.query("select oid,proname,pg_get_functiondef(oid) def,proowner,proacl::text,proconfig,provolatile,prosecdef,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result from pg_proc where pronamespace in ('public'::regnamespace,'app_private'::regnamespace) order by oid")).rows;
 const context=async()=>{await reset();return (await db.query('select to_jsonb(c) row from app_private.qa_sql_operation_context c order by table_oid,old_key::text')).rows.map(x=>x.row)};
 const graph=async(n,{full=true,owner=actors.employee}={})=>{
  const root=id(n),assignment=id(n+1),action=id(n+2),version=id(n+3),note=id(n+4);await bind(owner);
  await db.query("insert into public.transactions(id,number,title,created_by) values($1,$2,'synthetic graph',$3)",[root,'GRAPH-'+n,owner]);
  if(full){
   await db.query("insert into public.transaction_assignments(id,transaction_id,assignment_type,created_by) values($1,$2,'direct',$3)",[assignment,root,owner]);
   await db.query('insert into public.transaction_assignment_users values($1,$2)',[assignment,owner]);
   await db.query("insert into public.transaction_assignment_targets(id,assignment_id,user_id,display_name) values($1,$2,$3,'synthetic')",[id(n+5),assignment,owner]);
   await db.query("insert into public.transaction_actions(id,transaction_id,assignment_id,actor_id,actor_name,action_text) values($1,$2,$3,$4,'synthetic','synthetic')",[action,root,assignment,owner]);
   await db.query("insert into public.transaction_action_versions(id,action_id,version_no,actor_id,body) values($1,$2,1,$3,'synthetic')",[version,action,owner]);
   await db.query("insert into public.transaction_action_notes(id,transaction_id,action_id,actor_name,note) values($1,$2,$3,'synthetic','synthetic')",[note,root,action]);
   await db.query("insert into public.transaction_links(id,transaction_id,assignment_id,url,created_by) values($1,$2,$3,'https://fixture.invalid',$4)",[id(n+6),root,assignment,owner]);
   await db.query("insert into public.transaction_routes(id,transaction_id,route_type,from_user_id,to_user_id) values($1,$2,'raise',$3,$3)",[id(n+7),root,owner]);
   await db.query("insert into public.transaction_requests(id,transaction_id,request_type,requested_by,reason) values($1,$2,'cancel',$3,'synthetic')",[id(n+8),root,owner]);
   await db.query("insert into public.transaction_history(transaction_id,event_type,actor_id) values($1,'created',$2)",[root,owner]);
   await db.query('insert into public.transaction_participants(transaction_id,user_id) values($1,$2)',[root,owner]);
   await db.query('insert into public.transaction_periods(id,transaction_id,cycle_no,started_at) values($1,$2,1,clock_timestamp())',[id(n+9),root]);
   await db.query("insert into public.notifications(id,transaction_id,user_id,event_type,title) values($1,$2,$3,'fixture','synthetic')",[id(n+10),root,owner]);
   await reset();await db.query('insert into app_private.transaction_read_state(transaction_id,user_id,seen_revision) values($1,$2,0)',[root,owner]);
  }
  await reset();return {root,assignment,action,version,note,owner};
 };
 const denied=async(sql,args=[],code='42501',setup=null,u=actors.employee)=>{
  const before=await snapshot();await db.exec('begin');if(setup)await setup();await bind(u);let got;try{await db.query(sql,args)}catch(e){got=e.code}await db.exec('rollback');assert.equal(got,code);assert.deepEqual(await snapshot(),before)
 };
 const absent=async(g)=>{await reset();for(const t of ['transactions','transaction_assignments','transaction_actions'])assert.equal(await scalar(`select count(*)::int from public.${t} where ${t==='transactions'?'id':'transaction_id'}=$1`,[g.root]),0);assert.equal(await scalar('select count(*)::int from app_private.qa_sql_operation_context'),0)};
 const unchangedExcept=async(before,removed,changedRoots=[])=>{const after=await snapshot();const normalize=o=>{const copy=structuredClone(o);for(const[t,rows]of Object.entries(copy))copy[t]=rows.filter(x=>!removed.some(r=>r.table===t&&JSON.stringify(r.row)===JSON.stringify(x.row))).map(x=>{if(t==='public.transactions'&&changedRoots.includes(x.row.id))for(const k of ['activity_revision','last_activity_at','updated_at'])delete x.row[k];return x});return copy};assert.deepEqual(normalize(after),normalize(before));return after};
 return {reset,bind,snapshot,abi,context,graph,denied,absent,unchangedExcept};
}
