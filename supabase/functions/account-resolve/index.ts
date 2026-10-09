import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { credentialFetch } from "../_shared/qa-context.ts";

const db=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:credentialFetch()}}
);

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

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,{error:"method_not_allowed"},405);
  let b:any;try{b=await req.json()}catch{return out(req,{error:"bad_request"},400)}
  const raw=String(b?.login||"").trim();
  if(!raw)return out(req,{error:"missing_login"},400);
  const ascii=raw.toLowerCase();

  let {data:u}=await db.from("account_migration_users")
    .select("canonical_key,login_username,preferred_login,display_name,role_code,internal_email,eligible,migrated_user_id,must_change_password")
    .eq("login_username",ascii).eq("eligible",true).maybeSingle();

  if(!u){
    const alias=raw.includes("@")?raw.toLowerCase():raw;
    const {data:a}=await db.from("account_migration_aliases")
      .select("canonical_key,active").eq("alias",alias).eq("active",true).maybeSingle();
    if(!a)return out(req,{eligible:false});

    const found=await db.from("account_migration_users")
      .select("canonical_key,login_username,preferred_login,display_name,role_code,internal_email,eligible,migrated_user_id,must_change_password")
      .eq("canonical_key",a.canonical_key).eq("eligible",true).maybeSingle();
    u=found.data;
  }

  if(!u)return out(req,{eligible:false});

  return out(req,{
    eligible:true,
    migrated:!!u.migrated_user_id,
    internal_email:u.migrated_user_id?u.internal_email:null,
    login_username:u.login_username,
    preferred_login:u.preferred_login,
    display_name:u.display_name,
    role:u.role_code,
    must_change_password:u.must_change_password===true
  });
});