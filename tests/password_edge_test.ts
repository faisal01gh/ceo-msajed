// Isolated regression: all provider requests are intercepted; no real account/session.
const originalFetch=globalThis.fetch,originalServe=Deno.serve;
Deno.test('token possession alone cannot clear mandatory password change',async()=>{
 let handler:(r:Request)=>Promise<Response>;let writes=0;
 Deno.env.set('SUPABASE_URL','https://movzojtnkkmdsjhmlgtq.supabase.co');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fixture-not-a-key');
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);const method=init?.method||'GET';
  if(url.pathname==='/auth/v1/user')return Response.json({id:'11111111-1111-4111-8111-111111111111',email:'fixture@invalid.local'});
  if(url.pathname==='/rest/v1/account_migration_users'&&method==='GET')return Response.json([{canonical_key:'fixture',login_username:'fixture',preferred_login:'fixture',display_name:'fixture',role_code:'employee'}]);
  if(method==='PATCH'&&['/rest/v1/profiles','/rest/v1/account_migration_users'].includes(url.pathname)){writes++;return new Response(null,{status:204})}
  throw new Error('Unexpected fixture request; external network forbidden');
 };
 Object.defineProperty(Deno,'serve',{value:(fn:typeof handler)=>{handler=fn;return{}},configurable:true});
 try{
  await import('../supabase/functions/account-confirm-password/index.ts?regression=token_only');
  const r=await handler!(new Request('https://fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://ceo-msajed.pages.dev'},body:JSON.stringify({access_token:'fixture-token'})}));
  if(r.status!==400)throw new Error('Token-only request must be rejected before any credential/flag write: status='+r.status);
  if(writes!==0)throw new Error('Token-only request changed protected flags');
 }finally{globalThis.fetch=originalFetch;Object.defineProperty(Deno,'serve',{value:originalServe,configurable:true})}
});
