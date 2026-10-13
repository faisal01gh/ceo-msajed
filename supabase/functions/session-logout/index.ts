import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const AUTH=Deno.env.get("SUPABASE_URL")!+"/auth/v1";
const PUBLIC=Deno.env.get("SUPABASE_ANON_KEY")!;

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const ok=origin==="https://faisal01gh.github.io"||origin==="https://ceo-msajed.pages.dev";
  const h:Record<string,string>={
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"content-type,apikey",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","Vary":"Origin"
  };
  if(ok)h["Access-Control-Allow-Origin"]=origin;
  return h;
}
function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors(req)})}

function isToken(token:unknown):token is string{
  if(typeof token!=="string"||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return false;
  try{
    const parts=token.split(".").map(part=>atob(part.replace(/-/g,"+").replace(/_/g,"/")));
    // Syntax only; Auth remains responsible for signature and session validation.
    return parts.slice(0,2).every(part=>{
      const value=JSON.parse(part);
      return value!==null&&typeof value==="object"&&!Array.isArray(value);
    });
  }catch{return false}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
  let b:any;try{b=await req.json()}catch{return json(req,{error:"bad_request"},400)}
  const token=b?.token;
  if(!isToken(token))return json(req,{error:"invalid_credentials"},401);
  try{
    const response=await fetch(AUTH+"/logout",{
      method:"POST",
      redirect:"error",
      headers:{apikey:PUBLIC,Authorization:"Bearer "+token}
    });
    if(response.status===401||response.status===403)return json(req,{error:"invalid_session"},401);
    if(response.status!==204)return json(req,{error:"logout_failed"},502);
  }catch{return json(req,{error:"logout_failed"},502)}
  return json(req,{ok:true});
});
