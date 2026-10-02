"use strict";

const CONFIG={
  supabaseUrl:"https://movzojtnkkmdsjhmlgtq.supabase.co",
  publishableKey:"sb_publishable_FjLQ_5HZEg_CGhdw3CC0CA_KbG3WKj8",
  loginFn:"legacy-login",
  readFn:"legacy-read",
  txFn:"transactions-api"
};

const app=document.getElementById("app");
const KEY="msajed_session";
let session=null;
let legacyRows=[];
let newRows=[];
let currentTab="";
let searchText="";
let statusFilter="";
let priorityFilter="";

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function fmtDate(v){
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function apiUrl(fn){return CONFIG.supabaseUrl+"/functions/v1/"+fn;}
async function post(fn,body){
  const r=await fetch(apiUrl(fn),{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey},
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data.error||"request_failed");e.status=r.status;e.data=data;throw e}
  return data;
}
function saveSession(){sessionStorage.setItem(KEY,JSON.stringify(session));}
function loadSession(){
  try{session=JSON.parse(sessionStorage.getItem(KEY)||"null")}catch{session=null}
  return session;
}
function clearSession(){sessionStorage.removeItem(KEY);session=null;}

function loginView(){
  app.innerHTML=`
  <section class="login-shell">
    <form class="login-card" id="loginForm" autocomplete="on">
      <h1 class="login-title">جمعية عمارة المساجد</h1>
      <label for="username">اسم المستخدم</label>
      <input class="field" id="username" autocomplete="username" autocapitalize="off" spellcheck="false">
      <label for="password">كلمة السر</label>
      <input class="field" id="password" type="password" autocomplete="current-password">
      <button class="login-btn" id="loginBtn" type="submit">دخول</button>
      <p class="login-msg" id="loginMsg" aria-live="polite"></p>
      <p class="login-foot">أهلاً وسهلاً بكم</p>
    </form>
  `;
  const f=document.getElementById("loginForm");
  f.addEventListener("submit",login);
  document.getElementById("username").focus();
}
async function login(e){
  e.preventDefault();
  const username=document.getElementById("username").value.trim();
  const password=document.getElementById("password").value;
  const btn=document.getElementById("loginBtn");
  const msg=document.getElementById("loginMsg");
  if(!username||!password){msg.textContent="أكمل الحقلين";return}
  btn.disabled=true;btn.textContent="…";msg.textContent="";
  try{
    const r=await post(CONFIG.loginFn,{username,password});
    session={
      app:r.app,token:r.token,username,
      display_name:r.display_name||username,
      legacy_role:r.role||"",
      dept_name:r.dept_name||"",
      dept_names:r.dept_names||[],
      org_name:r.org_name||""
    };
    session.role=mapRole(session);
    saveSession();
    await boot();
  }catch(err){
    if(err.status===429)msg.textContent="محاولات كثيرة — انتظر "+(err.data?.minutes||15)+" دقيقة";
    else msg.textContent="اسم المستخدم أو كلمة السر غير صحيحة";
    document.getElementById("password").value="";
    document.getElementById("password").focus();
  }finally{
    if(document.getElementById("loginBtn")){btn.disabled=false;btn.textContent="دخول"}
  }
}
function mapRole(s){
  if(s.app==="ceo")return s.legacy_role==="secretary"?"ceo_secretary":"ceo_office_manager";
  if(s.legacy_role==="manager")return "manager";
  if(s.legacy_role==="employee")return "employee";
  return "assistant";
}
function tabsFor(role){
  if(role==="ceo_office_manager"||role==="ceo_secretary"){
    return [
      ["incoming","وارد إليّ"],
      ["ceo","معاملات الرئيس التنفيذي"],
      ["shared","معاملات مشتركة"],
      ["all","جميع معاملات الجمعية"],
      ["closed","المعاملات المغلقة"]
    ];
  }
  if(role==="assistant"||role==="manager"){
    return [
      ["incoming","وارد إليّ"],
      ["shared","معاملات مشتركة"],
      ["scope","معاملات نطاقي"],
      ["closed","المعاملات المغلقة"]
    ];
  }
  return [["incoming","وارد إليّ"],["shared","معاملات مشتركة"],["closed","المعاملات المغلقة"]];
}
function defaultTab(role){
  if(role==="ceo_office_manager"||role==="ceo_secretary")return "all";
  if(role==="assistant"||role==="manager")return "scope";
  return "incoming";
}
async function boot(){
  if(!session){loginView();return}
  app.innerHTML='<div class="loading">جارٍ التحميل…</div>';
  try{
    await Promise.all([loadLegacy(),loadNew()]);
    renderApp();
  }catch(err){
    if(err.status===401){clearSession();loginView();return}
    renderApp();
  }
}
async function loadLegacy(){
  const r=await post(CONFIG.readFn,{app:session.app,token:session.token});
  const payload=r.data||{};
  legacyRows=session.app==="ceo"
    ? normalizeCeoLegacy(payload?.data?.transactions||[])
    : normalizePortalLegacy(payload);
}
function normalizeCeoLegacy(list){
  return (Array.isArray(list)?list:[]).map((t,i)=>({
    source:"legacy",
    id:null,
    key:"legacy-"+String(t.sn||t._sid||i),
    number:String(t.sn||t._sid||""),
    title:String(t.name||""),
    subject:String(t.note||""),
    department:String(t.dept||""),
    supporting:0,
    responsible:"",
    assignee:"",
    priority:t.urgent?"عاجل":"عادي",
    status:t.done?"closed":"open",
    created_at:t.createdAt||t.date||null,
    closed_at:t.doneDate||null,
    last_activity_at:t.doneDate||t.date||t.createdAt||null,
    channel:String(t.channel||""),
    attachment_url:String(t.mailUrl||""),
    acts:Array.isArray(t.acts)?t.acts:[],
    refs:Array.isArray(t.refs)?t.refs:[],
    route:Array.isArray(t.route)?t.route:[],
    raw:t
  }));
}
function normalizePortalLegacy(p){
  const rows=[];
  const seen=new Set();
  function add(x,kind){
    if(!x)return;
    const title=String(x.name||x.title||x.task_title||"").trim();
    if(!title)return;
    const key=String(x.id||x._sid||title);
    if(seen.has(key+"|"+kind))return;seen.add(key+"|"+kind);
    rows.push({
      source:"legacy",id:null,key:"portal-"+key,number:String(x.sn||x.id||""),
      title,subject:String(x.note||x.reply||""),department:String(x.dept_name||x.dept_scope||session.dept_name||""),
      supporting:0,responsible:String(x.from_user||""),assignee:String(x.assignee||""),
      priority:x.urgent?"عاجل":(x.priority==="daily"?"عاجل":"عادي"),
      status:x.done||x.status==="done"||x.status==="approved"?"closed":"open",
      created_at:x.created_at||x.date||x.start_date||null,closed_at:x.done_at||x.decided_at||null,
      last_activity_at:x.updated_at||x.last_update_date||x.created_at||null,
      acts:[],refs:[],route:[],raw:x
    });
  }
  ["ceo_trx","ceo_trx_replied","items","transfers","team_tasks"].forEach(k=>{
    const arr=Array.isArray(p?.[k])?p[k]:[];
    arr.forEach(x=>{if(k!=="items"||x.kind==="trx")add(x,k)});
  });
  return rows;
}
async function loadNew(){
  const r=await post(CONFIG.txFn,{app:session.app,token:session.token,action:"list"});
  newRows=(r.rows||[]).map(t=>({
    source:"new",id:t.id,key:"new-"+t.id,number:t.number,title:t.title,subject:t.subject||"",
    department:t.legacy_department_name||"",supporting:0,responsible:"",
    assignee:"",priority:t.priority,status:t.status,created_at:t.created_at,closed_at:t.closed_at,
    last_activity_at:t.last_activity_at,attachment_url:t.attachment_url||"",periods:t.transaction_periods||[],raw:t
  }));
}
function mergedRows(){
  const numbers=new Set(newRows.filter(x=>x.raw?.origin==="legacy").map(x=>String(x.raw.legacy_sn||x.number)));
  return [...newRows,...legacyRows.filter(x=>!numbers.has(String(x.number)))];
}
function renderApp(){
  if(!currentTab)currentTab=defaultTab(session.role);
  const tabs=tabsFor(session.role);
  app.innerHTML=`
    <div class="shell">
      <header class="top-header">
        <div class="header-row">
          <h1>المعاملات</h1>
          <div class="user-box">
            <span class="user-name">${esc(session.display_name)}</span>
            <button class="btn btn-white" id="logoutBtn">تسجيل الخروج</button>
          </div>
        </div>
      </header>
      <nav class="nav-tabs" id="tabs">
        ${tabs.map(([k,n])=>`<button class="nav-tab ${currentTab===k?"active":""}" data-tab="${k}">${n}</button>`).join("")}
      </nav>
      <div class="toolbar">
        <input class="field search" id="search" placeholder="بحث" value="${esc(searchText)}">
        <select class="field" id="statusFilter">
          <option value="">الحالة</option>
          <option value="open" ${statusFilter==="open"?"selected":""}>مفتوحة</option>
          <option value="closed" ${statusFilter==="closed"?"selected":""}>مغلقة</option>
        </select>
        <select class="field" id="priorityFilter">
          <option value="">الأولوية</option>
          <option value="عاجل جدًا" ${priorityFilter==="عاجل جدًا"?"selected":""}>عاجل جدًا</option>
          <option value="عاجل" ${priorityFilter==="عاجل"?"selected":""}>عاجل</option>
          <option value="عادي" ${priorityFilter==="عادي"?"selected":""}>عادي</option>
        </select>
        ${canCreate()?`<button class="btn btn-green" id="createBtn">إنشاء معاملة</button>`:""}
      </div>
      <section class="card">
        <div class="card-head"><span class="card-title">${esc(tabs.find(x=>x[0]===currentTab)?.[1]||"المعاملات")}</span><span class="count" id="rowCount">0</span></div>
        <div id="tableHost"></div>
      </section>
    </div>
  `;
  document.getElementById("logoutBtn").onclick=logout;
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;renderApp()});
  document.getElementById("search").oninput=e=>{searchText=e.target.value;renderTable()};
  document.getElementById("statusFilter").onchange=e=>{statusFilter=e.target.value;renderTable()};
  document.getElementById("priorityFilter").onchange=e=>{priorityFilter=e.target.value;renderTable()};
  if(document.getElementById("createBtn"))document.getElementById("createBtn").onclick=openCreate;
  renderTable();
}
function canCreate(){return ["ceo_office_manager","ceo_secretary","assistant","manager"].includes(session.role)}
function latestStage(row){
  if(row.source==="new")return row.raw?.current_level||"";
  const rr=Array.isArray(row.route)?row.route:[];
  return rr.length?String(rr[rr.length-1]?.stage||""):"";
}
function tabMatch(row){
  if(currentTab==="closed")return row.status==="closed";
  if(row.status==="closed")return false;
  if(currentTab==="all")return true;
  if(currentTab==="scope")return true;
  if(currentTab==="ceo")return latestStage(row)==="ceo"||row.raw?.current_level==="ceo";
  if(currentTab==="shared")return (row.refs?.length||0)>0;
  if(currentTab==="incoming"){
    if(row.source==="new")return row.raw?.created_by_name===session.display_name||row.raw?.created_by_name===session.username;
    const rr=Array.isArray(row.route)?row.route:[];
    const last=rr[rr.length-1]||{};
    return [session.display_name,session.username].includes(String(last.person||last.assignee||""));
  }
  return true;
}
function visibleRows(){
  const q=searchText.trim().toLowerCase();
  return mergedRows().filter(r=>{
    if(!tabMatch(r))return false;
    if(statusFilter&&r.status!==statusFilter)return false;
    if(priorityFilter&&r.priority!==priorityFilter)return false;
    if(q){
      const hay=[r.number,r.title,r.subject,r.department,r.responsible,r.assignee].join(" ").toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
}
function daysInfo(r){
  if(r.source==="new"&&Array.isArray(r.periods)&&r.periods.length){
    const ps=[...r.periods].sort((a,b)=>a.cycle_no-b.cycle_no);
    const last=ps[ps.length-1];
    const d=last.ended_at?Number(last.duration_days||0):Math.max(1,Math.floor((Date.now()-new Date(last.started_at).getTime())/86400000)+1);
    return String(d);
  }
  if(!r.created_at)return "—";
  const start=new Date(r.created_at);if(Number.isNaN(start.getTime()))return "—";
  const end=r.status==="closed"&&r.closed_at?new Date(r.closed_at):new Date();
  return String(Math.max(1,Math.floor((end.getTime()-start.getTime())/86400000)+1));
}
function timeStatus(r){
  if(r.status==="closed")return ["مغلقة","st-closed"];
  const d=Number(daysInfo(r));
  if(!Number.isFinite(d))return ["مفتوحة","st-open"];
  if(d<=2)return ["جديدة","st-new"];
  if(d<=5)return ["قيد الإجراء","st-progress"];
  return ["متأخرة","st-late"];
}
function priClass(p){return p==="عاجل جدًا"?"pri-vh":p==="عاجل"?"pri-h":"pri-n"}
function renderTable(){
  const rows=visibleRows();
  document.getElementById("rowCount").textContent=String(rows.length);
  const host=document.getElementById("tableHost");
  if(!rows.length){host.innerHTML='<div class="empty">لا توجد معاملات</div>';return}
  host.innerHTML=`
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>رقم المعاملة</th><th>عنوان المعاملة</th><th>الإدارة المسؤولة</th><th>الإدارات المساندة</th>
        <th>مسؤول المعاملة</th><th>المحال إليه حاليًا</th><th>الأولوية</th><th>الحالة</th>
        <th>عدد أيام المعاملة</th><th>آخر تحديث</th><th>الإجراءات</th>
      </tr></thead>
      <tbody>
      ${rows.map(r=>{
        const [st,sc]=timeStatus(r);
        return `<tr>
          <td>${esc(r.number||"—")}</td>
          <td class="tx-title">${esc(r.title||"—")}</td>
          <td>${esc(r.department||"—")}</td>
          <td>${r.supporting||0}</td>
          <td>${esc(r.responsible||"—")}</td>
          <td>${esc(r.assignee||"—")}</td>
          <td><span class="badge ${priClass(r.priority)}">${esc(r.priority||"عادي")}</span></td>
          <td><span class="badge ${sc}">${st}</span></td>
          <td>${esc(daysInfo(r))}</td>
          <td>${esc(fmtDate(r.last_activity_at))}</td>
          <td><div class="actions">
            ${r.source==="new"&&r.status!=="closed"?`<button class="row-btn btn-soft" data-action="act" data-id="${r.id}">إجراء</button>`:""}
            ${r.source==="new"&&r.status!=="closed"?`<button class="row-btn btn-red" data-action="close" data-id="${r.id}">إغلاق</button>`:""}
            ${r.source==="new"&&r.status==="closed"?`<button class="row-btn btn-soft" data-action="reopen" data-id="${r.id}">استرجاع المعاملة</button>`:""}
            <button class="row-btn btn-blue" data-action="open" data-key="${esc(r.key)}">فتح</button>
          </div></td>
        </tr>`
      }).join("")}
      </tbody>
    </table>
  </div>`;
  host.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{
    const a=b.dataset.action;
    if(a==="open")openDetails(b.dataset.key);
    if(a==="act")openAction(b.dataset.id);
    if(a==="close")openReason("close",b.dataset.id,"إغلاق");
    if(a==="reopen")openReason("reopen",b.dataset.id,"استرجاع المعاملة");
  });
}
function modal(title,body,foot=""){
  const wrap=document.createElement("div");wrap.className="overlay";
  wrap.innerHTML=`<section class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-close>×</button></div><div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:""}</section>`;
  document.body.appendChild(wrap);
  wrap.querySelector("[data-close]").onclick=()=>wrap.remove();
  wrap.addEventListener("click",e=>{if(e.target===wrap)wrap.remove()});
  return wrap;
}
function openCreate(){
  const w=modal("إنشاء معاملة",`
    <form id="createForm">
      <div class="form-grid">
        <div class="wide"><label>عنوان المعاملة</label><input class="field" name="title" required></div>
        <div class="wide"><label>موضوع المعاملة</label><textarea class="field" name="subject"></textarea></div>
        <div><label>الأولوية</label><select class="field" name="priority"><option>عادي</option><option>عاجل</option><option>عاجل جدًا</option></select></div>
        <div><label>رابط المرفقات</label><input class="field" type="url" name="attachment_url"></div>
      </div>
    </form>
  `,`<button class="btn btn-green" id="saveCreate">حفظ</button><button class="btn btn-soft" data-close2>خروج</button>`);
  w.querySelector("[data-close2]").onclick=()=>w.remove();
  w.querySelector("#saveCreate").onclick=async()=>{
    const f=new FormData(w.querySelector("#createForm"));
    const title=String(f.get("title")||"").trim();if(!title)return;
    const b=w.querySelector("#saveCreate");b.disabled=true;
    try{
      await post(CONFIG.txFn,{app:session.app,token:session.token,action:"create",title,subject:f.get("subject"),priority:f.get("priority"),attachment_url:f.get("attachment_url")});
      await loadNew();w.remove();renderApp();
    }finally{if(document.body.contains(b))b.disabled=false}
  };
}
function findRow(key){return mergedRows().find(x=>x.key===key)}
async function openDetails(key){
  const r=findRow(key);if(!r)return;
  let actions=r.acts||[],periods=r.periods||[];
  if(r.source==="new"){
    try{
      const d=await post(CONFIG.txFn,{app:session.app,token:session.token,action:"details",transaction_id:r.id});
      actions=d.actions||[];periods=d.periods||[];
    }catch{}
  }
  const actionHtml=(actions||[]).length?(actions||[]).map(a=>`
    <div class="action-item"><div class="action-top"><span>${esc(a.actor_name||a.by||"—")}</span><span>${esc(fmtDate(a.created_at||a.date))}</span></div><div class="action-text">${esc(a.action_text||a.text||"")}</div></div>
  `).join(""):'<div class="muted">—</div>';
  const periodHtml=(periods||[]).length?(periods||[]).map(p=>`
    <div class="action-item"><div class="action-top"><span>الدورة ${esc(p.cycle_no)}</span><span>${esc(p.ended_at?String(p.duration_days||"—"):daysInfo({...r,periods:[p]}))} يوم</span></div><div class="action-text">${esc(fmtDate(p.started_at))}${p.ended_at?" — "+esc(fmtDate(p.ended_at)):""}</div></div>
  `).join(""):"";
  modal(r.title,`
    <div class="details-grid">
      <div class="detail"><div class="detail-k">رقم المعاملة</div><div class="detail-v">${esc(r.number||"—")}</div></div>
      <div class="detail"><div class="detail-k">الإدارة المسؤولة</div><div class="detail-v">${esc(r.department||"—")}</div></div>
      <div class="detail"><div class="detail-k">الأولوية</div><div class="detail-v">${esc(r.priority||"عادي")}</div></div>
      <div class="detail"><div class="detail-k">مسؤول المعاملة</div><div class="detail-v">${esc(r.responsible||"—")}</div></div>
      <div class="detail"><div class="detail-k">المحال إليه حاليًا</div><div class="detail-v">${esc(r.assignee||"—")}</div></div>
      <div class="detail"><div class="detail-k">تاريخ الإنشاء</div><div class="detail-v">${esc(fmtDate(r.created_at))}</div></div>
    </div>
    <div class="section-title">موضوع المعاملة</div><div class="action-item"><div class="action-text">${esc(r.subject||"—")}</div></div>
    ${r.attachment_url?`<div class="section-title">رابط المرفقات</div><a href="${esc(r.attachment_url)}" target="_blank" rel="noopener noreferrer">${esc(r.attachment_url)}</a>`:""}
    ${periodHtml?`<div class="section-title">المدة</div>${periodHtml}`:""}
    <div class="section-title">إجراءات العمل</div>${actionHtml}
  `);
}
function openAction(id){
  const w=modal("إجراء",`<label>إجراء العمل</label><textarea class="field" id="actionText"></textarea>`,
    `<button class="btn btn-green" id="saveAction">حفظ</button><button class="btn btn-soft" data-close2>خروج</button>`);
  w.querySelector("[data-close2]").onclick=()=>w.remove();
  w.querySelector("#saveAction").onclick=async()=>{
    const text=w.querySelector("#actionText").value.trim();if(!text)return;
    await post(CONFIG.txFn,{app:session.app,token:session.token,action:"add_action",transaction_id:id,text});
    await loadNew();w.remove();renderApp();
  };
}
function openReason(action,id,title){
  const w=modal(title,`<label>السبب</label><textarea class="field" id="reason"></textarea>`,
    `<button class="btn btn-green" id="confirmReason">حفظ</button><button class="btn btn-soft" data-close2>خروج</button>`);
  w.querySelector("[data-close2]").onclick=()=>w.remove();
  w.querySelector("#confirmReason").onclick=async()=>{
    const reason=w.querySelector("#reason").value.trim();if(!reason)return;
    await post(CONFIG.txFn,{app:session.app,token:session.token,action,transaction_id:id,reason});
    await loadNew();w.remove();renderApp();
  };
}
async function logout(){
  clearSession();legacyRows=[];newRows=[];currentTab="";loginView();
}

loadSession();
boot();
