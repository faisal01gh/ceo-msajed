export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function passwordStrong(value:unknown):value is string {
 return typeof value==='string'&&Array.from(value).length>=8&&Array.from(value).length<=128&&/[A-Z]/.test(value)&&/[a-z]/.test(value)&&/[0-9]/.test(value)&&/[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,.\/\x60~]/.test(value)&&!/[\x00-\x1f\x7f]/.test(value);
}
export interface Account {canonical_key:string;login_username:string;preferred_login:string;display_name:string;role_code:string;internal_email:string;migrated_user_id:string}
export interface Caller {id:string;session_id:string;email:string}
export interface Operation {operation_id:string;target_user_id:string;canonical_key:string;login_username:string;generation:number;status:string;write_allowed?:boolean}
export interface PasswordPort {
 caller(token:string):Promise<Caller|null>;
 accountByUser(id:string):Promise<Account|null>;
 accountByKey(key:string):Promise<Account|null>;
 begin(caller:Caller,target:Account,kind:'change'|'reset',id:string):Promise<Operation>;
 markerMatches(op:Operation):Promise<boolean>;
 currentOperation(target:Account,id:string):Promise<boolean>;
 samePassword(email:string,password:string):Promise<boolean>;
 replace(op:Operation,password:string):Promise<void>;
 finish(op:Operation):Promise<void>;
 uncertain(op:Operation):Promise<void>;
 failed(op:Operation,code:string):Promise<void>;
 signIn(email:string,password:string):Promise<{access_token:string;refresh_token:string}|null>;
}
function headers(req:Request){const origin=req.headers.get('origin')||'';const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'content-type,apikey,authorization'};if(['https://ceo-msajed.pages.dev','https://faisal01gh.github.io'].includes(origin))h['Access-Control-Allow-Origin']=origin;return h}
export async function passwordRequest(req:Request,port:PasswordPort,kind:'change'|'reset'){
 const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(req)});
 const origin=req.headers.get('origin');if(origin&&!['https://ceo-msajed.pages.dev','https://faisal01gh.github.io'].includes(origin))return out({error:'forbidden_origin'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)});
 if(req.method!=='POST')return out({error:'method_not_allowed'},405);
 let b:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>8192)throw new Error();b=JSON.parse(raw);if(!b||Array.isArray(b)||typeof b!=='object')throw new Error()}catch{return out({error:'bad_request'},400)}
 const keys=new Set(['access_token','new_password','operation_id',...(kind==='reset'?['target_key']:[])]);
 if(Object.keys(b).some(k=>!keys.has(k))||!passwordStrong(b.new_password)||typeof b.operation_id!=='string'||!UUID.test(b.operation_id)||(kind==='reset'&&(typeof b.target_key!=='string'||!b.target_key||b.target_key.length>80)))return out({error:'invalid_password_request'},400);
 const bearer=req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
 if(bearer&&b.access_token&&bearer!==b.access_token)return out({error:'unauthorized'},401);
 const token=bearer||(typeof b.access_token==='string'?b.access_token:'');if(!token)return out({error:'unauthorized'},401);
 let op:Operation|undefined;
 try{
  const actor=await port.caller(token);if(!actor)return out({error:'unauthorized'},401);
  const target=kind==='change'?await port.accountByUser(actor.id):await port.accountByKey(b.target_key as string);
  if(!target?.migrated_user_id)return out({error:'account_not_provisioned'},403);
  if(kind==='change'&&!await port.currentOperation(target,b.operation_id)&&await port.samePassword(target.internal_email,b.new_password))return out({error:'same_password'},400);
  // Office authority, effective override, active state and session are checked atomically by SQL begin.
  op=await port.begin(actor,target,kind,b.operation_id);
  const proven=await port.markerMatches(op);
  if(op.status==='completed'&&!proven)return out({error:'credential_operation_superseded'},409);
  if(op.status!=='completed'&&!proven&&op.write_allowed!==true)return out({error:'credential_operation_pending',operation_id:op.operation_id},409);
  if(kind==='reset'&&op.write_allowed!==true&&proven&&!await port.samePassword(target.internal_email,b.new_password))return out({error:'operation_candidate_mismatch'},409);
  if(op.status!=='completed'&&!proven){

   await port.replace(op,b.new_password);
   if(!await port.markerMatches(op))throw new Error('unproven_auth_write');
  }
  if(op.status!=='completed')await port.finish(op);
  if(kind==='reset')return out({ok:true,login_username:target.login_username,must_change_password:true,operation_id:op.operation_id});
  const auth=await port.signIn(target.internal_email,b.new_password);
  if(!auth)return out({error:'password_changed_login_required',password_changed:true},409);
  return out({ok:true,login_username:target.login_username,preferred_login:target.preferred_login,display_name:target.display_name,role:target.role_code,auth,operation_id:op.operation_id});
 }catch(error){
  if(op&&error instanceof Error&&['provider_400','provider_422'].includes(error.message)){
   try{await port.failed(op,error.message);return out({error:'provider_password_rejected'},400)}catch{}
  }
  if(op){await port.uncertain(op).catch(()=>{});return out({error:'credential_operation_unresolved',operation_id:op.operation_id},503)}
  return out({error:'forbidden'},403);
 }
}
