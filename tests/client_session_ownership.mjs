import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const boundary=source.indexOf('\nroot.addEventListener("click"');
assert(boundary>0);
const evidence='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/client-fixes-tdd-evidence.md';
const tests=[];
function test(slice,name,fn){tests.push({slice,name,fn});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
const response=(status,data={})=>({r:{status,ok:status>=200&&status<300},data});
function context(){
  const stored=new Map(),events=[],calls=[];
  const host={isConnected:true,setAttribute(){},prepend(){events.push('retry');}};
  const elements={app:{innerHTML:''},retryBoot:{},tableHost:host};
  const c=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,crypto:webcrypto,
    document:{getElementById:id=>elements[id]||null,querySelector:()=>null,createElement:()=>({}),addEventListener(){}},
    sessionStorage:{setItem:(k,v)=>stored.set(k,v),getItem:k=>stored.get(k)||null,removeItem:k=>stored.delete(k)},
    fetch:()=>{throw Error('External network forbidden');},navigator:{},window:{},events});
  const run=s=>vm.runInContext(s,c);
  run(source.slice(0,boundary));
  run('session={app:"new",token:"A-old",refresh_token:"A-refresh",role:"employee"};globalThis.ownerA=session;renderApp=()=>events.push("render");loginView=()=>events.push("login");passwordChangeView=()=>events.push("forced");renderListOnly=()=>events.push("list");showNotice=()=>events.push("notice");');
  c.fetchJson=(url,options)=>{const d=deferred();calls.push({url,options,...d});return d.promise;};
  return {c,run,calls,stored,events,host};
}
const switchOwner=h=>h.run('session={app:"new",token:"B-old",refresh_token:"B-refresh",role:"employee"}');
for(const target of ['B','null'])test('refresh','refresh ignores completed A response after '+target,async()=>{
  const h=context(),p=h.run('refreshAuthSession()');
  if(target==='B')switchOwner(h);else h.run('clearSession()');
  h.calls[0].resolve(response(200,{access_token:'A-new',refresh_token:'rotated'}));
  assert.equal(await p,false);assert.equal(h.run('session?.token'),target==='B'?'B-old':undefined);
  assert.equal(h.run('ownerA.token'),'A-old');assert.equal(h.stored.size,0);
});
test('refresh','same lifecycle rotates only once and late old token reuses rotation',async()=>{
  const h=context(),a=h.run('refreshAuthSession(session,session.token)'),b=h.run('refreshAuthSession(session,session.token)');
  assert.equal(h.calls.length,1,'same-owner refresh must be single-flight');
  h.calls[0].resolve(response(200,{access_token:'A-new',refresh_token:'A-rotated'}));
  assert.deepEqual(await Promise.all([a,b]),[true,true]);
  assert.equal(await h.run('refreshAuthSession(session,"A-old")'),true);assert.equal(h.calls.length,1);
  assert.equal(JSON.parse(h.stored.get('msajed_session')).refresh_token,'A-rotated');
});
test('refresh','different lifecycle has independent in-flight refresh',async()=>{
  const h=context(),a=h.run('refreshAuthSession()');switchOwner(h);const b=h.run('refreshAuthSession()');
  assert.equal(h.calls.length,2);h.calls[0].resolve(response(200,{access_token:'A-new'}));
  assert.equal(await a,false);h.calls[1].resolve(response(200,{access_token:'B-new'}));assert.equal(await b,true);
  assert.equal(h.run('session.token'),'B-new');
});
for(const status of [503,429])test('refresh','transient '+status+' is not definitive rejection',async()=>{
  const h=context(),p=h.run('refreshAuthSession()');h.calls[0].resolve(response(status,{error:'temporarily_unavailable'}));
  await assert.rejects(p,e=>e.status===status);assert.equal(h.run('session.token'),'A-old');assert.equal(h.stored.size,0);
});
test('refresh','network failure preserves owner and permits a later attempt',async()=>{
  const h=context(),p=h.run('refreshAuthSession()');h.calls[0].reject(Error('offline'));await assert.rejects(p,/offline/);
  assert.equal(h.run('session.token'),'A-old');const next=h.run('refreshAuthSession()');assert.equal(h.calls.length,2);
  h.calls[1].resolve(response(200,{access_token:'A-new'}));assert.equal(await next,true);
});
test('refresh','definitive rejection returns false without writing credentials',async()=>{
  const h=context(),p=h.run('refreshAuthSession()');h.calls[0].resolve(response(400,{error:'invalid_grant'}));
  assert.equal(await p,false);assert.equal(h.stored.size,0);
});
test('refresh','refresh preserves exact URL headers payload and stored session shape',async()=>{
  const h=context(),p=h.run('refreshAuthSession()'),call=h.calls[0];
  assert.equal(call.url,'https://movzojtnkkmdsjhmlgtq.supabase.co/auth/v1/token?grant_type=refresh_token');
  assert.deepEqual(JSON.parse(JSON.stringify(call.options)),{method:'POST',headers:{'Content-Type':'application/json',apikey:h.run('CONFIG.publishableKey')},body:JSON.stringify({refresh_token:'A-refresh'})});
  call.resolve(response(200,{access_token:'A-new'}));assert.equal(await p,true);
  assert.deepEqual(JSON.parse(h.stored.get('msajed_session')),{app:'new',token:'A-new',refresh_token:'A-refresh',role:'employee'});
});

