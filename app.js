"use strict";

const CONFIG={
  supabaseUrl:"https://movzojtnkkmdsjhmlgtq.supabase.co",
  publishableKey:"sb_publishable_FjLQ_5HZEg_CGhdw3CC0CA_KbG3WKj8",
  loginFn:"legacy-login",
  txFn:"transactions-api",
  logoutFn:"session-logout",
  legacyAuthUrl:"https://urgkbbconlxeagfgyjee.supabase.co",
  legacyAuthKey:"sb_publishable_76BLD35YhIoDSI8d-qdp7A_EWhsjEVT"
};

const root=document.getElementById("app");
const SESSION_KEY="msajed_session";
let session=null;
let directoryData={users:[],units:[],me:null};
let listData={rows:[],total:0,page:1,page_size:50,counters:{}};
let currentTab="";
let searchText="";
let priorityFilter="";
let statusFilter="";
let departmentFilter="";
let employeeFilter="";
let originFilter="";
let lateOnly=false;
let dateFrom="";
let dateTo="";
let page=1;
let searchTimer=null;

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function fmtDate(v){
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function apiUrl(fn){return CONFIG.supabaseUrl+"/functions/v1/"+fn}
async function refreshAuthSession(){
  if(!session||session.app!=="auth"||!session.refresh_token)return false;
  const r=await fetch(CONFIG.legacyAuthUrl+"/auth/v1/token?grant_type=refresh_token",{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":CONFIG.legacyAuthKey},
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.access_token)return false;
  session.token=data.access_token;
  session.refresh_token=data.refresh_token||session.refresh_token;
  saveSession();
  return true;
}
async function post(fn,body,retry=true){
  let r=await fetch(apiUrl(fn),{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey},
    body:JSON.stringify(body)
  });
  let data=await r.json().catch(()=>({}));
  if(r.status===401&&retry&&session?.app==="auth"&&await refreshAuthSession()){
    body={...body,token:session.token};
    r=await fetch(apiUrl(fn),{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey},
      body:JSON.stringify(body)
    });
    data=await r.json().catch(()=>({}));
  }
  if(!r.ok){const e=new Error(data.error||"request_failed");e.status=r.status;e.data=data;throw e}
  return data;
}
function saveSession(){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}
function loadSession(){try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null")}catch{session=null}}
function clearSession(){sessionStorage.removeItem(SESSION_KEY);session=null}
function mapRole(s){
  if(s.app==="ceo")return s.legacy_role==="secretary"?"ceo_secretary":"ceo_office_manager";
  if(s.legacy_role==="manager")return "manager";
  if(s.legacy_role==="employee")return "employee";
  return "assistant";
}
function isExec(){return ["ceo","ceo_office_manager","ceo_secretary"].includes(session?.role)}
function tabsFor(role){
  if(role==="ceo")return [["incoming","وارد إليّ"],["ceo_view","معاملات للاطلاع"],["shared","معاملات مشتركة"],["all","جميع معاملات الجمعية"],["closed","المعاملات المغلقة"]];
  if(role==="ceo_office_manager"||role==="ceo_secretary")return [["incoming","وارد إليّ"],["ceo","معاملات الرئيس التنفيذي"],["shared","معاملات مشتركة"],["all","جميع معاملات الجمعية"],["closed","المعاملات المغلقة"]];
  if(role==="assistant"||role==="manager")return [["incoming","وارد إليّ"],["shared","معاملات مشتركة"],["scope","معاملات نطاقي"],["closed","المعاملات المغلقة"]];
  return [["incoming","وارد إليّ"],["shared","معاملات مشتركة"],["closed","المعاملات المغلقة"]];
}
function defaultTab(role){return role==="ceo"?"incoming":isExec()?"all":(role==="assistant"||role==="manager")?"scope":"incoming"}
function baseBody(action,extra={}){return {app:session.app,token:session.token,action,...extra}}

function loginView(){
  root.innerHTML=`
  <section class="login-shell">
    <form class="login-card" id="loginForm">
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
  document.getElementById("loginForm").addEventListener("submit",login);
  document.getElementById("username").focus();
}
async function login(e){
  e.preventDefault();
  const username=document.getElementById("username").value.trim();
  const password=document.getElementById("password").value;
  const btn=document.getElementById("loginBtn"),msg=document.getElementById("loginMsg");
  if(!username||!password){msg.textContent="أكمل الحقلين";return}
  btn.disabled=true;btn.textContent="…";msg.textContent="";
  try{
    let r=null;
    if(username.includes("@")){
      const authRes=await fetch(CONFIG.legacyAuthUrl+"/auth/v1/token?grant_type=password",{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":CONFIG.legacyAuthKey},
        body:JSON.stringify({email:username,password})
      });
      const authData=await authRes.json().catch(()=>({}));
      if(authRes.ok&&authData.access_token){
        r={app:"auth",token:authData.access_token,refresh_token:authData.refresh_token,
           display_name:authData.user?.user_metadata?.full_name||username,role:"auth"};
      }
    }
    if(!r)r=await post(CONFIG.loginFn,{username,password});
    session={
      app:r.app,token:r.token,refresh_token:r.refresh_token||null,username,
      display_name:r.display_name||username,legacy_role:r.role||"",
      dept_name:r.dept_name||"",dept_names:r.dept_names||[],org_name:r.org_name||""
    };
    session.role=mapRole(session);
    saveSession();
    currentTab="";
    await boot();
  }catch(err){
    msg.textContent=err.status===429?"محاولات كثيرة — انتظر "+(err.data?.minutes||15)+" دقيقة":"اسم المستخدم أو كلمة السر غير صحيحة";
    document.getElementById("password").value="";
  }finally{
    if(document.getElementById("loginBtn")){btn.disabled=false;btn.textContent="دخول"}
  }
}
async function boot(){
  if(!session){loginView();return}
  root.innerHTML='<div class="loading">جارٍ التحميل…</div>';
  try{
    directoryData=await post(CONFIG.txFn,baseBody("directory"));
    if(directoryData.me){
      session.role=directoryData.me.role||session.role;
      session.display_name=directoryData.me.display_name||session.display_name;
      session.org_name=directoryData.me.org_name||session.org_name;
      session.dept_name=directoryData.me.dept_name||session.dept_name;
      session.dept_names=directoryData.me.dept_names||session.dept_names;
      session.login_name=directoryData.me.login_name||session.username;
      saveSession();
    }
    if(!currentTab)currentTab=defaultTab(session.role);
    await loadList();
    renderApp();
  }catch(err){
    if(err.status===401){clearSession();loginView();return}
    root.innerHTML='<div class="loading">تعذّر تحميل المعاملات</div>';
  }
}
async function loadList(){
  listData=await post(CONFIG.txFn,baseBody("list",{
    tab:currentTab,search:searchText,priority:priorityFilter,status:statusFilter,
    department:departmentFilter,employee:employeeFilter,origin:originFilter,late_only:lateOnly,
    date_from:dateFrom,date_to:dateTo,page,page_size:50
  }));
}
function renderApp(){
  const tabs=tabsFor(session.role);
  const unread=Number(listData?.counters?.notifications||0);
  root.innerHTML=`
  <div class="shell">
    <header class="top-header">
      <div class="header-row">
        <h1>المعاملات</h1>
        <div class="user-box">
          <span class="user-name">${esc(session.display_name)}</span>
          <button class="btn btn-white" id="notifBtn">التنبيهات${unread?" ("+unread+")":""}</button>
          <button class="btn btn-white" id="logoutBtn">تسجيل الخروج</button>
        </div>
      </div>
    </header>

    <nav class="nav-tabs">
      ${tabs.map(([k,n])=>`<button class="nav-tab ${currentTab===k?"active":""}" data-tab="${k}">${n}</button>`).join("")}
    </nav>

    <div class="trx-stats">
      <span>وارد جديد <b>${Number(listData.counters?.incoming||0)}</b></span>
      <span>متأخر <b>${Number(listData.counters?.late||0)}</b></span>
      <span>بانتظار اعتماد <b>${Number(listData.counters?.pending_approval||0)}</b></span>
      <span>مغلق اليوم <b>${Number(listData.counters?.closed_today||0)}</b></span>
    </div>
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
      <select class="field" id="departmentFilter">
        <option value="">الإدارة</option>
        ${(directoryData.units||[]).filter(u=>["department","independent","branch"].includes(u.unit_type)).map(u=>'<option value="'+esc(u.name)+'" '+(departmentFilter===u.name?"selected":"")+'>'+esc(u.name)+'</option>').join("")}
      </select>
      <select class="field" id="employeeFilter">
        <option value="">الموظف</option>
        ${(directoryData.users||[]).map(u=>'<option value="'+esc(u.login_name)+'" '+(employeeFilter===u.login_name?"selected":"")+'>'+esc(u.display_name)+'</option>').join("")}
      </select>
      <select class="field" id="originFilter">
        <option value="">قديم/جديد</option>
        <option value="legacy" ${originFilter==="legacy"?"selected":""}>قديم</option>
        <option value="new" ${originFilter==="new"?"selected":""}>جديد</option>
      </select>
      <label class="check-filter"><input type="checkbox" id="lateOnly" ${lateOnly?"checked":""}> متأخرة</label>
      <input class="field date-filter" id="dateFrom" type="date" value="${esc(dateFrom)}">
      <input class="field date-filter" id="dateTo" type="date" value="${esc(dateTo)}">
      ${session.role!=="employee"?'<button class="btn btn-green" id="createBtn">إنشاء معاملة</button>':""}
      <button class="btn btn-soft" id="excelListBtn">Excel القائمة</button>
      <button class="btn btn-soft" id="pdfListBtn">PDF القائمة</button>
    </div>

    <section class="card">
      <div class="card-head">
        <span class="card-title">${esc(tabs.find(x=>x[0]===currentTab)?.[1]||"المعاملات")}</span>
        <span class="count">${Number(listData.total||0)}</span>
      </div>
      <div id="tableHost"></div>
      <div id="pagerHost"></div>
    </section>
  </div>`;
  document.getElementById("logoutBtn").onclick=logout;
  document.getElementById("notifBtn").onclick=openNotifications;
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=async()=>{currentTab=b.dataset.tab;page=1;await refresh()});
  document.getElementById("search").oninput=e=>{
    searchText=e.target.value;page=1;clearTimeout(searchTimer);searchTimer=setTimeout(()=>refresh(),300);
  };
  document.getElementById("statusFilter").onchange=async e=>{statusFilter=e.target.value;page=1;await refresh()};
  document.getElementById("priorityFilter").onchange=async e=>{priorityFilter=e.target.value;page=1;await refresh()};
  document.getElementById("departmentFilter").onchange=async e=>{departmentFilter=e.target.value;page=1;await refresh()};
  document.getElementById("employeeFilter").onchange=async e=>{employeeFilter=e.target.value;page=1;await refresh()};
  document.getElementById("originFilter").onchange=async e=>{originFilter=e.target.value;page=1;await refresh()};
  document.getElementById("lateOnly").onchange=async e=>{lateOnly=e.target.checked;page=1;await refresh()};
  document.getElementById("dateFrom").onchange=async e=>{dateFrom=e.target.value;page=1;await refresh()};
  document.getElementById("dateTo").onchange=async e=>{dateTo=e.target.value;page=1;await refresh()};
  if(document.getElementById("createBtn"))document.getElementById("createBtn").onclick=openCreate;
  document.getElementById("excelListBtn").onclick=exportListExcel;
  document.getElementById("pdfListBtn").onclick=printList;
  renderTable();
  renderPager();
}
async function refresh(){await loadList();renderApp()}
function priorityClass(p){return p==="عاجل جدًا"?"pri-vh":p==="عاجل"?"pri-h":"pri-n"}
function statusBadge(r){
  if(r.status==="closed")return ["مغلقة","st-closed"];
  if(r.status==="cancelled")return ["ملغاة","st-closed"];
  if(r.late)return ["متأخرة","st-late"];
  if(Number(r.days||0)<=2)return ["جديدة","st-new"];
  return ["قيد الإجراء","st-progress"];
}
function renderTable(){
  const host=document.getElementById("tableHost"),rows=listData.rows||[];
  if(!rows.length){host.innerHTML='<div class="empty">لا توجد معاملات</div>';return}
  host.innerHTML=`
  <div class="table-wrap"><table>
    <thead><tr>
      <th>رقم المعاملة</th><th>عنوان المعاملة</th><th>الإدارة المسؤولة</th><th>الإدارات المساندة</th>
      <th>مسؤول المعاملة</th><th>المحال إليه حاليًا</th><th>الأولوية</th><th>الحالة</th>
      <th>عدد أيام المعاملة</th><th>آخر تحديث</th><th>الإجراءات</th>
    </tr></thead>
    <tbody>
      ${rows.map(r=>{
        const [st,sc]=statusBadge(r);
        const open=r.status==="open";
        const closeLabel=r.can_close?"إغلاق":"طلب إغلاق";
        const reopenLabel=r.can_close?"استرجاع المعاملة":"طلب استرجاع";
        return `<tr>
          <td>${esc(r.number)}</td>
          <td class="tx-title">${esc(r.title)}</td>
          <td>${esc(r.responsible_unit_name||"—")}</td>
          <td>${Number(r.supporting_count||0)}</td>
          <td>${esc(r.responsible_name||"—")}</td>
          <td>${esc((r.current_assignees||[]).join("، ")|| (r.current_level==="ceo"?"الرئيس التنفيذي":"—"))}</td>
          <td><span class="badge ${priorityClass(r.priority)}">${esc(r.priority)}</span></td>
          <td><span class="badge ${sc}">${st}</span></td>
          <td>${esc(r.days||"—")}</td>
          <td>${esc(fmtDate(r.last_activity_at))}</td>
          <td><div class="actions">
            ${r.pending_transfer?'<button class="row-btn btn-green" data-act="accept-transfer" data-route="'+r.pending_transfer.id+'">قبول</button><button class="row-btn btn-red" data-act="reject-transfer" data-route="'+r.pending_transfer.id+'">رفض</button>':""}
            ${open&&r.can_act?'<button class="row-btn btn-soft" data-act="action" data-id="'+r.id+'">إجراء</button>':""}
            ${open&&r.can_act?'<button class="row-btn btn-soft" data-act="route" data-id="'+r.id+'">إحالة</button>':""}
            ${open?'<button class="row-btn btn-red" data-act="close" data-id="'+r.id+'" data-direct="'+(r.can_close?"1":"0")+'">'+closeLabel+'</button>':""}
            ${r.status==="closed"?'<button class="row-btn btn-soft" data-act="reopen" data-id="'+r.id+'" data-direct="'+(r.can_close?"1":"0")+'">'+reopenLabel+'</button>':""}
            <button class="row-btn btn-blue" data-act="open" data-id="${r.id}">فتح</button>
          </div></td>
        </tr>`
      }).join("")}
    </tbody>
  </table></div>`;
  host.querySelectorAll("[data-act]").forEach(btn=>btn.onclick=()=>{
    const a=btn.dataset.act,id=btn.dataset.id;
    if(a==="open")openDetails(id);
    if(a==="action")openAction(id);
    if(a==="route")openReferral(id);
    if(a==="close")openReason(btn.dataset.direct==="1"?"close":"request_close",id,btn.dataset.direct==="1"?"إغلاق":"طلب إغلاق");
    if(a==="reopen"){
      const row=(listData.rows||[]).find(x=>x.id===id);
      const actionName=btn.dataset.direct==="1"?"reopen":"request_reopen";
      const title=btn.dataset.direct==="1"?"استرجاع المعاملة":"طلب استرجاع";
      if(row?.origin==="legacy"&&(!row.responsible_unit_id||!row.responsible_login_name))openLegacyReopen(actionName,id,title);
      else openReason(actionName,id,title);
    }
    if(a==="accept-transfer")decideTransfer(btn.dataset.route,true);
    if(a==="reject-transfer")decideTransfer(btn.dataset.route,false);
  });
}
function renderPager(){
  const h=document.getElementById("pagerHost"),total=Number(listData.total||0),size=Number(listData.page_size||50);
  const pages=Math.max(1,Math.ceil(total/size));
  if(pages<=1){h.innerHTML="";return}
  h.innerHTML=`<div class="pager"><button class="btn btn-soft" id="prevPage" ${page<=1?"disabled":""}>السابق</button><span>${page} / ${pages}</span><button class="btn btn-soft" id="nextPage" ${page>=pages?"disabled":""}>التالي</button></div>`;
  document.getElementById("prevPage").onclick=async()=>{if(page>1){page--;await refresh()}};
  document.getElementById("nextPage").onclick=async()=>{if(page<pages){page++;await refresh()}};
}
function modal(title,body,footer=""){
  const w=document.createElement("div");w.className="overlay";
  w.innerHTML=`<section class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-close>×</button></div><div class="modal-body">${body}</div>${footer?'<div class="modal-foot">'+footer+'</div>':""}</section>`;
  document.body.appendChild(w);
  w.querySelector("[data-close]").onclick=()=>w.remove();
  w.addEventListener("click",e=>{if(e.target===w)w.remove()});
  return w;
}
function userOptions(filter,selected=[]){
  return (directoryData.users||[]).filter(filter).map(u=>`<option value="${esc(u.login_name)}" ${selected.includes(u.login_name)?"selected":""}>${esc(u.display_name)}</option>`).join("");
}
function unitOptions(filter){
  return (directoryData.units||[]).filter(filter).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join("");
}
function myDeptNames(){return [...new Set([session.dept_name,...(session.dept_names||[])].filter(Boolean))]}
function managerUnits(){const n=myDeptNames();return (directoryData.units||[]).filter(u=>u.unit_type==="department"&&n.includes(u.name))}
function sectorUnits(){
  const all=directoryData.units||[],rootUnit=all.find(u=>u.name===session.org_name&&u.parent_id===null);
  if(!rootUnit)return [];
  const ids=new Set([rootUnit.id]);let changed=true;
  while(changed){changed=false;for(const u of all)if(u.parent_id&&ids.has(u.parent_id)&&!ids.has(u.id)){ids.add(u.id);changed=true}}
  return all.filter(u=>ids.has(u.id)&&u.unit_type==="department");
}
async function openCreate(){
  let rolePart="";
  if(session.role==="manager"){
    rolePart=`
      <div class="wide"><label>المسار</label><select class="field" id="createMode"><option value="assign">إسناد لموظف أو أكثر</option><option value="raise">رفع للمساعد</option></select></div>
      <div class="wide" id="createRouteFields"></div>`;
  }else if(isExec()){
    rolePart=`
      <div class="wide"><label>المساعد</label><select class="field" name="assistant">${userOptions(u=>u.role==="assistant")}</select></div>
      <div class="wide"><label>التوجيه</label><textarea class="field" name="directive" required></textarea></div>`;
  }
  const w=modal("إنشاء معاملة",`
    <form id="createForm"><div class="form-grid">
      <div class="wide"><label>عنوان المعاملة</label><input class="field" name="title" required></div>
      <div class="wide"><label>موضوع المعاملة</label><textarea class="field" name="subject"></textarea></div>
      <div><label>الأولوية</label><select class="field" name="priority"><option>عادي</option><option>عاجل</option><option>عاجل جدًا</option></select></div>
      <div><label>رابط المرفقات</label><input class="field" name="attachment_url" type="url"></div>
      ${rolePart}
    </div></form>
  `,`<button class="btn btn-green" id="saveCreate">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>`);
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  if(session.role==="manager"){
    const mode=w.querySelector("#createMode"),host=w.querySelector("#createRouteFields");
    const draw=()=>{
      host.innerHTML=mode.value==="assign"?`
        <label>الإدارة</label><select class="field" name="unit_id">${managerUnits().map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")}</select>
        <label>الموظفون</label><select class="field multi" name="targets" multiple>${userOptions(u=>u.role==="employee"&&u.dept_names.some(d=>myDeptNames().includes(d)))}</select>
        <label>التوجيه</label><textarea class="field" name="directive"></textarea>`
      :`<label>سبب الرفع</label><textarea class="field" name="raise_reason"></textarea><label>القرار المقترح</label><textarea class="field" name="proposed_decision"></textarea>`;
    };mode.onchange=draw;draw();
  }
  w.querySelector("#saveCreate").onclick=async()=>{
    const f=w.querySelector("#createForm"),fd=new FormData(f);
    const title=String(fd.get("title")||"").trim();if(!title)return;
    const btn=w.querySelector("#saveCreate");btn.disabled=true;
    try{
      const created=await post(CONFIG.txFn,baseBody("create",{title,subject:fd.get("subject"),priority:fd.get("priority"),attachment_url:fd.get("attachment_url")}));
      if(session.role==="manager"){
        const mode=w.querySelector("#createMode").value;
        if(mode==="assign"){
          const targets=[...w.querySelector('[name="targets"]').selectedOptions].map(o=>o.value);
          await post(CONFIG.txFn,baseBody("route_manager_employees",{transaction_id:created.row.id,unit_id:fd.get("unit_id"),targets,directive:fd.get("directive")}));
        }else{
          await post(CONFIG.txFn,baseBody("route_manager_assistant",{transaction_id:created.row.id,raise_reason:fd.get("raise_reason"),proposed_decision:fd.get("proposed_decision")}));
        }
      }else if(isExec()){
        await post(CONFIG.txFn,baseBody("route_exec_assistant",{transaction_id:created.row.id,to_login:fd.get("assistant"),directive:fd.get("directive")}));
      }
      w.remove();await refresh();
    }catch(e){btn.disabled=false}
  };
}
async function openReferral(id){
  if(session.role==="employee")return childEmployeeRaise(id,null);
  const choices=[];
  if(session.role==="manager"){
    choices.push(["assign","إسناد لموظف أو أكثر"],["raise","رفع للمساعد"]);
  }else if(session.role==="assistant"){
    choices.push(["scope","إحالة داخل القطاع"],["transfer","تحويل لمساعد آخر"],["ceo","رفع للرئيس التنفيذي"]);
  }else if(isExec()){
    choices.push(["assistant","إحالة للمساعد"],["direct","إسناد مباشر لموظف"]);
  }
  const w=modal("إحالة",`<div class="choice-grid">${choices.map(([k,n])=>'<button class="choice-btn" data-choice="'+k+'">'+n+'</button>').join("")}</div>`,
    '<button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>{
    const c=b.dataset.choice;w.remove();
    if(c==="assign")childManagerAssign(id);
    if(c==="raise")childManagerRaise(id);
    if(c==="scope")childAssistantScope(id);
    if(c==="transfer")childAssistantTransfer(id);
    if(c==="ceo")childAssistantCeo(id);
    if(c==="assistant")childExecAssistant(id);
    if(c==="direct")childExecDirect(id);
  });
}
function backFooter(parentFn){return '<button class="btn btn-soft" data-back>رجوع</button>'}
function wireBack(w,id){w.querySelector("[data-back]").onclick=()=>{w.remove();openReferral(id)}}
function childEmployeeRaise(id){
  const w=modal("رفع للمدير",'<label>سبب الرفع</label><textarea class="field" id="raiseReason"></textarea><label>القرار المقترح</label><textarea class="field" id="proposed"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button>');
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("route_employee_manager",{transaction_id:id,raise_reason:w.querySelector("#raiseReason").value,proposed_decision:w.querySelector("#proposed").value}));w.remove();await refresh()};
}
function childManagerAssign(id){
  const w=modal("إسناد لموظف أو أكثر",`
    <label>الإدارة</label><select class="field" id="unit">${managerUnits().map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")}</select>
    <label>الموظفون</label><select class="field multi" id="targets" multiple>${userOptions(u=>u.role==="employee"&&u.dept_names.some(d=>myDeptNames().includes(d)))}</select>
    <label>التوجيه</label><textarea class="field" id="directive"></textarea>`,
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  w.querySelector("#save").onclick=async()=>{
    const targets=[...w.querySelector("#targets").selectedOptions].map(o=>o.value);
    await post(CONFIG.txFn,baseBody("route_manager_employees",{transaction_id:id,unit_id:w.querySelector("#unit").value,targets,directive:w.querySelector("#directive").value}));
    w.remove();await refresh();
  };
}
function childManagerRaise(id){
  const w=modal("رفع للمساعد",'<label>سبب الرفع</label><textarea class="field" id="reason"></textarea><label>القرار المقترح</label><textarea class="field" id="proposed"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("route_manager_assistant",{transaction_id:id,raise_reason:w.querySelector("#reason").value,proposed_decision:w.querySelector("#proposed").value}));w.remove();await refresh()};
}
function employeesForUnit(unitId){
  const u=(directoryData.units||[]).find(x=>x.id===unitId);if(!u)return [];
  return (directoryData.users||[]).filter(x=>["employee","manager"].includes(x.role)&&x.dept_names.includes(u.name));
}
function supportBlock(index){
  const units=sectorUnits();
  return `<div class="support-block" data-support="${index}">
    <label>الإدارة المساندة</label><select class="field s-unit">${units.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")}</select>
    <label>الموظفون</label><select class="field multi s-targets" multiple></select>
    <label>التوجيه</label><textarea class="field s-directive"></textarea>
    <button class="btn btn-red s-remove" type="button">حذف</button>
  </div>`;
}
function fillTargetSelect(block){
  const unit=block.querySelector(".s-unit").value,sel=block.querySelector(".s-targets");
  sel.innerHTML=employeesForUnit(unit).map(u=>'<option value="'+esc(u.login_name)+'">'+esc(u.display_name)+'</option>').join("");
}
function childAssistantScope(id){
  const units=sectorUnits();
  const w=modal("إحالة داخل القطاع",`
    <label>الإدارة المسؤولة</label><select class="field" id="responsibleUnit">${units.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")}</select>
    <label>الموظفون</label><select class="field multi" id="responsibleTargets" multiple></select>
    <label>التوجيه</label><textarea class="field" id="directive"></textarea>
    <div id="supports"></div>
    <button class="btn btn-soft" id="addSupport" type="button">إضافة إدارة مساندة</button>`,
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  const ru=w.querySelector("#responsibleUnit"),rt=w.querySelector("#responsibleTargets");
  const fill=()=>{rt.innerHTML=employeesForUnit(ru.value).map(u=>'<option value="'+esc(u.login_name)+'">'+esc(u.display_name)+'</option>').join("")};ru.onchange=fill;fill();
  let n=0;
  w.querySelector("#addSupport").onclick=()=>{
    const host=w.querySelector("#supports");host.insertAdjacentHTML("beforeend",supportBlock(++n));
    const b=host.lastElementChild;fillTargetSelect(b);b.querySelector(".s-unit").onchange=()=>fillTargetSelect(b);b.querySelector(".s-remove").onclick=()=>b.remove();
  };
  w.querySelector("#save").onclick=async()=>{
    const targets=[...rt.selectedOptions].map(o=>o.value);
    const supporting=[...w.querySelectorAll("[data-support]")].map(b=>({
      unit_id:b.querySelector(".s-unit").value,
      targets:[...b.querySelector(".s-targets").selectedOptions].map(o=>o.value),
      directive:b.querySelector(".s-directive").value
    }));
    await post(CONFIG.txFn,baseBody("route_assistant_scope",{transaction_id:id,responsible_unit_id:ru.value,targets,directive:w.querySelector("#directive").value,supporting}));
    w.remove();await refresh();
  };
}
function childAssistantTransfer(id){
  const w=modal("تحويل لمساعد آخر",`
    <label>المساعد</label><select class="field" id="to">${userOptions(u=>u.role==="assistant"&&u.login_name!==session.login_name)}</select>
    <label>سبب التحويل</label><textarea class="field" id="reason"></textarea>
    <label>التوجيه</label><textarea class="field" id="directive"></textarea>`,
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("transfer_assistant",{transaction_id:id,to_login:w.querySelector("#to").value,transfer_reason:w.querySelector("#reason").value,directive:w.querySelector("#directive").value}));w.remove();await refresh()};
}
function childAssistantCeo(id){
  const w=modal("رفع للرئيس التنفيذي",'<label>سبب الرفع</label><textarea class="field" id="reason"></textarea><label>القرار المقترح</label><textarea class="field" id="proposed"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("route_assistant_ceo",{transaction_id:id,raise_reason:w.querySelector("#reason").value,proposed_decision:w.querySelector("#proposed").value}));w.remove();await refresh()};
}
function childExecAssistant(id){
  const w=modal("إحالة للمساعد",'<label>المساعد</label><select class="field" id="to">'+userOptions(u=>u.role==="assistant")+'</select><label>التوجيه</label><textarea class="field" id="directive"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("route_exec_assistant",{transaction_id:id,to_login:w.querySelector("#to").value,directive:w.querySelector("#directive").value}));w.remove();await refresh()};
}
function childExecDirect(id){
  const depts=(directoryData.units||[]).filter(u=>u.unit_type==="department"||u.unit_type==="independent"||u.unit_type==="branch");
  const w=modal("إسناد مباشر لموظف",`
    <label>الإدارة</label><select class="field" id="unit">${depts.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")}</select>
    <label>الموظفون</label><select class="field multi" id="targets" multiple></select>
    <label>التوجيه</label><textarea class="field" id="directive"></textarea>
    <label>نطاق الظهور</label><select class="field" id="visibility">
      <option value="employee_exec">الموظف + مستوى الرئيس فقط</option>
      <option value="manager">إظهار مدير الإدارة</option>
      <option value="assistant">إظهار المساعد</option>
      <option value="manager_assistant">إظهار المدير + المساعد</option>
    </select>`,
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  const unit=w.querySelector("#unit"),targets=w.querySelector("#targets");
  const fill=()=>{targets.innerHTML=employeesForUnit(unit.value).map(u=>'<option value="'+esc(u.login_name)+'">'+esc(u.display_name)+'</option>').join("")};unit.onchange=fill;fill();
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("direct_exec_employee",{transaction_id:id,unit_id:unit.value,targets:[...targets.selectedOptions].map(o=>o.value),directive:w.querySelector("#directive").value,visibility_scope:w.querySelector("#visibility").value}));w.remove();await refresh()};
}
function openAction(id){
  const w=modal("إجراء",'<label>إجراء العمل</label><textarea class="field" id="actionText"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#save").onclick=async()=>{const text=w.querySelector("#actionText").value.trim();if(!text)return;await post(CONFIG.txFn,baseBody("add_action",{transaction_id:id,text}));w.remove();await refresh()};
}
function openLegacyReopen(action,id,title){
  const units=(directoryData.units||[]).filter(u=>["department","independent","branch"].includes(u.unit_type));
  const w=modal(title,`
    <label>السبب</label><textarea class="field" id="legacyReopenReason"></textarea>
    <label>الإدارة المسؤولة</label><select class="field" id="legacyReopenUnit">${units.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")}</select>
    <label>مسؤول المعاملة</label><select class="field" id="legacyReopenUser"></select>`,
    '<button class="btn btn-green" id="saveLegacyReopen">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  const unit=w.querySelector("#legacyReopenUnit"),user=w.querySelector("#legacyReopenUser");
  const fill=()=>{
    const selected=units.find(x=>x.id===unit.value);
    const choices=(directoryData.users||[]).filter(u=>selected&&(u.dept_names||[]).includes(selected.name));
    user.innerHTML=choices.map(u=>'<option value="'+esc(u.login_name)+'">'+esc(u.display_name)+'</option>').join("");
  };
  unit.onchange=fill;fill();
  w.querySelector("#saveLegacyReopen").onclick=async()=>{
    const reason=w.querySelector("#legacyReopenReason").value.trim();
    if(!reason||!unit.value||!user.value)return;
    await post(CONFIG.txFn,baseBody(action,{transaction_id:id,reason,responsible_unit_id:unit.value,responsible_login_name:user.value}));
    w.remove();await refresh();
  };
}
function openReason(action,id,title){
  const w=modal(title,'<label>السبب</label><textarea class="field" id="reason"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#save").onclick=async()=>{const reason=w.querySelector("#reason").value.trim();if(!reason)return;await post(CONFIG.txFn,baseBody(action,{transaction_id:id,reason}));w.remove();await refresh()};
}
async function decideTransfer(routeId,approve){
  if(approve){
    await post(CONFIG.txFn,baseBody("decide_assistant_transfer",{route_id:routeId,approve:true,reason:""}));
    await refresh();return;
  }
  const w=modal("رفض التحويل",'<label>السبب</label><textarea class="field" id="transferRejectReason"></textarea>',
    '<button class="btn btn-red" id="saveReject">رفض</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveReject").onclick=async()=>{
    const reason=w.querySelector("#transferRejectReason").value.trim();if(!reason)return;
    await post(CONFIG.txFn,baseBody("decide_assistant_transfer",{route_id:routeId,approve:false,reason}));
    w.remove();await refresh();
  };
}
async function openDetails(id){
  const d=await post(CONFIG.txFn,baseBody("details",{transaction_id:id})),t=d.transaction;
  const assignments=(d.assignments||[]).map(a=>{
    const names=(a.transaction_assignment_targets||[]).map(x=>x.display_name).join("، ");
    return '<div class="action-item"><div class="action-top"><span>'+esc(a.assignment_type==="supporting"?"إدارة مساندة":a.assignment_type==="direct"?"إسناد مباشر":"الإدارة المسؤولة")+'</span><span>'+esc(fmtDate(a.created_at))+'</span></div><div class="action-text">'+esc(a.directive||"")+(names?'<br>'+esc(names):"")+'</div></div>';
  }).join("")||'<div class="muted">—</div>';
  const versionsByAction=new Map();
  for(const v of d.action_versions||[]){if(!versionsByAction.has(v.action_id))versionsByAction.set(v.action_id,[]);versionsByAction.get(v.action_id).push(v)}
  const canDecide=["manager","assistant","ceo","ceo_office_manager","ceo_secretary"].includes(session.role);
  const actions=(d.actions||[]).map(a=>{
    const vs=versionsByAction.get(a.id)||[];
    const history=vs.length>1?'<div class="version-list">'+vs.map(v=>'<div>نسخة '+esc(v.version_no)+': '+esc(v.body)+(v.decision_status?'<br>'+esc(v.decision_status==="rejected"?"مرفوض":"معتمد")+(v.decision_reason?" — "+esc(v.decision_reason):""):"")+'</div>').join("")+'</div>':"";
    const decisionButtons=canDecide&&a.status!=="approved"?'<div class="request-actions"><button class="row-btn btn-green" data-action-approve="'+a.id+'">اعتماد</button><button class="row-btn btn-red" data-action-reject="'+a.id+'">رفض</button></div>':"";
    const reviseButton=a.status==="rejected"&&[session.display_name,session.login_name,session.username].includes(a.actor_name)?'<button class="row-btn btn-soft" data-action-revise="'+a.id+'">تعديل الإجراء</button>':"";
    return '<div class="action-item"><div class="action-top"><span>'+esc(a.actor_name||"—")+'</span><span>'+esc(fmtDate(a.created_at))+'</span></div><div class="action-text">'+esc(a.action_text||"")+'</div><div class="badge '+(a.status==="rejected"?"pri-vh":a.status==="approved"?"st-open":"pri-n")+'">'+esc(a.status==="rejected"?"مرفوض":a.status==="approved"?"معتمد":"مسجل")+'</div>'+decisionButtons+reviseButton+history+'</div>';
  }).join("")||'<div class="muted">—</div>';
  const periods=(d.periods||[]).map(p=>'<div class="action-item"><div class="action-top"><span>الدورة '+esc(p.cycle_no)+'</span><span>'+esc(p.ended_at?(p.duration_days||"—")+" يوم":"مستمرة")+'</span></div><div class="action-text">'+esc(fmtDate(p.started_at))+(p.ended_at?" — "+esc(fmtDate(p.ended_at)):"")+'</div></div>').join("");
  const routes=(d.routes||[]).map(r=>'<div class="action-item"><div class="action-top"><span>'+esc(r.from_name||"—")+' → '+esc(r.to_name||"—")+'</span><span>'+esc(fmtDate(r.created_at))+'</span></div><div class="action-text">'+esc(r.directive||r.raise_reason||r.transfer_reason||"")+(r.proposed_decision?'<br>القرار المقترح: '+esc(r.proposed_decision):"")+(r.rejection_reason?'<br>سبب الرفض: '+esc(r.rejection_reason):"")+'</div></div>').join("")||'<div class="muted">—</div>';
  const canDecideRequest=r=>{
    const requesterRole=String(r?.meta?.requester_role||"");
    if(["ceo","ceo_office_manager","ceo_secretary"].includes(session.role))return true;
    if(session.role==="assistant")return !!d.flags?.scope&&["employee","manager"].includes(requesterRole);
    if(session.role==="manager")return !!d.flags?.scope&&requesterRole==="employee";
    return false;
  };
  const requests=(d.requests||[]).map(r=>'<div class="action-item"><div class="action-top"><span>'+esc(r.requested_by_name||"—")+'</span><span>'+esc(fmtDate(r.created_at))+'</span></div><div class="action-text">'+esc(r.reason||"")+'</div>'+(r.status==="pending"&&canDecideRequest(r)?'<div class="request-actions"><button class="row-btn btn-green" data-request-approve="'+r.id+'">اعتماد</button><button class="row-btn btn-red" data-request-reject="'+r.id+'">رفض</button></div>':'<div class="badge '+(r.status==="approved"?"st-open":r.status==="rejected"?"pri-vh":"pri-n")+'">'+esc(r.status==="approved"?"معتمد":r.status==="rejected"?"مرفوض":"قيد الانتظار")+'</div>')+'</div>').join("")||'<div class="muted">—</div>';
  const hist=(d.history||[]).map(h=>'<div class="action-item"><div class="action-top"><span>'+esc(h.actor_name||"—")+'</span><span>'+esc(fmtDate(h.created_at))+'</span></div><div class="action-text">'+esc(h.detail||h.event_type||"")+'</div></div>').join("")||'<div class="muted">—</div>';
  const w=modal(t.title,`
    <div class="details-grid">
      <div class="detail"><div class="detail-k">رقم المعاملة</div><div class="detail-v">${esc(t.number)}</div></div>
      <div class="detail"><div class="detail-k">الأولوية</div><div class="detail-v">${esc(t.priority)}</div></div>
      <div class="detail"><div class="detail-k">مسؤول المعاملة</div><div class="detail-v">${esc(t.responsible_name||"—")}</div></div>
      <div class="detail"><div class="detail-k">تاريخ الإنشاء</div><div class="detail-v">${esc(fmtDate(t.created_at))}</div></div>
      <div class="detail"><div class="detail-k">تاريخ الاستحقاق</div><div class="detail-v">${esc(fmtDate(t.due_at))}</div></div>
      <div class="detail"><div class="detail-k">الحالة</div><div class="detail-v">${esc(t.status==="closed"?"مغلقة":t.status==="cancelled"?"ملغاة":"مفتوحة")}</div></div>
    </div>
    <div class="section-title">موضوع المعاملة</div><div class="action-item"><div class="action-text">${esc(t.subject||"—")}</div></div>
    ${t.attachment_url?'<div class="section-title">رابط المرفقات</div><a href="'+esc(t.attachment_url)+'" target="_blank" rel="noopener noreferrer">'+esc(t.attachment_url)+'</a>':""}
    ${periods?'<div class="section-title">المدة</div>'+periods:""}
    <div class="section-title">الإسناد والإدارات</div>${assignments}
    <div class="section-title">إجراءات العمل</div>${actions}
    <div class="section-title">الإحالات والتوجيهات</div>${routes}
    <div class="section-title">الطلبات</div>${requests}
    <div class="section-title">السجل</div>${hist}
  `,`
    ${t.status==="open"?'<button class="btn btn-soft" id="priorityBtn">الأولوية</button>':""}
    ${t.status==="open"&&session.role!=="employee"?'<button class="btn btn-soft" id="dueBtn">تاريخ الاستحقاق</button>':""}
    ${t.status==="open"?'<button class="btn btn-soft" id="responsibleBtn">مسؤول المعاملة</button>':""}
    ${t.status==="open"&&t.due_at?'<button class="btn btn-soft" id="extensionBtn">طلب تمديد</button>':""}
    ${t.status==="open"&&["manager","assistant","ceo","ceo_office_manager","ceo_secretary"].includes(session.role)?'<button class="btn btn-soft" id="ceoViewBtn">إطلاع الرئيس</button>':""}
    ${t.status==="open"?'<button class="btn btn-red" id="cancelBtn">إلغاء المعاملة</button>':""}
    ${t.status==="open"&&session.role==="ceo_office_manager"&&!t.workflow_started?'<button class="btn btn-red" id="deleteBtn">حذف نهائي</button>':""}
    <button class="btn btn-soft" id="waBtn">نسخ واتساب</button>
    <button class="btn btn-soft" id="excelBtn">Excel المعاملة</button>
    <button class="btn btn-soft" id="pdfBtn">PDF المعاملة</button>
  `);
  w.querySelectorAll("[data-action-approve]").forEach(b=>b.onclick=()=>decideAction(b.dataset.actionApprove,true,w,id));
  w.querySelectorAll("[data-action-reject]").forEach(b=>b.onclick=()=>decideAction(b.dataset.actionReject,false,w,id));
  w.querySelectorAll("[data-action-revise]").forEach(b=>b.onclick=()=>reviseAction(b.dataset.actionRevise,w,id));
  w.querySelectorAll("[data-request-approve]").forEach(b=>b.onclick=()=>decideRequest(b.dataset.requestApprove,true,w,id));
  w.querySelectorAll("[data-request-reject]").forEach(b=>b.onclick=()=>decideRequest(b.dataset.requestReject,false,w,id));
  if(w.querySelector("#priorityBtn"))w.querySelector("#priorityBtn").onclick=()=>openPriority(id,w);
  if(w.querySelector("#dueBtn"))w.querySelector("#dueBtn").onclick=()=>openDueDate(id,w,t.due_at);
  if(w.querySelector("#responsibleBtn"))w.querySelector("#responsibleBtn").onclick=()=>openResponsible(id,w);
  if(w.querySelector("#extensionBtn"))w.querySelector("#extensionBtn").onclick=()=>openExtension(id,w,t.due_at);
  if(w.querySelector("#ceoViewBtn"))w.querySelector("#ceoViewBtn").onclick=async()=>{await post(CONFIG.txFn,baseBody("mark_ceo_view",{transaction_id:id}));w.remove();await refresh()};
  if(w.querySelector("#cancelBtn"))w.querySelector("#cancelBtn").onclick=()=>{w.remove();openReason("request_cancel",id,"إلغاء المعاملة")};
  if(w.querySelector("#deleteBtn"))w.querySelector("#deleteBtn").onclick=async()=>{await post(CONFIG.txFn,baseBody("delete_hard",{transaction_id:id}));w.remove();await refresh()};
  w.querySelector("#waBtn").onclick=()=>copyWhatsApp(d);
  w.querySelector("#excelBtn").onclick=()=>exportTransactionExcel(d);
  w.querySelector("#pdfBtn").onclick=()=>printTransaction(d);
}
async function decideAction(actionId,approve,parent,txId){
  if(approve){
    await post(CONFIG.txFn,baseBody("decide_action",{action_id:actionId,decision:"approved",reason:""}));
    parent.remove();await refresh();return;
  }
  const w=modal("رفض الإجراء",'<label>سبب الرفض</label><textarea class="field" id="actionRejectReason"></textarea>',
    '<button class="btn btn-red" id="saveActionReject">رفض</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveActionReject").onclick=async()=>{
    const reason=w.querySelector("#actionRejectReason").value.trim();if(!reason)return;
    await post(CONFIG.txFn,baseBody("decide_action",{action_id:actionId,decision:"rejected",reason}));
    w.remove();parent.remove();await refresh();
  };
}
function reviseAction(actionId,parent,txId){
  const w=modal("تعديل الإجراء",'<label>إجراء العمل</label><textarea class="field" id="revisionText"></textarea>',
    '<button class="btn btn-green" id="saveRevision">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveRevision").onclick=async()=>{
    const text=w.querySelector("#revisionText").value.trim();if(!text)return;
    await post(CONFIG.txFn,baseBody("revise_action",{action_id:actionId,text}));
    w.remove();parent.remove();await refresh();
  };
}
async function decideRequest(requestId,approve,parent,txId){
  if(approve){
    await post(CONFIG.txFn,baseBody("decide_request",{request_id:requestId,approve:true,decision_reason:""}));
    parent.remove();await refresh();return;
  }
  const w=modal("رفض الطلب",'<label>سبب الرفض</label><textarea class="field" id="decisionReason"></textarea>',
    '<button class="btn btn-red" id="saveDecision">رفض</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveDecision").onclick=async()=>{
    const reason=w.querySelector("#decisionReason").value.trim();if(!reason)return;
    await post(CONFIG.txFn,baseBody("decide_request",{request_id:requestId,approve:false,decision_reason:reason}));
    w.remove();parent.remove();await refresh();
  };
}
function openPriority(id,parent){
  const w=modal("الأولوية",'<label>الأولوية</label><select class="field" id="newPriority"><option>عادي</option><option>عاجل</option><option>عاجل جدًا</option></select>',
    '<button class="btn btn-green" id="save">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("change_priority",{transaction_id:id,priority:w.querySelector("#newPriority").value}));w.remove();parent.remove();await refresh()};
}
function openDueDate(id,parent,current){
  const v=current?String(current).slice(0,10):"";
  const w=modal("تاريخ الاستحقاق",'<label>تاريخ الاستحقاق</label><input class="field" type="date" id="newDue" value="'+esc(v)+'">',
    '<button class="btn btn-green" id="save">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("set_due_date",{transaction_id:id,due_at:w.querySelector("#newDue").value}));w.remove();parent.remove();await refresh()};
}
function openExtension(id,parent,current){
  const v=current?String(current).slice(0,10):"";
  const w=modal("طلب تمديد",'<label>السبب</label><textarea class="field" id="extensionReason"></textarea><label>التاريخ الجديد المقترح</label><input class="field" type="date" id="extensionDate" value="'+esc(v)+'">',
    '<button class="btn btn-green" id="saveExtension">إرسال الطلب</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveExtension").onclick=async()=>{
    const reason=w.querySelector("#extensionReason").value.trim(),requested_due_at=w.querySelector("#extensionDate").value;
    if(!reason||!requested_due_at)return;
    await post(CONFIG.txFn,baseBody("request_extension",{transaction_id:id,reason,requested_due_at}));
    w.remove();parent.remove();await refresh();
  };
}
function openResponsible(id,parent){
  const w=modal("مسؤول المعاملة",'<label>المسؤول الجديد</label><select class="field" id="newResponsible">'+userOptions(()=>true)+'</select><label>السبب</label><textarea class="field" id="respReason"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#save").onclick=async()=>{const reason=w.querySelector("#respReason").value.trim();if(!reason)return;await post(CONFIG.txFn,baseBody("change_responsible",{transaction_id:id,to_login:w.querySelector("#newResponsible").value,reason}));w.remove();parent.remove();await refresh()};
}
async function openNotifications(){
  const n=await post(CONFIG.txFn,baseBody("notifications"));
  const rows=n.rows||[];
  const w=modal("التنبيهات",rows.length?rows.map(x=>'<button class="notification-item '+(x.read_at?"read":"")+'" data-notif="'+x.id+'"><span>'+esc(x.title)+'</span><small>'+esc(fmtDate(x.created_at))+'</small><b>'+esc(x.body||"")+'</b></button>').join(""):'<div class="empty">لا توجد تنبيهات</div>');
  w.querySelectorAll("[data-notif]").forEach(b=>b.onclick=async()=>{await post(CONFIG.txFn,baseBody("notification_read",{notification_id:b.dataset.notif}));b.classList.add("read")});
}
function copyWhatsApp(d){
  const t=d.transaction;
  const text=['*'+t.title+'*','رقم المعاملة: '+t.number,'الأولوية: '+t.priority,'الحالة: '+(t.status==="closed"?"مغلقة":"مفتوحة"),t.subject?'الموضوع: '+t.subject:""].filter(Boolean).join("\n");
  navigator.clipboard.writeText(text);
}
function xmlCell(v){return '<Cell><Data ss:Type="String">'+String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</Data></Cell>'}
function download(name,type,content){
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}
function excelXml(rows){
  return '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="المعاملات"><Table>'+rows.map(r=>'<Row>'+r.map(xmlCell).join("")+'</Row>').join("")+'</Table></Worksheet></Workbook>';
}
function exportListExcel(){
  const rows=[["رقم المعاملة","عنوان المعاملة","الإدارة المسؤولة","مسؤول المعاملة","الأولوية","الحالة","عدد الأيام","آخر تحديث"],...(listData.rows||[]).map(r=>[r.number,r.title,r.responsible_unit_name||"",r.responsible_name||"",r.priority,r.status,r.days,fmtDate(r.last_activity_at)])];
  download("المعاملات.xls","application/vnd.ms-excel;charset=utf-8",excelXml(rows));
}
function exportTransactionExcel(d){
  const t=d.transaction,rows=[
    ["رقم المعاملة",t.number],["عنوان المعاملة",t.title],["موضوع المعاملة",t.subject||""],["الأولوية",t.priority],["الحالة",t.status],["مسؤول المعاملة",t.responsible_name||""],["تاريخ الإنشاء",fmtDate(t.created_at)],["تاريخ الاستحقاق",fmtDate(t.due_at)],
    [],["إجراءات العمل"],["التاريخ","بواسطة","الإجراء"],...(d.actions||[]).map(a=>[fmtDate(a.created_at),a.actor_name||"",a.action_text||""]),
    [],["الإسناد"],["التاريخ","النوع","التوجيه","الموظفون"],...(d.assignments||[]).map(a=>[fmtDate(a.created_at),a.assignment_type,a.directive||"",(a.transaction_assignment_targets||[]).map(x=>x.display_name).join("، ")]),
    [],["الإحالات"],["التاريخ","من","إلى","التوجيه","سبب الرفع","القرار المقترح"],...(d.routes||[]).map(r=>[fmtDate(r.created_at),r.from_name||"",r.to_name||"",r.directive||"",r.raise_reason||r.transfer_reason||"",r.proposed_decision||""]),
    [],["الطلبات"],["التاريخ","الطالب","النوع","السبب","الحالة"],...(d.requests||[]).map(r=>[fmtDate(r.created_at),r.requested_by_name||"",r.request_type,r.reason,r.status]),
    [],["السجل"],["التاريخ","الحدث","بواسطة","التفاصيل"],...(d.history||[]).map(h=>[fmtDate(h.created_at),h.event_type,h.actor_name||"",h.detail||""])
  ];
  download("معاملة-"+t.number+".xls","application/vnd.ms-excel;charset=utf-8",excelXml(rows));
}
function printHtml(title,body){
  const w=window.open("","_blank");if(!w)return;
  w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font-family:Tahoma,Arial;padding:28px;color:#1f2937}h1{color:#0f2b4d}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:7px;text-align:right}th{background:#0E7490;color:white}.sec{margin-top:24px}</style></head><body>'+body+'</body></html>');
  w.document.close();w.focus();setTimeout(()=>w.print(),200);
}
function printList(){
  const rows=(listData.rows||[]).map(r=>'<tr><td>'+esc(r.number)+'</td><td>'+esc(r.title)+'</td><td>'+esc(r.responsible_unit_name||"")+'</td><td>'+esc(r.priority)+'</td><td>'+esc(r.status)+'</td></tr>').join("");
  printHtml("المعاملات",'<h1>المعاملات</h1><table><thead><tr><th>الرقم</th><th>العنوان</th><th>الإدارة</th><th>الأولوية</th><th>الحالة</th></tr></thead><tbody>'+rows+'</tbody></table>');
}
function printTransaction(d){
  const t=d.transaction;
  const acts=(d.actions||[]).map(a=>'<tr><td>'+esc(fmtDate(a.created_at))+'</td><td>'+esc(a.actor_name||"")+'</td><td>'+esc(a.action_text||"")+'</td></tr>').join("");
  const routes=(d.routes||[]).map(r=>'<tr><td>'+esc(fmtDate(r.created_at))+'</td><td>'+esc(r.from_name||"")+'</td><td>'+esc(r.to_name||"")+'</td><td>'+esc(r.directive||r.raise_reason||r.transfer_reason||"")+'</td></tr>').join("");
  printHtml("معاملة "+t.number,'<h1>'+esc(t.title)+'</h1><table><tr><th>رقم المعاملة</th><td>'+esc(t.number)+'</td></tr><tr><th>الموضوع</th><td>'+esc(t.subject||"")+'</td></tr><tr><th>الأولوية</th><td>'+esc(t.priority)+'</td></tr></table><h2 class="sec">إجراءات العمل</h2><table><tr><th>التاريخ</th><th>بواسطة</th><th>الإجراء</th></tr>'+acts+'</table><h2 class="sec">الإحالات والتوجيهات</h2><table><tr><th>التاريخ</th><th>من</th><th>إلى</th><th>التفاصيل</th></tr>'+routes+'</table>');
}
async function logout(){
  const old=session;
  try{if(old?.token)await post(CONFIG.logoutFn,{app:old.app,token:old.token},false)}catch{}
  clearSession();directoryData={users:[],units:[],me:null};listData={rows:[]};currentTab="";loginView();
}

loadSession();
boot();
