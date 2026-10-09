const uid='10000000-0000-4000-8000-000000000001',sid='30000000-0000-4000-8000-000000000001';
const endpoint='https://movzojtnkkmdsjhmlgtq.supabase.co';
const token=['fixture',btoa(JSON.stringify({sub:uid,iss:endpoint+'/auth/v1',role:'authenticated',session_id:sid})),'fixture'].join('.');
function assert(value:unknown,message:string){if(!value)throw Error(message)}
Deno.test('actual transactions handler binds each REST request to verified UID/SID, not incoming headers',async()=>{
 const oldFetch=globalThis.fetch,oldServe=Deno.serve;let handler!:(r:Request)=>Promise<Response>;const observed:Headers[]=[];
 Deno.env.set('SUPABASE_URL',endpoint);Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','offline-fixture-not-a-key');
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),name=url.pathname.split('/').at(-1);
  if(url.pathname==='/auth/v1/user')return Response.json({id:uid,email:'fixture@example.invalid'});
  if(name==='account_session_check_internal')return Response.json(true);
  if(name==='user_context_internal')return Response.json({active:true,must_change_password:false,role:'employee',login_name:'fixture',full_name:'fixture',dept_names:[]});
  if(url.pathname.startsWith('/rest/'))observed.push(request.headers);
  if(name==='account_migration_users')return Response.json([]);
  if(name==='notifications')return new Response(null,{headers:{'content-range':'0-0/0'}});
  if(name==='qa_scope_probe_internal')return Response.json([{allowed:true,actor_class:'ordinary',target_class:'ordinary',run_id:null,reason:'allowed'}]);
  return Response.json([]);
 };
 Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{handler=fn;return{}},configurable:true});
 try{await import('../supabase/functions/transactions-api/index.ts?qa-context-red');
  const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json','x-qa-actor-user':'forged','x-qa-actor-sid':'forged'},body:JSON.stringify({app:'new',token,action:'notifications'})}));
  assert(response.status===200,'fixture must execute the actual handler');assert(observed.length>0,'REST requests must be exercised');
  assert(observed.every(h=>h.get('x-qa-actor-user')===uid&&h.get('x-qa-actor-sid')===sid),'all post-verification REST requests require trusted per-request identity');
 }finally{globalThis.fetch=oldFetch;Object.defineProperty(Deno,'serve',{value:oldServe,configurable:true})}
});
Deno.test('actual create stops after failed dependent REST statement and sanitizes its error',async()=>{
 const oldFetch=globalThis.fetch,oldServe=Deno.serve;let handler!:(r:Request)=>Promise<Response>;const writes:string[]=[];
 const unit='20000000-0000-4000-8000-000000000001';
 Deno.env.set('SUPABASE_URL',endpoint);Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','offline-fixture-not-a-key');
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),name=url.pathname.split('/').at(-1);
  if(url.pathname==='/auth/v1/user')return Response.json({id:uid,email:'fixture@example.invalid'});
  if(name==='account_session_check_internal')return Response.json(true);
  if(name==='user_context_internal')return Response.json({active:true,must_change_password:false,role:'manager',login_name:'fixture',full_name:'fixture',dept_names:[]});
  if(name==='qa_scope_probe_internal')return Response.json([{allowed:true,actor_class:'ordinary',target_class:'ordinary',run_id:null,reason:'allowed'}]);
  if(name==='next_transaction_number')return Response.json('FIXTURE-1');
  if(request.method==='GET'){
   if(name==='user_roles')return Response.json([{role_code:'manager'}]);
   if(name==='role_permissions')return Response.json([{permission_code:'transactions.create'}]);
   if(name==='user_memberships')return Response.json([{unit_id:unit}]);
   if(name==='organizational_units')return Response.json([{id:unit,name:'fixture',unit_type:'department',parent_id:null,active:true}]);
   return Response.json([]);
  }
  if(request.method==='POST'){
   writes.push(name!);
   if(name==='transactions')return Response.json({id:uid,created_at:'2026-10-08T00:00:00Z'},{status:201});
   if(name==='transaction_periods')return Response.json({code:'fixture_rejected',message:'PRIVATE_ERROR_SENTINEL'},{status:400});
   return Response.json([],{status:201});
  }
  throw Error('unrecognized offline boundary');
 };
 Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{handler=fn;return{}},configurable:true});
 try{await import('../supabase/functions/transactions-api/index.ts?qa-write-red');
  const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:'new',token,action:'create',title:'fixture',responsible_unit_id:unit})}));
  assert(response.status!==200,'failed periods write cannot claim success');
  assert(writes.join(',')==='transactions,transaction_periods','no later dependent history/audit writes after failure');
  assert(!(await response.text()).includes('PRIVATE_ERROR_SENTINEL'),'private provider errors must not escape');
 }finally{globalThis.fetch=oldFetch;Object.defineProperty(Deno,'serve',{value:oldServe,configurable:true})}
});


