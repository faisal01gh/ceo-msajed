import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {repo,artifactRoot,acorn,hash,environment,login,measure} from './performance_frontend_fixture.mjs';

const label=process.argv[2]||'GREEN';
const source=fs.readFileSync(path.join(repo,'app.js'),'utf8');
const ast=acorn.parse(source,{ecmaVersion:'latest'});
const baseline=fs.readFileSync(path.join(artifactRoot,'BEFORE/source/app.js'),'utf8');
const baselineAst=acorn.parse(baseline,{ecmaVersion:'latest'});
const results=[];
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}}
const fn=name=>ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
async function check(name,body){try{await body();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message.split('\n')[0].slice(0,180)});}}

await check('formatters are reused outside row render calls',()=>{
  for(const name of ['fmtDate','fmtDateTime'])walk(fn(name),node=>{
    assert(!(node.type==='NewExpression'&&node.callee?.object?.name==='Intl'&&node.callee?.property?.name==='DateTimeFormat'),'per-row Intl formatter allocation');
  });
});
await check('security and bootstrap functions retain baseline outside reviewed ownership consumers',()=>{
  // These exact consumers are behavior-checked below against real app.js/DOM.
  const ownershipConsumers=new Set(['refresh','logout','loadPermissions']);
  const names=['login','signInNew','boot','loadList','refresh','rpc','post','refreshAuthSession','fetchJson','saveSession','loadSession','clearSession','logout','hasTxPerm','canManagePermissions','loadPermissions','renderPermissionsApp','renderPermissionGrid','credentialCommand','openOwnPasswordChange','acknowledgeTransactionSeen','openDetails'];
  for(const name of names){
    if(ownershipConsumers.has(name))continue;
    const old=baselineAst.body.find(n=>n.id?.name===name),current=fn(name);
    assert.equal(hash(source.slice(current.start,current.end)),hash(baseline.slice(old.start,old.end)),`changed protected function: ${name}`);
  }
});
await check('reviewed ownership consumers pass current-source offline DOM regressions',()=>{
  const python=process.env.FRONTEND_OWNERSHIP_PYTHON;
  assert.ok(python,'FRONTEND_OWNERSHIP_PYTHON must select the prepared fixture Python');
  const output=path.join(artifactRoot,`${label}-ownership-regressions.json`);
  const harness=path.join(repo,'tests/frontend_navigation_races.py');
  const result=spawnSync(python,[harness,'--output',output],{
    encoding:'utf8',timeout:120000,
    env:{...process.env,CHROMIUM_EXECUTABLE_PATH:process.env.FRONTEND_CHROMIUM||process.env.CHROMIUM_EXECUTABLE_PATH||''}
  });
  fs.writeFileSync(path.join(artifactRoot,`${label}-ownership-stdout.txt`),result.stdout||'');
  fs.writeFileSync(path.join(artifactRoot,`${label}-ownership-stderr.txt`),result.stderr||'');
  assert.equal(result.status,0,'owned DOM regression failed; inspect retained ownership stderr/JSON');
  const receipt=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(receipt.appSha256,hash(source));
  assert.equal(receipt.harnessSha256,hash(fs.readFileSync(harness)));
  assert.ok(receipt.testsRun>=20);
  assert.equal(receipt.passed,receipt.testsRun);
  assert.equal(receipt.failures,0);assert.equal(receipt.errors,0);
  assert.equal(receipt.externalRequestCount,0);assert.deepEqual(receipt.pageErrors,[]);
  for(const name of ['test_fe003_refresh_renders_replacement_transactions_host',
    'test_fe001_details_complete_during_pending_logout','test_nav_permissions_completed_owner_handoff']){
    assert.ok(receipt.scenarios.some(s=>s.name.endsWith('.'+name)&&s.status==='passed'),`missing ownership replacement: ${name}`);
  }
});
await check('public configuration preserved by AST hash only',()=>{
  const config=tree=>tree.body.find(n=>n.type==='VariableDeclaration'&&n.declarations[0]?.id?.name==='CONFIG');
  const before=config(baselineAst),after=config(ast);assert.equal(hash(source.slice(after.start,after.end)),hash(baseline.slice(before.start,before.end)));
});
await check('no polling and bounded list request contract',()=>{
  let lists=0;
  walk(ast,n=>{
    if(n.type!=='CallExpression')return;
    assert.notEqual(n.callee?.name,'setInterval');
    if(n.callee?.name==='rpc'&&n.arguments[0]?.value==='list_my_transactions')lists++;
  });
  assert.equal(lists,2);
  for(const name of ['boot','loadList']){
    const sizes=[];walk(fn(name),n=>{if(n.type==='Property'&&n.key.name==='p_page_size')sizes.push(n.value.value);});assert.deepEqual(sizes,[50]);
  }
  for(const n of ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name!=='login'&&n.id.name!=='passwordChangeView')){
    let mutates=false,boots=false;
    walk(n,x=>{if(x.type==='CallExpression'&&x.callee.name==='post')mutates=true;if(x.type==='CallExpression'&&x.callee.name==='boot')boots=true;});
    assert(!(mutates&&boots),`mutation invokes boot: ${n.id.name}`);
  }
});

