import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const admin=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false,autoRefreshToken:false}}
);

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const ok=origin==="https://faisal01gh.github.io";
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

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,{error:"method_not_allowed"},405);
  let b:any;try{b=await req.json()}catch{return out(req,{error:"bad_request"},400)}
  const token=String(b?.access_token||"").trim();
  if(!token)return out(req,{error:"unauthorized"},401);

  const user=await admin.auth.getUser(token);
  if(user.error||!user.data.user)return out(req,{error:"unauthorized"},401);
  const userId=user.data.user.id;

  const {data:row}=await admin.from("account_migration_users")
    .select("canonical_key,preferred_login,display_name,role_code")
    .eq("migrated_user_id",userId).maybeSingle();
  if(!row)return out(req,{error:"not_migrated_account"},403);

  await admin.from("profiles").update({
    must_change_password:false,updated_at:new Date().toISOString()
  }).eq("id",userId);

  await admin.from("account_migration_users").update({
    must_change_password:false,password_changed_at:new Date().toISOString()
  }).eq("canonical_key",row.canonical_key);

  return out(req,{
    ok:true,preferred_login:row.preferred_login,
    display_name:row.display_name,role:row.role_code
  });
});