for(const transport of ['post','rpc']){
  const invoke=h=>h.run(transport==='post'?'post("fixture",{token:session.token,action:"mutation",value:"original"})':'rpc("fixture",{p_value:"original"})');
  for(const stage of ['initial401','refresh','success','retry'])test('transport',transport+' rejects owner switch at '+stage,async()=>{
    const h=context(),p=invoke(h);const observed=p.catch(e=>e);
    if(stage==='refresh'||stage==='retry'){
      h.calls[0].resolve(response(401));await flush();assert.equal(h.calls.length,2);
      if(stage==='retry'){h.calls[1].resolve(response(200,{access_token:'A-new'}));await flush();assert.equal(h.calls.length,3);}
    }
    switchOwner(h);
    h.calls.at(-1).resolve(stage==='initial401'?response(401):response(200,{access_token:'A-new',ok:true}));
    // Drain any forbidden extra calls so buggy replay reports an assertion, not a hung test.
    for(let i=0;i<5;i++){await flush();for(const call of h.calls)call.resolve(response(200,{access_token:'unexpected',ok:true}));}
    const result=await observed;assert.equal(result.message,'session_changed');
    assert.equal(h.calls.length,stage==='initial401'||stage==='success'?1:stage==='refresh'?2:3);
    assert.equal(h.run('session.token'),'B-old');
  });
  test('transport',transport+' captures successful request protocol and response',async()=>{
    const h=context(),p=invoke(h),call=h.calls[0];
    assert.equal(call.url,transport==='post'?'https://movzojtnkkmdsjhmlgtq.supabase.co/functions/v1/fixture':'https://movzojtnkkmdsjhmlgtq.supabase.co/rest/v1/rpc/fixture');
    assert.equal(call.options.method,'POST');assert.equal(call.options.headers['Content-Type'],'application/json');
    assert.equal(call.options.headers.apikey,h.run('CONFIG.publishableKey'));
    assert.equal(call.options.headers.Authorization,transport==='rpc'?'Bearer A-old':undefined);
    assert.deepEqual(Object.keys(call.options.headers).sort(),transport==='rpc'?['Authorization','Content-Type','apikey']:['Content-Type','apikey']);
    assert.deepEqual(JSON.parse(call.options.body),transport==='post'?{token:'A-old',action:'mutation',value:'original'}:{p_value:'original'});
    call.resolve(response(200,{ok:true,value:7}));assert.deepEqual(await p,{ok:true,value:7});assert.equal(h.calls.length,1);
  });
  for(const status of [403,503])test('transport',transport+' never retries original non-401 '+status,async()=>{
    const h=context(),p=invoke(h);h.calls[0].resolve(response(status,{error:'fixture_failure'}));
    await assert.rejects(p,e=>e.status===status);assert.equal(h.calls.length,1);assert.equal(h.run('session.token'),'A-old');
  });
  for(const late of [false,true])test('transport',transport+' '+(late?'late':'parallel')+' 401 reuses one rotation',async()=>{
    const h=context(),a=invoke(h),b=invoke(h);
    h.calls[0].resolve(response(401));await flush();
    if(!late){h.calls[1].resolve(response(401));await flush();}
    assert.equal(h.calls.length,3);h.calls[2].resolve(response(200,{access_token:'A-new',refresh_token:'A-rotated'}));await flush();
    if(late){h.calls[1].resolve(response(401));await flush();}
    assert.equal(h.calls.length,5);assert.equal(h.calls.filter(c=>c.url.includes('/auth/')).length,1);
    for(const call of h.calls.slice(3)){
      const body=JSON.parse(call.options.body);
      assert.equal(transport==='post'?body.token:call.options.headers.Authorization,transport==='post'?'A-new':'Bearer A-new');
      assert.deepEqual(body,transport==='post'?{token:'A-new',action:'mutation',value:'original'}:{p_value:'original'});
      call.resolve(response(200,{ok:true}));
    }
    await Promise.all([a,b]);
  });
  for(const kind of ['503','timeout','network'])test('transport',transport+' does not replay on '+kind,async()=>{
    const h=context(),p=invoke(h);const observed=p.catch(e=>e);
    h.calls[0].resolve(response(401));await flush();
    if(kind==='503')h.calls[1].resolve(response(503));else h.calls[1].reject(Object.assign(Error(kind),{code:kind==='timeout'?'NETWORK_TIMEOUT':undefined}));
    const err=await observed;assert.notEqual(err.status,401);assert.equal(h.calls.length,2);assert.equal(h.run('session.token'),'A-old');
  });
}

