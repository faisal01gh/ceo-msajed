import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const artifactRoot = path.resolve(process.env.FRONTEND_PERF_ARTIFACT_ROOT || path.join(repo,'.hermes','performance-evidence','frontend'));
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);
export const {chromium} = require(process.env.FRONTEND_PLAYWRIGHT || 'playwright');
export const acorn = require(process.env.FRONTEND_ACORN || 'acorn');

// Only the fetch boundary is replaced. No application function or timer is patched.
// These records are synthetic, generated locally, and are never sent to a server.
export function installFixture() {
  const uid = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
  const permissions = ['transactions.view_all', 'transactions.act_all', 'transactions.edit_subject', 'transactions.change_priority'];
  const users = Array.from({length:80}, (_,i)=>({id:uid(i+1),user_id:uid(i+1),canonical_key:`fixture-${i}`,login_name:`fixture-${i}`,display_name:`موظف تجريبي ${i}`,role:i?'employee':'ceo_office_manager',org_unit_id:uid(900+i%8),permissions:permissions.map(code=>({code,name_ar:code,effective_enabled:true,editable:false}))}));
  const units = Array.from({length:8},(_,i)=>({id:uid(900+i),name:`إدارة تجريبية ${i}`,unit_type:'department'}));
  const transactions = Array.from({length:160},(_,i)=>({id:uid(1000+i),number:`LOCAL-${i+1}`,title:`معاملة تجريبية ${i+1}`,subject:`موضوع محلي ${i+1}`,priority:i%2?'عاجل':'عادي',status:'open',days:i%20,responsible_unit_name:units[i%8].name,responsible_name:users[i%80].display_name,current_assignees:[users[(i+1)%80].display_name],supporting_count:0,last_activity_at:'2026-10-10T10:30:00Z',created_at:'2026-10-01T08:00:00Z',due_at:'2026-10-30T12:00:00Z',activity_revision:1,read_state:'read',has_unread_updates:false}));
  const fixture = window.__fixture = {calls:[],external:0,sequence:0,holds:new Set(),pending:[],failures:new Map(),user:1};
  fixture.release = name => { fixture.holds.delete(name); fixture.pending.filter(x=>x.name===name).forEach(x=>x.resolve()); fixture.pending=fixture.pending.filter(x=>x.name!==name); };
  fixture.fail = (name,status) => fixture.failures.set(name,status);
  window.fetch = async (url, options={}) => {
    const parsed = new URL(String(url),location.href);
    if(parsed.origin !== 'https://movzojtnkkmdsjhmlgtq.supabase.co') { fixture.external++; throw Error('fixture_denied_destination'); }
    const body = options.body ? JSON.parse(options.body) : {};
    const name = parsed.pathname.split('/').at(-1);
    const operation = name==='transactions-api' ? body.action : name;
    // Never retain headers, credential fields, or raw provider bodies in artifacts.
    const call={sequence:++fixture.sequence,name:operation,start:performance.now(),requestBytes:new TextEncoder().encode(options.body||'').length,args:{page:body.p_page,pageSize:body.p_page_size,search:body.p_search,tab:body.p_tab,priority:body.p_priority,id:body.transaction_id||body.p_transaction_id}};
    fixture.calls.push(call);
    if(fixture.holds.has(operation)) await new Promise(resolve=>fixture.pending.push({name:operation,resolve}));
    let data, status=fixture.failures.get(operation)||200;
    fixture.failures.delete(operation);
    if(status!==200) data={error:'local_fixture_rejected'};
    else if(name==='account-resolve') data={eligible:true,migrated:true,internal_email:'fixture@example.invalid',role:'ceo_office_manager',preferred_login:'fixture'};
    else if(name==='token') data={access_token:`synthetic-access-${fixture.user}`,refresh_token:`synthetic-refresh-${fixture.user}`};
    else if(name==='logout') data={};
    else if(name==='my_profile') data={ok:true,user_id:uid(fixture.user),must_change_password:false,name:'مستخدم تجريبي',email:'fixture@example.invalid',can_edit_email:false};
    else if(name==='transaction_directory_my') data={users:users.map(({permissions,...user})=>user),units,me:{role:'ceo_office_manager',display_name:'مستخدم تجريبي',login_name:'fixture'}};
    else if(name==='my_permissions') data=permissions;
    else if(name==='permissions_admin_snapshot') data={tabs:[{code:'transactions',name_ar:'المعاملات'}],users};
    else if(name==='list_my_transactions') {
      if(!(body.p_page_size>0&&body.p_page_size<=100)) throw Error('fixture_page_budget');
      const filtered=transactions.filter(t=>(!body.p_search||t.title.includes(body.p_search)||t.number.includes(body.p_search))&&(!body.p_priority||t.priority===body.p_priority)&&(!body.p_status||t.status===body.p_status));
      const rows=filtered.slice((body.p_page-1)*body.p_page_size,body.p_page*body.p_page_size).map(({subject,created_at,due_at,...row})=>row);
      data={rows,total:filtered.length,page:body.p_page,page_size:body.p_page_size,counters:{incoming:160,late:0,pending_approval:0,closed_today:0,notifications:0}};
      call.rows=rows.length;call.rowKeys=rows.length?Object.keys(rows[0]):[];
    } else if(name==='mark_my_transaction_seen') data={ok:true,transaction_id:body.p_transaction_id,seen_revision:body.p_revision,activity_revision:body.p_revision,read_state:'read',has_unread_updates:false};
    else if(operation==='details') {
      const transaction=transactions.find(t=>t.id===body.transaction_id);
      if(!transaction) throw Error('fixture_missing_transaction');
      data={transaction,can_act:true,can_close:false,flags:{scope:true},assignments:[],actions:[],action_notes:[],action_versions:[],requests:[],routes:[],periods:[],history:Array.from({length:8},(_,i)=>({id:uid(2000+i),event_type:'created',created_at:'2026-10-01T08:00:00Z',actor_name:'موظف تجريبي',meta:{}}))};
    } else if(operation==='change_subject') {
      const transaction=transactions.find(t=>t.id===body.transaction_id);
      if(!transaction) throw Error('fixture_missing_transaction');
      transaction.subject=body.subject; transaction.activity_revision++; data={ok:true};
    } else throw Error('fixture_unexpected_operation');
    const encoded=JSON.stringify(data);
    call.responseBytes=new TextEncoder().encode(encoded).length;call.status=status;call.end=performance.now();
    return new Response(encoded,{status,headers:{'Content-Type':'application/json'}});
  };
}

