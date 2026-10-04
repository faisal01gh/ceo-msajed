import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req:Request)=>{
  const origin=req.headers.get("origin")||"";
  const allowed=origin==="https://faisal01gh.github.io"||origin==="https://ceo-msajed.pages.dev";
  const headers:Record<string,string>={
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"content-type,apikey",
    "Vary":"Origin"
  };
  if(allowed)headers["Access-Control-Allow-Origin"]=origin;
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  return new Response(JSON.stringify({error:"legacy_path_disabled"}),{status:410,headers});
});