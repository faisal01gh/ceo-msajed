import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const URL=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const CACHE_MS=60000;
let directoryCache:{at:number,data:any[]}={at:0,data:[]};
let unitsCache:{at:number,data:any[]}={at:0,data:[]};
const identityCache=new Map<string,{at:number,who:Who}>();

type Who={
  app:string;
  login_name:string;
  display_name:string;
  role:string;
  org_name:string;
  dept_name:string;
  dept_names:string[];
  user_id:string|null;
  permissions:string[];
};

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const ok=origin==="https://faisal01gh.github.io"||origin==="https://ceo-msajed.pages.dev";
  const h:Record<string,string>={
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"content-type,apikey",
    "Access-Control-Max-Age":"86400",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Vary":"Origin",
    "X-Robots-Tag":"noindex, nofollow"
  };
  if(ok)h["Access-Control-Allow-Origin"]=origin;
  return h;
}
function out(req:Request,data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:cors(req)});
}
function arr(v:any){return Array.isArray(v)?v:[]}
function clean(v:any){return String(v??"").trim()}
function safeHttpUrl(v:any){
  const value=clean(v);
  if(!value)return null;
  try{
    const u=new URL(value);
    return ["http:","https:"].includes(u.protocol)?u.href:null;
  }catch{return null}
}
function canonicalDept(v:any){
  const n=clean(v);
  if(n==="إدارة العلاقات العامة")return "إدارة العلاقات العامة والإعلام";
  if(n==="إدارة تقنية المعلومات")return "إدارة التقنية";
  if(n==="إدرة المشاريع")return "إدارة المشاريع";
  return n;
}
function unique<T>(xs:T[]){return [...new Set(xs)]}
function isExec(role:string){return ["ceo","ceo_office_manager","ceo_secretary"].includes(role)}
function level(role:string){return isExec(role)?"ceo":role==="assistant"?"assistant":role==="manager"?"manager":"employee"}
function levelRank(v:string|null|undefined){return v==="ceo"?3:v==="assistant"?2:v==="manager"?1:0}
function higherLevel(a:string|null|undefined,b:string|null|undefined){
  return levelRank(a)>=levelRank(b)?a:b;
}
async function effectivePermissions(who:Who){
  const roles=new Set<string>([who.role]);
  if(who.user_id){
    const {data:urs}=await db.from("user_roles").select("role_code").eq("user_id",who.user_id);
    for(const r of urs||[])roles.add(String(r.role_code));
  }
  const {data:rps}=await db.from("role_permissions").select("permission_code").in("role_code",[...roles]);
  const enabled=new Set<string>((rps||[]).map((x:any)=>String(x.permission_code)));

  const {data:acct}=await db.from("account_migration_users").select("canonical_key")
    .eq("preferred_login",who.login_name).eq("eligible",true).limit(1).maybeSingle();
  if(acct?.canonical_key){
    const {data:aos}=await db.from("account_permission_overrides").select("permission_code,effect")
      .eq("canonical_key",acct.canonical_key);
    for(const x of aos||[]){
      const code=String(x.permission_code);
      if(x.effect==="allow")enabled.add(code);
      if(x.effect==="deny")enabled.delete(code);
    }
  }

  if(who.user_id){
    const {data:ups}=await db.from("user_permissions").select("permission_code,effect").eq("user_id",who.user_id);
    for(const x of ups||[]){
      const code=String(x.permission_code);
      if(x.effect==="allow")enabled.add(code);
      if(x.effect==="deny")enabled.delete(code);
    }
  }
  return [...enabled];
}
function hasPerm(who:Who,code:string){
  return arr(who.permissions).includes(code);
}
async function directory(){
  const now=Date.now();
  if(directoryCache.data.length&&now-directoryCache.at<CACHE_MS)return directoryCache.data;
  const {data,error}=await db.from("account_migration_users")
    .select("canonical_key,preferred_login,display_name,role_code,org_name,dept_names,migrated_user_id,eligible")
    .eq("eligible",true).order("display_name");
  if(error)throw error;
  const rows=(data||[]).map((u:any)=>({
    canonical_key:u.canonical_key,
    login_name:u.preferred_login,
    display_name:u.display_name,
    role:u.role_code,
    legacy_role:"",
    org_name:u.org_name||"",
    dept_name:arr(u.dept_names)[0]||(["ceo","ceo_office_manager","ceo_secretary"].includes(u.role_code)?"مكتب الرئيس التنفيذي":""),
    dept_names:arr(u.dept_names).map(canonicalDept),
    user_id:u.migrated_user_id||null,
    source:"migration_registry"
  }));
  directoryCache={at:now,data:rows};
  return rows;
}
async function identity(app:string,token:string):Promise<Who|null>{
  if(app!=="new"||!token)return null;
  const cacheKey=app+":"+token;
  const cached=identityCache.get(cacheKey);
  if(cached&&Date.now()-cached.at<5000)return cached.who;

  const auth=await db.auth.getUser(token);
  if(auth.error||!auth.data.user)return null;
  const {data:ctx,error}=await db.rpc("user_context_internal",{p_user_id:auth.data.user.id});
  if(error||!ctx||ctx.active!==true||ctx.must_change_password===true)return null;

  const role=clean(ctx.role)||"employee";
  const deptNames=arr(ctx.dept_names).map(canonicalDept).filter(Boolean);
  let org=clean(ctx.org_name);
  if(["ceo","ceo_office_manager","ceo_secretary"].includes(role))org="مكتب الرئيس التنفيذي";
  else if(role==="assistant")org=clean(ctx.assistant_unit)||org;

  const who:Who={
    app:"new",
    login_name:clean(ctx.login_name),
    display_name:clean(ctx.full_name),
    role,
    org_name:org,
    dept_name:deptNames[0]||"",
    dept_names:deptNames,
    user_id:auth.data.user.id,
    permissions:[]
  };
  who.permissions=await effectivePermissions(who);
  identityCache.set(cacheKey,{at:Date.now(),who});
  return who;
}
async function units(){
  const now=Date.now();
  if(unitsCache.data.length&&now-unitsCache.at<CACHE_MS)return unitsCache.data;
  const {data,error}=await db.from("organizational_units").select("id,name,unit_type,parent_id,active").eq("active",true);
  if(error)throw error;
  unitsCache={at:now,data:data||[]};
  return unitsCache.data;
}
function descendantIds(all:any[],rootId:string){
  const set=new Set<string>([rootId]);
  let changed=true;
  while(changed){
    changed=false;
    for(const u of all){
      if(u.parent_id&&set.has(u.parent_id)&&!set.has(u.id)){set.add(u.id);changed=true}
    }
  }
  return set;
}
function sectorScopeOf(who:Who,all:any[]){
  const ids=new Set<string>();
  const names=new Set<string>();
  const root=all.find(u=>u.name===who.org_name&&u.parent_id===null);
  if(root){
    const ds=descendantIds(all,root.id);
    for(const id of ds){ids.add(id);const u=all.find(x=>x.id===id);if(u)names.add(u.name)}
  }
  return {ids,names};
}
function scopeOf(who:Who,all:any[]){
  const ids=new Set<string>();
  const names=new Set<string>();
  if(hasPerm(who,"transactions.view_all")){
    for(const u of all){ids.add(u.id);names.add(u.name)}
    return {ids,names};
  }
  if(who.role==="assistant")return sectorScopeOf(who,all);
  const ds=unique([who.dept_name,...who.dept_names].filter(Boolean));
  for(const n of ds){
    names.add(n);
    for(const u of all)if(u.name===n)ids.add(u.id);
  }
  return {ids,names};
}
async function txContext(){
  const [txr,ar,tr,rr,qr,ur]=await Promise.all([
    db.from("transactions").select("id,number,origin,legacy_source,legacy_sn,title,subject,attachment_url,priority,status,responsible_unit_id,responsible_login_name,responsible_name,current_level,close_level,ceo_attention,due_at,created_by_name,created_at,closed_at,cancelled_at,last_activity_at,updated_at,legacy_department_name,workflow_started,closed_reason,cancelled_reason,migration_status,transaction_periods(id,cycle_no,started_at,ended_at,duration_days)").order("created_at",{ascending:false}).limit(1500),
    db.from("transaction_assignments").select("id,transaction_id,unit_id,assignment_type,directive,attachment_url,status,created_at,completed_at,visibility_scope"),
    db.from("transaction_assignment_targets").select("id,assignment_id,user_id,login_name,display_name,active,assigned_at,completed_at"),
    db.from("transaction_routes").select("id,transaction_id,route_type,from_login_name,from_name,to_login_name,to_name,to_unit_id,directive,raise_reason,proposed_decision,transfer_reason,status,rejection_reason,created_at,decided_at,visibility_scope,meta"),
    db.from("transaction_requests").select("id,transaction_id,request_type,requested_by_login_name,requested_by_name,reason,requested_due_at,status,decision_reason,created_at,meta"),
    db.from("organizational_units").select("id,name,unit_type,parent_id,active").eq("active",true)
  ]);
  for(const r of [txr,ar,tr,rr,qr,ur])if(r.error)throw r.error;
  return {txs:txr.data||[],assignments:ar.data||[],targets:tr.data||[],routes:rr.data||[],requests:qr.data||[],units:ur.data||[]};
}
function byKey(rows:any[],key:string){const m=new Map<string,any[]>();for(const r of rows){const k=String(r[key]||"");if(!m.has(k))m.set(k,[]);m.get(k)!.push(r)}return m}
function directVisible(who:Who,a:any){
  if(a.assignment_type!=="direct")return true;
  const s=a.visibility_scope||"employee_exec";
  if(hasPerm(who,"transactions.view_all"))return true;
  if(who.role==="manager")return s==="manager"||s==="manager_assistant";
  if(who.role==="assistant")return s==="assistant"||s==="manager_assistant";
  return false;
}
function flagsFor(who:Who,tx:any,assigns:any[],targetsByAssignment:Map<string,any[]>,routes:any[],scope:any,unitMap:Map<string,any>){
  if(tx.status==="cancelled"&&!hasPerm(who,"transactions.view_all")){
    const mine=tx.created_by_name===who.display_name||tx.created_by_name===who.login_name;
    if(!mine)return {visible:false,incoming:false,shared:false,scope:false,ceo:false,closed:false};
  }
  const mineCreator=[who.display_name,who.login_name].includes(clean(tx.created_by_name));
  const mineResponsible=[who.display_name,who.login_name].includes(clean(tx.responsible_name))||tx.responsible_login_name===who.login_name;
  let currentTarget=false,everTarget=false,scopeHit=false;
  for(const a of assigns){
    const ts=targetsByAssignment.get(a.id)||[];
    if(ts.some(t=>t.login_name===who.login_name||t.display_name===who.display_name)){
      everTarget=true;
      if(a.status==="active"&&ts.some(t=>(t.login_name===who.login_name||t.display_name===who.display_name)&&t.active))currentTarget=true;
    }
    if(a.unit_id&&scope.ids.has(a.unit_id)&&directVisible(who,a))scopeHit=true;
  }
  const routeTo=routes.some(r=>r.to_login_name===who.login_name&&["pending","completed","accepted"].includes(r.status));
  const routeFrom=routes.some(r=>r.from_login_name===who.login_name);
  if(tx.origin==="legacy"&&tx.legacy_department_name&&scope.names.has(tx.legacy_department_name))scopeHit=true;
  const visible=hasPerm(who,"transactions.view_all")||mineCreator||mineResponsible||everTarget||routeTo||routeFrom||scopeHit;
  const incoming=visible&&tx.status==="open"&&(currentTarget||routeTo||mineResponsible);
  const shared=visible&&tx.status==="open"&&!incoming&&(everTarget||routeFrom||(mineCreator&&tx.workflow_started));
  return {visible,incoming,shared,scope:scopeHit,ceo:tx.current_level==="ceo",closed:tx.status==="closed"};
}
function activeDays(tx:any){
  const ps=arr(tx.transaction_periods).sort((a:any,b:any)=>a.cycle_no-b.cycle_no);
  if(ps.length){
    const p=ps[ps.length-1];
    if(p.ended_at)return Number(p.duration_days||0);
    const s=new Date(p.started_at).getTime();
    return Number.isFinite(s)?Math.max(1,Math.floor((Date.now()-s)/86400000)+1):0;
  }
  const s=new Date(tx.created_at).getTime();
  const e=tx.status==="closed"&&tx.closed_at?new Date(tx.closed_at).getTime():Date.now();
  return Number.isFinite(s)&&Number.isFinite(e)?Math.max(1,Math.floor((e-s)/86400000)+1):0;
}
function late(tx:any){
  if(tx.status!=="open"||tx.current_level==="ceo")return false;
  if(tx.due_at)return Date.now()>new Date(tx.due_at).getTime();
  return activeDays(tx)>=6;
}
function canAct(who:Who,tx:any,flags:any){
  if(hasPerm(who,"transactions.act_all")&&flags.visible)return true;
  if(flags.incoming)return true;
  if(who.role==="manager"&&flags.scope&&["employee","manager"].includes(tx.current_level||""))return true;
  if(who.role==="assistant"&&flags.scope&&tx.current_level!=="ceo")return true;
  return false;
}
function canSetDue(who:Who,tx:any,flags:any){
  if(hasPerm(who,"transactions.act_all")&&flags.visible)return true;
  return !!flags.scope&&tx.current_level!=="ceo";
}
function closeAuthority(tx:any){
  if(tx.close_level)return tx.close_level;
  if(tx.current_level==="ceo")return "ceo";
  if(tx.current_level==="assistant")return "assistant";
  return "manager";
}
function rootUnitId(unitId:string|null,unitMap:Map<string,any>){
  if(!unitId)return "";
  let current=unitMap.get(unitId),guard=0;
  while(current?.parent_id&&guard++<20){
    const parent=unitMap.get(current.parent_id);
    if(!parent)break;
    current=parent;
  }
  return current?.id||unitId;
}
function isCrossSector(access:any){
  const roots=new Set<string>();
  const add=(unitId:any)=>{const root=rootUnitId(clean(unitId)||null,access.unitMap);if(root)roots.add(root)};
  add(access.tx.responsible_unit_id);
  for(const a of arr(access.assigns))if(a.unit_id)add(a.unit_id);
  return roots.size>1;
}
function effectiveCloseAuthority(access:any){
  return isCrossSector(access)?"ceo":closeAuthority(access.tx);
}
function canClose(who:Who,access:any){
  if(!access?.flags?.visible)return false;
  const authority=effectiveCloseAuthority(access);
  if(isExec(who.role))return true;
  if(authority==="ceo")return false;
  if(who.role==="assistant"&&access.flags.scope&&["manager","assistant"].includes(authority))return true;
  if(who.role==="manager"&&access.flags.scope&&authority==="manager")return true;
  return false;
}
function closeRequestTarget(who:Who,access:any){
  if(isCrossSector(access))return "ceo";
  if(who.role==="employee")return "manager";
  if(who.role==="assistant_secretary")return "assistant";
  if(who.role==="manager")return "assistant";
  if(who.role==="assistant")return "ceo";
  return "ceo";
}
function canRaiseCeo(who:Who,access:any){
  if(hasPerm(who,"transactions.raise_ceo"))return true;
  const directTarget=arr(access.assigns).some((a:any)=>{
    if(a.assignment_type!=="direct"||a.status!=="active")return false;
    return arr(access.targetsByAssignment?.get(a.id)).some((t:any)=>
      t.active&&(t.login_name===who.login_name||t.display_name===who.display_name)
    );
  });
  const fromExec=arr(access.routes).some((r:any)=>
    r.route_type==="direct_assign"&&r.meta?.directive_owner==="الرئيس التنفيذي"
  );
  return directTarget&&fromExec;
}
async function notify(login:string|undefined|null,name:string|undefined|null,txId:string,event:string,title:string,body:string|null=null){
  if(!login)return;
  await db.from("notifications").insert({
    user_id:null,target_login_name:login,target_name:name||login,transaction_id:txId,event_type:event,title,body
  });
}
async function notifyExec(txId:string,event:string,title:string,body:string|null=null){
  const d=await directory();
  const xs=d.filter((u:any)=>["ceo","ceo_office_manager","ceo_secretary"].includes(u.role));
  for(const x of xs)await notify(x.login_name,x.display_name,txId,event,title,body);
}
async function completeActive(txId:string){
  const {data:as}=await db.from("transaction_assignments").select("id").eq("transaction_id",txId).eq("status","active");
  const ids=(as||[]).map((x:any)=>x.id);
  if(ids.length){
    const now=new Date().toISOString();
    await db.from("transaction_assignment_targets").update({active:false,completed_at:now}).in("assignment_id",ids).eq("active",true);
    await db.from("transaction_assignments").update({status:"completed",completed_at:now}).in("id",ids);
  }
}
async function addAssignment(txId:string,unitId:string|null,type:string,directive:string,targets:string[],visibility:string|null,who:Who){
  const {data:a,error}=await db.from("transaction_assignments").insert({
    transaction_id:txId,unit_id:unitId,assignment_type:type,directive:directive||null,
    status:"active",visibility_scope:visibility||null
  }).select("*").single();
  if(error)throw error;
  if(targets.length){
    const d=await directory();
    const rows=[];
    for(const login of targets){
      const u=d.find((x:any)=>x.login_name===login);
      if(!u)throw new Error("invalid_target");
      rows.push({assignment_id:a.id,user_id:u.user_id||null,login_name:u.login_name,display_name:u.display_name,active:true});
    }
    const {error:e}=await db.from("transaction_assignment_targets").insert(rows);
    if(e)throw e;
    for(const x of rows)await notify(x.login_name,x.display_name,txId,"assignment","معاملة جديدة",directive||null);
  }
  return a;
}
async function addRoute(txId:string,type:string,who:Who,to:any,fields:any={}){
  const row={
    transaction_id:txId,route_type:type,from_login_name:who.login_name,from_name:who.display_name,
    from_role:who.role,to_login_name:to?.login_name||null,to_name:to?.display_name||to?.name||null,
    to_unit_id:to?.unit_id||null,directive:fields.directive||null,raise_reason:fields.raise_reason||null,
    proposed_decision:fields.proposed_decision||null,transfer_reason:fields.transfer_reason||null,
    status:fields.status||"completed",visibility_scope:fields.visibility_scope||null,meta:fields.meta||{}
  };
  const {data,error}=await db.from("transaction_routes").insert(row).select("*").single();
  if(error)throw error;
  return data;
}
async function history(txId:string,event:string,who:Who,detail:string,meta:any={}){
  await db.from("transaction_history").insert({
    transaction_id:txId,event_type:event,actor_name:who.display_name,detail,meta
  });
  await db.from("audit_log").insert({
    actor_id:null,event_type:event,entity_type:"transaction",entity_id:txId,detail,
    meta:{...meta,actor_login:who.login_name,actor_name:who.display_name,actor_role:who.role}
  });
}
async function txRow(id:string){
  const {data}=await db.from("transactions").select("*").eq("id",id).maybeSingle();
  return data;
}
async function scopeCheck(who:Who,unitId:string|null){
  if(hasPerm(who,"transactions.view_all")||hasPerm(who,"transactions.assign_cross_sector"))return true;
  if(!unitId)return false;
  const all=await units();return scopeOf(who,all).ids.has(unitId);
}
async function account(login:string){
  const d=await directory();return d.find((u:any)=>u.login_name===login)||null;
}
async function assistantForOrg(org:string){
  const d=await directory();
  return d.find((u:any)=>u.role==="assistant"&&u.org_name===org&&u.legacy_role==="asst")||
         d.find((u:any)=>u.role==="assistant"&&u.org_name===org)||null;
}
async function managerFor(who:Who){
  const d=await directory();
  const deps=unique([who.dept_name,...who.dept_names].filter(Boolean));
  return d.find((u:any)=>u.role==="manager"&&u.org_name===who.org_name&&u.dept_names.some((x:string)=>deps.includes(x)))||null;
}
async function txAccess(who:Who,id:string){
  const [txr,ar,rr,ur]=await Promise.all([
    db.from("transactions").select("*").eq("id",id).maybeSingle(),
    db.from("transaction_assignments").select("id,transaction_id,unit_id,assignment_type,directive,attachment_url,status,created_at,completed_at,visibility_scope,transaction_assignment_targets(id,user_id,login_name,display_name,active,assigned_at,completed_at)").eq("transaction_id",id),
    db.from("transaction_routes").select("*").eq("transaction_id",id).order("created_at"),
    db.from("organizational_units").select("id,name,unit_type,parent_id,active").eq("active",true)
  ]);
  if(txr.error||!txr.data)return null;
  if(ar.error||rr.error||ur.error)throw ar.error||rr.error||ur.error;
  const tx=txr.data,assigns=ar.data||[],routes=rr.data||[],allUnits=ur.data||[];
  const targetRows:any[]=[];
  for(const a of assigns)for(const t of arr(a.transaction_assignment_targets))targetRows.push({...t,assignment_id:a.id});
  const targetsByAssignment=byKey(targetRows,"assignment_id");
  const scope=scopeOf(who,allUnits);const unitMap=new Map(allUnits.map((u:any)=>[u.id,u]));
  const responsibleUnit=tx.responsible_unit_id?unitMap.get(tx.responsible_unit_id):null;
  tx.responsible_unit_name=responsibleUnit?.name||tx.legacy_department_name||null;
  const flags=flagsFor(who,tx,assigns,targetsByAssignment,routes,scope,unitMap);
  return {tx,assigns,routes,targetsByAssignment,flags,scope,unitMap,units:allUnits};
}
async function closeTx(who:Who,tx:any,reason:string){
  const now=new Date().toISOString();
  const {data:p}=await db.from("transaction_periods").select("id,started_at").eq("transaction_id",tx.id).is("ended_at",null).order("cycle_no",{ascending:false}).limit(1).maybeSingle();
  if(p?.id){
    const days=Math.max(1,Math.floor((Date.now()-new Date(p.started_at).getTime())/86400000)+1);
    await db.from("transaction_periods").update({ended_at:now,duration_days:days}).eq("id",p.id);
  }
  await completeActive(tx.id);
  await db.from("transactions").update({status:"closed",closed_at:now,closed_reason:reason,updated_at:now,last_activity_at:now}).eq("id",tx.id);
  await history(tx.id,"closed",who,reason);
}
async function reopenTx(who:Who,tx:any,reason:string){
  const now=new Date().toISOString();
  const {data:p}=await db.from("transaction_periods").select("cycle_no").eq("transaction_id",tx.id).order("cycle_no",{ascending:false}).limit(1).maybeSingle();
  await db.from("transaction_periods").insert({transaction_id:tx.id,cycle_no:Number(p?.cycle_no||0)+1,started_at:now});
  await db.from("transactions").update({status:"open",closed_at:null,updated_at:now,last_activity_at:now}).eq("id",tx.id);
  await history(tx.id,"reopened",who,reason);
}
async function createRequest(who:Who,tx:any,type:string,reason:string,extra:any={}){
  const meta={requester_role:who.role,...(extra.meta||{})};
  const {data,error}=await db.from("transaction_requests").insert({
    transaction_id:tx.id,request_type:type,requested_by:null,requested_by_login_name:who.login_name,
    requested_by_name:who.display_name,reason,requested_due_at:extra.requested_due_at||null,
    requested_user_id:null,status:"pending",meta
  }).select("*").single();
  if(error)throw error;
  await history(tx.id,"request_"+type,who,reason,{request_id:data.id,target_role:meta.target_role||null});
  const targetRole=clean(meta.target_role);
  if(targetRole==="ceo")await notifyExec(tx.id,"request",tx.title,reason);
  else if(targetRole==="assistant"){
    const a=await assistantForOrg(who.org_name);
    if(a)await notify(a.login_name,a.display_name,tx.id,"request",tx.title,reason);
    else await notifyExec(tx.id,"request",tx.title,reason);
  }else if(targetRole==="manager"){
    const m=await managerFor(who);
    if(m)await notify(m.login_name,m.display_name,tx.id,"request",tx.title,reason);
  }else if(who.role==="manager"||who.role==="assistant")await notifyExec(tx.id,"request",tx.title,reason);
  else{
    const m=await managerFor(who);
    if(m)await notify(m.login_name,m.display_name,tx.id,"request",tx.title,reason);
  }
  return data;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="GET")return out(req,{ok:true,service:"transactions-api",version:33});
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,{error:"method_not_allowed"},405);
  let b:any;try{b=await req.json()}catch{return out(req,{error:"bad_request"},400)}
  const who=await identity(clean(b.app),clean(b.token));
  if(!who)return out(req,{error:"unauthorized"},401);
  const directoryDataCache=await directory();
  const action=clean(b.action);

  try{
    if(action==="directory"){
      const [users0,units0]=await Promise.all([directory(),units()]);
      let visibleUsers=users0,visibleUnits=units0;
      const broadDirectory=hasPerm(who,"transactions.view_all")||hasPerm(who,"transactions.assign_cross_sector");
      if(!broadDirectory){
        const sectorRouting=hasPerm(who,"transactions.assign_sector")||hasPerm(who,"transactions.add_supporting");
        if(sectorRouting){
          const sc=sectorScopeOf(who,units0);
          visibleUnits=units0.filter((u:any)=>sc.ids.has(u.id));
          visibleUsers=users0.filter((u:any)=>u.login_name===who.login_name||u.org_name===who.org_name||u.role==="assistant");
        }else{
          const sc=scopeOf(who,units0);
          visibleUnits=units0.filter((u:any)=>sc.ids.has(u.id));
          if(who.role==="assistant"){
            visibleUsers=users0.filter((u:any)=>u.org_name===who.org_name||u.role==="assistant"||u.login_name===who.login_name);
          }else if(who.role==="manager"){
            const mine=new Set(unique([who.dept_name,...who.dept_names].filter(Boolean)));
            visibleUsers=users0.filter((u:any)=>u.login_name===who.login_name||
              (u.role==="assistant"&&u.org_name===who.org_name)||
              (u.org_name===who.org_name&&arr(u.dept_names).some((d:any)=>mine.has(String(d))))||
              (hasPerm(who,"transactions.transfer_assistant")&&u.role==="assistant"));
          }else{
            const mine=new Set(unique([who.dept_name,...who.dept_names].filter(Boolean)));
            visibleUsers=users0.filter((u:any)=>u.login_name===who.login_name||
              (u.role==="manager"&&u.org_name===who.org_name&&arr(u.dept_names).some((d:any)=>mine.has(String(d))))||
              (hasPerm(who,"transactions.transfer_assistant")&&u.role==="assistant"));
          }
        }
      }
      return out(req,{ok:true,me:who,users:visibleUsers,units:visibleUnits,permissions:who.permissions});
    }

    if(action==="list"){
      const [listed,notif]=await Promise.all([
        db.rpc("list_transactions_internal",{
          p_login:who.login_name,
          p_name:who.display_name,
          p_role:who.role,
          p_org:who.org_name,
          p_depts:who.dept_names,
          p_tab:clean(b.tab)||"all",
          p_search:clean(b.search),
          p_priority:clean(b.priority),
          p_status:clean(b.status),
          p_department:clean(b.department),
          p_employee:clean(b.employee),
          p_origin:clean(b.origin),
          p_late_only:b.late_only===true,
          p_date_from:clean(b.date_from)||null,
          p_date_to:clean(b.date_to)||null,
          p_page:Math.max(1,Number(b.page)||1),
          p_page_size:Math.min(100,Math.max(10,Number(b.page_size)||50))
        }),
        db.from("notifications").select("id",{count:"exact",head:true})
          .eq("target_login_name",who.login_name).is("read_at",null)
      ]);
      if(listed.error)throw listed.error;
      const result:any=listed.data||{ok:true,total:0,page:1,page_size:50,counters:{},rows:[]};
      result.me=who;
      result.counters={...(result.counters||{}),notifications:Number(notif.count||0)};
      return out(req,result);
    }

    if(action==="details"){
      const id=clean(b.transaction_id);const access=await txAccess(who,id);
      if(!access||!access.flags.visible)return out(req,{error:"forbidden"},403);
      const actionIds=(await db.from("transaction_actions").select("id").eq("transaction_id",id)).data?.map((x:any)=>x.id)||[];
      const [{data:actions},{data:versions},{data:actionNotes},{data:routes},{data:requests},{data:historyRows},{data:periods},{data:links},{data:assignments}]=await Promise.all([
        db.from("transaction_actions").select("*").eq("transaction_id",id).order("created_at"),
        db.from("transaction_action_versions").select("*").in("action_id",actionIds.length?actionIds:["00000000-0000-0000-0000-000000000000"]).order("version_no"),
        db.from("transaction_action_notes").select("*").in("action_id",actionIds.length?actionIds:["00000000-0000-0000-0000-000000000000"]).order("created_at"),
        db.from("transaction_routes").select("*").eq("transaction_id",id).order("created_at"),
        db.from("transaction_requests").select("*").eq("transaction_id",id).order("created_at"),
        db.from("transaction_history").select("*").eq("transaction_id",id).order("created_at"),
        db.from("transaction_periods").select("*").eq("transaction_id",id).order("cycle_no"),
        db.from("transaction_links").select("*").eq("transaction_id",id).order("created_at"),
        db.from("transaction_assignments").select("*,transaction_assignment_targets(*)").eq("transaction_id",id).order("created_at")
      ]);
      return out(req,{ok:true,transaction:access.tx,flags:access.flags,can_act:canAct(who,access.tx,access.flags),
        can_close:canClose(who,access),close_authority:effectiveCloseAuthority(access),cross_sector:isCrossSector(access),can_raise_ceo:canRaiseCeo(who,access),actions:actions||[],action_versions:versions||[],action_notes:actionNotes||[],routes:routes||[],
        requests:requests||[],history:historyRows||[],periods:periods||[],links:links||[],assignments:assignments||[]});
    }

    if(action==="create"){
      const title=clean(b.title);if(!title)return out(req,{error:"missing_title"},400);
      const attachment=safeHttpUrl(b.attachment_url);
      if(clean(b.attachment_url)&&!attachment)return out(req,{error:"invalid_attachment_url"},400);
      if(!hasPerm(who,"transactions.create"))return out(req,{error:"forbidden"},403);
      const {data:num,error:numErr}=await db.rpc("next_transaction_number");if(numErr)throw numErr;
      const lvl=level(who.role);
      const {data:tx,error}=await db.from("transactions").insert({
        number:num,origin:"new",title,subject:clean(b.subject)||null,attachment_url:attachment,
        priority:["عاجل جدًا","عاجل","عادي"].includes(clean(b.priority))?clean(b.priority):"عادي",
        status:"open",responsible_login_name:who.login_name,responsible_name:who.display_name,
        current_level:lvl,close_level:lvl==="employee"?"manager":lvl,created_by_name:who.display_name
      }).select("*").single();
      if(error)throw error;
      await db.from("transaction_periods").insert({transaction_id:tx.id,cycle_no:1,started_at:tx.created_at});
      await history(tx.id,"created",who,"إنشاء معاملة");
      return out(req,{ok:true,row:tx});
    }

    if(action==="add_action"){
      const id=clean(b.transaction_id),text=clean(b.text);if(!id||!text)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible||!canAct(who,a.tx,a.flags))return out(req,{error:"forbidden"},403);
      const {data:row,error}=await db.from("transaction_actions").insert({
        transaction_id:id,actor_name:who.display_name,action_text:text,status:"recorded"
      }).select("*").single();if(error)throw error;
      await db.from("transaction_action_versions").insert({action_id:row.id,version_no:1,body:text,actor_name:who.display_name});
      await history(id,"action",who,text);
      await db.from("transactions").update({last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
      return out(req,{ok:true,row});
    }

    if(action==="add_action_note"){
      const actionId=clean(b.action_id),note=clean(b.note);
      if(!actionId||!note)return out(req,{error:"missing"},400);
      const {data:act}=await db.from("transaction_actions").select("*").eq("id",actionId).maybeSingle();
      if(!act)return out(req,{error:"not_found"},404);
      const a=await txAccess(who,act.transaction_id);
      if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const d=await directory();
      const actor=d.find((u:any)=>u.display_name===clean(act.actor_name)||u.login_name===clean(act.actor_name));
      let allowed=hasPerm(who,"transactions.act_all");
      if(!allowed&&actor){
        allowed=levelRank(level(who.role))>levelRank(level(actor.role));
        if(allowed&&who.role==="manager")allowed=a.flags.scope;
        if(allowed&&who.role==="assistant")allowed=a.flags.scope;
      }
      if(!allowed)return out(req,{error:"forbidden"},403);
      const {data:row,error}=await db.from("transaction_action_notes").insert({
        action_id:actionId,transaction_id:act.transaction_id,actor_name:who.display_name,note
      }).select("*").single();
      if(error)throw error;
      await history(act.transaction_id,"action_note",who,note,{action_id:actionId});
      return out(req,{ok:true,row});
    }

    if(action==="decide_action"){
      return out(req,{error:"action_approval_retired"},410);
    }

    if(action==="revise_action"){
      const actionId=clean(b.action_id),text=clean(b.text);if(!text)return out(req,{error:"missing"},400);
      const {data:act}=await db.from("transaction_actions").select("*").eq("id",actionId).maybeSingle();
      if(!act)return out(req,{error:"not_found"},404);
      if(!hasPerm(who,"transactions.act_all")&&![who.display_name,who.login_name].includes(clean(act.actor_name)))return out(req,{error:"forbidden"},403);
      const v=Number(act.current_version||1)+1;
      await db.from("transaction_action_versions").insert({action_id:actionId,version_no:v,body:text,actor_name:who.display_name});
      await db.from("transaction_actions").update({action_text:text,current_version:v,status:"recorded",updated_at:new Date().toISOString()}).eq("id",actionId);
      await history(act.transaction_id,"action_revised",who,text,{action_id:actionId,version:v});
      return out(req,{ok:true});
    }

    if(action==="resolve_legacy_context"){
      if(!hasPerm(who,"transactions.act_all")||!hasPerm(who,"transactions.change_responsible"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),unitId=clean(b.responsible_unit_id),login=clean(b.responsible_login_name);
      const title=clean(b.title),subject=clean(b.subject);
      if(!id||!unitId||!login||!title)return out(req,{error:"missing"},400);
      const tx=await txRow(id);if(!tx)return out(req,{error:"not_found"},404);
      if(tx.origin!=="legacy"||tx.status!=="open"||tx.migration_status!=="needs_review")return out(req,{error:"not_review_case"},409);
      const target=await account(login);if(!target)return out(req,{error:"invalid_target"},400);
      const allUnits=await units();
      const unit=allUnits.find((u:any)=>u.id===unitId);if(!unit)return out(req,{error:"invalid_unit"},400);
      if(!arr(target.dept_names).includes(unit.name)&&target.role!=="assistant"&&!isExec(target.role))return out(req,{error:"target_unit_mismatch"},409);
      const now=new Date().toISOString();
      await db.from("transactions").update({
        title,subject:subject||null,responsible_unit_id:unitId,
        responsible_login_name:target.login_name,responsible_name:target.display_name,
        current_level:level(target.role),migration_status:"ready",workflow_started:true,
        updated_at:now,last_activity_at:now
      }).eq("id",id);
      await history(id,"legacy_context_resolved",who,"تهيئة سياق المعاملة القديمة",{
        unit:unit.name,responsible:target.display_name,title
      });
      return out(req,{ok:true});
    }

    if(action==="route_employee_manager"){
      if(!hasPerm(who,"transactions.raise_manager"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),reason=clean(b.raise_reason),proposed=clean(b.proposed_decision);
      if(!id||!reason||!proposed)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.incoming)return out(req,{error:"forbidden"},403);
      const m=await managerFor(who);if(!m)return out(req,{error:"manager_not_found"},409);
      await completeActive(id);
      await addRoute(id,"raise",who,m,{raise_reason:reason,proposed_decision:proposed});
      await db.from("transactions").update({current_level:"manager",close_level:higherLevel(a.tx.close_level,"manager"),workflow_started:true,updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"raise_manager",who,reason,{proposed_decision:proposed,to:m.display_name});
      await notify(m.login_name,m.display_name,id,"route",a.tx.title,reason);
      return out(req,{ok:true});
    }

    if(action==="route_manager_employees"){
      if(!hasPerm(who,"transactions.assign_department"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),directive=clean(b.directive),unitId=clean(b.unit_id);
      const targets=unique(arr(b.targets).map(String).filter(Boolean));
      if(!id||!directive||!unitId||!targets.length)return out(req,{error:"missing"},400);
      const allUnits=await units();
      const unit=allUnits.find((u:any)=>u.id===unitId);
      const mine=new Set(unique([who.dept_name,...who.dept_names].filter(Boolean)));
      if(!unit||!mine.has(unit.name))return out(req,{error:"forbidden_scope"},403);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const d=await directory();
      for(const login of targets){
        const u=d.find((x:any)=>x.login_name===login);if(!u)return out(req,{error:"invalid_target"},400);
        if(!u.dept_names.includes(unit.name))return out(req,{error:"forbidden_target"},403);
      }
      await completeActive(id);
      await addAssignment(id,unitId,"responsible",directive,targets,null,who);
      await addRoute(id,"directive",who,{unit_id:unitId,name:unit?.name||"",display_name:targets.join("، ")},{directive,meta:{targets}});
      await db.from("transactions").update({responsible_unit_id:unitId,current_level:"employee",close_level:higherLevel(a.tx.close_level,"manager"),workflow_started:true,migration_status:"ready",updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"directive_employee",who,directive,{targets,unit:unit?.name||""});
      return out(req,{ok:true});
    }

    if(action==="route_manager_assistant"){
      if(!hasPerm(who,"transactions.raise_assistant"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),reason=clean(b.raise_reason),proposed=clean(b.proposed_decision);
      if(!id||!reason||!proposed)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const asst=await assistantForOrg(who.org_name);if(!asst)return out(req,{error:"assistant_not_found"},409);
      await completeActive(id);
      await addRoute(id,"raise",who,asst,{raise_reason:reason,proposed_decision:proposed});
      await db.from("transactions").update({current_level:"assistant",close_level:higherLevel(a.tx.close_level,"assistant"),workflow_started:true,migration_status:"ready",updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"raise_assistant",who,reason,{proposed_decision:proposed,to:asst.display_name});
      await notify(asst.login_name,asst.display_name,id,"route",a.tx.title,reason);
      return out(req,{ok:true});
    }

    if(action==="route_assistant_scope"){
      if(!hasPerm(who,"transactions.assign_sector"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),responsibleUnit=clean(b.responsible_unit_id),directive=clean(b.directive);
      const responsibleTargets=unique(arr(b.targets).map(String).filter(Boolean));
      const supports=arr(b.supporting);
      if(!id||!responsibleUnit||!directive||!responsibleTargets.length)return out(req,{error:"missing"},400);
      const allUnits=await units();
      const sectorScope=sectorScopeOf(who,allUnits);
      if(!sectorScope.ids.has(responsibleUnit))return out(req,{error:"forbidden_scope"},403);
      if(supports.length&&!hasPerm(who,"transactions.add_supporting"))return out(req,{error:"forbidden_supporting"},403);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const directoryUsers=await directory();
      const responsibleUnitRow=allUnits.find((u:any)=>u.id===responsibleUnit);
      if(!responsibleUnitRow)return out(req,{error:"invalid_unit"},400);
      for(const login of responsibleTargets){
        const u=directoryUsers.find((x:any)=>x.login_name===login);
        if(!u||!u.dept_names.includes(responsibleUnitRow.name))return out(req,{error:"forbidden_target"},403);
      }
      await completeActive(id);
      await addAssignment(id,responsibleUnit,"responsible",directive,responsibleTargets,null,who);
      for(const s of supports){
        const unitId=clean(s.unit_id),supportDirective=clean(s.directive),targets=unique(arr(s.targets).map(String).filter(Boolean));
        if(!unitId||!supportDirective||!targets.length)return out(req,{error:"invalid_supporting"},400);
        if(!sectorScope.ids.has(unitId))return out(req,{error:"forbidden_scope"},403);
        const unitRow=allUnits.find((u:any)=>u.id===unitId);
        if(!unitRow)return out(req,{error:"invalid_unit"},400);
        for(const login of targets){
          const u=directoryUsers.find((x:any)=>x.login_name===login);
          if(!u||!u.dept_names.includes(unitRow.name))return out(req,{error:"forbidden_target"},403);
        }
        await addAssignment(id,unitId,"supporting",supportDirective,targets,null,who);
      }
      await addRoute(id,"directive",who,{unit_id:responsibleUnit,name:""},{directive,meta:{responsible_targets:responsibleTargets,supporting:supports}});
      await db.from("transactions").update({responsible_unit_id:responsibleUnit,current_level:"employee",close_level:higherLevel(a.tx.close_level,"assistant"),workflow_started:true,migration_status:"ready",updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"assistant_scope_route",who,directive,{responsible_targets:responsibleTargets,supporting:supports});
      return out(req,{ok:true});
    }

    if(action==="transfer_assistant"){
      if(!hasPerm(who,"transactions.transfer_assistant"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),toLogin=clean(b.to_login),reason=clean(b.transfer_reason),directive=clean(b.directive);
      if(!id||!toLogin||!reason||!directive)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const target=await account(toLogin);if(!target||target.role!=="assistant"||target.login_name===who.login_name)return out(req,{error:"invalid_target"},400);
      const route=await addRoute(id,"assistant_transfer",who,target,{transfer_reason:reason,directive,status:"pending"});
      await history(id,"assistant_transfer_requested",who,reason,{to:target.display_name,route_id:route.id});
      await notify(target.login_name,target.display_name,id,"assistant_transfer",a.tx.title,reason);
      return out(req,{ok:true,route});
    }

    if(action==="decide_assistant_transfer"){
      if(!hasPerm(who,"transactions.decide_assistant_transfer"))return out(req,{error:"forbidden"},403);
      const routeId=clean(b.route_id),approve=!!b.approve,reason=clean(b.reason);
      const {data:r}=await db.from("transaction_routes").select("*").eq("id",routeId).eq("route_type","assistant_transfer").eq("status","pending").maybeSingle();
      if(!r||r.to_login_name!==who.login_name)return out(req,{error:"forbidden"},403);
      if(!approve&&!reason)return out(req,{error:"reason_required"},400);
      const now=new Date().toISOString();
      await db.from("transaction_routes").update({
        status:approve?"accepted":"rejected",rejection_reason:approve?null:reason,decided_at:now,to_name:who.display_name
      }).eq("id",routeId);
      const tx=await txRow(r.transaction_id);if(!tx)return out(req,{error:"not_found"},404);
      if(approve){
        await completeActive(tx.id);
        await db.from("transactions").update({current_level:"assistant",close_level:"ceo",workflow_started:true,updated_at:now,last_activity_at:now}).eq("id",tx.id);
        await history(tx.id,"assistant_transfer_accepted",who,r.transfer_reason||"",{from:r.from_name});
      }else await history(tx.id,"assistant_transfer_rejected",who,reason,{from:r.from_name});
      await notify(r.from_login_name,r.from_name,tx.id,approve?"transfer_accepted":"transfer_rejected",tx.title,approve?null:reason);
      return out(req,{ok:true});
    }

    if(action==="route_assistant_ceo"){
      const id=clean(b.transaction_id),reason=clean(b.raise_reason),proposed=clean(b.proposed_decision);
      if(!id||!reason||!proposed)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible||!canRaiseCeo(who,a))return out(req,{error:"forbidden"},403);
      await completeActive(id);
      await addRoute(id,"raise",who,{name:"الرئيس التنفيذي"},{raise_reason:reason,proposed_decision:proposed});
      await db.from("transactions").update({current_level:"ceo",close_level:"ceo",workflow_started:true,ceo_attention:false,updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"raise_ceo",who,"تم رفع المعاملة للرئيس التنفيذي",{reason,requested:proposed,proposed_decision:proposed});
      await notifyExec(id,"raise_ceo",a.tx.title,reason);
      return out(req,{ok:true});
    }

    if(action==="route_exec_assistant"){
      if(!hasPerm(who,"transactions.raise_assistant"))return out(req,{error:"forbidden"},403);
      if(!isExec(who.role))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),toLogin=clean(b.to_login),directive=clean(b.directive);
      if(!id||!toLogin||!directive)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a)return out(req,{error:"not_found"},404);
      const target=await account(toLogin);if(!target||target.role!=="assistant")return out(req,{error:"invalid_target"},400);
      await completeActive(id);
      await addRoute(id,"directive",who,target,{directive,meta:isExec(who.role)?{directive_owner:"الرئيس التنفيذي",entered_by:who.display_name}:{}});
      await db.from("transactions").update({current_level:"assistant",close_level:"ceo",workflow_started:true,migration_status:"ready",ceo_attention:false,updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"exec_to_assistant",who,directive,{to:target.display_name});
      await notify(target.login_name,target.display_name,id,"route",a.tx.title,directive);
      return out(req,{ok:true});
    }

    if(action==="direct_exec_employee"){
      if(!hasPerm(who,"transactions.assign_cross_sector"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id),unitId=clean(b.unit_id),directive=clean(b.directive),visibility=clean(b.visibility_scope)||"employee_exec";
      const targets=unique(arr(b.targets).map(String).filter(Boolean));
      if(!id||!unitId||!directive||!targets.length)return out(req,{error:"missing"},400);
      if(!["employee_exec","manager","assistant","manager_assistant"].includes(visibility))return out(req,{error:"bad_visibility"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const allUnits=await units();
      const unit=allUnits.find((u:any)=>u.id===unitId);if(!unit)return out(req,{error:"invalid_unit"},400);
      const d=await directory();
      for(const login of targets){
        const u=d.find((x:any)=>x.login_name===login);if(!u||!u.dept_names.includes(unit.name))return out(req,{error:"forbidden_target"},403);
      }
      await completeActive(id);
      await addAssignment(id,unitId,"direct",directive,targets,visibility,who);
      await addRoute(id,"direct_assign",who,{unit_id:unitId,name:unit.name},{directive,visibility_scope:visibility,meta:isExec(who.role)?{targets,directive_owner:"الرئيس التنفيذي",entered_by:who.display_name}:{targets}});
      await db.from("transactions").update({responsible_unit_id:unitId,current_level:"employee",close_level:isExec(who.role)?"ceo":"assistant",workflow_started:true,migration_status:"ready",ceo_attention:false,updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"direct_assign",who,directive,{targets,visibility_scope:visibility});
      return out(req,{ok:true});
    }

    if(action==="mark_ceo_view"){
      const id=clean(b.transaction_id);if(!id)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      if(!hasPerm(who,"transactions.ceo_view"))return out(req,{error:"forbidden"},403);
      await db.from("transactions").update({ceo_attention:true,updated_at:new Date().toISOString()}).eq("id",id);
      await addRoute(id,"ceo_view",who,{name:"الرئيس التنفيذي"},{});
      await history(id,"ceo_view_marked",who,"إطلاع الرئيس التنفيذي");
      await notifyExec(id,"ceo_view",a.tx.title,null);
      return out(req,{ok:true});
    }

    if(action==="change_subject"){
      const id=clean(b.transaction_id),subject=clean(b.subject);
      const a=await txAccess(who,id);
      if(!a||!a.flags.visible||!hasPerm(who,"transactions.edit_subject")||(!canAct(who,a.tx,a.flags)&&!hasPerm(who,"transactions.act_all")))return out(req,{error:"forbidden"},403);
      const old=clean(a.tx.subject);
      if(old===subject)return out(req,{ok:true,unchanged:true});
      const now=new Date().toISOString();
      await db.from("transactions").update({subject:subject||null,updated_at:now,last_activity_at:now}).eq("id",id);
      await history(id,"subject_changed",who,"تم تعديل موضوع المعاملة",{old_subject:old,new_subject:subject});
      return out(req,{ok:true});
    }

    if(action==="change_responsible_unit"){
      const id=clean(b.transaction_id),unitId=clean(b.responsible_unit_id),toLogin=clean(b.responsible_login_name);
      if(!id||!unitId||!toLogin)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);
      if(!a||!a.flags.visible||!hasPerm(who,"transactions.change_responsible_unit"))return out(req,{error:"forbidden"},403);
      if(!hasPerm(who,"transactions.act_all")&&!(await scopeCheck(who,unitId)))return out(req,{error:"forbidden_scope"},403);
      const unit=a.units.find((u:any)=>u.id===unitId);
      const target=await account(toLogin);
      if(!unit||!target)return out(req,{error:"invalid_target"},400);
      if(!arr(target.dept_names).includes(unit.name)&&!isExec(target.role)&&target.role!=="assistant")return out(req,{error:"target_unit_mismatch"},409);
      const oldUnit=a.tx.responsible_unit_name||"";
      const oldResponsible=a.tx.responsible_name||a.tx.responsible_login_name||"";
      const now=new Date().toISOString();
      await db.from("transactions").update({
        responsible_unit_id:unitId,responsible_login_name:target.login_name,responsible_name:target.display_name,
        updated_at:now,last_activity_at:now
      }).eq("id",id);
      await history(id,"responsible_unit_changed",who,"تم تغيير الإدارة المسؤولة",{
        old_unit:oldUnit,new_unit:unit.name,old_responsible:oldResponsible,new_responsible:target.display_name
      });
      await notify(target.login_name,target.display_name,id,"responsible_changed",a.tx.title,"تم تعيينك مسؤولًا عن المعاملة");
      return out(req,{ok:true});
    }

    if(action==="change_priority"){
      const id=clean(b.transaction_id),priority=clean(b.priority),reason=clean(b.reason);
      if(!["عاجل جدًا","عاجل","عادي"].includes(priority))return out(req,{error:"bad_priority"},400);
      if(!reason)return out(req,{error:"reason_required"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible||!canAct(who,a.tx,a.flags)||!hasPerm(who,"transactions.change_priority"))return out(req,{error:"forbidden"},403);
      const old=a.tx.priority;
      await db.from("transactions").update({priority,updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"priority_changed",who,"تم تغيير أولوية المعاملة",{old_priority:old,new_priority:priority,reason});
      return out(req,{ok:true});
    }

    if(action==="set_due_date"){
      const id=clean(b.transaction_id),due=clean(b.due_at);
      const a=await txAccess(who,id);if(!a||!a.flags.visible||!canSetDue(who,a.tx,a.flags)||!hasPerm(who,"transactions.set_due_date"))return out(req,{error:"forbidden"},403);
      const d=due?new Date(due):null;if(d&&Number.isNaN(d.getTime()))return out(req,{error:"bad_date"},400);
      const oldDue=a.tx.due_at||null;
      const nextDue=d?d.toISOString():null;
      await db.from("transactions").update({due_at:nextDue,updated_at:new Date().toISOString()}).eq("id",id);
      await history(id,"due_date_changed",who,nextDue?"تم تعيين تاريخ استحقاق المعاملة":"تمت إزالة تاريخ استحقاق المعاملة",{old_due_at:oldDue,new_due_at:nextDue});
      return out(req,{ok:true});
    }

    if(action==="request_extension"){
      const id=clean(b.transaction_id),reason=clean(b.reason),due=clean(b.requested_due_at);
      if(!reason||!due)return out(req,{error:"missing"},400);
      const d=new Date(due);if(Number.isNaN(d.getTime()))return out(req,{error:"bad_date"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const row=await createRequest(who,a.tx,"extension",reason,{requested_due_at:d.toISOString()});
      return out(req,{ok:true,row});
    }

    if(action==="change_responsible"){
      const id=clean(b.transaction_id),toLogin=clean(b.to_login),reason=clean(b.reason);
      if(!id||!toLogin||!reason)return out(req,{error:"missing"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const target=await account(toLogin);if(!target)return out(req,{error:"invalid_target"},400);
      let direct=hasPerm(who,"transactions.change_responsible")&&hasPerm(who,"transactions.act_all");
      if(hasPerm(who,"transactions.change_responsible")&&who.role==="manager"&&["employee","manager"].includes(a.tx.current_level||"")&&target.dept_names.some((x:string)=>who.dept_names.includes(x)||x===who.dept_name))direct=true;
      if(hasPerm(who,"transactions.change_responsible")&&who.role==="assistant"&&a.tx.current_level!=="ceo"&&target.org_name===who.org_name)direct=true;
      if(!direct){
        const row=await createRequest(who,a.tx,"change_responsible",reason,{meta:{to_login:toLogin,to_name:target.display_name}});
        return out(req,{ok:true,requested:true,row});
      }
      const old=a.tx.responsible_name||a.tx.responsible_login_name||"";
      await db.from("transactions").update({responsible_login_name:target.login_name,responsible_name:target.display_name,updated_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}).eq("id",id);
      await history(id,"responsible_changed",who,"تم تغيير مسؤول المعاملة",{old_responsible:old,new_responsible:target.display_name,reason});
      await notify(target.login_name,target.display_name,id,"responsible_changed",a.tx.title,reason);
      return out(req,{ok:true});
    }

    if(action==="close"){
      const id=clean(b.transaction_id),reason=clean(b.reason);if(!reason)return out(req,{error:"reason_required"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible||!canClose(who,a)||!hasPerm(who,"transactions.close"))return out(req,{error:"forbidden"},403);
      await closeTx(who,a.tx,reason);return out(req,{ok:true});
    }
    if(action==="request_close"){
      const id=clean(b.transaction_id),reason=clean(b.reason);if(!reason)return out(req,{error:"reason_required"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const targetRole=closeRequestTarget(who,a);
      const row=await createRequest(who,a.tx,"close",reason,{meta:{target_role:targetRole,cross_sector:isCrossSector(a)}});
      return out(req,{ok:true,row,target_role:targetRole});
    }
    if(action==="reopen"){
      const id=clean(b.transaction_id),reason=clean(b.reason);if(!reason)return out(req,{error:"reason_required"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible||!canClose(who,a)||!hasPerm(who,"transactions.reopen"))return out(req,{error:"forbidden"},403);
      if(a.tx.origin==="legacy"&&(!a.tx.responsible_unit_id||!a.tx.responsible_login_name)){
        const unitId=clean(b.responsible_unit_id),login=clean(b.responsible_login_name);
        if(!unitId||!login)return out(req,{error:"legacy_context_required"},409);
        if(!(await scopeCheck(who,unitId))&&!hasPerm(who,"transactions.act_all"))return out(req,{error:"forbidden_scope"},403);
        const target=await account(login);if(!target)return out(req,{error:"invalid_target"},400);
        await db.from("transactions").update({
          responsible_unit_id:unitId,responsible_login_name:target.login_name,responsible_name:target.display_name,
          current_level:level(target.role),workflow_started:true,migration_status:"ready"
        }).eq("id",id);
        a.tx.responsible_unit_id=unitId;a.tx.responsible_login_name=target.login_name;a.tx.responsible_name=target.display_name;
        a.tx.current_level=level(target.role);a.tx.workflow_started=true;a.tx.migration_status="ready";a.tx.migration_status="ready";
      }
      await reopenTx(who,a.tx,reason);return out(req,{ok:true});
    }
    if(action==="request_reopen"){
      const id=clean(b.transaction_id),reason=clean(b.reason);if(!reason)return out(req,{error:"reason_required"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const meta:any={};
      if(a.tx.origin==="legacy"&&(!a.tx.responsible_unit_id||!a.tx.responsible_login_name)){
        const unitId=clean(b.responsible_unit_id),login=clean(b.responsible_login_name);
        if(!unitId||!login)return out(req,{error:"legacy_context_required"},409);
        const target=await account(login);if(!target)return out(req,{error:"invalid_target"},400);
        meta.responsible_unit_id=unitId;meta.responsible_login_name=target.login_name;meta.responsible_name=target.display_name;
      }
      const row=await createRequest(who,a.tx,"reopen",reason,{meta});return out(req,{ok:true,row});
    }

    if(action==="request_cancel"){
      const id=clean(b.transaction_id),reason=clean(b.reason);if(!reason)return out(req,{error:"reason_required"},400);
      const a=await txAccess(who,id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      if(hasPerm(who,"transactions.act_all")){
        await completeActive(id);
        await db.from("transactions").update({status:"cancelled",cancelled_at:new Date().toISOString(),cancelled_reason:reason,updated_at:new Date().toISOString()}).eq("id",id);
        await history(id,"cancelled",who,reason);return out(req,{ok:true,direct:true});
      }
      const row=await createRequest(who,a.tx,"cancel",reason);return out(req,{ok:true,row});
    }

    if(action==="decide_request"){
      const requestId=clean(b.request_id),approve=!!b.approve,decisionReason=clean(b.decision_reason);
      const {data:r}=await db.from("transaction_requests").select("*").eq("id",requestId).eq("status","pending").maybeSingle();
      if(!r)return out(req,{error:"not_found"},404);
      const a=await txAccess(who,r.transaction_id);if(!a||!a.flags.visible)return out(req,{error:"forbidden"},403);
      const requesterRole=clean(r.meta?.requester_role),targetRole=clean(r.meta?.target_role);
      let allowed=false;
      if(targetRole==="ceo")allowed=isExec(who.role)&&hasPerm(who,"transactions.act_all");
      else if(targetRole==="assistant")allowed=who.role==="assistant"&&a.flags.scope;
      else if(targetRole==="manager")allowed=who.role==="manager"&&a.flags.scope;
      else{
        allowed=hasPerm(who,"transactions.act_all");
        if(who.role==="assistant"&&["manager","employee"].includes(requesterRole)&&a.flags.scope)allowed=true;
        if(who.role==="manager"&&requesterRole==="employee"&&a.flags.scope)allowed=true;
      }
      if(!allowed)return out(req,{error:"forbidden"},403);
      if(!approve&&!decisionReason)return out(req,{error:"reason_required"},400);
      const now=new Date().toISOString();
      if(approve){
        if(r.request_type==="close"){
          if(canClose(who,a))await closeTx(who,a.tx,r.reason);
          else{
            const nextRole=closeRequestTarget(who,a);
            await createRequest(who,a.tx,"close",r.reason,{meta:{target_role:nextRole,forwarded_from_request:r.id,cross_sector:isCrossSector(a)}});
          }
        }
        else if(r.request_type==="reopen"){
          if(a.tx.origin==="legacy"&&(!a.tx.responsible_unit_id||!a.tx.responsible_login_name)){
            const unitId=clean(r.meta?.responsible_unit_id),login=clean(r.meta?.responsible_login_name);
            if(!unitId||!login)return out(req,{error:"legacy_context_required"},409);
            const target=await account(login);if(!target)return out(req,{error:"invalid_target"},409);
            await db.from("transactions").update({
              responsible_unit_id:unitId,responsible_login_name:target.login_name,responsible_name:target.display_name,
              current_level:level(target.role),workflow_started:true,migration_status:"ready"
            }).eq("id",a.tx.id);
            a.tx.responsible_unit_id=unitId;a.tx.responsible_login_name=target.login_name;a.tx.responsible_name=target.display_name;
            a.tx.current_level=level(target.role);a.tx.workflow_started=true;
          }
          await reopenTx(who,a.tx,r.reason);
        }
        else if(r.request_type==="cancel"){
          await completeActive(a.tx.id);
          await db.from("transactions").update({status:"cancelled",cancelled_at:now,cancelled_reason:r.reason,updated_at:now}).eq("id",a.tx.id);
          await history(a.tx.id,"cancelled",who,r.reason);
        }else if(r.request_type==="extension"){
          await db.from("transactions").update({due_at:r.requested_due_at,updated_at:now}).eq("id",a.tx.id);
          await history(a.tx.id,"extension_approved",who,r.reason,{due_at:r.requested_due_at});
        }else if(r.request_type==="change_responsible"){
          const toLogin=clean(r.meta?.to_login),target=await account(toLogin);
          if(!target)return out(req,{error:"invalid_target"},409);
          const oldResponsible=a.tx.responsible_name||a.tx.responsible_login_name||"";
          await db.from("transactions").update({responsible_login_name:toLogin,responsible_name:target.display_name,updated_at:now,last_activity_at:now}).eq("id",a.tx.id);
          await history(a.tx.id,"responsible_changed",who,"تم تغيير مسؤول المعاملة",{old_responsible:oldResponsible,new_responsible:target.display_name,reason:r.reason});
        }
      }
      await db.from("transaction_requests").update({
        status:approve?"approved":"rejected",decided_by_login_name:who.login_name,decided_by_name:who.display_name,
        decision_reason:decisionReason||null,decided_at:now
      }).eq("id",requestId);
      await history(a.tx.id,approve?"request_approved":"request_rejected",who,decisionReason||r.reason,{request_id:requestId,type:r.request_type});
      await notify(r.requested_by_login_name,r.requested_by_name,a.tx.id,approve?"request_approved":"request_rejected",a.tx.title,decisionReason||null);
      return out(req,{ok:true});
    }

    if(action==="delete_hard"){
      if(!hasPerm(who,"transactions.delete_hard"))return out(req,{error:"forbidden"},403);
      const id=clean(b.transaction_id);const tx=await txRow(id);if(!tx)return out(req,{error:"not_found"},404);
      const [{count:routes},{count:acts},{count:assigns}]=await Promise.all([
        db.from("transaction_routes").select("id",{count:"exact",head:true}).eq("transaction_id",id),
        db.from("transaction_actions").select("id",{count:"exact",head:true}).eq("transaction_id",id),
        db.from("transaction_assignments").select("id",{count:"exact",head:true}).eq("transaction_id",id)
      ]);
      if(tx.workflow_started||Number(routes||0)>0||Number(acts||0)>0||Number(assigns||0)>0)return out(req,{error:"workflow_started"},409);
      await db.from("audit_log").insert({
        actor_id:null,event_type:"hard_delete",entity_type:"transaction",entity_id:id,
        detail:"حذف نهائي لمعاملة لم يبدأ سيرها",meta:{actor_login:who.login_name,actor_name:who.display_name,actor_role:who.role,number:tx.number,title:tx.title}
      });
      await db.from("transactions").delete().eq("id",id);
      return out(req,{ok:true});
    }

    if(action==="notifications"){
      const {data,error}=await db.from("notifications").select("*").eq("target_login_name",who.login_name).order("created_at",{ascending:false}).limit(100);
      if(error)throw error;return out(req,{ok:true,rows:data||[]});
    }
    if(action==="notification_read"){
      const id=clean(b.notification_id);
      await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("target_login_name",who.login_name);
      return out(req,{ok:true});
    }

    return out(req,{error:"unknown_action"},400);
  }catch(e){
    console.error(e);
    return out(req,{error:"server_error"},500);
  }
});