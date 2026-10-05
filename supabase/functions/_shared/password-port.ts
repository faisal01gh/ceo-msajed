import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { UUID,type Account,type Caller,type Operation,type PasswordPort } from './password-command.ts';
export function passwordPort():PasswordPort {
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(url!=='https://movzojtnkkmdsjhmlgtq.supabase.co'||!service)throw new Error('Invalid credential service configuration');
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=()=>createClient(url,Deno.env.get('SUPABASE_ANON_KEY')||service,{auth:{persistSession:false,autoRefreshToken:false}});
 async function rpc(name:string,args:Record<string,unknown>){const r=await admin.rpc(name,args);if(r.error)throw new Error('Credential authorization failed');return r.data}
 async function account(column:string,value:string):Promise<Account|null>{const r=await admin.from('account_migration_users').select('canonical_key,login_username,preferred_login,display_name,role_code,internal_email,migrated_user_id').eq(column,value).eq('eligible',true).maybeSingle();if(r.error)throw new Error('Account lookup failed');return r.data as Account|null}
 async function target(op:Operation){const r=await admin.auth.admin.getUserById(op.target_user_id);if(r.error||!r.data.user)throw new Error('Credential target unavailable');return r.data.user}
 return {
  async caller(token:string):Promise<Caller|null>{
   const r=await admin.auth.getUser(token);if(r.error||!r.data.user)return null;
   try{const c=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0))));
    if(c.sub!==r.data.user.id||c.iss!==url+'/auth/v1'||c.role!=='authenticated'||typeof c.session_id!=='string'||!UUID.test(c.session_id)||!r.data.user.email)return null;
    return {id:r.data.user.id,session_id:c.session_id,email:r.data.user.email};
   }catch{return null}
  },
  accountByUser:id=>account('migrated_user_id',id),accountByKey:key=>account('canonical_key',key),
  async begin(caller,target,kind,id){return await rpc('account_password_begin_internal',{p_actor:caller.id,p_session:caller.session_id,p_target_key:target.canonical_key,p_kind:kind,p_operation_id:id}) as Operation},
  async markerMatches(op){const u=await target(op);return u.app_metadata?.msajed_password_operation===op.operation_id&&String(u.app_metadata?.msajed_password_generation)===String(op.generation)},
  async currentOperation(account,id){const r=await admin.auth.admin.getUserById(account.migrated_user_id);if(r.error||!r.data.user)throw new Error('Credential target unavailable');return r.data.user.app_metadata?.msajed_password_operation===id},
  async samePassword(email,password){
   const client=login();const r=await client.auth.signInWithPassword({email,password});
   if(r.error){if(r.error.code==='invalid_credentials')return false;throw new Error('Credential verification unavailable')}
   await client.auth.signOut({scope:'local'});return true;
  },
  async replace(op,password){const u=await target(op);const r=await admin.auth.admin.updateUserById(op.target_user_id,{password,app_metadata:{...u.app_metadata,msajed_password_operation:op.operation_id,msajed_password_generation:op.generation}});if(r.error)throw new Error([400,422].includes(r.error.status||0)?'provider_'+r.error.status:'Credential write unresolved')},
  async finish(op){await rpc('account_password_finish_internal',{p_operation_id:op.operation_id,p_generation:op.generation})},
  async uncertain(op){await rpc('account_password_unknown_internal',{p_operation_id:op.operation_id})},
  async failed(op,code){await rpc('account_password_fail_internal',{p_operation_id:op.operation_id,p_error_code:code})},
  async signIn(email,password){const r=await login().auth.signInWithPassword({email,password});if(r.error||!r.data.session)return null;return {access_token:r.data.session.access_token,refresh_token:r.data.session.refresh_token}}
 };
}
