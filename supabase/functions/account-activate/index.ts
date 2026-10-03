import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const URL=Deno.env.get("SUPABASE_URL")!;
const admin=createClient(URL,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const OLD_URL="https://urgkbbconlxeagfgyjee.supabase.co";
const OLD_PUBLIC="sb_publishable_76BLD35YhIoDSI8d-qdp7A_EWhsjEVT";
const OLD_FN=OLD_URL+"/functions/v1";

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const ok=origin==="https://faisal01gh.github.io"||origin==="https://ceo-msajed.pages.dev";
  const h:Record<string,string>={
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"content-type,apikey",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Vary":"Origin"
  };
  if(ok)h["Access-Control-Allow-Origin"]=origin;
  return h;
}
function out(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors(req)})}
function clean(v:any){return String(v??"").trim()}

async function verifyLegacy(app:string,token:string,aliasRow:any){
  if(app==="ceo"){
    const r=await fetch(OLD_FN+"/ceoapp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"whoami",token})});
    const d=await r.json().catch(()=>null);
    return !!(r.ok&&d?.ok&&d.username===aliasRow.source_login);
  }
  if(app==="portal"){
    const r=await fetch(OLD_FN+"/ceoportal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pdata",token})});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.ok)return false;
    const {data:oldRow}=await admin.from("legacy_login_credentials")
      .select("display_name,org_name").eq("username",aliasRow.source_login).maybeSingle();
    return !!oldRow&&clean(oldRow.display_name)===clean(d.display_name)&&clean(oldRow.org_name)===clean(d.org_name);
  }
  if(app==="auth"){
    const r=await fetch(OLD_URL+"/auth/v1/user",{headers:{apikey:OLD_PUBLIC,Authorization:"Bearer "+token}});
    const d=await r.json().catch(()=>null);
    return !!(r.ok&&clean(d?.email).toLowerCase()===clean(aliasRow.source_login).toLowerCase());
  }
  return false;
}
async function setMemberships(userId:string,row:any){
  const role=row.role_code;
  const unitRows:any[]=[];
  if(["ceo","ceo_office_manager","ceo_secretary"].includes(role)){
    const {data}=await admin.from("organizational_units").select("id").eq("name","مكتب الرئيس التنفيذي").is("parent_id",null).limit(1);
    for(const u of data||[])unitRows.push({user_id:userId,unit_id:u.id,membership_role:"office",is_primary:true,active:true});
  }else if(role==="assistant"){
    const {data}=await admin.from("organizational_units").select("id").eq("name",row.org_name).is("parent_id",null).limit(1);
    for(const u of data||[])unitRows.push({user_id:userId,unit_id:u.id,membership_role:"assistant",is_primary:true,active:true});
  }else{
    const names=Array.isArray(row.dept_names)?row.dept_names:[];
    if(names.length){
      const {data}=await admin.from("organizational_units").select("id,name").in("name",names);
      let i=0;
      for(const u of data||[])unitRows.push({user_id:userId,unit_id:u.id,membership_role:role==="manager"?"manager":"member",is_primary:i++===0,active:true});
    }
  }
  await admin.from("user_memberships").delete().eq("user_id",userId);
  if(unitRows.length)await admin.from("user_memberships").insert(unitRows);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,{error:"method_not_allowed"},405);
  let b:any;try{b=await req.json()}catch{return out(req,{error:"bad_request"},400)}
  const login=clean(b.login),app=clean(b.app),token=clean(b.token);
  if(!login||!app||!token)return out(req,{error:"invalid_request"},400);

  const aliasKey=login.includes("@")?login.toLowerCase():login;
  const {data:a}=await admin.from("account_migration_aliases").select("*").eq("alias",aliasKey).eq("active",true).maybeSingle();
  if(!a)return out(req,{error:"not_eligible"},403);
  if(!(await verifyLegacy(app,token,a)))return out(req,{error:"unauthorized"},401);

  const {data:u}=await admin.from("account_migration_users").select("*").eq("canonical_key",a.canonical_key).eq("eligible",true).maybeSingle();
  if(!u)return out(req,{error:"not_eligible"},403);

  let userId=u.migrated_user_id as string|null;
  if(!userId){
    const temporary=crypto.randomUUID()+"!Aa9";
    const created=await admin.auth.admin.createUser({
      email:u.internal_email,password:temporary,email_confirm:true,
      app_metadata:{role_code:u.role_code,canonical_key:u.canonical_key,login_name:u.preferred_login},
      user_metadata:{full_name:u.display_name}
    });
    if(created.error||!created.data.user)return out(req,{error:"activation_failed"},500);
    userId=created.data.user.id;

    await admin.from("profiles").upsert({
      id:userId,login_name:u.preferred_login,full_name:u.display_name,job_title:u.job_title||null,
      active:true,legacy_source:"migrated_active_account",legacy_username:u.preferred_login,
      must_change_password:true,updated_at:new Date().toISOString()
    });
    await admin.from("user_roles").delete().eq("user_id",userId);
    await admin.from("user_roles").insert({user_id:userId,role_code:u.role_code,is_primary:true});
    await setMemberships(userId,u);
    await admin.from("account_migration_users").update({
      migrated_user_id:userId,must_change_password:true,migrated_at:new Date().toISOString()
    }).eq("canonical_key",u.canonical_key);
  }

  const generated=await admin.auth.admin.generateLink({type:"recovery",email:u.internal_email});
  if(generated.error||!generated.data?.properties?.hashed_token)return out(req,{error:"recovery_failed"},500);

  return out(req,{
    ok:true,
    email:u.internal_email,
    token_hash:generated.data.properties.hashed_token,
    display_name:u.display_name,
    role:u.role_code,
    preferred_login:u.preferred_login
  });
});