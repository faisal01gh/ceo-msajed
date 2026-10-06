// Actual Edge handler; every provider request intercepted, no real sessions/accounts.
const uuid='10000000-0000-4000-8000-000000000001',unit='20000000-0000-4000-8000-000000000001';
let handler:(r:Request)=>Promise<Response>,mode='manager',failNotificationWrite=false;
let currentLevel='manager',incoming=true,scope=true;
let replyArgs:any=null;
let extraPermissions:string[]=[];
const targetId='10000000-0000-4000-8000-000000000002';
let pendingTarget='fixture_target';
let receiptOverride:any={};
let sourceUser:any=targetId,sourceLogin='fixture_sender';
const writes:{table:string,body:any}[]=[];
const originalFetch=globalThis.fetch,originalServe=Deno.serve;
const user={id:uuid,email:'fixture@example.invalid'};
const ctx=()=>({login_name:'fixture_manager',full_name:'مدير تجريبي',role:mode,org_name:'قطاع تجريبي',dept_names:['إدارة تجريبية'],active:true,must_change_password:false});
const token=['fixture',btoa(JSON.stringify({sub:uuid,iss:'https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1',role:'authenticated',session_id:'30000000-0000-4000-8000-000000000001'})),'fixture'].join('.');
const account={canonical_key:'fixture_manager',preferred_login:'fixture_manager',display_name:'مدير تجريبي',role_code:'manager',dept_names:['إدارة تجريبية'],org_name:'قطاع تجريبي',migrated_user_id:uuid,eligible:true};
const accounts=[account,...[['fixture_target',targetId],['fixture_unlinked',null],['fixture_invalid','not-a-uuid'],['fixture_inactive','10000000-0000-4000-8000-000000000004'],['fixture_wrong_profile','10000000-0000-4000-8000-000000000005']].map(([login,id])=>({...account,canonical_key:login,preferred_login:login,display_name:'مسؤول تجريبي',migrated_user_id:id}))];
accounts.push(...['fixture_ambiguous_a','fixture_ambiguous_b'].map(login=>({...account,canonical_key:login,preferred_login:login,migrated_user_id:'10000000-0000-4000-8000-000000000006'})));
Deno.test('feedback actual Edge integration: identity-bound create, owned notifications, checked failures',async()=>{
 Deno.env.set('SUPABASE_URL','https://movzojtnkkmdsjhmlgtq.supabase.co');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','offline_fixture');
 globalThis.fetch=async(input,init)=>{
  const request=input instanceof Request?input:null,url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method||request?.method||'GET';
  const raw=init?.body??(request?await request.clone().text():null);const body=typeof raw==='string'&&raw?JSON.parse(raw):null;
  const name=url.pathname.split('/').at(-1)!;
  if(url.pathname==='/auth/v1/user')return Response.json(user);
  if(name==='account_session_check_internal')return Response.json(true);
  if(name==='user_context_internal')return Response.json(ctx());
  if(name==='transaction_feedback_flags_internal')return Response.json({visible:true,incoming,shared:!incoming,scope,current_assignees:['مدير تجريبي']});
  if(name==='transaction_reply_raise_internal'){replyArgs=body;return Response.json({ok:true,transaction_id:body.p_tx,source_route_id:body.p_route,operation_id:body.p_operation_id,actor_user_id:body.p_actor,reply_route_id:'70000000-0000-4000-8000-000000000001',target_user_id:targetId,target_login_name:'fixture_target',target_name:'مسؤول تجريبي',...receiptOverride});}
  if(name==='next_transaction_number')return Response.json('TEST-000001');
  if(method==='HEAD'&&name==='notifications')return new Response(null,{headers:{'content-range':'0-0/1'}});
  if(method==='GET'){
   if(name==='account_migration_users')return Response.json(url.searchParams.get('select')==='canonical_key'?{canonical_key:'fixture_manager'}:accounts);
   if(name==='profiles'){
    const id=url.searchParams.get('id')?.replace(/^eq\./,'');
    const found=accounts.find(a=>a.migrated_user_id===id);
    return Response.json(found?{id,login_name:found.preferred_login==='fixture_wrong_profile'?'different_login':found.preferred_login,active:found.preferred_login!=='fixture_inactive'}:null);
   }
   if(name==='user_roles')return Response.json([{role_code:mode}]);
   if(name==='role_permissions')return Response.json([...(mode==='assistant_secretary'?[]:[{permission_code:'transactions.create'},{permission_code:'transactions.raise_assistant'},...(mode==='assistant'?[{permission_code:'transactions.reply_raise'}]:[])]),...extraPermissions.map(permission_code=>({permission_code}))]);
   if(['account_permission_overrides','user_permissions'].includes(name))return Response.json([]);
   if(name==='organizational_units')return Response.json([{id:unit,name:'إدارة تجريبية',unit_type:'department',parent_id:null,active:true}]);
   if(name==='user_memberships')return Response.json([{unit_id:unit,membership_role:'manager',active:true,is_primary:true}]);
   if(name==='transactions')return Response.json([{id:'50000000-0000-4000-8000-000000000001',title:'اختبار',status:'open',current_level:currentLevel,responsible_unit_id:unit,responsible_login_name:'fixture_manager'}]);
   if(name==='transaction_routes')return Response.json(mode==='assistant'?[{id:'70000000-0000-4000-8000-000000000002',route_type:'raise',status:'completed',to_user_id:uuid,to_login_name:'fixture_manager',from_user_id:sourceUser,from_login_name:sourceLogin,from_name:'صاحب الطلب',created_at:'2026-10-06T00:00:00Z'}]:[]);
   if(name==='transaction_requests'&&url.searchParams.has('id'))return Response.json({id:'60000000-0000-4000-8000-000000000001',transaction_id:'50000000-0000-4000-8000-000000000001',request_type:'change_responsible',reason:'اختبار',requested_by_login_name:'fixture_manager',requested_by_name:'مدير تجريبي',meta:{requester_role:'employee',to_login:pendingTarget}});
   if(['transaction_assignments','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_requests','transaction_history','transaction_periods','transaction_links'].includes(name))return Response.json([]);
   if(name==='notifications')return Response.json([{id:'40000000-0000-4000-8000-000000000001',user_id:uuid,target_login_name:'fixture_manager',read_at:null}],{headers:{'content-range':'0-0/1'}});
  }
  if(['POST','PATCH'].includes(method)&&['transactions','transaction_periods','transaction_history','audit_log','notifications','transaction_requests'].includes(name)){
   writes.push({table:name,body});
   if(name==='notifications'&&failNotificationWrite)return Response.json({message:'offline notification write rejected',code:'fixture_failure'},{status:400});
   if(name==='transactions')return Response.json({...body,id:'50000000-0000-4000-8000-000000000001',created_at:'2026-10-06T00:00:00Z'},{status:201});
   if(name==='transaction_requests')return Response.json({...body,id:'60000000-0000-4000-8000-000000000001'},{status:201});
   return Response.json(name==='notifications'?[{id:'40000000-0000-4000-8000-000000000001'}]:[],{status:201});
  }
  throw new Error('Unrecognized intercepted provider request: '+method+' '+name);
 };
 Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{handler=fn;return{}},configurable:true});
 async function call(action:string,extra:any={}){return handler(new Request('https://fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://ceo-msajed.pages.dev'},body:JSON.stringify({app:'new',token,action,...extra})}));}
 try{
  await import('../supabase/functions/transactions-api/index.ts?feedback-integration');
  const created=await call('create',{title:'معاملة اختبار معزولة',responsible_unit_id:unit});if(created.status!==200)throw new Error('Fixture create failed: '+created.status);
  const saved=writes.find(x=>x.table==='transactions')?.body;
  if(saved?.created_by!==uuid||saved?.responsible_user_id!==uuid||saved?.responsible_unit_id!==unit)throw new Error('CREATE must persist actual authenticated IDs and validated responsible department');
  if(writes.find(x=>x.table==='transaction_history')?.body.actor_id!==uuid||writes.find(x=>x.table==='audit_log')?.body.actor_id!==uuid)throw new Error('History and audit must bind the authenticated actor UID');
  const before=writes.length;
  const foreign=await call('create',{title:'معاملة اختبار معزولة',responsible_unit_id:'20000000-0000-4000-8000-000000000099'});
  if(foreign.status!==403||writes.length!==before)throw new Error('Foreign department must be denied before creation writes');
  const listed=await call('notifications');const data=await listed.json();if(listed.status!==200||data.unread_count!==1)throw new Error('Unread notification count must be returned by backend');
  failNotificationWrite=true;const failed=await call('notification_read',{notification_id:'40000000-0000-4000-8000-000000000001'});if(failed.status===200)throw new Error('Provider read-ack failure cannot claim success');
  incoming=false;currentLevel='assistant';
  const stale=await call('route_manager_assistant',{transaction_id:'50000000-0000-4000-8000-000000000001',raise_reason:'اختبار',proposed_decision:'اختبار'});
  if(stale.status!==403)throw new Error('Historical manager cannot reroute assistant-held work: '+stale.status);
  mode='assistant_secretary';scope=false;failNotificationWrite=false;
  for(const [action,extra]of [['request_close',{}],['request_cancel',{}],['request_reopen',{}],['change_responsible',{to_login:'fixture_manager'}]] as const){
    const secretary=await call(action,{transaction_id:'50000000-0000-4000-8000-000000000001',reason:'اختبار',...extra});
    if(secretary.status!==403)throw new Error('Secretary queue visibility cannot inherit '+action+' mutation: '+secretary.status);
  }
  const queueBefore=writes.length;
  const extension=await call('request_extension',{transaction_id:'50000000-0000-4000-8000-000000000001',reason:'اختبار',requested_due_at:'2026-10-20'});
  if(extension.status!==403||writes.length!==queueBefore)throw new Error('Secretary queue extension must be denied with NO writes; status='+extension.status+' writes='+ (writes.length-queueBefore));
  incoming=true;scope=true;
  const unprivilegedBefore=writes.length;
  const unprivileged=await call('request_extension',{transaction_id:'50000000-0000-4000-8000-000000000001',reason:'اختبار',requested_due_at:'2026-10-20'});
  if(unprivileged.status!==403||writes.length!==unprivilegedBefore)throw new Error('Secretary custody without date permission must not write');
  extraPermissions=['transactions.set_due_date'];
  const authorized=await call('request_extension',{transaction_id:'50000000-0000-4000-8000-000000000001',reason:'اختبار',requested_due_at:'2026-10-20'});
  if(authorized.status!==200||!writes.slice(unprivilegedBefore).some(w=>w.table==='transaction_requests'))throw new Error('Secretary actual custody with explicit date permission must retain extension requests');
  incoming=false;scope=false;
  const sectorBefore=writes.length;
  const sector=await call('request_extension',{transaction_id:'50000000-0000-4000-8000-000000000001',reason:'اختبار',requested_due_at:'2026-10-20'});
  if(sector.status!==403||writes.length!==sectorBefore)throw new Error('Other sector visibility plus date permission must not replace custody');
  mode='manager';currentLevel='manager';incoming=true;scope=true;extraPermissions=['transactions.change_responsible_unit'];
  for(const login of ['fixture_unlinked','fixture_invalid','fixture_inactive','fixture_wrong_profile','missing_target']){
   const before=writes.length;
   const denied=await call('change_responsible_unit',{transaction_id:'50000000-0000-4000-8000-000000000001',responsible_unit_id:unit,responsible_login_name:login});
   if(denied.status!==400||writes.length!==before)throw new Error('Invalid responsible unit target must deny BEFORE all mutations: '+login+' status='+denied.status+' writes='+(writes.length-before));
  }
  const ownershipBefore=writes.length;
  const changedUnit=await call('change_responsible_unit',{transaction_id:'50000000-0000-4000-8000-000000000001',responsible_unit_id:unit,responsible_login_name:'fixture_target'});
  const ownershipPatch=writes.slice(ownershipBefore).find(w=>w.table==='transactions')?.body;
  if(changedUnit.status!==200||ownershipPatch?.responsible_user_id!==targetId||ownershipPatch?.responsible_login_name!=='fixture_target'||ownershipPatch?.responsible_name!=='مسؤول تجريبي')throw new Error('Responsible unit PATCH must atomically synchronize validated directory UUID/login/name: '+JSON.stringify(ownershipPatch));
  extraPermissions=['transactions.change_responsible'];
  const directBefore=writes.length;
  const direct=await call('change_responsible',{transaction_id:'50000000-0000-4000-8000-000000000001',to_login:'fixture_target',reason:'اختبار'});
  const directPatch=writes.slice(directBefore).find(w=>w.table==='transactions')?.body;
  if(direct.status!==200||directPatch?.responsible_user_id!==targetId||directPatch?.responsible_login_name!=='fixture_target'||directPatch?.responsible_name!=='مسؤول تجريبي')throw new Error('Direct responsible PATCH must synchronize UUID/login/name: '+JSON.stringify(directPatch));
  for(const login of ['fixture_unlinked','fixture_invalid','fixture_inactive','fixture_wrong_profile','missing_target']){
   const before=writes.length;
   const denied=await call('change_responsible',{transaction_id:'50000000-0000-4000-8000-000000000001',to_login:login,reason:'اختبار'});
   if(denied.status!==400||writes.length!==before)throw new Error('Invalid direct ownership target must deny all writes: '+login);
  }
  extraPermissions=[];
  const approvedBefore=writes.length;
  const approved=await call('decide_request',{request_id:'60000000-0000-4000-8000-000000000001',approve:true});
  const approvedPatch=writes.slice(approvedBefore).find(w=>w.table==='transactions')?.body;
  if(approved.status!==200||approvedPatch?.responsible_user_id!==targetId||approvedPatch?.responsible_login_name!=='fixture_target'||approvedPatch?.responsible_name!=='مسؤول تجريبي')throw new Error('Approved responsible PATCH must synchronize UUID/canonical login/name: '+JSON.stringify(approvedPatch));
  console.log('__OWNERSHIP_SQL_BRIDGE__'+JSON.stringify({targetId,unit,patches:[{action:'change_responsible_unit',patch:ownershipPatch},{action:'change_responsible',patch:directPatch},{action:'decide_request',patch:approvedPatch}]}));
  for(const login of ['fixture_unlinked','fixture_invalid','fixture_inactive','fixture_wrong_profile','missing_target']){
   pendingTarget=login;const before=writes.length;
   const denied=await call('decide_request',{request_id:'60000000-0000-4000-8000-000000000001',approve:true});
   if(denied.status!==409||writes.length!==before)throw new Error('Invalid approval target must deny request/history/audit/notification/transaction writes: '+login);
  }
  pendingTarget='fixture_target';
  mode='assistant';currentLevel='assistant';incoming=true;scope=true;
  const details=await call('details',{transaction_id:'50000000-0000-4000-8000-000000000001'});const detailBody=await details.json();
  if(details.status!==200||detailBody.can_reply_raise!==true||detailBody.reply_route_id!=='70000000-0000-4000-8000-000000000002'||detailBody.reply_target_name!=='مسؤول تجريبي'||detailBody.reply_target_user_id!==targetId||detailBody.reply_target_login_name!=='fixture_target')throw new Error('Reply details must bind original sender UID to canonical registry login/name despite stale route text: '+JSON.stringify(detailBody));
  for(const [uid,login,enabled]of [[null,'fixture_target',true],[undefined,'fixture_target',true],[null,'fixture_unlinked',false],['10000000-0000-4000-8000-000000000099','fixture_target',false],[null,'missing_target',false],['10000000-0000-4000-8000-000000000004','fixture_target',false],['10000000-0000-4000-8000-000000000006','fixture_ambiguous_a',false],[null,'fixture_ambiguous_a',false]] as const){
   sourceUser=uid;sourceLogin=login;
   const r=await call('details',{transaction_id:'50000000-0000-4000-8000-000000000001'});const d=await r.json();
   if(r.status!==200||d.can_reply_raise!==enabled||(enabled?(d.reply_target_user_id!==targetId||d.reply_target_login_name!=='fixture_target'||d.reply_target_name!=='مسؤول تجريبي'):(d.reply_target_user_id!==null||d.reply_route_id!==null)))throw new Error('Reply sender resolution must use UID first and login ONLY for null UID: '+JSON.stringify({uid,login,d}));
  }
  sourceUser=targetId;sourceLogin='fixture_sender';
  const response=await call('reply_raise',{transaction_id:'50000000-0000-4000-8000-000000000001',route_id:'70000000-0000-4000-8000-000000000002',response:'تمت الموافقة',operation_id:'70000000-0000-4000-8000-000000000003',to_login:'ignored_client_target'});
  if(response.status!==200||replyArgs?.p_actor!==uuid||replyArgs?.p_session!=='30000000-0000-4000-8000-000000000001'||replyArgs?.p_route!=='70000000-0000-4000-8000-000000000002'||replyArgs?.p_response!=='تمت الموافقة'||Object.hasOwn(replyArgs,'to_login'))throw new Error('Reply must invoke atomic operation with verified actor/session and immutable original route, not client target');
  for(const [key,value]of [['transaction_id',targetId],['source_route_id',targetId],['operation_id',targetId],['actor_user_id',targetId],['reply_route_id','invalid'],['target_user_id','invalid']] as const){
   receiptOverride={[key]:value};const before=writes.length;
   const invalid=await call('reply_raise',{transaction_id:'50000000-0000-4000-8000-000000000001',route_id:'70000000-0000-4000-8000-000000000002',response:'اختبار',operation_id:'70000000-0000-4000-8000-000000000003'});
   const data=await invalid.json();
   if(invalid.status!==500||data.ok===true||writes.length!==before)throw new Error('Unbound or malformed receipt cannot return synthetic success: '+key+' status='+invalid.status);
  }
  receiptOverride={};
 }finally{globalThis.fetch=originalFetch;Object.defineProperty(Deno,'serve',{value:originalServe,configurable:true})}
});