const profile={ok:true,user_id:'11111111-1111-4111-8111-111111111111',must_change_password:false};
async function openBoot(h,p=profile){
  const job=h.run('boot()');h.calls.at(-1).resolve(response(200,p));await flush();return {job,batch:h.calls.slice(-3)};
}
function releaseBoot(batch,tag){
  batch[0].resolve(response(200,{me:null,tag}));batch[1].resolve(response(200,{rows:[],tag}));batch[2].resolve(response(200,['permission.'+tag]));
}
for(const oldResult of ['success','401','403','network'])test('boot','newer BOOT survives older '+oldResult,async()=>{
  const h=context(),old=await openBoot(h),recent=await openBoot(h,{...profile,user_id:'22222222-2222-4222-8222-222222222222'});
  releaseBoot(recent.batch,'NEW');await recent.job;
  if(oldResult==='success')releaseBoot(old.batch,'OLD');
  else old.batch[0].reject(Object.assign(Error('old error'),{status:oldResult==='network'?undefined:Number(oldResult)}));
  await old.job;assert.equal(h.run('listData.tag'),'NEW');assert.equal(h.run('sessionPermissions[0]'),'permission.NEW');
  assert.equal(h.run('session?.user_id'),'22222222-2222-4222-8222-222222222222');assert.deepEqual(h.events,['render']);
  assert.equal(h.run('root.innerHTML.includes("retryBoot")'),false);
});
for(const result of ['success','error'])test('boot','older profile '+result+' cannot replace canonical identity or gate',async()=>{
  const h=context(),old=h.run('boot()'),gate=h.calls[0];
  const recent=h.run('boot()');h.calls[1].resolve(response(200,{...profile,user_id:'22222222-2222-4222-8222-222222222222',must_change_password:true}));await recent;
  if(result==='success')gate.resolve(response(200,{...profile,must_change_password:true}));else gate.reject(Object.assign(Error('old'),{status:403}));
  await old;assert.equal(h.run('session?.user_id'),'22222222-2222-4222-8222-222222222222');assert.deepEqual(h.events,['forced']);assert.equal(h.calls.length,2);
});
test('boot','new forced gate survives older transaction batch',async()=>{
  const h=context(),old=await openBoot(h),recent=h.run('boot()');h.calls.at(-1).resolve(response(200,{...profile,must_change_password:true}));await recent;
  releaseBoot(old.batch,'OLD');await old.job;assert.deepEqual(h.events,['forced']);assert.equal(h.run('listData.tag'),undefined);
});
test('boot','new BOOT survives old corrected-tab await',async()=>{
  const h=context(),old=await openBoot(h);h.run('currentTab="invalid"');
  old.batch[0].resolve(response(200,{me:{role:'employee'}}));old.batch[1].resolve(response(200,{tag:'OLD'}));old.batch[2].resolve(response(200,[]));await flush();
  const corrected=h.calls.at(-1),recent=await openBoot(h);releaseBoot(recent.batch,'NEW');await recent.job;
  corrected.resolve(response(200,{tag:'OLD-corrected'}));await old.job;assert.equal(h.run('listData.tag'),'NEW');assert.deepEqual(h.events,['render']);
});
for(const target of ['B','null'])test('boot','BOOT ignores stale owner '+target,async()=>{
  const h=context(),old=await openBoot(h);if(target==='B')switchOwner(h);else h.run('clearSession()');
  releaseBoot(old.batch,'OLD');await old.job;assert.equal(h.run('listData.tag'),undefined);assert.deepEqual(h.events,[]);
});
for(const p of [{must_change_password:true},{ok:true,user_id:'invalid'},{ok:false,user_id:profile.user_id}])test('boot','invalid profile fails closed '+JSON.stringify(p),async()=>{
  const h=context(),job=h.run('boot()');h.calls[0].resolve(response(200,p));await job;
  assert.equal(h.calls.length,1);assert.deepEqual(h.events,[]);assert.equal(h.run('root.innerHTML.includes("retryBoot")'),true);
});
test('boot','BOOT preserves session after transient refresh 503',async()=>{
  const h=context(),job=h.run('boot()');h.calls[0].resolve(response(401));await flush();h.calls[1].resolve(response(503));await job;
  assert.equal(h.run('session.token'),'A-old');assert.deepEqual(h.events,[]);assert.equal(h.run('root.innerHTML.includes("retryBoot")'),true);
});
test('boot','BOOT logs out current owner after definitive refresh rejection',async()=>{
  const h=context(),job=h.run('boot()');h.calls[0].resolve(response(401));await flush();h.calls[1].resolve(response(400,{error:'invalid_grant'}));await job;
  assert.equal(h.run('session'),null);assert.deepEqual(h.events,['login']);
});
test('boot','older BOOT list cannot overwrite newer list request',async()=>{
  const h=context(),old=await openBoot(h),list=h.run('loadList()');h.calls.at(-1).resolve(response(200,{tag:'NEW'}));await list;
  releaseBoot(old.batch,'OLD');await old.job;assert.equal(h.run('listData.tag'),'NEW');
});

