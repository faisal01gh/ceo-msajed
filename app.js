"use strict";

const CONFIG={
  supabaseUrl:"https://movzojtnkkmdsjhmlgtq.supabase.co",
  publishableKey:"sb_publishable_FjLQ_5HZEg_CGhdw3CC0CA_KbG3WKj8",
  resolveFn:"account-resolve",
  confirmPasswordFn:"account-confirm-password",
  txFn:"transactions-api"
};

const root=document.getElementById("app");
const SESSION_KEY="msajed_session";
let session=null;
let directoryData={users:[],units:[],me:null};
let listData={rows:[],total:0,page:1,page_size:50,counters:{}};
let currentSection="transactions";
let currentTab="";
let sessionPermissions=[];
let permissionsData=null;
let permissionsSelectedUser="";
let permissionsSection="transactions";
let profileData=null;
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
function safeUrl(v){
  try{
    const u=new URL(String(v||""));
    return ["http:","https:"].includes(u.protocol)?u.href:"";
  }catch{return ""}
}
function fmtDate(v){
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function fmtDateTime(v){
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);
}
function periodDays(p){
  if(p?.ended_at)return Number(p.duration_days||0);
  const start=new Date(p?.started_at||"").getTime();
  return Number.isFinite(start)?Math.max(1,Math.floor((Date.now()-start)/86400000)+1):0;
}
function requestTypeLabel(type){
  return ({close:"طلب إغلاق المعاملة",reopen:"طلب استرجاع المعاملة",extension:"طلب تمديد",change_responsible:"طلب تغيير المسؤول",cancel:"طلب إلغاء المعاملة"})[type]||"طلب";
}
function requestStatusLabel(status){
  return ({pending:"قيد الانتظار",approved:"معتمد",rejected:"مرفوض"})[status]||status||"—";
}
function requestTargetLabel(role){
  return ({manager:"مدير الإدارة",assistant:"المساعد",ceo:"مستوى الرئيس"})[role]||"";
}
function transactionRequestedText(d){
  const routes=[...(d?.routes||[])].reverse();
  return routes.find(r=>String(r.proposed_decision||"").trim())?.proposed_decision||d?.transaction?.subject||"—";
}
function historyText(h){
  const m=h?.meta||{},actor=h?.actor_name||"—",detail=String(h?.detail||"").trim();
  if(h.event_type==="priority_changed"){
    let old=m.old_priority||"",next=m.new_priority||"";
    if((!old||!next)&&detail.includes("→")){const p=detail.split("→");old=p[0]?.trim()||old;next=p[1]?.trim()||next}
    return "تم تغيير أولوية المعاملة"+(old&&next?" من «"+old+"» إلى «"+next+"»":"")+" من قبل «"+actor+"»"+(m.reason?" بسبب «"+m.reason+"»":"");
  }
  if(h.event_type==="due_date_changed"){
    if(m.new_due_at)return (m.old_due_at?"تم تعديل تاريخ استحقاق المعاملة إلى ":"تم تعيين تاريخ استحقاق المعاملة بتاريخ ")+"«"+fmtDate(m.new_due_at)+"» من قبل «"+actor+"»";
    return "تمت إزالة تاريخ استحقاق المعاملة من قبل «"+actor+"»";
  }
  if(h.event_type==="responsible_changed"){
    return "تم تغيير مسؤول المعاملة"+(m.old_responsible||m.new_responsible?" من «"+(m.old_responsible||"—")+"» إلى «"+(m.new_responsible||"—")+"»":"")+" من قبل «"+actor+"»"+(m.reason?" بسبب «"+m.reason+"»":"");
  }
  if(h.event_type==="responsible_unit_changed"){
    return "تم تغيير الإدارة المسؤولة من «"+(m.old_unit||"—")+"» إلى «"+(m.new_unit||"—")+"» وتعيين «"+(m.new_responsible||"—")+"» مسؤولًا عن المعاملة بواسطة «"+actor+"»";
  }
  if(h.event_type==="subject_changed"){
    return "تم تعديل موضوع المعاملة من قبل «"+actor+"»"+(m.old_subject||m.new_subject?" من «"+(m.old_subject||"—")+"» إلى «"+(m.new_subject||"—")+"»":"");
  }
  if(h.event_type==="raise_ceo"){
    return "تمت إحالة المعاملة من قبل «"+actor+"» إلى الرئيس التنفيذي"+((m.reason||detail)?" بسبب «"+(m.reason||detail)+"»":"")+(m.requested?"، والمطلوب «"+m.requested+"»":"");
  }
  if(h.event_type==="closed")return "تم إغلاق المعاملة من قبل «"+actor+"»"+(detail?" بسبب «"+detail+"»":"");
  if(h.event_type==="reopened")return "تم استرجاع المعاملة من قبل «"+actor+"»"+(detail?" بسبب «"+detail+"»":"");
  if(h.event_type==="request_close")return "تم طلب إغلاق المعاملة من قبل «"+actor+"»"+(detail?" بسبب «"+detail+"»":"");
  if(h.event_type==="request_reopen")return "تم طلب استرجاع المعاملة من قبل «"+actor+"»"+(detail?" بسبب «"+detail+"»":"");
  if(h.event_type==="ceo_view_marked")return "تم إرسال المعاملة لإطلاع الرئيس التنفيذي بواسطة «"+actor+"»";
  if(h.event_type==="request_approved")return "تم اعتماد الطلب من قبل «"+actor+"»"+(detail?" — "+detail:"");
  if(h.event_type==="request_rejected")return "تم رفض الطلب من قبل «"+actor+"»"+(detail?" بسبب «"+detail+"»":"");
  return detail||h?.event_type||"—";
}
function apiUrl(fn){return CONFIG.supabaseUrl+"/functions/v1/"+fn}
async function fetchJson(url,options={},timeoutMs=15000){
  const controller=new AbortController();
  const timeoutId=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:controller.signal});
    const data=await r.json().catch(()=>({}));
    return {r,data};
  }catch(err){
    if(err?.name==="AbortError"){
      const e=new Error("network_timeout");
      e.code="NETWORK_TIMEOUT";
      throw e;
    }
    throw err;
  }finally{
    clearTimeout(timeoutId);
  }
}
async function refreshAuthSession(){
  if(!session?.refresh_token)return false;
  const {r,data}=await fetchJson(CONFIG.supabaseUrl+"/auth/v1/token?grant_type=refresh_token",{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey},
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  if(!r.ok||!data.access_token)return false;
  session.token=data.access_token;
  session.refresh_token=data.refresh_token||session.refresh_token;
  saveSession();
  return true;
}
async function post(fn,body,retry=true){
  let {r,data}=await fetchJson(apiUrl(fn),{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey},
    body:JSON.stringify(body)
  });
  if(r.status===401&&retry&&session&&await refreshAuthSession()){
    body={...body,token:session.token};
    ({r,data}=await fetchJson(apiUrl(fn),{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey},
      body:JSON.stringify(body)
    }));
  }
  if(!r.ok){const e=new Error(data.error||"request_failed");e.status=r.status;e.data=data;throw e}
  return data;
}
async function rpc(name,body={},retry=true){
  if(!session?.token)throw new Error("unauthorized");
  const url=CONFIG.supabaseUrl+"/rest/v1/rpc/"+name;
  const headers={"Content-Type":"application/json","apikey":CONFIG.publishableKey,Authorization:"Bearer "+session.token};
  let {r,data}=await fetchJson(url,{method:"POST",headers,body:JSON.stringify(body)});
  if(r.status===401&&retry&&session&&await refreshAuthSession()){
    headers.Authorization="Bearer "+session.token;
    ({r,data}=await fetchJson(url,{method:"POST",headers,body:JSON.stringify(body)}));
  }
  if(!r.ok){const e=new Error(data.message||data.error||"request_failed");e.status=r.status;e.data=data;throw e}
  return data;
}
function saveSession(){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}
function loadSession(){try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null");if(session?.app!=="new")session=null}catch{session=null}}
function clearSession(){sessionStorage.removeItem(SESSION_KEY);session=null}
function isExec(){return ["ceo","ceo_office_manager","ceo_secretary"].includes(session?.role)}
function hasTxPerm(code){return sessionPermissions.includes(code)}
function canManagePermissions(){return session?.role==="ceo_office_manager"}
const ROUTE_PERMISSION_CODES=[
  "transactions.raise_manager",
  "transactions.assign_department",
  "transactions.assign_sector",
  "transactions.assign_cross_sector",
  "transactions.raise_assistant",
  "transactions.transfer_assistant",
  "transactions.raise_ceo"
];
function hasAnyRoutePerm(){return ROUTE_PERMISSION_CODES.some(hasTxPerm)}
function tabsFor(role){
  let tabs;
  if(role==="ceo")tabs=[["incoming","وارد إليّ"],["ceo_view","معاملات للاطلاع"],["shared","معاملات مشتركة"],["closed","المعاملات المغلقة"]];
  else if(role==="ceo_office_manager"||role==="ceo_secretary")tabs=[["incoming","وارد إليّ"],["ceo","معاملات الرئيس التنفيذي"],["shared","معاملات مشتركة"],["closed","المعاملات المغلقة"]];
  else if(role==="assistant"||role==="manager")tabs=[["incoming","وارد إليّ"],["shared","معاملات مشتركة"],["scope","معاملات نطاقي"],["closed","المعاملات المغلقة"]];
  else tabs=[["incoming","وارد إليّ"],["shared","معاملات مشتركة"],["closed","المعاملات المغلقة"]];
  if(hasTxPerm("transactions.view_all")){
    const i=tabs.findIndex(x=>x[0]==="closed");
    tabs.splice(i<0?tabs.length:i,0,["all","جميع معاملات الجمعية"]);
  }
  return tabs;
}
function defaultTab(role){
  if(role==="ceo")return "incoming";
  if(hasTxPerm("transactions.view_all"))return "all";
  return (role==="assistant"||role==="manager")?"scope":"incoming";
}
function baseBody(action,extra={}){return {app:"new",token:session.token,action,...extra}}

function uiIcon(name){
  const paths={
    transactions:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    profile:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    permissions:'<path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    filter:'<path d="M4 7h16M7 12h10M10 17h4"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    edit:'<path d="m15 4 5 5M4 20l4-1 12-12-3-3L5 16Z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    building:'<path d="M4 21V10l8-7 8 7v11M2 21h20M9 21v-7h6v7M8 10h.01M16 10h.01"/>',
    empty:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>'
  };
  return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.transactions)+'</svg>';
}
function showNotice(message,success=false){
  document.querySelector('.ui-notice')?.remove();
  const el=document.createElement('div');
  el.className='ui-notice'+(success?' success':'');el.setAttribute('role',success?'status':'alert');
  el.innerHTML='<span>'+esc(message)+'</span><button type="button" aria-label="إغلاق التنبيه">'+uiIcon('close')+'</button>';
  el.querySelector('button').onclick=()=>el.remove();document.body.appendChild(el);
}
function showRequestError(container,message='تعذر إكمال الطلب. تحقق من الاتصال ثم حاول مرة أخرى.'){
  if(container?.isConnected){
    let el=container.querySelector('.modal-feedback');
    if(!el){el=document.createElement('p');el.className='modal-feedback';el.setAttribute('role','alert');container.querySelector('.modal-body').prepend(el)}
    el.textContent=message;
  }else showNotice(message);
}
let uiFieldSerial=0;
function associateFormLabels(container){
  container.querySelectorAll('label:not([for])').forEach(label=>{
    if(label.querySelector('input,select,textarea'))return;
    const next=label.nextElementSibling;
    const field=next?.matches('input,select,textarea')?next:next?.querySelector('input,select,textarea');
    if(!field)return;
    if(!field.id)field.id='ui-field-'+(++uiFieldSerial);
    label.htmlFor=field.id;
  });
}
function emptyState(title,help=''){
  return '<div class="empty">'+uiIcon('empty')+'<strong>'+esc(title)+'</strong>'+(help?'<p>'+esc(help)+'</p>':'')+'</div>';
}
function loginView(){
  root.innerHTML=`
  <section class="login-shell" role="main">
    <form class="login-card" id="loginForm">
      <div class="login-brand"><span class="brand-mark">${uiIcon("building")}</span><h1 class="login-title">جمعية عمارة المساجد</h1></div>
      <p class="login-intro">سجّل الدخول إلى نظام الجمعية.</p>
      <label for="username">اسم المستخدم</label>
      <input class="field" id="username" autocomplete="username" autocapitalize="off" spellcheck="false">
      <label for="password">كلمة السر</label>
      <div class="password-input-wrap"><input class="field password-input" id="password" type="password" autocomplete="current-password" aria-describedby="loginMsg"><button class="password-toggle" id="toggleLoginPassword" type="button" aria-label="إظهار كلمة المرور" aria-pressed="false">${passwordEyeIcon()}</button></div>
      <button class="login-btn" id="loginBtn" type="submit">دخول</button>
      <p class="login-msg" id="loginMsg" aria-live="polite"></p>
      <p class="login-foot">أهلاً وسهلاً بكم</p>
    </form>
  </section>`;
  document.getElementById("loginForm").addEventListener("submit",login);
  wirePasswordToggle(document.getElementById("toggleLoginPassword"),document.getElementById("password"));
  document.getElementById("username").focus();
}
async function signInNew(email,password){
  const {r,data}=await fetchJson(CONFIG.supabaseUrl+"/auth/v1/token?grant_type=password",{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey},
    body:JSON.stringify({email,password})
  });
  return r.ok&&data.access_token?data:null;
}
function passwordPolicy(value){
  return {
    length:Array.from(value).length>=8,
    upper:/[A-Z]/.test(value),
    lower:/[a-z]/.test(value),
    symbol:/[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,.\/\x60~]/.test(value),
    digit:/[0-9]/.test(value)
  };
}
function passwordComponentIds(prefix=""){
  const stem=prefix?prefix[0].toUpperCase()+prefix.slice(1):"";
  return {
    first:prefix?prefix+"NewPassword":"newPassword",
    second:prefix?prefix+"ConfirmPassword":"confirmPassword",
    firstToggle:"toggle"+stem+"NewPassword",
    secondToggle:"toggle"+stem+"ConfirmPassword",
    rules:prefix?prefix+"PasswordRules":"passwordRules",
    match:prefix?prefix+"PasswordMatch":"passwordMatch"
  };
}
function passwordRulesMarkup(value="",confirmation="",prefix=""){
  const ids=passwordComponentIds(prefix);
  const state={...passwordPolicy(value),match:!!value&&!!confirmation&&value===confirmation};
  const rules=[["upper","حرف كبير (ABC)"],["lower","حرف صغير (abc)"],["symbol","رمز (! @ #)"],["length","8 خانات على الأقل"],["digit","رقم (123)"],["match","كلمتا المرور متطابقتان"]];
  return '<ul class="password-requirements" id="'+ids.rules+'" aria-label="شروط كلمة المرور">'+rules.map(([key,label])=>'<li class="password-requirement '+(state[key]?"ok":"")+'" data-password-rule="'+key+'" id="'+(key==="match"?ids.match:ids.rules+"-"+key)+'"><span class="password-rule-indicator" aria-hidden="true">'+(state[key]?"✓":"")+'</span><span>'+esc(label)+'</span><span class="sr-only">'+(state[key]?" — متحقق":" — غير متحقق")+'</span></li>').join("")+'</ul>';
}
function passwordComponentMarkup(prefix=""){
  const ids=passwordComponentIds(prefix);
  return `<div class="password-field-group">
    <label for="${ids.first}">كلمة المرور الجديدة</label>
    <div class="password-input-wrap">
      <input class="field password-input" id="${ids.first}" type="password" autocomplete="new-password" aria-describedby="${ids.rules}" placeholder="أدخل كلمة المرور الجديدة">
      <button class="password-toggle" id="${ids.firstToggle}" type="button" aria-label="إظهار كلمة المرور">${passwordEyeIcon()}</button>
    </div>
  </div><div class="password-field-group">
    <label for="${ids.second}">تأكيد كلمة المرور</label>
    <div class="password-input-wrap">
      <input class="field password-input" id="${ids.second}" type="password" autocomplete="new-password" aria-describedby="${ids.match}" placeholder="أعد إدخال كلمة المرور">
      <button class="password-toggle" id="${ids.secondToggle}" type="button" aria-label="إظهار كلمة المرور">${passwordEyeIcon()}</button>
    </div>
  </div>${passwordRulesMarkup("","",prefix)}<span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-password-match-status></span>`;
}
function wirePasswordComponent(container,prefix,button){
  const ids=passwordComponentIds(prefix);
  const first=container.querySelector('#'+ids.first),second=container.querySelector('#'+ids.second);
  const toggles=[container.querySelector('#'+ids.firstToggle),container.querySelector('#'+ids.secondToggle)];
  wirePasswordToggle(toggles[0],first);wirePasswordToggle(toggles[1],second);
  let busy=false;
  const ready=()=>passwordStrong(first.value)&&!!second.value&&first.value===second.value;
  const draw=()=>{
    const list=container.querySelector('#'+ids.rules);
    if(list)list.outerHTML=passwordRulesMarkup(first.value,second.value,prefix);
    const matchStatus=container.querySelector('[data-password-match-status]');
    const matchText=second.value?(first.value&&first.value===second.value?"كلمتا المرور متطابقتان":"كلمتا المرور غير متطابقتين"):"";
    if(matchStatus&&matchStatus.textContent!==matchText)matchStatus.textContent=matchText;
    button.disabled=busy||!ready();
  };
  first.addEventListener('input',draw);second.addEventListener('input',draw);draw();
  return {first,second,ready,setBusy(value){busy=value;first.disabled=value;second.disabled=value;toggles.forEach(b=>{b.disabled=value});draw()}};
}
function passwordStrong(value){return Object.values(passwordPolicy(value)).every(Boolean)}
function passwordEyeIcon(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
}
function wirePasswordToggle(button,input){
  if(!button||!input)return;
  button.setAttribute("aria-pressed","false");
  button.onclick=()=>{
    const show=input.type==="password";
    input.type=show?"text":"password";
    button.classList.toggle("active",show);
    button.setAttribute("aria-pressed",String(show));
    button.setAttribute("aria-label",show?"إخفاء كلمة المرور":"إظهار كلمة المرور");
  };
}
function passwordChangeView(ctx){
  root.innerHTML=`
  <section class="password-shell" role="main">
    <form class="password-card" id="passwordForm">
      <div class="password-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7.5 10V7.8a4.5 4.5 0 0 1 9 0V10"/><rect x="5.5" y="10" width="13" height="10" rx="2.5"/><path d="M12 14v2.4"/></svg>
      </div>
      <div class="password-heading">
        <h1>تحديث كلمة المرور</h1>
        <p>حدّث كلمة المرور للمتابعة.</p>
      </div>

      ${passwordComponentMarkup()}
      <button class="password-submit" id="passwordBtn" type="submit" disabled>حفظ والدخول</button>
      <p class="login-msg" id="passwordMsg" aria-live="polite"></p>
    </form>
  </section>`;
  const component=wirePasswordComponent(document.getElementById("passwordForm"),"",document.getElementById("passwordBtn"));
  const p1=component.first,p2=component.second;
  document.getElementById("passwordForm").onsubmit=async e=>{
    e.preventDefault();
    const p=p1.value,pConfirm=p2.value;
    const msg=document.getElementById("passwordMsg"),btn=document.getElementById("passwordBtn");
    if(!passwordStrong(p)){msg.textContent="أكمل شروط كلمة المرور";return}
    if(p!==pConfirm){msg.textContent="كلمتا المرور غير متطابقتين";return}
    component.setBusy(true);msg.textContent="";
    try{
      const {r:upd}=await fetchJson(CONFIG.supabaseUrl+"/auth/v1/user",{
        method:"PUT",
        headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey,Authorization:"Bearer "+ctx.auth.access_token},
        body:JSON.stringify({password:p})
      });
      if(!upd.ok)throw new Error("password_update_failed");
      const confirmed=await post(CONFIG.confirmPasswordFn,{access_token:ctx.auth.access_token},false);
      session={
        app:"new",token:ctx.auth.access_token,refresh_token:ctx.auth.refresh_token||null,
        username:confirmed.preferred_login,login_name:confirmed.preferred_login,
        display_name:confirmed.display_name,role:confirmed.role,legacy_role:""
      };
      saveSession();currentTab="";currentSection="transactions";await boot();
    }catch{
      msg.textContent="تعذر حفظ كلمة المرور";
      component.setBusy(false);
    }
  };
  p1.focus();
}
async function login(e){
  e.preventDefault();
  const username=document.getElementById("username").value.trim();
  const password=document.getElementById("password").value;
  const btn=document.getElementById("loginBtn"),msg=document.getElementById("loginMsg");
  if(!username||!password){msg.textContent="أكمل الحقلين";return}
  btn.disabled=true;btn.textContent="…";msg.textContent="";
  try{
    const resolved=await post(CONFIG.resolveFn,{login:username},false);
    if(!resolved.eligible||!resolved.migrated)throw new Error("account_not_ready");
    const auth=await signInNew(resolved.internal_email,password);
    if(!auth)throw new Error("invalid_credentials");
    if(resolved.must_change_password===true){
      passwordChangeView({resolved,auth});
      return;
    }
    session={
      app:"new",token:auth.access_token,refresh_token:auth.refresh_token||null,
      username:resolved.preferred_login||username,login_name:resolved.preferred_login||username,
      display_name:resolved.display_name||username,role:resolved.role,legacy_role:""
    };
    saveSession();currentTab="";currentSection="transactions";await boot();return;
  }catch(err){
    msg.textContent=err?.message==="account_not_ready"
      ?"الحساب مسجل وسيتم تفعيل دخوله في النظام الجديد عند اكتمال إنشاء Auth"
      :"اسم المستخدم أو كلمة السر غير صحيحة";
    document.getElementById("password").value="";
    btn.disabled=false;btn.textContent="دخول";
  }
}
async function boot(){
  if(!session){loginView();return}
  root.innerHTML='<section class="loading" role="status" aria-live="polite"><h1>جارٍ تحميل المعاملات</h1><p>نجهّز مساحة العمل.</p><div class="skeleton-lines" aria-hidden="true"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></section>';
  try{
    const gateProfile=await rpc("my_profile");
    if(gateProfile?.must_change_password===true){
      passwordChangeView({auth:{access_token:session.token,refresh_token:session.refresh_token||null}});
      return;
    }
    if(!currentTab)currentTab=defaultTab(session.role);
    const listArgs={
      p_tab:currentTab,p_search:searchText,p_priority:priorityFilter,p_status:statusFilter,
      p_department:departmentFilter,p_employee:employeeFilter,p_origin:originFilter,p_late_only:lateOnly,
      p_date_from:dateFrom||null,p_date_to:dateTo||null,p_page:page,p_page_size:50
    };
    const [dir,list,perms]=await Promise.all([
      rpc("transaction_directory_my"),
      rpc("list_my_transactions",listArgs),
      rpc("my_permissions")
    ]);
    directoryData=dir;
    listData=list;
    sessionPermissions=Array.isArray(perms)?perms:[];
    if(directoryData.me){
      session.role=directoryData.me.role||session.role;
      session.display_name=directoryData.me.display_name||session.display_name;
      session.org_name=directoryData.me.org_name||session.org_name;
      session.dept_name=directoryData.me.dept_name||session.dept_name;
      session.dept_names=directoryData.me.dept_names||session.dept_names;
      session.login_name=directoryData.me.login_name||session.username;
      saveSession();
      const wanted=defaultTab(session.role);
      if(!tabsFor(session.role).some(x=>x[0]===currentTab)){
        currentTab=wanted;
        await loadList();
      }
    }
    renderApp();
  }catch(err){
    if(err.status===401){clearSession();loginView();return}
    root.innerHTML='<section class="loading"><h1>تعذّر تحميل المعاملات</h1><p role="alert">تحقق من الاتصال ثم أعد المحاولة. لم تتغير بياناتك.</p><button class="btn btn-blue" id="retryBoot">إعادة المحاولة</button></section>';
    document.getElementById("retryBoot").onclick=boot;
  }
}
async function loadList(){
  listData=await rpc("list_my_transactions",{
    p_tab:currentTab,p_search:searchText,p_priority:priorityFilter,p_status:statusFilter,
    p_department:departmentFilter,p_employee:employeeFilter,p_origin:originFilter,p_late_only:lateOnly,
    p_date_from:dateFrom||null,p_date_to:dateTo||null,p_page:page,p_page_size:50
  });
}
function sectionSidebar(active){
  return `
    <nav class="glass-sidebar" aria-label="أقسام النظام">
      <div class="sidebar-brand">نظام الجمعية<small>جمعية عمارة المساجد</small><span class="brand-line" aria-hidden="true"></span></div>
      <button class="sidebar-item ${active==="transactions"?"active":""}" ${active==="transactions"?'aria-current="page"':""} data-section="transactions">${uiIcon("transactions")}المعاملات</button>
      <button class="sidebar-item ${active==="profile"?"active":""}" ${active==="profile"?'aria-current="page"':""} data-section="profile">${uiIcon("profile")}بياناتي</button>
      ${canManagePermissions()?'<button class="sidebar-item '+(active==="permissions"?"active":"")+'" '+(active==="permissions"?'aria-current="page"':"")+' data-section="permissions">'+uiIcon("permissions")+'الصلاحيات</button>':""}
    </nav>`;
}
async function wireSectionSidebar(){
  document.querySelectorAll("[data-section]").forEach(b=>b.onclick=async()=>{
    const section=b.dataset.section;
    try{
    if(section==="transactions"){
      currentSection="transactions";
      renderApp();
      return;
    }
    if(section==="profile"){
      await loadProfile();
      currentSection="profile";
      renderProfileApp();
      return;
    }
    if(section==="permissions"&&canManagePermissions()){
      await loadPermissions();
      currentSection="permissions";
      renderPermissionsApp();
    }
    }catch{showNotice("تعذر تحميل القسم. تحقق من الاتصال ثم حاول مرة أخرى.")}
  });
}
async function loadProfile(){
  profileData=await rpc("my_profile");
}
function openOwnPasswordChange(){
  const w=modal("تغيير كلمة المرور",passwordComponentMarkup("profile"),
    '<button class="btn btn-green" id="saveProfilePassword" disabled>حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  const component=wirePasswordComponent(w,"profile",w.querySelector("#saveProfilePassword"));
  const p1=component.first,p2=component.second;
  w.querySelector("#saveProfilePassword").onclick=async()=>{
    const p=p1.value;
    if(!passwordStrong(p)||p!==p2.value){showRequestError(w,"أكمل شروط كلمة المرور وتأكد من تطابق كلمتي المرور.");return}
    component.setBusy(true);
    try{
      const {r}=await fetchJson(CONFIG.supabaseUrl+"/auth/v1/user",{
        method:"PUT",
        headers:{"Content-Type":"application/json","apikey":CONFIG.publishableKey,Authorization:"Bearer "+session.token},
        body:JSON.stringify({password:p})
      });
      if(!r.ok)throw new Error("password_update_failed");
      w.remove();
    }catch{component.setBusy(false);showRequestError(w)}
  };
}
function renderProfileApp(){
  if(!profileData){currentSection="transactions";renderApp();return}
  root.innerHTML=`
  <div class="workspace">
    ${sectionSidebar("profile")}
    <main class="workspace-main">
      <header class="top-header">
        <div class="header-row">
          <h1>بياناتي</h1>
          <div class="user-box">
            <span class="user-name">${esc(session.display_name)}</span>
            <button class="btn btn-white" id="logoutBtn">تسجيل الخروج</button>
          </div>
        </div>
      </header>
      <section class="card profile-card">
        <div class="card-head"><span class="card-title">بيانات الحساب</span></div>
        <div class="profile-body">
          <label for="profileName">الاسم</label>
          <input class="field" id="profileName" value="${esc(profileData.name||"")}" disabled>
          <label for="profileEmail">البريد الإلكتروني</label>
          <input class="field" id="profileEmail" type="email" value="${esc(profileData.email||"")}" ${profileData.can_edit_email?"":"disabled"}>
          <div class="profile-actions">
            ${profileData.can_edit_email?'<button class="btn btn-green" id="saveProfileEmail">حفظ البريد</button>':""}
            <button class="btn btn-soft" id="changeProfilePassword">تغيير كلمة المرور</button>
          </div>
          ${profileData.can_edit_email?"":'<div class="profile-note">تعديل البريد مغلق حاليًا ويمكن لمدير المكتب منحه من الصلاحيات.</div>'}
        </div>
      </section>
    </main>
  </div>`;
  document.getElementById("logoutBtn").onclick=logout;
  wireSectionSidebar();
  document.getElementById("changeProfilePassword").onclick=openOwnPasswordChange;
  const save=document.getElementById("saveProfileEmail");
  if(save)save.onclick=async()=>{
    const email=document.getElementById("profileEmail").value.trim();save.disabled=true;
    try{
      profileData=await rpc("my_profile_set_email",{p_email:email});
      await loadProfile();renderProfileApp();showNotice("تم حفظ البريد الإلكتروني.",true);
    }catch{showNotice("تعذر حفظ البريد الإلكتروني. تحقق منه ثم حاول مرة أخرى.");save.disabled=false}
  };
}
async function loadPermissions(){
  if(!canManagePermissions())throw new Error("forbidden");
  permissionsData=await rpc("permissions_admin_snapshot",{p_section:permissionsSection});
  const users=permissionsData.users||[];
  if(!permissionsSelectedUser||!users.some(u=>u.canonical_key===permissionsSelectedUser)){
    permissionsSelectedUser=users[0]?.canonical_key||"";
  }
}
function renderPermissionsApp(){
  if(!canManagePermissions()){currentSection="transactions";renderApp();return}
  const users=permissionsData?.users||[];
  const selected=users.find(u=>u.canonical_key===permissionsSelectedUser)||users[0]||null;
  root.innerHTML=`
  <div class="workspace">
    ${sectionSidebar("permissions")}
    <main class="workspace-main">
      <header class="top-header">
        <div class="header-row">
          <h1>الصلاحيات</h1>
          <div class="user-box">
            <span class="user-name">${esc(session.display_name)}</span>
            <button class="btn btn-white" id="logoutBtn">تسجيل الخروج</button>
          </div>
        </div>
      </header>
      <section class="card permissions-card">
        <div class="card-head"><span class="card-title">الصلاحيات</span></div>
        <nav class="permissions-tabs">
          ${(permissionsData?.tabs||[]).map(t=>'<button class="permissions-tab '+(t.code===permissionsSection?"active":"")+'" data-permission-section="'+esc(t.code)+'">'+esc(t.name_ar)+'</button>').join("")}
        </nav>
        <div class="permissions-body">
          <div class="permissions-userbar">
            <label class="permissions-user-select" for="permissionsUser">المستخدم<select class="field" id="permissionsUser">
              ${users.map(u=>'<option value="'+esc(u.canonical_key)+'" '+(selected&&u.canonical_key===selected.canonical_key?"selected":"")+'>'+esc(u.display_name)+'</option>').join("")}
            </select></label>
            ${selected?'<span class="account-state '+(selected.user_id?"linked":"pending")+'">'+(selected.user_id?"الحساب مفعل":"بانتظار تفعيل الحساب")+'</span>':""}
            ${selected&&sessionPermissions.includes("profiles.admin_edit_name")?'<button class="btn btn-soft" id="editAccountNameBtn">تعديل الاسم</button>':""}
          </div>
          <div id="permissionsGrid">
            ${selected?renderPermissionGrid(selected):'<div class="empty">لا توجد حسابات</div>'}
          </div>
        </div>
      </section>
    </main>
  </div>`;
  document.getElementById("logoutBtn").onclick=logout;
  wireSectionSidebar();
  document.querySelectorAll("[data-permission-section]").forEach(b=>b.onclick=async()=>{
    permissionsSection=b.dataset.permissionSection;
    await loadPermissions();
    renderPermissionsApp();
  });
  const userSelect=document.getElementById("permissionsUser");
  if(userSelect)userSelect.onchange=e=>{permissionsSelectedUser=e.target.value;renderPermissionsApp()};
  const editNameBtn=document.getElementById("editAccountNameBtn");
  if(editNameBtn&&selected)editNameBtn.onclick=()=>openAdminAccountName(selected);
  document.querySelectorAll("[data-permission-toggle]").forEach(input=>input.onchange=async e=>{
    const target=e.target;
    if(!selected?.canonical_key){target.checked=!target.checked;return}
    target.disabled=true;let saved=false;
    try{
      await rpc("permissions_admin_set_by_account",{
        p_target_key:selected.canonical_key,
        p_permission_code:target.dataset.permissionToggle,
        p_enabled:target.checked
      });
      saved=true;await loadPermissions();
      renderPermissionsApp();
    }catch{
      if(!saved)target.checked=!target.checked;
      target.disabled=false;
      showNotice(saved?"حُفظ التعديل، لكن تعذر تحديث القائمة. أعد فتح قسم الصلاحيات للتحقق.":"تعذر تأكيد حفظ الصلاحية. أعد فتح القسم للتحقق من القيمة الحالية.");
    }
  });
}
function openAdminAccountName(user){
  const w=modal("تعديل اسم المستخدم",`
    <label>الاسم</label>
    <input class="field" id="adminAccountName" value="${esc(user.display_name||"")}">
    <div class="profile-note">يتغير الاسم في النظام الجديد فقط، ولا يغير اسم المستخدم للدخول.</div>`,
    '<button class="btn btn-green" id="saveAdminAccountName">حفظ</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveAdminAccountName").onclick=async()=>{
    const name=w.querySelector("#adminAccountName").value.trim();
    if(name.length<2)return;
    const btn=w.querySelector("#saveAdminAccountName");btn.disabled=true;
    try{
      await rpc("admin_set_account_name",{p_target_key:user.canonical_key,p_name:name});
      w.remove();
      await loadPermissions();
      if(currentSection==="permissions")renderPermissionsApp();
    }catch{btn.disabled=false}
  };
}
function renderPermissionGrid(user){
  const groups=[
    ["العرض والعمل",["transactions.view_all","transactions.act_all","transactions.create","transactions.ceo_view"]],
    ["الإحالات والإسناد",[...ROUTE_PERMISSION_CODES,"transactions.add_supporting","transactions.decide_assistant_transfer"]],
    ["إدارة المعاملة",["transactions.edit_subject","transactions.change_responsible_unit","transactions.change_priority","transactions.change_responsible","transactions.set_due_date","transactions.close","transactions.reopen","transactions.delete_hard"]],
    ["بيانات الحساب",["profiles.edit_email","profiles.admin_edit_name","profiles.admin_reset_password"]],
    ["صلاحيات أخرى",[]]
  ];
  const buckets=groups.map(()=>[]);
  for(const permission of user.permissions||[]){
    const index=groups.findIndex(([,codes])=>codes.includes(permission.code));
    buckets[index<0?groups.length-1:index].push(permission);
  }
  return groups.map(([title],i)=>buckets[i].length?'<section class="permission-group"><h2>'+esc(title)+'</h2><div class="permission-group-grid">'+buckets[i].map(p=>{
    const disabled=!p.editable;
    return `<label class="permission-item ${disabled?"fixed":""}">
      <span class="permission-name">${esc(p.name_ar)}</span>
      <span class="permission-switch"><input type="checkbox" role="switch" data-permission-toggle="${esc(p.code)}" ${p.effective_enabled?"checked":""} ${disabled?"disabled":""}><span class="switch-track" aria-hidden="true"></span></span>
    </label>`;
  }).join("")+'</div></section>':"").join("");
}
function activeFilterCount(){
  return [priorityFilter,statusFilter,departmentFilter,employeeFilter,originFilter,lateOnly,dateFrom,dateTo].filter(Boolean).length;
}
function updateFilterCount(){
  const count=document.getElementById("activeFilterCount");
  if(count){count.textContent=String(activeFilterCount());count.hidden=activeFilterCount()===0}
}
function renderApp(){
  if(currentSection==="permissions"){renderPermissionsApp();return}
  if(currentSection==="profile"){renderProfileApp();return}
  const tabs=tabsFor(session.role);
  const unread=Number(listData?.counters?.notifications||0);
  root.innerHTML=`
  <div class="workspace">
    ${sectionSidebar("transactions")}
    <main class="workspace-main">
      <header class="top-header">
        <div class="header-row">
          <h1>المعاملات</h1>
          <div class="user-box">
            <span class="user-name">${esc(session.display_name)}</span>
            <button class="btn btn-white notification-bell" id="notifBtn" aria-label="${unread?"لديك "+unread+" تنبيهات غير مقروءة":"لا توجد تنبيهات غير مقروءة"}">${uiIcon("bell")}${unread?'<span class="notification-dot" aria-hidden="true"></span>':""}</button>
            <button class="btn btn-white" id="logoutBtn">تسجيل الخروج</button>
          </div>
        </div>
      </header>

      <nav class="nav-tabs" aria-label="عرض المعاملات">
        ${tabs.map(([k,n])=>`<button class="nav-tab ${currentTab===k?"active":""}" data-tab="${k}" aria-pressed="${currentTab===k}">${n}</button>`).join("")}
      </nav>

      <div class="trx-stats">
        <span>وارد جديد <b id="statIncoming">${Number(listData.counters?.incoming||0)}</b></span>
        <span>متأخر <b id="statLate">${Number(listData.counters?.late||0)}</b></span>
        <span>طلبات معلقة <b id="statPending">${Number(listData.counters?.pending_approval||0)}</b></span>
        <span>مغلق اليوم <b id="statClosedToday">${Number(listData.counters?.closed_today||0)}</b></span>
      </div>
      <div class="list-toolbar">
        <div class="search-wrap">${uiIcon("search")}<input class="field search" id="search" type="search" aria-label="البحث في المعاملات" placeholder="ابحث بالرقم أو العنوان أو المسؤول" value="${esc(searchText)}"></div>
        <div class="list-actions">
          ${hasTxPerm("transactions.create")?'<button class="btn btn-green" id="createBtn">'+uiIcon("plus")+'إنشاء معاملة</button>':""}
          <button class="btn btn-soft" id="excelListBtn">Excel القائمة</button>
          <button class="btn btn-soft" id="pdfListBtn">PDF القائمة</button>
        </div>
      </div>
      <details class="filter-disclosure" id="filtersPanel" ${window.matchMedia("(min-width:701px)").matches||activeFilterCount()?"open":""}>
        <summary>${uiIcon("filter")}البحث المتقدم والفلاتر <span class="filter-count" id="activeFilterCount" ${activeFilterCount()?"":"hidden"}>${activeFilterCount()}</span><span class="filter-chevron">${uiIcon("chevron")}</span></summary>
        <div class="toolbar">
          <label class="filter-field" for="statusFilter">الحالة<select class="field" id="statusFilter">
            <option value="">كل الحالات</option>
            <option value="open" ${statusFilter==="open"?"selected":""}>مفتوحة</option>
            <option value="closed" ${statusFilter==="closed"?"selected":""}>مغلقة</option>
          </select></label>
          <label class="filter-field" for="priorityFilter">الأولوية<select class="field" id="priorityFilter">
            <option value="">كل الأولويات</option>
            <option value="عاجل جدًا" ${priorityFilter==="عاجل جدًا"?"selected":""}>عاجل جدًا</option>
            <option value="عاجل" ${priorityFilter==="عاجل"?"selected":""}>عاجل</option>
            <option value="عادي" ${priorityFilter==="عادي"?"selected":""}>عادي</option>
          </select></label>
          <label class="filter-field" for="departmentFilter">الإدارة<select class="field" id="departmentFilter">
            <option value="">كل الإدارات</option>
            ${(directoryData.units||[]).filter(u=>["department","independent","branch"].includes(u.unit_type)).map(u=>'<option value="'+esc(u.name)+'" '+(departmentFilter===u.name?"selected":"")+'>'+esc(u.name)+'</option>').join("")}
          </select></label>
          <label class="filter-field" for="employeeFilter">الموظف<select class="field" id="employeeFilter">
            <option value="">كل الموظفين</option>
            ${(directoryData.users||[]).map(u=>'<option value="'+esc(u.login_name)+'" '+(employeeFilter===u.login_name?"selected":"")+'>'+esc(u.display_name)+'</option>').join("")}
          </select></label>
          <label class="filter-field" for="originFilter">مصدر المعاملة<select class="field" id="originFilter">
            <option value="">قديم وجديد</option>
            <option value="legacy" ${originFilter==="legacy"?"selected":""}>قديم</option>
            <option value="new" ${originFilter==="new"?"selected":""}>جديد</option>
          </select></label>
          <label class="filter-field" for="dateFrom">من تاريخ<input class="field date-filter" id="dateFrom" type="date" value="${esc(dateFrom)}"></label>
          <label class="filter-field" for="dateTo">إلى تاريخ<input class="field date-filter" id="dateTo" type="date" value="${esc(dateTo)}"></label>
          <div class="filter-options"><label class="check-filter"><input type="checkbox" id="lateOnly" ${lateOnly?"checked":""}>المتأخرة فقط</label>
          <button class="btn btn-soft filter-reset" id="resetFilters" type="button">مسح الفلاتر</button></div>
        </div>
      </details>

      <section class="card">
        <div class="card-head">
          <span class="card-title" id="cardTitle">${esc(tabs.find(x=>x[0]===currentTab)?.[1]||"المعاملات")}</span>
          <span class="count" id="rowTotal">${Number(listData.total||0)}</span>
        </div>
        <div id="tableHost"></div>
        <div id="pagerHost"></div>
      </section>
    </main>
  </div>`;
  document.getElementById("logoutBtn").onclick=logout;
  document.getElementById("notifBtn").onclick=()=>openNotifications().catch(()=>showNotice("تعذر تحميل التنبيهات. حاول مرة أخرى."));
  wireSectionSidebar();
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
  document.getElementById("resetFilters").onclick=async e=>{
    const invoker=e.currentTarget,panel=document.getElementById("filtersPanel");
    priorityFilter="";statusFilter="";departmentFilter="";employeeFilter="";originFilter="";lateOnly=false;dateFrom="";dateTo="";page=1;
    for(const id of ["statusFilter","priorityFilter","departmentFilter","employeeFilter","originFilter","dateFrom","dateTo"]){
      const control=document.getElementById(id);if(control)control.value="";
    }
    document.getElementById("lateOnly").checked=false;updateFilterCount();
    await refresh();
    if(currentSection==="transactions"&&panel?.isConnected){
      const target=invoker.isConnected&&invoker.checkVisibility()?invoker:panel.querySelector("summary");
      target?.focus({preventScroll:true});
    }
  };
  if(document.getElementById("createBtn"))document.getElementById("createBtn").onclick=openCreate;
  document.getElementById("excelListBtn").onclick=exportListExcel;
  document.getElementById("pdfListBtn").onclick=printList;
  renderTable();
  renderPager();
}
function renderListOnly(){
  const tabs=tabsFor(session.role);
  document.querySelectorAll("[data-tab]").forEach(b=>{b.classList.toggle("active",b.dataset.tab===currentTab);b.setAttribute("aria-pressed",String(b.dataset.tab===currentTab))});
  updateFilterCount();
  const cardTitle=document.getElementById("cardTitle");
  if(cardTitle)cardTitle.textContent=tabs.find(x=>x[0]===currentTab)?.[1]||"المعاملات";
  const rowTotal=document.getElementById("rowTotal");
  if(rowTotal)rowTotal.textContent=String(Number(listData.total||0));
  const notifBtn=document.getElementById("notifBtn");
  if(notifBtn){
    const unread=Number(listData?.counters?.notifications||0);
    notifBtn.innerHTML=uiIcon("bell")+(unread?'<span class="notification-dot" aria-hidden="true"></span>':"");
    notifBtn.setAttribute("aria-label",unread?"لديك "+unread+" تنبيهات غير مقروءة":"لا توجد تنبيهات غير مقروءة");
  }
  const stats={
    statIncoming:listData.counters?.incoming,
    statLate:listData.counters?.late,
    statPending:listData.counters?.pending_approval,
    statClosedToday:listData.counters?.closed_today
  };
  for(const [id,value] of Object.entries(stats)){
    const el=document.getElementById(id);
    if(el)el.textContent=String(Number(value||0));
  }
  renderTable();
  renderPager();
}
async function refresh(){
  const host=document.getElementById("tableHost");host?.setAttribute("aria-busy","true");
  try{await loadList();if(currentSection==="transactions"&&host?.isConnected)renderListOnly()}
  catch{
    showNotice("تعذر تحديث النتائج. النتائج السابقة محفوظة؛ أعد المحاولة.");
    if(!document.getElementById("retryList")&&host){
      const retry=document.createElement("button");retry.className="btn btn-soft";retry.id="retryList";retry.textContent="إعادة المحاولة";retry.onclick=refresh;host.prepend(retry);
    }
  }finally{host?.setAttribute("aria-busy","false")}
}
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
  if(!rows.length){host.innerHTML=emptyState("لا توجد معاملات",searchText||activeFilterCount()?"جرّب تعديل البحث أو مسح الفلاتر.":"ستظهر هنا المعاملات المتاحة ضمن صلاحياتك.");return}
  host.innerHTML=`
  <p class="table-hint">يمكن تمرير الجدول أفقيًا للاطلاع على جميع الحقول.</p>
  <div class="table-wrap" role="region" aria-label="جدول المعاملات، جميع الحقول" tabindex="0"><table>
    <caption class="sr-only">المعاملات المتاحة ضمن العرض الحالي</caption>
    <thead><tr>
      <th scope="col">رقم المعاملة</th><th scope="col">عنوان المعاملة</th><th scope="col">الإدارة المسؤولة</th><th scope="col">الإدارات المساندة</th>
      <th scope="col">مسؤول المعاملة</th><th scope="col">المحال إليه حاليًا</th><th scope="col">الأولوية</th><th scope="col">الحالة</th>
      <th scope="col">عدد أيام المعاملة</th><th scope="col">آخر تحديث</th><th scope="col">الإجراءات</th>
    </tr></thead>
    <tbody>
      ${rows.map(r=>{
        const [st,sc]=statusBadge(r);
        return `<tr>
          <td class="tx-number" data-label="رقم المعاملة"><span class="number-value">${esc(r.number)}</span></td>
          <td class="tx-title" data-label="عنوان المعاملة">${esc(r.title)}</td>
          <td data-label="الإدارة المسؤولة">${esc(r.responsible_unit_name||"—")}</td>
          <td data-label="الإدارات المساندة">${Number(r.supporting_count||0)}</td>
          <td data-label="مسؤول المعاملة">${esc(r.responsible_name||"—")}</td>
          <td data-label="المحال إليه حاليًا">${esc((r.current_assignees||[]).join("، ")|| (r.current_level==="ceo"?"الرئيس التنفيذي":"—"))}</td>
          <td data-label="الأولوية"><span class="badge ${priorityClass(r.priority)}">${esc(r.priority)}</span></td>
          <td data-label="الحالة"><span class="badge ${sc}">${st}</span></td>
          <td class="tx-days" data-label="عدد أيام المعاملة">${esc(r.days??"—")}</td>
          <td class="tx-date" data-label="آخر تحديث">${esc(fmtDate(r.last_activity_at))}</td>
          <td data-label="الإجراءات"><div class="actions">
            <button class="row-btn btn-blue" data-act="open" data-id="${r.id}">فتح</button>
          </div></td>
        </tr>`
      }).join("")}
    </tbody>
  </table></div>`;
}
function handleTableActionClick(e,invoker=document.activeElement){
  const btn=e.target.closest?.("[data-act]");
  if(!btn||!root.contains(btn))return;
  e.preventDefault();
  const a=btn.dataset.act,id=btn.dataset.id;
  if(a==="open")return openDetails(id,invoker);
  if(a==="action")return openAction(id);
  if(a==="route")return openReferral(id);
  if(a==="close")return openReason(btn.dataset.direct==="1"?"close":"request_close",id,btn.dataset.direct==="1"?"إغلاق":"طلب إغلاق");
  if(a==="reopen"){
    const row=(listData.rows||[]).find(x=>x.id===id);
    const actionName=btn.dataset.direct==="1"?"reopen":"request_reopen";
    const title=btn.dataset.direct==="1"?"استرجاع المعاملة":"طلب استرجاع";
    if(row?.origin==="legacy"&&(!row.responsible_unit_id||!row.responsible_login_name))return openLegacyReopen(actionName,id,title);
    return openReason(actionName,id,title);
  }
  if(a==="accept-transfer")return decideTransfer(btn.dataset.route,true);
  if(a==="reject-transfer")return decideTransfer(btn.dataset.route,false);
}
function renderPager(){
  const h=document.getElementById("pagerHost"),total=Number(listData.total||0),size=Number(listData.page_size||50);
  const pages=Math.max(1,Math.ceil(total/size));
  if(pages<=1){h.innerHTML="";return}
  h.innerHTML=`<div class="pager"><button class="btn btn-soft" id="prevPage" ${page<=1?"disabled":""}>السابق</button><span>${page} / ${pages}</span><button class="btn btn-soft" id="nextPage" ${page>=pages?"disabled":""}>التالي</button></div>`;
  document.getElementById("prevPage").onclick=async()=>{if(page>1){page--;await refresh()}};
  document.getElementById("nextPage").onclick=async()=>{if(page<pages){page++;await refresh()}};
}
const modalStack=[];
let modalSerial=0;
let modalBackground=[];
function modalFocusable(w){
  return [...w.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]'));
}
function focusModal(w){
  const field=w.querySelector('.modal-body input:not(:disabled),.modal-body select:not(:disabled),.modal-body textarea:not(:disabled)');
  const target=field?.getClientRects().length?field:w.querySelector('.modal');
  target.focus({preventScroll:true});
}
function syncModalStack(){
  modalStack.forEach((w,i)=>{
    const inactive=i!==modalStack.length-1;
    w.inert=inactive;
    if(inactive)w.setAttribute('aria-hidden','true');else w.removeAttribute('aria-hidden');
  });
}
document.addEventListener('keydown',e=>{
  const w=modalStack.at(-1);if(!w)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();w.remove();return}
  if(e.key!=='Tab')return;
  const fields=modalFocusable(w),first=fields[0],last=fields.at(-1);
  if(!first){e.preventDefault();focusModal(w);return}
  const active=document.activeElement;
  if(!w.contains(active)||active===w.querySelector('.modal')){e.preventDefault();(e.shiftKey?last:first).focus();return}
  if(e.shiftKey&&active===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&active===last){e.preventDefault();first.focus()}
});
document.addEventListener('focusin',e=>{
  const w=modalStack.at(-1);
  if(w&&!w.contains(e.target))focusModal(w);
});
function modal(title,body,footer="",invoker=document.activeElement){
  const id='modal-title-'+(++modalSerial);
  const w=document.createElement("div");w.className="overlay";
  w.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1"><div class="modal-head"><h2 id="${id}">${esc(title)}</h2><button class="modal-close" type="button" aria-label="إغلاق النافذة" data-close>${uiIcon("close")}</button></div><div class="modal-body">${body}</div>${footer?'<div class="modal-foot">'+footer+'</div>':""}</section>`;
  if(!modalStack.length){
    modalBackground=[...document.body.children].map(el=>[el,el.inert]);
    modalBackground.forEach(([el])=>{el.inert=true});document.body.classList.add('modal-open');
  }
  document.body.appendChild(w);modalStack.push(w);syncModalStack();
  const nativeRemove=w.remove.bind(w);
  const wrapped=new WeakMap();
  const wireButtons=()=>{
    associateFormLabels(w);
    w.querySelectorAll('button').forEach(button=>{
      const handler=button.onclick;
      if(!handler||wrapped.get(button)===handler)return;
      const safeHandler=function(e){
        const wasDisabled=button.disabled;
        let result;
        try{result=handler.call(this,e)}catch{showRequestError(w);return}
        if(result&&typeof result.then==='function'){
          button.disabled=true;
          return result.catch(()=>showRequestError(w)).finally(()=>{if(button.isConnected)button.disabled=wasDisabled});
        }
        return result;
      };
      wrapped.set(button,safeHandler);button.onclick=safeHandler;
    });
  };
  const observer=new MutationObserver(wireButtons);
  observer.observe(w,{childList:true,subtree:true});
  w.remove=()=>{
    if(!w.isConnected)return;
    observer.disconnect();const top=modalStack.at(-1)===w;
    const i=modalStack.indexOf(w);if(i>=0)modalStack.splice(i,1);
    nativeRemove();syncModalStack();
    if(!modalStack.length){
      modalBackground.forEach(([el,old])=>{if(el.isConnected)el.inert=old});modalBackground=[];document.body.classList.remove('modal-open');
    }
    if(top){
      if(invoker?.isConnected&&!invoker.closest('[inert]')&&!invoker.disabled&&invoker.getClientRects().length)invoker.focus({preventScroll:true});
      else if(modalStack.length)focusModal(modalStack.at(-1));
      else document.getElementById('search')?.focus({preventScroll:true});
    }
  };
  w.querySelector("[data-close]").onclick=()=>w.remove();
  w.addEventListener("click",e=>{if(e.target===w&&modalStack.at(-1)===w)w.remove()});
  queueMicrotask(()=>{if(w.isConnected){wireButtons();focusModal(w)}});
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
    const modes=['<option value="none">حفظ بدون إحالة</option>'];
    if(hasTxPerm("transactions.assign_department"))modes.push('<option value="assign">إسناد لموظف أو أكثر</option>');
    if(hasTxPerm("transactions.raise_assistant"))modes.push('<option value="raise">رفع للمساعد</option>');
    rolePart=`
      <div class="wide"><label>المسار بعد الحفظ</label><select class="field" id="createMode">${modes.join("")}</select></div>
      <div class="wide" id="createRouteFields"></div>`;
  }else if(isExec()&&hasTxPerm("transactions.raise_assistant")){
    rolePart=`
      <div class="wide"><label>الإحالة بعد الحفظ</label><select class="field" name="assistant">
        <option value="">حفظ بدون إحالة</option>
        ${userOptions(u=>u.role==="assistant")}
      </select></div>
      <div class="wide"><label>التوجيه</label><textarea class="field" name="directive"></textarea></div>`;
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
      :mode.value==="raise"?`
        <label>سبب الرفع</label><textarea class="field" name="raise_reason"></textarea>
        <label>المطلوب</label><textarea class="field" name="proposed_decision"></textarea>`
      :"";
    };
    mode.onchange=draw;draw();
  }
  w.querySelector("#saveCreate").onclick=async()=>{
    const form=w.querySelector("#createForm");
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    const title=String(fd.get("title")||"").trim();if(!title)return;
    const btn=w.querySelector("#saveCreate");btn.disabled=true;
    try{
      const created=await post(CONFIG.txFn,baseBody("create",{
        title,subject:fd.get("subject"),priority:fd.get("priority"),attachment_url:fd.get("attachment_url")
      }));
      if(session.role==="manager"){
        const mode=w.querySelector("#createMode")?.value||"none";
        if(mode==="assign"){
          const targets=[...w.querySelector('[name="targets"]').selectedOptions].map(o=>o.value);
          await post(CONFIG.txFn,baseBody("route_manager_employees",{
            transaction_id:created.row.id,unit_id:fd.get("unit_id"),targets,directive:fd.get("directive")
          }));
        }else if(mode==="raise"){
          await post(CONFIG.txFn,baseBody("route_manager_assistant",{
            transaction_id:created.row.id,raise_reason:fd.get("raise_reason"),proposed_decision:fd.get("proposed_decision")
          }));
        }
      }else if(isExec()&&fd.get("assistant")){
        await post(CONFIG.txFn,baseBody("route_exec_assistant",{
          transaction_id:created.row.id,to_login:fd.get("assistant"),directive:fd.get("directive")
        }));
      }
      w.remove();await refresh();
    }catch(e){btn.disabled=false;showRequestError(w)}
  };
}
async function openReferral(id){
  const choices=[];
  if(hasTxPerm("transactions.raise_manager"))choices.push(["raise-manager","رفع للمدير"]);
  if(hasTxPerm("transactions.assign_department"))choices.push(["assign-department","إسناد داخل الإدارة"]);
  if(hasTxPerm("transactions.assign_sector"))choices.push(["assign-sector","إحالة داخل القطاع"]);
  if(hasTxPerm("transactions.assign_cross_sector"))choices.push(["assign-cross-sector","إسناد إلى قطاع آخر"]);
  if(hasTxPerm("transactions.raise_assistant"))choices.push(["raise-assistant","إحالة / رفع للمساعد"]);
  if(hasTxPerm("transactions.transfer_assistant"))choices.push(["transfer-assistant","تحويل لمساعد آخر"]);
  if(!choices.length)return;
  const w=modal("إحالة",`<div class="choice-grid">${choices.map(([k,n])=>'<button class="choice-btn" data-choice="'+k+'">'+n+'</button>').join("")}</div>`,
    '<button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>{
    const c=b.dataset.choice;w.remove();
    if(c==="raise-manager")childEmployeeRaise(id);
    if(c==="assign-department")childManagerAssign(id);
    if(c==="assign-sector")childAssistantScope(id);
    if(c==="assign-cross-sector")childExecDirect(id);
    if(c==="raise-assistant")(isExec()?childExecAssistant(id):childManagerRaise(id));
    if(c==="transfer-assistant")childAssistantTransfer(id);
  });
}
function backFooter(parentFn){return '<button class="btn btn-soft" data-back>رجوع</button>'}
function wireBack(w,id){w.querySelector("[data-back]").onclick=()=>{w.remove();openReferral(id)}}
function childEmployeeRaise(id){
  const w=modal("رفع للمدير",'<label>سبب الرفع</label><textarea class="field" id="raiseReason"></textarea><label>المطلوب</label><textarea class="field" id="proposed"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
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
  const w=modal("رفع للمساعد",'<label>سبب الرفع</label><textarea class="field" id="reason"></textarea><label>المطلوب</label><textarea class="field" id="proposed"></textarea>',
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  w.querySelector("#save").onclick=async()=>{await post(CONFIG.txFn,baseBody("route_manager_assistant",{transaction_id:id,raise_reason:w.querySelector("#reason").value,proposed_decision:w.querySelector("#proposed").value}));w.remove();await refresh()};
}
function employeesForUnit(unitId){
  const u=(directoryData.units||[]).find(x=>x.id===unitId);if(!u)return [];
  return (directoryData.users||[]).filter(x=>["employee","manager"].includes(x.role)&&x.dept_names.includes(u.name));
}
function supportBlock(blockId){
  const units=sectorUnits();
  return `<div class="support-block" data-support="${blockId}">
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
    ${hasTxPerm("transactions.add_supporting")?'<button class="btn btn-soft" id="addSupport" type="button">إضافة إدارة مساندة</button>':""}`,
    '<button class="btn btn-green" id="save">حفظ</button>'+backFooter());
  wireBack(w,id);
  const ru=w.querySelector("#responsibleUnit"),rt=w.querySelector("#responsibleTargets");
  const fill=()=>{rt.innerHTML=employeesForUnit(ru.value).map(u=>'<option value="'+esc(u.login_name)+'">'+esc(u.display_name)+'</option>').join("")};ru.onchange=fill;fill();
  const addSupport=w.querySelector("#addSupport");
  if(addSupport)addSupport.onclick=()=>{
    const blockId="support-"+(crypto.randomUUID?.()||Date.now()+"-"+Math.random().toString(36).slice(2,8));
    const host=w.querySelector("#supports");host.insertAdjacentHTML("beforeend",supportBlock(blockId));
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
  const w=modal("رفع للرئيس التنفيذي",'<label>سبب الرفع</label><textarea class="field" id="reason"></textarea><label>المطلوب</label><textarea class="field" id="proposed"></textarea>',
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
  w.querySelector("#save").onclick=async()=>{const reason=w.querySelector("#reason").value.trim();if(!reason)return;await post(CONFIG.txFn,baseBody(action,{transaction_id:id,reason}));w.remove();await refresh();if(action==="request_close")showNotice("تم رفع طلب الإغلاق للمستوى المختص.",true)};
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
function detailField(label,value,editable=false,id=""){
  const tag=editable?"button":"div";
  return '<'+tag+' class="detail '+(editable?"clickable":"")+'"'+(editable?' type="button" id="'+esc(id)+'"':"")+'><span class="detail-k">'+esc(label)+'</span><span class="detail-v">'+value+'</span>'+(editable?uiIcon("edit"):"")+'</'+tag+'>';
}
let workspaceSerial=0;
function workspaceSections(sections){
  const prefix='tx-'+(++workspaceSerial)+'-';
  const tabs=sections.map(([key,title,body,count],i)=>'<button class="workspace-tab" type="button" role="tab" id="'+prefix+'tab-'+key+'" aria-controls="'+prefix+'panel-'+key+'" aria-selected="'+(i===0)+'" tabindex="'+(i===0?"0":"-1")+'" data-workspace-tab="'+key+'">'+esc(title)+(count===undefined?"":'<span class="tab-count">'+count+'</span>')+'</button>').join("");
  const panels=sections.map(([key,title,body],i)=>'<section class="workspace-panel" role="tabpanel" id="'+prefix+'panel-'+key+'" aria-labelledby="'+prefix+'tab-'+key+'" tabindex="0" '+(i===0?"":"hidden")+'>'+body+'</section>').join("");
  return '<div class="workspace-tabs" role="tablist" aria-label="تفاصيل المعاملة">'+tabs+'</div>'+panels;
}
function wireWorkspaceTabs(w){
  const tabs=[...w.querySelectorAll('[data-workspace-tab]')];
  const select=tab=>{
    tabs.forEach(t=>{
      const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;
      w.querySelector('#'+t.getAttribute('aria-controls')).hidden=!active;
    });
  };
  tabs.forEach((tab,i)=>{
    tab.onclick=()=>select(tab);
    tab.onkeydown=e=>{
      let next;
      if(e.key==='ArrowLeft')next=(i+1)%tabs.length;
      else if(e.key==='ArrowRight')next=(i-1+tabs.length)%tabs.length;
      else if(e.key==='Home')next=0;
      else if(e.key==='End')next=tabs.length-1;
      else return;
      e.preventDefault();select(tabs[next]);tabs[next].focus();
    };
  });
}
async function openDetails(id,invoker=document.activeElement){
  const d=await post(CONFIG.txFn,baseBody("details",{transaction_id:id})),t=d.transaction;
  const assignments=(d.assignments||[]).map(a=>{
    const names=(a.transaction_assignment_targets||[]).map(x=>x.display_name).join("، ");
    return '<div class="action-item"><div class="action-top"><span>'+esc(a.assignment_type==="supporting"?"إدارة مساندة":a.assignment_type==="direct"?"إسناد مباشر":"الإدارة المسؤولة")+'</span><span>'+esc(fmtDate(a.created_at))+'</span></div><div class="action-text">'+esc(a.directive||"")+(names?'<br>'+esc(names):"")+'</div></div>';
  }).join("")||'<div class="muted">—</div>';

  const versionsByAction=new Map();
  for(const v of d.action_versions||[]){if(!versionsByAction.has(v.action_id))versionsByAction.set(v.action_id,[]);versionsByAction.get(v.action_id).push(v)}
  const notesByAction=new Map();
  for(const n of d.action_notes||[]){if(!notesByAction.has(n.action_id))notesByAction.set(n.action_id,[]);notesByAction.get(n.action_id).push(n)}
  const canTryNote=hasTxPerm("transactions.act_all")||["manager","assistant","ceo","ceo_office_manager","ceo_secretary"].includes(session.role);

  const actions=(d.actions||[]).map(a=>{
    const vs=versionsByAction.get(a.id)||[];
    const ns=notesByAction.get(a.id)||[];
    const history=vs.length>1?'<div class="version-list">'+vs.map(v=>'<div>نسخة '+esc(v.version_no)+': '+esc(v.body)+'</div>').join("")+'</div>':"";
    const notes=ns.length?'<div class="action-notes">'+ns.map(n=>'<div class="action-note"><b>'+esc(n.actor_name||"—")+' · '+esc(fmtDate(n.created_at))+'</b>'+esc(n.note||"")+'</div>').join("")+'</div>':"";
    const revise=[session.display_name,session.login_name,session.username].includes(a.actor_name)
      ?'<button class="row-btn btn-soft" data-action-revise="'+a.id+'">تعديل الإجراء</button>':"";
    const noteBtn=canTryNote?'<button class="row-btn btn-soft" data-action-note="'+a.id+'">ملاحظة</button>':"";
    return '<div class="action-item"><div class="action-top"><span>'+esc(a.actor_name||"—")+'</span><span>'+esc(fmtDate(a.created_at))+'</span></div><div class="action-text">'+esc(a.action_text||"")+'</div><div class="badge pri-n">مسجل</div><div class="action-controls">'+revise+noteBtn+'</div>'+notes+history+'</div>';
  }).join("")||'<div class="muted">—</div>';

  const periods=(d.periods||[]).map(p=>{const days=periodDays(p);return '<div class="action-item"><div class="action-top"><span>الدورة '+esc(p.cycle_no)+'</span><span>'+esc(p.ended_at?days+" يوم":"مستمرة · "+days+" يوم")+'</span></div><div class="action-text">من '+esc(fmtDate(p.started_at))+(p.ended_at?" إلى "+esc(fmtDate(p.ended_at)):" وحتى الآن")+'</div></div>'}).join("");
  const routes=(d.routes||[]).map(r=>'<div class="action-item"><div class="action-top"><span>'+esc(r.from_name||"—")+' → '+esc(r.to_name||"—")+'</span><span>'+esc(fmtDate(r.created_at))+'</span></div><div class="action-text">'+esc(r.directive||r.raise_reason||r.transfer_reason||"")+(r.proposed_decision?'<br>المطلوب: '+esc(r.proposed_decision):"")+(r.rejection_reason?'<br>سبب الرفض: '+esc(r.rejection_reason):"")+'</div></div>').join("")||'<div class="muted">—</div>';

  const canDecideRequest=r=>{
    const requesterRole=String(r?.meta?.requester_role||""),targetRole=String(r?.meta?.target_role||"");
    if(targetRole==="ceo")return isExec()&&hasTxPerm("transactions.act_all");
    if(targetRole==="assistant")return session.role==="assistant"&&!!d.flags?.scope;
    if(targetRole==="manager")return session.role==="manager"&&!!d.flags?.scope;
    if(hasTxPerm("transactions.act_all"))return true;
    if(session.role==="assistant")return !!d.flags?.scope&&["employee","manager"].includes(requesterRole);
    if(session.role==="manager")return !!d.flags?.scope&&requesterRole==="employee";
    return false;
  };
  const requests=(d.requests||[]).map(r=>{
    const target=requestTargetLabel(r?.meta?.target_role);
    return '<div class="action-item"><div class="action-top"><span>'+esc(requestTypeLabel(r.request_type))+'</span><span>'+esc(fmtDateTime(r.created_at))+'</span></div><div class="action-text">مقدم الطلب: '+esc(r.requested_by_name||"—")+(target?'<br>موجّه إلى: '+esc(target):"")+'<br>السبب: '+esc(r.reason||"—")+'</div>'+(r.status==="pending"&&canDecideRequest(r)?'<div class="request-actions"><button class="row-btn btn-green" data-request-approve="'+r.id+'">اعتماد</button><button class="row-btn btn-red" data-request-reject="'+r.id+'">رفض</button></div>':'<div class="badge '+(r.status==="approved"?"st-open":r.status==="rejected"?"pri-vh":"pri-n")+'">'+esc(requestStatusLabel(r.status))+'</div>')+'</div>';
  }).join("")||'<div class="muted">لا توجد طلبات معلقة أو سابقة لهذه المعاملة.</div>';
  const hist=(d.history||[]).map(h=>'<div class="action-item"><div class="action-top"><span>سجل المعاملة</span><span>'+esc(fmtDateTime(h.created_at))+'</span></div><div class="action-text">'+esc(historyText(h))+'</div></div>').join("")||'<div class="muted">—</div>';
  const pendingTransfer=(d.routes||[]).find(r=>r.route_type==="assistant_transfer"&&r.status==="pending"&&r.to_login_name===session.login_name);
  const directClose=!!d.can_close&&hasTxPerm("transactions.close");
  const directReopen=!!d.can_close&&hasTxPerm("transactions.reopen");

  const toolbar=`
    <div class="detail-toolbar">
      <span class="workspace-number">المعاملة <bdi dir="ltr">${esc(t.number)}</bdi></span>
      <button class="tool-icon" id="waBtn" title="نسخ واتساب" aria-label="نسخ واتساب">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 18.2 4 20l.8-3.2A8 8 0 1 1 6.5 18.2Z"/><path d="M8.6 8.2c.3 2.8 2.4 5 5.2 5.3"/><path d="M8.8 8.1 10 7.5l1.1 1.8-.8 1.1"/><path d="m13.6 12.8 1.1-.8 1.8 1-.5 1.3"/></svg><span>واتساب</span>
      </button>
      <button class="tool-icon" id="excelBtn" title="Excel" aria-label="Excel">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 8h16M9 8v12M14.5 8v12M4 13h16"/></svg><span>Excel</span>
      </button>
      <button class="tool-icon" id="pdfBtn" title="PDF" aria-label="PDF">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V20H7Z"/><path d="M14 3.5V8h4"/><path d="M9.5 14h5M9.5 17h4"/></svg><span>PDF</span>
      </button>
    </div>`;

  const subjectClickable=t.status==="open"&&hasTxPerm("transactions.edit_subject");
  const unitClickable=t.status==="open"&&hasTxPerm("transactions.change_responsible_unit");
  const priorityClickable=t.status==="open"&&hasTxPerm("transactions.change_priority");
  const dueClickable=t.status==="open"&&hasTxPerm("transactions.set_due_date");
  const responsibleClickable=t.status==="open"&&hasTxPerm("transactions.change_responsible");

  const reviewBanner=t.status==="open"&&t.migration_status==="needs_review"
    ?'<div class="review-banner">هذه معاملة قديمة ينقصها سياق المسؤولية. اختر الإدارة والمسؤول لتكمل على المسار الجديد دون اختلاق بيانات.</div>':"";

  const footer=`
    <div class="detail-primary-actions">
      ${pendingTransfer&&hasTxPerm("transactions.decide_assistant_transfer")?'<button class="btn btn-green" id="acceptTransferBtn">قبول التحويل</button><button class="btn btn-red" id="rejectTransferBtn">رفض التحويل</button>':""}
      ${t.status==="open"&&d.can_act?'<button class="btn btn-blue" id="actionBtn">إجراء عمل</button>':""}
      ${t.status==="open"&&d.can_act&&hasAnyRoutePerm()?'<button class="btn btn-soft" id="referralBtn">إحالة</button>':""}
    </div>
    <div class="detail-secondary-actions">
      ${t.status==="open"&&d.can_raise_ceo?'<button class="btn btn-gold" id="raiseCeoBtn">رفع للرئيس</button>':""}
      ${t.status==="open"&&t.due_at?'<button class="btn btn-soft" id="extensionBtn">طلب تمديد</button>':""}
      ${t.status==="open"&&hasTxPerm("transactions.ceo_view")?'<button class="btn btn-soft" id="ceoViewBtn">إطلاع الرئيس</button>':""}
      ${t.status==="closed"?'<button class="btn btn-soft" id="reopenBtn">'+(directReopen?"استرجاع المعاملة":"طلب استرجاع")+'</button>':""}
      ${t.status==="open"&&t.migration_status==="needs_review"&&hasTxPerm("transactions.act_all")&&hasTxPerm("transactions.change_responsible")?'<button class="btn btn-gold" id="resolveLegacyBtn">تهيئة المعاملة القديمة</button>':""}
      ${t.status==="open"?'<button class="btn btn-soft" id="closeBtn">إغلاق المعاملة</button>':""}
    </div>
    <div class="detail-danger-actions">
      ${t.status==="open"?'<button class="btn btn-red" id="cancelBtn">إلغاء المعاملة</button>':""}
      ${t.status==="open"&&hasTxPerm("transactions.delete_hard")&&!t.workflow_started?'<button class="btn btn-red" id="deleteBtn">حذف نهائي</button>':""}
    </div>
  `;

  const overview='<h3 class="section-title">الإسناد والإدارات</h3>'+assignments+(periods?'<h3 class="section-title">المدة ودورات العمل</h3>'+periods:"");
  const sections=workspaceSections([
    ["overview","نظرة عامة",overview],
    ["actions","إجراءات العمل",actions,(d.actions||[]).length],
    ["routes","الإحالات",routes,(d.routes||[]).length],
    ["requests","الطلبات والاعتمادات",requests,(d.requests||[]).length],
    ["history","السجل",hist,(d.history||[]).length]
  ]);
  const w=modal(t.title,toolbar+reviewBanner+`
    <div class="workspace-context">
      <div class="workspace-subject ${subjectClickable?"clickable":""}" id="${subjectClickable?"subjectField":""}"><h3 class="section-title">موضوع المعاملة ${subjectClickable?uiIcon("edit"):""}</h3><div class="action-text">${esc(t.subject||"—")}</div>
        ${safeUrl(t.attachment_url)?'<div class="workspace-attachment"><span>رابط المرفقات</span><br><a href="'+esc(safeUrl(t.attachment_url))+'" target="_blank" rel="noopener noreferrer">'+esc(t.attachment_url)+'</a></div>':""}
      </div>
      <div class="details-grid">
        ${detailField("رقم المعاملة",'<bdi dir="ltr">'+esc(t.number)+'</bdi>')}
        ${detailField("الحالة",'<span class="badge '+(t.status==="open"?"st-open":"st-closed")+'">'+esc(t.status==="closed"?"مغلقة":t.status==="cancelled"?"ملغاة":"مفتوحة")+'</span>')}
        ${detailField("الإدارة المسؤولة",esc(t.responsible_unit_name||t.legacy_department_name||"—"),unitClickable,"responsibleUnitField")}
        ${detailField("مسؤول المعاملة",esc(t.responsible_name||"—"),responsibleClickable,"responsibleField")}
        ${detailField("الأولوية",'<span class="badge '+priorityClass(t.priority)+'">'+esc(t.priority)+'</span>',priorityClickable,"priorityField")}
        ${detailField("تاريخ الإنشاء",esc(fmtDate(t.created_at)))}
        ${detailField("تاريخ الاستحقاق",esc(fmtDate(t.due_at)),dueClickable,"dueField")}
      </div>
    </div>${sections}
  `,footer,invoker);
  w.querySelector('.modal').classList.add('transaction-workspace');
  wireWorkspaceTabs(w);

  w.querySelectorAll("[data-action-revise]").forEach(b=>b.onclick=()=>reviseAction(b.dataset.actionRevise,w,id));
  w.querySelectorAll("[data-action-note]").forEach(b=>b.onclick=()=>addActionNote(b.dataset.actionNote,w,id));
  w.querySelectorAll("[data-request-approve]").forEach(b=>b.onclick=()=>decideRequest(b.dataset.requestApprove,true,w,id));
  w.querySelectorAll("[data-request-reject]").forEach(b=>b.onclick=()=>decideRequest(b.dataset.requestReject,false,w,id));
  if(w.querySelector("#subjectField"))w.querySelector("#subjectField").onclick=()=>openSubject(id,w,t.subject||"");
  if(w.querySelector("#responsibleUnitField"))w.querySelector("#responsibleUnitField").onclick=()=>openResponsibleUnit(id,w,t.responsible_unit_id||"");
  if(w.querySelector("#priorityField"))w.querySelector("#priorityField").onclick=()=>openPriority(id,w,t.priority);
  if(w.querySelector("#dueField"))w.querySelector("#dueField").onclick=()=>openDueDate(id,w,t.due_at);
  if(w.querySelector("#responsibleField"))w.querySelector("#responsibleField").onclick=()=>openResponsible(id,w);
  if(w.querySelector("#actionBtn"))w.querySelector("#actionBtn").onclick=()=>{w.remove();openAction(id)};
  if(w.querySelector("#referralBtn"))w.querySelector("#referralBtn").onclick=()=>{w.remove();openReferral(id)};
  if(w.querySelector("#raiseCeoBtn"))w.querySelector("#raiseCeoBtn").onclick=()=>openRaiseCeo(id,w);
  if(w.querySelector("#extensionBtn"))w.querySelector("#extensionBtn").onclick=()=>openExtension(id,w,t.due_at);
  if(w.querySelector("#ceoViewBtn"))w.querySelector("#ceoViewBtn").onclick=async()=>{await post(CONFIG.txFn,baseBody("mark_ceo_view",{transaction_id:id}));w.remove();await refresh()};
  if(w.querySelector("#cancelBtn"))w.querySelector("#cancelBtn").onclick=()=>{w.remove();openReason("request_cancel",id,"إلغاء المعاملة")};
  if(w.querySelector("#closeBtn"))w.querySelector("#closeBtn").onclick=()=>{w.remove();openReason(directClose?"close":"request_close",id,"إغلاق المعاملة")};
  if(w.querySelector("#reopenBtn"))w.querySelector("#reopenBtn").onclick=()=>{
    w.remove();
    if(t.origin==="legacy"&&(!t.responsible_unit_id||!t.responsible_login_name))return openLegacyReopen(directReopen?"reopen":"request_reopen",id,directReopen?"استرجاع المعاملة":"طلب استرجاع");
    openReason(directReopen?"reopen":"request_reopen",id,directReopen?"استرجاع المعاملة":"طلب استرجاع");
  };
  if(w.querySelector("#resolveLegacyBtn"))w.querySelector("#resolveLegacyBtn").onclick=()=>resolveLegacyReview(id,w,t);
  if(w.querySelector("#deleteBtn"))w.querySelector("#deleteBtn").onclick=async()=>{await post(CONFIG.txFn,baseBody("delete_hard",{transaction_id:id}));w.remove();await refresh()};
  if(w.querySelector("#acceptTransferBtn"))w.querySelector("#acceptTransferBtn").onclick=async()=>{await decideTransfer(pendingTransfer.id,true);w.remove()};
  if(w.querySelector("#rejectTransferBtn"))w.querySelector("#rejectTransferBtn").onclick=()=>{w.remove();decideTransfer(pendingTransfer.id,false)};
  w.querySelector("#waBtn").onclick=()=>copyWhatsApp(d);
  w.querySelector("#excelBtn").onclick=()=>exportTransactionExcel(d);
  w.querySelector("#pdfBtn").onclick=()=>printTransaction(d);
}
function addActionNote(actionId,parent,txId){
  const w=modal("ملاحظة على الإجراء",'<label>الملاحظة</label><textarea class="field" id="actionNoteText"></textarea>',
    '<button class="btn btn-green" id="saveActionNote">حفظ الملاحظة</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveActionNote").onclick=async()=>{
    const note=w.querySelector("#actionNoteText").value.trim();if(!note)return;
    await post(CONFIG.txFn,baseBody("add_action_note",{action_id:actionId,note}));
    w.remove();parent.remove();await refresh();
  };
}
function openRaiseCeo(id,parent){
  const w=modal("رفع للرئيس التنفيذي",'<label>سبب الرفع</label><textarea class="field" id="raiseCeoReason"></textarea><label>المطلوب</label><textarea class="field" id="raiseCeoProposed"></textarea>',
    '<button class="btn btn-green" id="saveRaiseCeo">رفع</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  w.querySelector("#saveRaiseCeo").onclick=async()=>{
    const reason=w.querySelector("#raiseCeoReason").value.trim(),proposed=w.querySelector("#raiseCeoProposed").value.trim();
    if(!reason||!proposed)return;
    await post(CONFIG.txFn,baseBody("route_assistant_ceo",{transaction_id:id,raise_reason:reason,proposed_decision:proposed}));
    w.remove();parent.remove();await refresh();
  };
}
function resolveLegacyReview(id,parent,t){
  const units=(directoryData.units||[]).filter(u=>["department","independent","branch"].includes(u.unit_type));
  const w=modal("تهيئة المعاملة القديمة",`
    <label>عنوان المعاملة</label><input class="field" id="legacyReviewTitle" value="${esc(t.title||"")}">
    <label>موضوع المعاملة</label><textarea class="field" id="legacyReviewSubject">${esc(t.subject||"")}</textarea>
    <label>الإدارة المسؤولة</label><select class="field" id="legacyReviewUnit">${units.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join("")}</select>
    <label>مسؤول المعاملة</label><select class="field" id="legacyReviewUser"></select>`,
    '<button class="btn btn-green" id="saveLegacyReview">اعتماد التهيئة</button><button class="btn btn-soft" data-exit>خروج</button>');
  w.querySelector("[data-exit]").onclick=()=>w.remove();
  const unit=w.querySelector("#legacyReviewUnit"),user=w.querySelector("#legacyReviewUser");
  const fill=()=>{
    const selected=units.find(x=>x.id===unit.value);
    const choices=(directoryData.users||[]).filter(u=>selected&&(u.dept_names||[]).includes(selected.name));
    user.innerHTML=choices.map(u=>'<option value="'+esc(u.login_name)+'">'+esc(u.display_name)+'</option>').join("");
  };
  unit.onchange=fill;fill();
  w.querySelector("#saveLegacyReview").onclick=async()=>{
    const title=w.querySelector("#legacyReviewTitle").value.trim();
    if(!title||!unit.value||!user.value)return;
    await post(CONFIG.txFn,baseBody("resolve_legacy_context",{
      transaction_id:id,title,subject:w.querySelector("#legacyReviewSubject").value,
      responsible_unit_id:unit.value,responsible_login_name:user.value
    }));
    w.remove();parent.remove();await refresh();
  };
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
  const w=modal("التنبيهات",rows.length?rows.map(x=>'<button class="notification-item '+(x.read_at?"read":"")+'" data-notif="'+x.id+'"><span>'+esc(x.title)+'</span><small>'+esc(fmtDate(x.created_at))+'</small><b>'+esc(x.body||"")+'</b></button>').join(""):emptyState("لا توجد تنبيهات","ستظهر التنبيهات الجديدة هنا."));
  w.querySelectorAll("[data-notif]").forEach(b=>b.onclick=async()=>{await post(CONFIG.txFn,baseBody("notification_read",{notification_id:b.dataset.notif}));b.classList.add("read")});
}
function copyWhatsApp(d){
  const t=d.transaction;
  const text=['*'+t.title+'*','رقم المعاملة: '+t.number,'الأولوية: '+t.priority,'الحالة: '+(t.status==="closed"?"مغلقة":"مفتوحة"),t.subject?'الموضوع: '+t.subject:""].filter(Boolean).join("\n");
  navigator.clipboard.writeText(text);
}
function xmlCell(v){
  const value=String(v??"").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return '<Cell><Data ss:Type="String">'+value+'</Data></Cell>';
}
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
    [],["الإحالات"],["التاريخ","من","إلى","التوجيه","سبب الرفع","المطلوب"],...(d.routes||[]).map(r=>[fmtDate(r.created_at),r.from_name||"",r.to_name||"",r.directive||"",r.raise_reason||r.transfer_reason||"",r.proposed_decision||""]),
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
  const token=session?.token;
  if(token){
    try{
      await fetchJson(CONFIG.supabaseUrl+"/auth/v1/logout",{
        method:"POST",
        headers:{apikey:CONFIG.publishableKey,Authorization:"Bearer "+token}
      },8000);
    }catch{}
  }
  clearSession();
  directoryData={users:[],units:[],me:null};
  listData={rows:[]};sessionPermissions=[];permissionsData=null;profileData=null;
  currentSection="transactions";currentTab="";loginView();
}

root.addEventListener("click",e=>{
  const button=e.target.closest?.('[data-act]'),invoker=button||document.activeElement;
  if(button?.disabled)return;
  if(button)button.disabled=true;
  try{
    Promise.resolve(handleTableActionClick(e,invoker)).catch(()=>showNotice("تعذر فتح المعاملة. تحقق من الاتصال ثم حاول مرة أخرى.")).finally(()=>{if(button?.isConnected)button.disabled=false});
  }catch{if(button)button.disabled=false;showNotice("تعذر فتح المعاملة. حاول مرة أخرى.")}
});

loadSession();
boot();


if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  });
}
