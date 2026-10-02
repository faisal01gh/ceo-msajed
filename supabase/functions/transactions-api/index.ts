import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const LEGACY = "https://urgkbbconlxeagfgyjee.supabase.co/functions/v1";

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const ok = origin === "https://faisal01gh.github.io" || /^https:\/\/[a-z0-9.-]+\.pages\.dev$/i.test(origin);
  const h: Record<string,string> = {
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"content-type",
    "Content-Type":"application/json; charset=utf-8",
    "Vary":"Origin"
  };
  if (ok) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function out(req: Request, data: unknown, status=200) {
  return new Response(JSON.stringify(data), { status, headers: cors(req) });
}
async function legacyCall(app: string, body: unknown) {
  const fn = app === "ceo" ? "ceoapp" : "ceoportal";
  const r = await fetch(`${LEGACY}/${fn}`, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
  const data = await r.json().catch(()=>null);
  return { ok:r.ok, data };
}
async function identity(app: string, token: string) {
  if (!token) return null;
  if (app === "ceo") {
    const r = await legacyCall("ceo", { action:"whoami", token });
    if (!r.ok || !r.data?.ok) return null;
    const role = r.data.role === "ceo" ? "ceo_office_manager" : "ceo_secretary";
    return { app, username:r.data.username, role, exec:true };
  }
  const r = await legacyCall("portal", { action:"pdata", token });
  if (!r.ok || !r.data?.ok) return null;
  const role = r.data.role === "manager" ? "manager" : (r.data.role === "employee" ? "employee" : "assistant");
  return { app, username:r.data.display_name || "", role, exec:false, raw:r.data };
}
function canCreate(role:string){ return ["ceo_office_manager","ceo_secretary","assistant","manager"].includes(role); }
function canExec(role:string){ return ["ceo_office_manager","ceo_secretary"].includes(role); }
async function canTouch(who:any,id:string){
  if(canExec(who.role)) return true;
  const {data}=await db.from("transactions").select("created_by_name").eq("id",id).maybeSingle();
  return !!data && String(data.created_by_name||"")===String(who.username||"");
}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST") return out(req,{error:"method_not_allowed"},405);
  let b:any; try{b=await req.json()}catch{return out(req,{error:"bad_request"},400)}
  const who = await identity(String(b.app||""), String(b.token||""));
  if(!who) return out(req,{error:"unauthorized"},401);
  const action=String(b.action||"");

  if(action==="list"){
    let q=db.from("transactions").select("*,transaction_periods(id,cycle_no,started_at,ended_at,duration_days)").order("created_at",{ascending:false}).limit(500);
    if(!canExec(who.role)) q=q.eq("origin","new").eq("created_by_name",who.username);
    const {data,error}=await q;
    if(error) return out(req,{error:"db_error"},500);
    return out(req,{ok:true,role:who.role,rows:data||[]});
  }

  if(action==="details"){
    const id=String(b.transaction_id||"");
    if(!id||!(await canTouch(who,id))) return out(req,{error:"forbidden"},403);
    const [{data:tx,error:txe},{data:actions},{data:routes},{data:history},{data:periods}]=await Promise.all([
      db.from("transactions").select("*").eq("id",id).single(),
      db.from("transaction_actions").select("*").eq("transaction_id",id).order("created_at",{ascending:true}),
      db.from("transaction_routes").select("*").eq("transaction_id",id).order("created_at",{ascending:true}),
      db.from("transaction_history").select("*").eq("transaction_id",id).order("created_at",{ascending:true}),
      db.from("transaction_periods").select("*").eq("transaction_id",id).order("cycle_no",{ascending:true})
    ]);
    if(txe) return out(req,{error:"not_found"},404);
    return out(req,{ok:true,transaction:tx,actions:actions||[],routes:routes||[],history:history||[],periods:periods||[]});
  }

  if(action==="create"){
    if(!canCreate(who.role)) return out(req,{error:"forbidden"},403);
    const title=String(b.title||"").trim();
    if(!title) return out(req,{error:"missing_title"},400);
    const {data:num,error:numErr}=await db.rpc("next_transaction_number");
    if(numErr) return out(req,{error:"number_failed"},500);
    const {data,error}=await db.from("transactions").insert({
      number:num,title,subject:String(b.subject||"")||null,attachment_url:String(b.attachment_url||"")||null,
      priority:["عاجل جدًا","عاجل","عادي"].includes(String(b.priority))?String(b.priority):"عادي",
      status:"open",created_by_name:who.username,current_level: who.role==="manager"?"manager":who.role==="assistant"?"assistant":"ceo"
    }).select("*").single();
    if(error) return out(req,{error:"db_error"},500);
    await db.from("transaction_periods").insert({transaction_id:data.id,cycle_no:1,started_at:data.created_at});
    await db.from("transaction_history").insert({
      transaction_id:data.id,event_type:"created",actor_name:who.username,detail:"إنشاء معاملة"
    });
    return out(req,{ok:true,row:data});
  }

  if(action==="add_action"){
    const id=String(b.transaction_id||"");
    const text=String(b.text||"").trim();
    if(!id||!text) return out(req,{error:"missing"},400);
    if(!(await canTouch(who,id))) return out(req,{error:"forbidden"},403);
    const {data,error}=await db.from("transaction_actions").insert({
      transaction_id:id,actor_name:who.username,action_text:text,status:"recorded"
    }).select("*").single();
    if(error) return out(req,{error:"db_error"},500);
    await db.from("transaction_history").insert({transaction_id:id,event_type:"action",actor_name:who.username,detail:text});
    await db.from("transactions").update({last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
    return out(req,{ok:true,row:data});
  }

  if(action==="close"){
    const id=String(b.transaction_id||"");
    const reason=String(b.reason||"").trim();
    if(!id||!reason) return out(req,{error:"missing"},400);
    if(!["ceo_office_manager","ceo_secretary","assistant","manager"].includes(who.role)) return out(req,{error:"forbidden"},403);
    if(!(await canTouch(who,id))) return out(req,{error:"forbidden"},403);
    const now=new Date().toISOString();
    const {data:period}=await db.from("transaction_periods").select("id,started_at").eq("transaction_id",id).is("ended_at",null).order("cycle_no",{ascending:false}).limit(1).maybeSingle();
    if(period?.id){
      const days=Math.max(1,Math.floor((Date.now()-new Date(period.started_at).getTime())/86400000)+1);
      await db.from("transaction_periods").update({ended_at:now,duration_days:days}).eq("id",period.id);
    }
    const {error}=await db.from("transactions").update({status:"closed",closed_at:now,updated_at:now,last_activity_at:now}).eq("id",id);
    if(error) return out(req,{error:"db_error"},500);
    await db.from("transaction_history").insert({transaction_id:id,event_type:"closed",actor_name:who.username,detail:reason});
    return out(req,{ok:true});
  }

  if(action==="reopen"){
    const id=String(b.transaction_id||"");
    const reason=String(b.reason||"").trim();
    if(!id||!reason) return out(req,{error:"missing"},400);
    if(!["ceo_office_manager","ceo_secretary","assistant","manager"].includes(who.role)) return out(req,{error:"forbidden"},403);
    if(!(await canTouch(who,id))) return out(req,{error:"forbidden"},403);
    const now=new Date().toISOString();
    const {data:last}=await db.from("transaction_periods").select("cycle_no").eq("transaction_id",id).order("cycle_no",{ascending:false}).limit(1).maybeSingle();
    const nextCycle=Number(last?.cycle_no||0)+1;
    await db.from("transaction_periods").insert({transaction_id:id,cycle_no:nextCycle,started_at:now});
    const {error}=await db.from("transactions").update({status:"open",closed_at:null,updated_at:now,last_activity_at:now}).eq("id",id);
    if(error) return out(req,{error:"db_error"},500);
    await db.from("transaction_history").insert({transaction_id:id,event_type:"reopened",actor_name:who.username,detail:reason});
    return out(req,{ok:true});
  }

  return out(req,{error:"unknown_action"},400);
});