export async function environment(sourceRoot=repo) {
  const assets=new Map(['/','/index.html','/app.js','/styles.css','/service-worker.js'].map(url=>[url,path.join(sourceRoot,url==='/'?'index.html':url.slice(1))]));
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://127.0.0.1').pathname, file=assets.get(pathname);
    if(!file){response.writeHead(404);response.end();return;}
    let contents=fs.readFileSync(file);
    if(pathname==='/'||pathname==='/index.html') {
      // Suppress speculative connection hints at the asset boundary; app.js is byte-identical.
      contents=Buffer.from(contents.toString('utf8').replace(/<link[^>]+rel="(?:preconnect|dns-prefetch)"[^>]*>/g,''));
    }
    response.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});response.end(contents);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTEND_CHROMIUM||undefined,args:['--disable-background-networking','--disable-component-update','--disable-domain-reliability','--no-pings']});
  const blocked=[],errors=[];
  async function newPage(){
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:900}});
    await context.route('**/*',route=>{if(route.request().url().startsWith(base+'/'))return route.continue();blocked.push('denied');return route.abort();});
    await context.addInitScript(installFixture);
    const page=await context.newPage();page.on('pageerror',()=>errors.push('page_error'));
    await page.goto(base);await page.waitForSelector('#loginForm');
    return {page,context};
  }
  return {base,browser,blocked,errors,newPage,async close(){await browser.close();await new Promise(resolve=>server.close(resolve));}};
}

export async function login(page){
  await page.locator('#username').fill('synthetic-fixture');
  await page.locator('#password').fill('SyntheticFixture9!');
  await page.locator('#loginBtn').click();
  await page.waitForSelector('#tableHost tbody tr');
}

// Invokes existing DOM handlers in Chromium and measures on the browser clock.
// The observer only watches readiness. It never replaces render/rpc/post/boot.
export async function measure(page, action, ready) {
  return page.evaluate(`(async ()=>{
    const start=performance.now(),from=__fixture.calls.length;
    const completed=await new Promise((resolve,reject)=>{
      let finished=false;
      const observer=new MutationObserver(check);
      const timeout=setTimeout(()=>{observer.disconnect();reject(Error('path_readiness_timeout'));},10000);
      function check(){
        if(finished||!(${ready}))return;
        finished=true;observer.disconnect();clearTimeout(timeout);
        requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now())));
      }
      observer.observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
      Promise.resolve((()=>{${action}})()).then(check,reject);check();
    });
    const calls=__fixture.calls.slice(from).map(c=>({...c}));
    const lastResponse=Math.max(start,...calls.map(c=>c.end||start));
    return {clientTotalMs:completed-start,syntheticTransportMs:calls.reduce((n,c)=>n+(c.end-c.start),0),postResponseToUsableMs:completed-lastResponse,finalAckMs:calls.some(c=>c.name==='change_subject')?completed-start:null,fixtureWriteResponseMs:calls.some(c=>c.name==='change_subject')?calls.find(c=>c.name==='change_subject').end-start:null,requests:calls.length,requestBytes:calls.reduce((n,c)=>n+c.requestBytes,0),responseBytes:calls.reduce((n,c)=>n+c.responseBytes,0),calls};
  })()`);
}

export function stats(values){
  const sorted=[...values].sort((a,b)=>a-b),q=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
  return {count:sorted.length,min:sorted[0],avg:sorted.reduce((a,b)=>a+b,0)/sorted.length,p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)};
}
