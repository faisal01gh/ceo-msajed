import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LEGACY_FN="https://urgkbbconlxeagfgyjee.supabase.co/functions/v1";
const LEGACY_AUTH="https://urgkbbconlxeagfgyjee.supabase.co";
const NEW_AUTH=Deno.env.get("SUPABASE_URL")!+"/auth/v1";
const NEW_PUBLIC=Deno.env.get("SUPABASE_ANON_KEY")!;
const LEGACY_PUBLIC="sb_publishable_76BLD35YhIoDSI8d-qdp7A_EWhsjEVT";

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const ok=origin==="https://faisal01gh.github.io"||/^https:\/\/[a-z0-9.-]+\.pages\.dev$/i.test(origin);
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
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
  let b:any;try{b=await req.json()}catch{return json(req,{error:"bad_request"},400)}
  const app=String(b?.app||""),token=String(b?.token||"");
  if(!token)return json(req,{ok:true});

  try{
    if(app==="ceo"||app==="portal"){
      const fn=app==="ceo"?"ceoapp":"ceoportal";
      const action=app==="ceo"?"logout":"plogout";
      await fetch(LEGACY_FN+"/"+fn,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,token})
      });
    }else if(app==="auth"){
      await fetch(LEGACY_AUTH+"/auth/v1/logout",{
        method:"POST",
        headers:{apikey:LEGACY_PUBLIC,Authorization:"Bearer "+token}
      });
    }else if(app==="new"){
      await fetch(NEW_AUTH+"/logout",{
        method:"POST",
        headers:{apikey:NEW_PUBLIC,Authorization:"Bearer "+token}
      });
    }
  }catch{}
  return json(req,{ok:true});
});