for(const result of ['success','error'])test('list','latest refresh wins over older '+result,async()=>{
  const h=context(),old=h.run('refresh()'),first=h.calls[0],recent=h.run('refresh()');
  h.calls[1].resolve(response(200,{tag:'NEW'}));await recent;
  if(result==='success')first.resolve(response(200,{tag:'OLD'}));else first.reject(Error('old offline'));
  await old;assert.equal(h.run('listData.tag'),'NEW');assert.deepEqual(h.events,['list']);
});
for(const target of ['B','null'])for(const result of ['success','error'])test('list','disconnected refresh ignores '+target+' stale '+result,async()=>{
  const h=context(),old=h.run('refresh()');h.host.isConnected=false;
  if(target==='B')switchOwner(h);else h.run('clearSession()');
  if(result==='success')h.calls[0].resolve(response(200,{tag:'OLD'}));else h.calls[0].reject(Error('offline'));
  await old;assert.equal(h.run('listData.tag'),undefined);assert.deepEqual(h.events,[]);
});
test('list','new BOOT list survives pending older loadList',async()=>{
  const h=context(),old=h.run('loadList()'),first=h.calls[0],recent=await openBoot(h);releaseBoot(recent.batch,'NEW');await recent.job;
  first.resolve(response(200,{tag:'OLD'}));await old;assert.equal(h.run('listData.tag'),'NEW');assert.deepEqual(h.events,['render']);
});
test('list','forced BOOT gate ignores older refresh results',async()=>{
  const h=context(),old=h.run('refresh()'),first=h.calls[0],recent=h.run('boot()');
  h.calls[1].resolve(response(200,{...profile,must_change_password:true}));await recent;
  first.resolve(response(200,{tag:'OLD'}));await old;assert.equal(h.run('listData.tag'),undefined);assert.deepEqual(h.events,['forced']);
});
test('list','older failure cannot clear newer aria-busy state',async()=>{
  const h=context(),busy=[];h.host.setAttribute=(k,v)=>busy.push(v);
  const old=h.run('refresh()'),recent=h.run('refresh()');h.calls[0].reject(Error('offline'));await old;
  assert.deepEqual(busy,['true','true']);assert.deepEqual(h.events,[]);
  h.calls[1].resolve(response(200,{tag:'NEW'}));await recent;assert.deepEqual(busy,['true','true','false']);
});
test('list','current refresh error keeps previous list and offers retry',async()=>{
  const h=context();h.run('listData={tag:"previous"}');const job=h.run('refresh()');h.calls[0].reject(Error('offline'));await job;
  assert.equal(h.run('listData.tag'),'previous');assert.deepEqual(h.events,['notice','retry']);
});

