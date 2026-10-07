// Actual worktree handler and cached SDK; only fetch/serve boundaries intercepted.
// Synthetic transport evidence, NOT native Auth, RLS, SQL or deployed acceptance.
const SOURCE=new URL('../supabase/functions/transactions-api/index.ts',import.meta.url).href;
const BASE='https://fixture-provider.invalid';
const uid=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tid=(n:number)=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');
const unit=uid(100),root=uid(101),route=uid(200),assignment=uid(201),target=uid(202),act=uid(203);
const actor=uid(1),ownTx=tid(1),foreignTx=tid(2),missingTx=tid(99);
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
type Spec={id:string;action:string;body:any;permissions:string[];expectedStatus:number;expectedError?:string;expectedWrites?:number;hidden?:boolean;parentMissing?:boolean;role?:string;wrongRecipient?:boolean;routeStatus?:string};
export type Write={seq:number;method:string;table:string;query:string;body:any;affectedIds:string[]};
const sectorBody={transaction_id:ownTx,responsible_unit_id:unit,directive:'synthetic directive',targets:['fixture_same'],supporting:[]};
const support={unit_id:unit,directive:'support',targets:['fixture_same']};
const scopePerms=['transactions.assign_sector','transactions.add_supporting'];
const transferPerms=['transactions.decide_assistant_transfer'];
const scope=(id:string,body:any={},extra:Partial<Spec>={}):Spec=>({id,action:'route_assistant_scope',body:{...sectorBody,supporting:[support],...body},permissions:scopePerms,expectedStatus:403,...extra});
const transfer=(id:string,body:any={},extra:Partial<Spec>={}):Spec=>({id,action:'decide_assistant_transfer',body:{route_id:route,approve:true,...body},permissions:transferPerms,expectedStatus:403,...extra});
const specs:Spec[]=[
 scope('supporting-invalid-last',{supporting:[support,{...support,targets:['fixture_absent']}]},{expectedError:'forbidden_target'}),
 transfer('transfer-missing-parent',{}, {parentMissing:true,expectedStatus:404,expectedError:'not_found'}),
 scope('supporting-valid-complete-array',{supporting:[support,{unit_id:uid(102),directive:'second support',targets:['fixture_second']}]},{expectedStatus:200,expectedWrites:15}),
 scope('scope-valid-no-supporting',{supporting:[]},{permissions:['transactions.assign_sector'],expectedStatus:200,expectedWrites:9}),
 scope('scope-missing-supporting-permission',{}, {permissions:['transactions.assign_sector'],expectedError:'forbidden_supporting'}),
 scope('scope-nonoffice-no-permission',{}, {role:'employee',permissions:[],expectedError:'forbidden'}),
 scope('scope-responsible-target-denied',{targets:['fixture_absent']},{expectedError:'forbidden_target'}),
 scope('scope-invisible-parent',{}, {hidden:true,expectedError:'forbidden'}),
 scope('supporting-last-outside-sector',{supporting:[support,{...support,unit_id:uid(999)}]},{expectedError:'forbidden_scope'}),
 scope('supporting-last-wrong-department',{supporting:[support,{...support,targets:['fixture_second']}]},{expectedError:'forbidden_target'}),
 scope('supporting-last-missing-directive',{supporting:[support,{...support,directive:''}]},{expectedStatus:400,expectedError:'invalid_supporting'}),
 scope('supporting-last-missing-targets',{supporting:[support,{...support,targets:[]}]},{expectedStatus:400,expectedError:'invalid_supporting'}),
 transfer('transfer-accept-valid-coherent',{transaction_id:foreignTx},{expectedStatus:200,expectedWrites:7}),
 transfer('transfer-reject-valid-coherent',{transaction_id:foreignTx,approve:false,reason:'ordinary rejection'},{expectedStatus:200,expectedWrites:4}),
 transfer('transfer-accept-valid-omitted-parent',{}, {expectedStatus:200,expectedWrites:7}),
 transfer('transfer-reject-valid-omitted-parent',{approve:false,reason:'ordinary rejection'}, {expectedStatus:200,expectedWrites:4}),
 transfer('transfer-accept-parent-mismatch',{transaction_id:ownTx},{expectedStatus:400,expectedError:'transaction_mismatch'}),
 transfer('transfer-reject-parent-mismatch',{transaction_id:ownTx,approve:false,reason:'ordinary rejection'},{expectedStatus:400,expectedError:'transaction_mismatch'}),
 transfer('transfer-accept-invisible-parent',{}, {hidden:true,expectedError:'forbidden'}),
 transfer('transfer-reject-invisible-parent',{approve:false,reason:'ordinary rejection'}, {hidden:true,expectedError:'forbidden'}),
 transfer('transfer-wrong-recipient',{}, {wrongRecipient:true,expectedError:'forbidden'}),
 transfer('transfer-nonoffice-no-permission',{}, {role:'employee',permissions:[],expectedError:'forbidden'}),
 transfer('transfer-reject-missing-reason',{approve:false},{expectedStatus:400,expectedError:'reason_required'}),
 transfer('transfer-not-pending',{}, {routeStatus:'accepted',expectedError:'forbidden'}),
];
const accounts=[
 ['fixture_second',uid(8),'employee','runA'],['fixture_actor',actor,'assistant','runA'],['fixture_same',uid(2),'employee','runA'],['fixture_original',uid(3),'employee','original'],
 ['fixture_other_run_assistant',uid(4),'assistant','runB'],['fixture_original_ceo',uid(5),'ceo','original'],
 ['fixture_runB_office',uid(6),'ceo_office_manager','runB'],['fixture_runA_secretary',uid(7),'ceo_secretary','runA'],
].map(([login,id,role,cohort])=>({canonical_key:login,preferred_login:login,display_name:login,role_code:role,org_name:'fixture sector',dept_names:[login==='fixture_second'?'fixture second department':'fixture department'],migrated_user_id:id,eligible:true,fixture_cohort:cohort}));
function seed(s:Spec){
 const parent=s.hidden?foreignTx:ownTx;
 const tx=(id:string)=>({id,number:'OFFLINE-'+id,title:'synthetic parent',status:'open',current_level:'assistant',close_level:'assistant',responsible_unit_id:unit,responsible_login_name:'fixture_actor',origin:'legacy',migration_status:'needs_review',workflow_started:false});
 const tables:any={account_migration_users:clone(accounts),organizational_units:[{id:root,name:'fixture sector',unit_type:'sector',parent_id:null,active:true},{id:unit,name:'fixture department',unit_type:'department',parent_id:root,active:true},{id:uid(102),name:'fixture second department',unit_type:'department',parent_id:root,active:true}],transactions:[tx(ownTx),tx(foreignTx)],transaction_routes:[],transaction_assignments:[],transaction_assignment_targets:[],transaction_actions:[{id:act,transaction_id:ownTx,actor_name:'fixture_actor',current_version:1,action_text:'existing text'}],transaction_action_versions:[{id:uid(204),action_id:act,version_number:1,action_text:'existing text'}],transaction_action_notes:[{id:uid(205),action_id:act,note:'existing note'}],transaction_history:[],audit_log:[],notifications:[],transaction_requests:[],transaction_periods:[]};
 if(s.action==='decide_assistant_transfer')tables.transaction_routes=[{id:route,transaction_id:s.parentMissing?missingTx:foreignTx,route_type:'assistant_transfer',status:s.routeStatus||'pending',to_login_name:s.wrongRecipient?'fixture_other_run_assistant':'fixture_actor',from_login_name:'fixture_original',from_name:'fixture_original',transfer_reason:'synthetic'}];
 if(['route_assistant_scope','decide_assistant_transfer'].includes(s.action)&&!s.parentMissing){
  tables.transaction_assignments=[{id:assignment,transaction_id:s.action==='decide_assistant_transfer'?foreignTx:parent,unit_id:unit,status:'active',assignment_type:'responsible'}];
  tables.transaction_assignment_targets=[{id:target,assignment_id:assignment,user_id:actor,login_name:'fixture_actor',active:true}];
 }
 return tables;
}
function matches(row:any,p:URLSearchParams){
 for(const [k,v]of p){if(['select','order','limit','offset','columns'].includes(k))continue;
  if(v.startsWith('eq.')&&String(row[k])!==v.slice(3))return false;
  if(v.startsWith('is.')&&((v.slice(3)==='null'&&row[k]!=null)||(v.slice(3)==='true'&&row[k]!==true)))return false;
  if(v.startsWith('in.(')&&!v.slice(4,-1).split(',').includes(String(row[k])))return false;
  if(!v.startsWith('eq.')&&!v.startsWith('is.')&&!v.startsWith('in.('))throw new Error('UNRECOGNIZED_QUERY_FILTER '+k+'='+v);
 }
 return true;
}
async function runProbes(specs:Spec[]){
 const originalFetch=globalThis.fetch,originalServe=Deno.serve;
 let denialVerified=false;
 try{await originalFetch('https://must-not-connect.invalid')}catch(e){denialVerified=e instanceof Deno.errors.PermissionDenied||e instanceof Deno.errors.NotCapable;}
 if(!denialVerified)throw new Error('Harness requires --deny-net; actual fetch denial NOT verified');
 const source=await Deno.readTextFile(new URL(SOURCE));
 const sourceSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const oldURL=Deno.env.get('SUPABASE_URL'),oldKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 Deno.env.set('SUPABASE_URL',BASE);Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','offline_fixture_not_a_key');
 const cases:any[]=[];
 try{for(const spec of specs){
  let handler:((r:Request)=>Promise<Response>)|undefined;let n=1000;
  const state=seed(spec),before=clone(state),writes:Write[]=[],requests:any[]=[],unhandled:string[]=[];
  globalThis.fetch=async(input,init)=>{
   const request=input instanceof Request?input:null,url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method||request?.method||'GET';
   const raw=init?.body??(request?await request.clone().text():null),body=typeof raw==='string'&&raw?JSON.parse(raw):null;
   const table=url.pathname.split('/').at(-1)!,seq=requests.length+1;
   requests.push({seq,method,path:url.pathname,query:url.search,body:clone(body)});
   if(url.origin!==BASE){unhandled.push(method+' '+url.origin+url.pathname);throw new Error('UNRECOGNIZED_PROVIDER_ORIGIN');}
   if(url.pathname==='/auth/v1/user')return Response.json({id:actor,email:'owned.fixture@example.invalid'});
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    if(table==='account_session_check_internal')return Response.json(true);
    if(table==='user_context_internal')return Response.json({login_name:'fixture_actor',full_name:'fixture_actor',role:spec.role||'assistant',org_name:'fixture sector',dept_names:['fixture department'],active:true,must_change_password:false});
    if(table==='transaction_feedback_flags_internal')return Response.json({visible:!spec.hidden,incoming:!spec.hidden,shared:false,scope:!spec.hidden,current_assignees:[]});
    unhandled.push(method+' RPC '+table);throw new Error('UNRECOGNIZED_RPC');
   }
   if(method==='GET'&&table==='user_roles')return Response.json([{role_code:spec.role||'assistant'}]);
   if(method==='GET'&&table==='role_permissions')return Response.json(spec.permissions.map(permission_code=>({permission_code})));
   if(method==='GET'&&['account_permission_overrides','user_permissions'].includes(table))return Response.json([]);
   if(method==='GET'&&table==='profiles')return Response.json(accounts.filter(a=>'eq.'+a.migrated_user_id===url.searchParams.get('id')).map(a=>({id:a.migrated_user_id,login_name:a.preferred_login,active:true})));
   if(!(table in state)){unhandled.push(method+' '+table);throw new Error('UNRECOGNIZED_TABLE');}
   const rows=state[table].filter((r:any)=>matches(r,url.searchParams));
   if(method==='HEAD')return new Response(null,{headers:{'content-range':'*/'+rows.length}});
   if(method==='GET'){
    const result=clone(rows);
    if(table==='transaction_assignments'&&(url.searchParams.get('select')||'').includes('transaction_assignment_targets'))for(const r of result)r.transaction_assignment_targets=clone(state.transaction_assignment_targets.filter((t:any)=>t.assignment_id===r.id));
    return Response.json(result);
   }
   if(!['POST','PATCH','DELETE'].includes(method)){unhandled.push(method+' '+table);throw new Error('UNRECOGNIZED_METHOD');}
   let affected:any[]=[];
   if(method==='POST'){affected=(Array.isArray(body)?body:[body]).map(row=>({id:uid(n++),...clone(row)}));state[table].push(...affected);}
   if(method==='PATCH'){affected=rows;for(const row of rows)Object.assign(row,clone(body));}
   if(method==='DELETE'){affected=rows;state[table]=state[table].filter((r:any)=>!rows.includes(r));}
   writes.push({seq,method,table,query:url.search,body:clone(body),affectedIds:affected.map(r=>r.id)});
   const accept=init?.headers instanceof Headers?init.headers.get('accept'):new Headers(init?.headers||request?.headers).get('accept');
   return Response.json(accept?.includes('application/vnd.pgrst.object+json')?(affected[0]||null):clone(affected),{status:method==='POST'?201:200});
  };
  Object.defineProperty(Deno,'serve',{value:(fn:any)=>{handler=fn;return{}},configurable:true});
  await import(SOURCE+'?prevalidation='+crypto.randomUUID());
  if(!handler)throw new Error('actual Deno.serve handler not captured');
  const token=['offline_fixture',btoa(JSON.stringify({sub:actor,iss:BASE+'/auth/v1',role:'authenticated',session_id:uid(300)})),'not_a_signature'].join('.');
  const response=await handler(new Request('https://fixture-client.invalid',{method:'POST',headers:{'content-type':'application/json',origin:'https://ceo-msajed.pages.dev'},body:JSON.stringify({app:'new',token,action:spec.action,...spec.body})}));
  cases.push({id:spec.id,status:response.status,expectedStatus:spec.expectedStatus,response:await response.json(),input:{action:spec.action,...spec.body},before,after:clone(state),writes,requests,unhandledProviderRequests:unhandled});
 }}finally{
  globalThis.fetch=originalFetch;Object.defineProperty(Deno,'serve',{value:originalServe,configurable:true});
  if(oldURL===undefined)Deno.env.delete('SUPABASE_URL');else Deno.env.set('SUPABASE_URL',oldURL);
  if(oldKey===undefined)Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',oldKey);
 }
 return {source:SOURCE,sourceSha256,native_acceptance:false,fixtureType:'owned synthetic provider transport; actual handler/SDK',network:{allowed:false,denialVerified},manifest:accounts.map(a=>({user_id:a.migrated_user_id,cohort:a.fixture_cohort,active:true})),cases};
}
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message)};
for(const spec of specs)Deno.test(spec.id,async()=>{
 const report=await runProbes([spec]);
 const c=report.cases[0];
 const evidence=Deno.env.get('QA_PREVALIDATION_EVIDENCE');
 if(evidence)await Deno.writeTextFile(evidence,JSON.stringify({...report,cases:[c]})+'\n',{append:true});
 assert(report.network.denialVerified,'runtime must actually deny network');
 assert(c.unhandledProviderRequests.length===0,'unhandled provider requests: '+JSON.stringify(c.unhandledProviderRequests));
 console.log(JSON.stringify({id:c.id,status:c.status,writes:c.writes.length,effects:c.writes.map((w:Write)=>w.method+' '+w.table),sourceSha256:report.sourceSha256,native_acceptance:false}));
 assert(c.status===spec.expectedStatus,spec.id+': expected status '+spec.expectedStatus+', got '+c.status);
 assert(c.requests.some((r:any)=>r.path==='/auth/v1/user'),'real SDK Auth getUser must run');
 assert(c.requests.some((r:any)=>r.path.endsWith('/account_session_check_internal')),'session protocol must run');
 if(spec.expectedStatus>=400){
  assert(c.response.error===spec.expectedError,'exact denial error: '+JSON.stringify(c.response));
  assert(c.writes.length===0,spec.id+': expected zero provider writes, got '+c.writes.length);
  assert(JSON.stringify(c.before)===JSON.stringify(c.after),'entire state, notifications and revisions must remain unchanged');
 }else{
  assert(JSON.stringify(c.response)===JSON.stringify({ok:true}),'unchanged success body');
  assert(c.writes.length===spec.expectedWrites,'exact provider write count '+c.writes.length+' expected '+spec.expectedWrites);
  assert(c.writes.every((w:Write)=>w.affectedIds.length>0),'all writes affect fixture rows');
  const parent=spec.action==='decide_assistant_transfer'?foreignTx:ownTx;
  assert(JSON.stringify(c.before.transactions.find((t:any)=>t.id!==parent))===JSON.stringify(c.after.transactions.find((t:any)=>t.id!==parent)),'unrelated parent unchanged');
  assert(JSON.stringify(c.before.transaction_actions)===JSON.stringify(c.after.transaction_actions)&&JSON.stringify(c.before.transaction_action_versions)===JSON.stringify(c.after.transaction_action_versions)&&JSON.stringify(c.before.transaction_action_notes)===JSON.stringify(c.after.transaction_action_notes),'populated unrelated actions, revisions and notes unchanged');
  if(spec.action==='route_assistant_scope'){
   assert(c.after.transaction_assignments.find((a:any)=>a.id===assignment).status==='completed','old assignment complete');
   assert(c.after.transaction_assignment_targets.find((t:any)=>t.id===target).active===false,'old target inactive');
   const active=c.after.transaction_assignments.filter((a:any)=>a.status==='active');
   assert(active.length===1+spec.body.supporting.length,'exact active assignments');
   assert(c.after.notifications.length===active.length,'one notification per new target');
   assert(active.filter((a:any)=>a.assignment_type==='supporting').length===spec.body.supporting.length,'all supporting persisted');
   if(spec.body.supporting.length===2)assert(c.after.transaction_assignment_targets.some((t:any)=>t.login_name==='fixture_second'&&t.active),'last valid distinct target persisted');
  }else{
   const decided=c.after.transaction_routes.find((r:any)=>r.id===route);
   assert(decided.status===(spec.body.approve?'accepted':'rejected'),'exact route outcome');
   assert(decided.rejection_reason===(spec.body.approve?null:spec.body.reason),'rejection reason preserved');
   const parentRead=c.requests.find((r:any)=>r.path==='/rest/v1/transactions');
   assert(parentRead&&parentRead.query.includes('id=eq.'+foreignTx)&&parentRead.seq<c.writes[0].seq,'exact route parent read before first mutation');
   const flags=c.requests.find((r:any)=>r.path.endsWith('/transaction_feedback_flags_internal'));
   assert(flags&&flags.body.p_tx===foreignTx&&flags.seq<c.writes[0].seq,'parent visibility checked before mutation');
   assert(c.after.notifications.length===1&&c.after.notifications[0].target_login_name==='fixture_original','exact sender notification');
   assert(c.after.transaction_assignments[0].status===(spec.body.approve?'completed':'active'),'assignment accept/reject outcome');
   if(!spec.body.approve)assert(JSON.stringify(c.before.transactions)===JSON.stringify(c.after.transactions),'rejection does not change transaction');
  }
  assert(c.after.transaction_history.length===1&&c.after.audit_log.length===1,'one history and audit');
 }
});
