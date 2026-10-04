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

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
  let b:any;try{b=await req.json()}catch{return json(req,{error:"bad_request"},400)}
  const token=String(b?.token||"");
  if(!token)return json(req,{ok:true});
  try{
    await fetch(AUTH+"/logout",{
      method:"POST",
      headers:{apikey:PUBLIC,Authorization:"Bearer "+token}
    });
  }catch{}
  return json(req,{ok:true});
});