const env=await environment();
try{
  await check('fresh public bootstrap performs no account or transaction request before login',async()=>{
    const {page,context}=await env.newPage();
    try{assert.equal(await page.evaluate(()=>__fixture.calls.length),0);assert.equal(await page.locator('#loginForm').count(),1);assert.equal(await page.locator('#tableHost').count(),0);}finally{await context.close();}
  });
  await check('date output is unchanged for valid invalid empty and timezone edge inputs',async()=>{
    const {page,context}=await env.newPage();
    try{assert.equal(await page.evaluate(()=>{
      for(const value of [null,'','invalid-date','2026-10-13','2026-03-08T01:59:59Z','2026-11-01T01:30:00Z',0,1]){
        for(const [format,options] of [[fmtDate,{year:'numeric',month:'2-digit',day:'2-digit'}],[fmtDateTime,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}]]){
          const date=new Date(value),expected=!value?'—':Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('ar-SA-u-ca-gregory',options).format(date);
          if(format(value)!==expected)return false;
        }
      }return true;
    }),true);}finally{await context.close();}
  });
  await check('native login parallel boot pagination search filters and lazy details remain bounded',async()=>{
    const {page,context}=await env.newPage();
    try{
      await page.evaluate(()=>{for(const name of ['transaction_directory_my','list_my_transactions','my_permissions'])__fixture.holds.add(name);});
      await page.locator('#username').fill('synthetic');await page.locator('#password').fill('SyntheticFixture9!');await page.locator('#loginBtn').click();
      await page.waitForFunction(()=>__fixture.pending.length===3);
      assert.equal(await page.locator('#tableHost').count(),0);
      await page.evaluate(()=>{for(const name of ['transaction_directory_my','list_my_transactions','my_permissions'])__fixture.release(name);});
      await page.waitForSelector('#tableHost tbody tr');
      await page.evaluate(()=>window.__originalSearch=document.querySelector('#search'));
      const ready='document.querySelector("#tableHost").getAttribute("aria-busy")!=="true"';
      const pagination=await measure(page,'document.querySelector("#nextPage").click()',ready);
      assert.deepEqual(pagination.calls.map(c=>c.name),['list_my_transactions']);assert.equal(pagination.calls[0].args.page,2);
      const search=await measure(page,'{const input=document.querySelector("#search");input.value="LOCAL-1";input.dispatchEvent(new Event("input"));}',`__fixture.calls.slice(from).some(c=>c.name==='list_my_transactions'&&c.end)&&${ready}`);
      assert(search.clientTotalMs>=290);assert.equal(search.calls[0].args.search,'LOCAL-1');assert.equal(search.calls[0].args.page,1);
      const filter=await measure(page,'{const input=document.querySelector("#priorityFilter");input.value="عادي";input.dispatchEvent(new Event("change"));}',ready);
      assert.equal(filter.calls[0].args.priority,'عادي');assert.equal(filter.calls[0].args.search,'LOCAL-1');
      assert(await page.evaluate(()=>__originalSearch===document.querySelector('#search')));
      const calls=await page.evaluate(()=>__fixture.calls);
      assert.equal(calls.filter(c=>c.name==='transaction_directory_my').length,1);assert.equal(calls.filter(c=>c.name==='my_permissions').length,1);assert.equal(calls.filter(c=>c.name==='details').length,0);
      for(const call of calls.filter(c=>c.name==='list_my_transactions')){assert(call.args.pageSize<=100&&call.rows<=50);assert(call.responseBytes<50000);assert(!call.rowKeys.some(k=>['history','actions','routes','requests'].includes(k)));}
      const details=await measure(page,'document.querySelector("[data-act=open]").click()','document.querySelector(".transaction-workspace")');
      assert.deepEqual(details.calls.map(c=>c.name),['details','mark_my_transaction_seen']);assert.equal(new Set(details.calls.map(c=>c.args.id)).size,1);
    }finally{await context.close();}
  });
  async function subjectPage(){
    const handles=await env.newPage(),{page}=handles;await login(page);await page.evaluate(()=>window.__originalSearch=document.querySelector('#search'));
    await page.locator('[data-act="open"]').first().click();await page.locator('#subjectField').click();await page.locator('#newSubject').fill('تعديل تجريبي مؤكد');
    return handles;
  }
  await check('selected mutation button has pending status until fixture confirms; no optimistic success or reboot',async()=>{
    const {page,context}=await subjectPage();
    try{
      await page.evaluate(()=>__fixture.holds.add('change_subject'));await page.locator('#saveSubject').click();
      assert(await page.locator('#saveSubject').isDisabled());
      assert.equal(await page.locator('#saveSubject').getAttribute('aria-busy'),'true');
      assert.equal(await page.locator('#saveSubject [role="status"]').count(),1);
      assert.equal(await page.locator('#newSubject').count(),1);assert.equal(await page.locator('#newSubject').isDisabled(),false);
      const counts=await page.evaluate(()=>__fixture.calls.filter(c=>c.name==='list_my_transactions').length);
      await page.evaluate(()=>__fixture.release('change_subject'));await page.waitForSelector('#saveSubject',{state:'detached'});
      await page.waitForFunction(()=>document.querySelector('#tableHost').getAttribute('aria-busy')==='false');
      const state=await page.evaluate(()=>({names:__fixture.calls.map(c=>c.name),preserved:__originalSearch===document.querySelector('#search')}));
      assert.equal(state.names.filter(n=>n==='change_subject').length,1);assert.equal(state.names.filter(n=>n==='list_my_transactions').length,counts+1);assert.equal(state.names.filter(n=>n==='transaction_directory_my').length,1);assert.equal(state.names.filter(n=>n==='my_permissions').length,1);assert(state.preserved);
    }finally{await context.close();}
  });
  await check('failed mutation retains modal and clears selected pending status without refreshing',async()=>{
    const {page,context}=await subjectPage();
    try{
      const before=await page.evaluate(()=>__fixture.calls.filter(c=>c.name==='list_my_transactions').length);
      await page.evaluate(()=>__fixture.fail('change_subject',403));await page.locator('#saveSubject').click();
      await page.waitForFunction(()=>!document.querySelector('#saveSubject').disabled);
      assert.equal(await page.locator('#newSubject').count(),1);assert.equal(await page.locator('#saveSubject').getAttribute('aria-busy'),null);
      assert.equal(await page.locator('#saveSubject [role="status"]').count(),0);
      assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.name==='list_my_transactions').length),before);
    }finally{await context.close();}
  });
  await check('owner switch during an in-flight mutation cannot refresh the new owner',async()=>{
    const {page,context}=await subjectPage();
    try{
      await page.evaluate(()=>__fixture.holds.add('change_subject'));await page.locator('#saveSubject').click();
      await page.evaluate(async()=>{for(const overlay of [...document.querySelectorAll('.overlay')].reverse())overlay.remove();await logout();__fixture.user=2;});
      await login(page);const before=await page.evaluate(()=>__fixture.calls.filter(c=>c.name==='list_my_transactions').length);
      await page.evaluate(()=>__fixture.release('change_subject'));
      await page.waitForFunction(()=>__fixture.calls.some(c=>c.name==='change_subject'&&c.end));
      assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.name==='list_my_transactions').length),before);
      assert.equal(await page.locator('#tableHost').count(),1);
    }finally{await context.close();}
  });
  // Native Chromium interleavings adapted from client_bootstrap_interleavings.py.
  // Unlike its deterministic search scheduler, these use the real refresh lifecycle
  // directly while bootstrap is pending; neither timers nor application functions change.
  async function manualPage(){
    const handles=await env.newPage();
    await handles.page.evaluate(()=>{
      window.__manual=[];
      window.fetch=(url,options={})=>new Promise((resolve,reject)=>{
        if(new URL(url).origin!=='https://movzojtnkkmdsjhmlgtq.supabase.co'){__fixture.external++;reject(Error('destination_denied'));return;}
        const call={name:new URL(url).pathname.split('/').at(-1),body:JSON.parse(options.body||'{}'),done:false,
          release(status,data){call.done=true;const response=new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});const parse=response.json.bind(response);response.json=async()=>{const value=await parse();call.consumed=true;return value;};resolve(response);},reject};
        __manual.push(call);
      });
    });
    return handles;
  }
  async function request(page,name){await page.waitForFunction(name=>__manual.some(c=>c.name===name&&!c.done),name);return page.evaluate(name=>__manual.findLastIndex(c=>c.name===name&&!c.done),name);}
  async function release(page,index,data,status=200){await page.evaluate(([index,status,data])=>__manual[index].release(status,data),[index,status,data]);await page.waitForFunction(i=>__manual[i].consumed,index);}
  async function gate(page,actor='A',role='employee'){
    await page.locator('#username').fill('fixture-'+actor);await page.locator('#password').fill('SyntheticFixture9!');await page.locator('#loginBtn').click();
    await release(page,await request(page,'account-resolve'),{eligible:true,migrated:true,internal_email:actor+'@example.invalid',role,preferred_login:actor});
    await release(page,await request(page,'token'),{access_token:actor+'-fixture-access',refresh_token:actor+'-fixture-refresh'});
    return request(page,'my_profile');
  }
  const profile={ok:true,user_id:'11111111-1111-4111-8111-111111111111',must_change_password:false};
  const list=tag=>({rows:[{id:'11111111-1111-4111-8111-111111111112',number:tag,title:tag,status:'open',priority:'عادي',days:1}],total:1,page:1,page_size:50,counters:{}});
  async function batch(page,index){
    await release(page,index,profile);return Object.fromEntries(await Promise.all(['transaction_directory_my','list_my_transactions','my_permissions'].map(async name=>[name,await request(page,name)])));
  }
  async function complete(page,requests,role='employee',tag='READY'){
    await release(page,requests.transaction_directory_my,{users:[],units:[],me:{role,display_name:'Fixture'}});
    await release(page,requests.list_my_transactions,list(tag));await release(page,requests.my_permissions,[]);
  }
  await check('current prerequisite failure cannot be suppressed by a newer successful list',async()=>{
    const {page,context}=await manualPage();
    try{
      const pending=await batch(page,await gate(page));await page.evaluate(()=>{void refresh();});const newer=await request(page,'list_my_transactions');
      await release(page,newer,list('NEWER'));await release(page,pending.list_my_transactions,list('OLD'));
      await release(page,pending.transaction_directory_my,{users:[],units:[],me:{role:'employee'}});
      await release(page,pending.my_permissions,{error:'fixture_unavailable'},503);
      assert.equal(await page.locator('#retryBoot').count(),1);assert.equal(await page.locator('#tableHost').count(),0);
      await page.locator('#retryBoot').click();await complete(page,await batch(page,await request(page,'my_profile')));await page.waitForSelector('#tableHost');
    }finally{await context.close();}
  });
  for(const forced of [false,true])await check(forced?'forced password gate never renders unproven list':'invalid identity gate fails closed despite a successful list',async()=>{
    const {page,context}=await manualPage();
    try{
      const pending=await gate(page);await page.evaluate(()=>{void refresh();});await release(page,await request(page,'list_my_transactions'),list('UNPROVEN'));
      await release(page,pending,forced?{...profile,must_change_password:true}:{ok:true,user_id:'invalid'});
      assert.equal(await page.locator('#tableHost').count(),0);assert.equal(await page.locator(forced?'#passwordForm':'#retryBoot').count(),1);
    }finally{await context.close();}
  });
  for(const before of [false,true])await check(`latest list ${before?'before':'after'} bootstrap reaches the native table only after prerequisites`,async()=>{
    const {page,context}=await manualPage();
    try{
      const pending=await batch(page,await gate(page));await page.evaluate(()=>{void refresh();});const newer=await request(page,'list_my_transactions');
      if(before){await release(page,newer,list('LATEST'));assert.equal(await page.locator('#tableHost').count(),0);}
      await complete(page,pending,'employee','SUPERSEDED');await page.waitForSelector('#tableHost');
      if(!before)await release(page,newer,list('LATEST'));
      assert((await page.locator('#tableHost').innerText()).includes('LATEST'));assert(!(await page.locator('#tableHost').innerText()).includes('SUPERSEDED'));
    }finally{await context.close();}
  });
  await check('canonical role correction discards unsupported list generation and keeps current filters',async()=>{
    const {page,context}=await manualPage();
    try{
      const pending=await batch(page,await gate(page,'A','manager'));await page.evaluate(()=>{searchText='current-filter';void refresh();});const obsolete=await request(page,'list_my_transactions');
      await complete(page,pending,'employee','UNSUPPORTED');const corrected=await request(page,'list_my_transactions');assert.notEqual(corrected,obsolete);
      assert.deepEqual(await page.evaluate(i=>({tab:__manual[i].body.p_tab,search:__manual[i].body.p_search}),corrected),{tab:'incoming',search:'current-filter'});
      await release(page,corrected,list('CORRECTED'));await release(page,obsolete,list('STALE'));await page.waitForSelector('#tableHost');
      assert((await page.locator('#tableHost').innerText()).includes('CORRECTED'));assert(!(await page.locator('#tableHost').innerText()).includes('STALE'));
    }finally{await context.close();}
  });
  await check('stale permissions request from owner A cannot render in owner B session',async()=>{
    const {page,context}=await manualPage();
    try{
      await complete(page,await batch(page,await gate(page,'A','ceo_office_manager')),'ceo_office_manager');await page.waitForSelector('#tableHost');
      await page.locator('[data-section="permissions"]').click();const old=await request(page,'permissions_admin_snapshot');
      await page.locator('#logoutBtn').click();await release(page,await request(page,'logout'),{});await page.waitForSelector('#loginForm');
      await complete(page,await batch(page,await gate(page,'B')));await page.waitForSelector('#tableHost');
      await release(page,old,{users:[{canonical_key:'stale-owner',display_name:'STALE'}]});
      assert.equal(await page.locator('#permissionsGrid').count(),0);assert.equal(await page.locator('#tableHost').count(),1);
      assert.equal(await page.evaluate(()=>permissionsData),null);
    }finally{await context.close();}
  });
  for(const outcome of [200,400,401,403,503,'network'])await check(`obsolete credential refresh ${outcome} cannot rewind a completed password command`,async()=>{
    const {page,context}=await manualPage();
    try{
      await complete(page,await batch(page,await gate(page)));await page.waitForSelector('#tableHost');
      await page.evaluate(()=>{void boot();});await release(page,await request(page,'my_profile'),{},401);const old=await request(page,'token');
      await page.evaluate(()=>{window.__passwordOwner=session;openOwnPasswordChange();});
      await page.locator('#profileNewPassword').fill('ChangedFixture9!');await page.locator('#profileConfirmPassword').fill('ChangedFixture9!');await page.locator('#saveProfilePassword').click();
      await release(page,await request(page,'account-confirm-password'),{ok:true,auth:{access_token:'new-fixture-access',refresh_token:'new-fixture-refresh'}});
      if(outcome==='network')await page.evaluate(i=>{__manual[i].done=true;__manual[i].reject(Error('fixture_offline'));},old);
      else await release(page,old,outcome===200?{access_token:'obsolete-fixture-access',refresh_token:'obsolete-fixture-refresh'}:{error:'fixture_rejection'},outcome);
      const retry=await request(page,'my_profile');await complete(page,await batch(page,retry));await page.waitForSelector('#tableHost');
      assert(await page.evaluate(()=>session===__passwordOwner&&session.token==='new-fixture-access'&&JSON.parse(sessionStorage.getItem(SESSION_KEY)).refresh_token==='new-fixture-refresh'));
      assert.equal(await page.locator('#loginForm').count(),0);
    }finally{await context.close();}
  });
  await check('no attempted external traffic or uncaught native app errors',()=>{assert.deepEqual(env.blocked,[]);assert.deepEqual(env.errors,[]);});
}finally{await env.close();}
if(fs.existsSync(path.join(artifactRoot,'AFTER/benchmark.json')))await check('all A-K measured budgets retain 30 samples and the identical harness',()=>{
  const before=JSON.parse(fs.readFileSync(path.join(artifactRoot,'BEFORE/benchmark.json'))),after=JSON.parse(fs.readFileSync(path.join(artifactRoot,'AFTER/benchmark.json')));
  assert.deepEqual(after.harnessHashes,before.harnessHashes);assert.equal(after.sourceHashes['app.js'],hash(source));
  for(const result of [before,after]){
    assert.equal(result.externalRequests,0);assert.equal(result.pageErrors,0);
    assert(result.sampleCount>=30);assert.equal(result.warmups.length,3);
    assert.deepEqual(Object.keys(result.summary),[...'ABCDEFGHIJK']);
    for(const metric of Object.values(result.summary))for(const stat of Object.values(metric)){
      assert(stat.count>=30);for(const field of ['min','avg','p50','p95','p99','max'])assert(Number.isFinite(stat[field]));
    }
  }
  for(const [key,p50,p95] of [['A',1500,2500],['C',500,1200],['D',500,1200],['E',500,1200],['G',700,1500],['J',800,2000]]){
    assert(after.summary[key].clientTotalMs.p50<=p50);assert(after.summary[key].clientTotalMs.p95<=p95);
  }
  assert(after.renderCpu.renderTable.p50<before.renderCpu.renderTable.p50);
});
const report={label,sourceHash:hash(source),checks:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
fs.mkdirSync(artifactRoot,{recursive:true});fs.writeFileSync(path.join(artifactRoot,`${label}-regressions.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.failed)process.exitCode=1;