for(const status of [401,403,503])test('interleave','current BOOT prerequisite error remains owned despite newer list '+status,async()=>{
  const h=context(),old=await openBoot(h),recent=h.run('refresh()');
  h.calls.at(-1).resolve(response(200,{tag:'NEW'}));await recent;
  old.batch[0].reject(Object.assign(Error('current prerequisite failure'),{status}));await old.job;
  assert.equal(h.run('listData.tag'),'NEW');
  if(status===503){
    assert.equal(h.run('session===ownerA'),true);
    assert.equal(h.run('root.innerHTML.includes("retryBoot")'),true);
  }else{assert.equal(h.run('session'),null);assert.ok(h.events.includes('login'));}
  assert.equal(h.events.includes('render'),false);
});

test('interleave','forced profile gate invalidates list started during profile await',async()=>{
  const h=context(),boot=h.run('boot()'),gate=h.calls[0],list=h.run('refresh()'),request=h.calls[1];
  gate.resolve(response(200,{...profile,must_change_password:true}));await boot;
  request.resolve(response(200,{tag:'must-not-render'}));await list;
  assert.equal(h.run('listData.tag'),undefined);assert.deepEqual(h.events,['forced']);
});

for(const outcome of [200,400,401,403,503,'network'])test('credential','same-owner password version survives old refresh '+outcome,async()=>{
  const h=context(),pending=h.run('refreshAuthSession()');
  h.run('session.token="PASSWORD-access";session.refresh_token="PASSWORD-refresh";saveSession()');
  if(outcome==='network')h.calls[0].reject(Error('obsolete offline'));
  else h.calls[0].resolve(response(outcome,{access_token:'OBSOLETE-access',refresh_token:'OBSOLETE-refresh'}));
  assert.equal(await pending,true,'obsolete completion should permit same-actor retry with current credentials');
  assert.equal(h.run('session.token'),'PASSWORD-access');
  assert.equal(JSON.parse(h.stored.get('msajed_session')).refresh_token,'PASSWORD-refresh');
});
test('credential','singleflight is credential-pair scoped and old finally retains newer entry',async()=>{
  const h=context(),old=h.run('refreshAuthSession()');
  h.run('session.token="PASSWORD-access";session.refresh_token="PASSWORD-refresh";saveSession()');
  const recent=h.run('refreshAuthSession()');assert.equal(h.calls.length,2);
  h.calls[0].resolve(response(400));assert.equal(await old,true);
  const join=h.run('refreshAuthSession()');assert.equal(h.calls.length,2,'old finally cannot remove recent entry');
  h.calls[1].resolve(response(200,{access_token:'LATEST',refresh_token:'LATEST-refresh'}));
  assert.deepEqual(await Promise.all([recent,join]),[true,true]);assert.equal(h.run('session.token'),'LATEST');
});
for(const transport of ['post','rpc'])test('credential',transport+' late old 401 reuses password pair without refresh',async()=>{
  const h=context(),job=h.run(transport==='post'?'post("fixture",{token:session.token,action:"fixture"})':'rpc("fixture")');
  h.run('session.token="PASSWORD-access";session.refresh_token="PASSWORD-refresh";saveSession()');
  h.calls[0].resolve(response(401));await flush();assert.equal(h.calls.length,2);
  assert.equal(h.calls.some(c=>c.url.includes('/auth/')),false);
  assert.equal(transport==='post'?JSON.parse(h.calls[1].options.body).token:h.calls[1].options.headers.Authorization,transport==='post'?'PASSWORD-access':'Bearer PASSWORD-access');
  h.calls[1].resolve(response(200,{ok:true}));assert.equal((await job).ok,true);
});
test('credential','refresh-token-only change is a new credential version',async()=>{
  const h=context(),old=h.run('refreshAuthSession()');h.run('session.refresh_token="PASSWORD-refresh";saveSession()');
  const recent=h.run('refreshAuthSession()');assert.equal(h.calls.length,2);
  h.calls[0].resolve(response(200,{access_token:'OBSOLETE'}));assert.equal(await old,true);
  assert.equal(h.run('session.token'),'A-old');
  h.calls[1].resolve(response(200,{access_token:'LATEST'}));assert.equal(await recent,true);
});
for(const transport of ['post','rpc'])test('credential',transport+' late 401 detects refresh-token-only password version',async()=>{
  const h=context(),job=h.run(transport==='post'?'post("fixture",{token:session.token})':'rpc("fixture")');
  h.run('session.refresh_token="PASSWORD-refresh";saveSession()');
  h.calls[0].resolve(response(401));await flush();
  assert.equal(h.calls.length,2);assert.equal(h.calls.some(c=>c.url.includes('/auth/')),false);
  h.calls[1].resolve(response(200,{ok:true}));assert.equal((await job).ok,true);
});
for(const outcome of [200,400,503,'network'])test('credential','old completion '+outcome+' after newer rotation cannot overwrite current pair',async()=>{
  const h=context(),old=h.run('refreshAuthSession()');h.run('session.token="PASSWORD-access";session.refresh_token="PASSWORD-refresh"');
  const recent=h.run('refreshAuthSession()');h.calls[1].resolve(response(200,{access_token:'LATEST',refresh_token:'LATEST-refresh'}));assert.equal(await recent,true);
  if(outcome==='network')h.calls[0].reject(Error('obsolete offline'));else h.calls[0].resolve(response(outcome,{access_token:'OBSOLETE'}));
  assert.equal(await old,true);assert.equal(h.run('session.token'),'LATEST');assert.equal(JSON.parse(h.stored.get('msajed_session')).refresh_token,'LATEST-refresh');
});
for(const order of ['before','after'])test('handoff','latest hostless list completes '+order+' validated bootstrap',async()=>{
  const h=context(),old=await openBoot(h);h.c.document.getElementById=id=>id==='tableHost'?null:id==='retryBoot'?{}:id==='app'?h.run('root'):null;
  const recent=h.run('refresh()'),request=h.calls.at(-1);
  if(order==='before'){request.resolve(response(200,{tag:'LATEST'}));await recent;assert.deepEqual(h.events,[]);}
  releaseBoot(old.batch,'OLD');await old.job;
  h.c.document.getElementById=id=>id==='tableHost'?h.host:id==='app'?h.run('root'):null;
  if(order==='after'){request.resolve(response(200,{tag:'LATEST'}));await recent;assert.deepEqual(h.events,['render','list']);}
  assert.equal(h.run('listData.tag'),'LATEST');
});
test('canonical','canonical employee always corrects scope with latest current filters',async()=>{
  const h=context();h.run('session.role="manager";currentTab="scope";searchText="initial"');
  const old=await openBoot(h);h.run('searchText="current";priorityFilter="urgent"');
  const recent=h.run('refresh()'),stale=h.calls.at(-1);
  old.batch[0].resolve(response(200,{me:{role:'employee'}}));old.batch[1].resolve(response(200,{tag:'OLD'}));old.batch[2].resolve(response(200,[]));await flush();
  assert.equal(h.run('currentTab'),'incoming');const corrected=h.calls.at(-1);
  assert.notEqual(corrected,stale);assert.equal(JSON.parse(corrected.options.body).p_search,'current');assert.equal(JSON.parse(corrected.options.body).p_priority,'urgent');
  corrected.resolve(response(200,{tag:'CORRECTED'}));await old.job;stale.resolve(response(200,{tag:'UNSUPPORTED'}));await recent;
  assert.equal(h.run('listData.tag'),'CORRECTED');
});
for(const status of [401,403,503])test('prerequisite','obsolete bootstrap list '+status+' cannot discard valid canonical prerequisites',async()=>{
  const h=context(),old=await openBoot(h),newer=h.run('loadList()');h.calls.at(-1).resolve(response(200,{tag:'LATEST'}));await newer;
  old.batch[0].resolve(response(200,{me:{role:'employee'}}));old.batch[2].resolve(response(200,[]));
  old.batch[1].reject(Object.assign(Error('obsolete list error'),{status}));await old.job;
  assert.equal(h.run('session===ownerA'),true);assert.equal(h.run('listData.tag'),'LATEST');assert.deepEqual(h.events,['render']);
});

let failed=0;const lines=[];
for(const t of tests.filter(t=>!process.argv[2]||process.argv[2]==='all'||t.slice===process.argv[2])){
  try{await t.fn();lines.push('PASS '+t.name);}catch(e){failed++;lines.push('FAIL '+t.name+': '+e.message);}
}
lines.push(`${lines.length-failed} passed; ${failed} failed; exit ${failed?1:0}`);
console.log(lines.join('\n'));
if(process.argv[3])fs.appendFileSync(evidence,`\n## ${process.argv[3]} ${process.argv[2]||'all'}\nCommand: & 'C:/Program Files/nodejs/node.exe' tests/client_session_ownership.mjs ${process.argv.slice(2).join(' ')}\n\n\`\`\`text\n${lines.join('\n')}\n\`\`\`\n`);
process.exitCode=failed?1:0;