Deno.test('actual handler fails closed and sanitizes a failed permission-deny lookup',async()=>{
 const oldFetch=globalThis.fetch,oldServe=Deno.serve;let handler!:(r:Request)=>Promise<Response>;
 Deno.env.set('SUPABASE_URL',endpoint);Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','offline-fixture-not-a-key');
 globalThis.fetch=async(input,init)=>{const r=new Request(input,init),u=new URL(r.url),name=u.pathname.split('/').at(-1);
  if(u.pathname==='/auth/v1/user')return Response.json({id:uid,email:'fixture@example.invalid'});
  if(name==='account_session_check_internal')return Response.json(true);
  if(name==='user_context_internal')return Response.json({active:true,must_change_password:false,role:'employee',login_name:'fixture',full_name:'fixture',dept_names:[]});
  if(name==='user_permissions')return Response.json({code:'fixture_denied',message:'PRIVATE_ERROR_SENTINEL'},{status:400});
  if(name==='notifications')return new Response(null,{headers:{'content-range':'0-0/0'}});
  return Response.json([]);
 };
 Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{handler=fn;return{}},configurable:true});
 try{await import('../supabase/functions/transactions-api/index.ts?qa-deny-read-red');
  const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:'new',token,action:'notifications'})}));
  assert(r.status===500,'permission-deny lookup failure cannot silently grant or continue');assert(!(await r.text()).includes('PRIVATE_ERROR_SENTINEL'),'SDK private error cannot escape the handler');
 }finally{globalThis.fetch=oldFetch;Object.defineProperty(Deno,'serve',{value:oldServe,configurable:true})}
});

for(const [label,claims] of [['uid-mismatch',{sub:'10000000-0000-4000-8000-000000000099',role:'authenticated',session_id:sid}],['wrong-role',{sub:uid,role:'service_role',session_id:sid}],['malformed-sid',{sub:uid,role:'authenticated',session_id:'not-a-native-sid'}]] as const){
 Deno.test('actual transactions rejects '+label+' after getUser before any SQL access',async()=>{
  const oldFetch=globalThis.fetch,oldServe=Deno.serve;let handler!:(r:Request)=>Promise<Response>;let sql=0;
  Deno.env.set('SUPABASE_URL',endpoint);Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','offline-fixture-not-a-key');
  globalThis.fetch=async(input,init)=>{const r=new Request(input,init);if(new URL(r.url).pathname==='/auth/v1/user')return Response.json({id:uid,email:'fixture@example.invalid'});sql++;throw Error('unexpected SQL access')};
  Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{handler=fn;return{}},configurable:true});
  try{await import('../supabase/functions/transactions-api/index.ts?qa-malformed='+label);
   const bad=['fixture',btoa(JSON.stringify({iss:endpoint+'/auth/v1',...claims})),'fixture'].join('.');
   const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json','x-qa-actor-user':uid,'x-qa-actor-sid':sid},body:JSON.stringify({app:'new',token:bad,action:'notifications'})}));
   assert(r.status===401&&sql===0,'malformed verified-envelope claims cannot establish SQL authority');
  }finally{globalThis.fetch=oldFetch;Object.defineProperty(Deno,'serve',{value:oldServe,configurable:true})}
 });
}
