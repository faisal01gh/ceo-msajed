// Actual Edge + cached Supabase SDK; only HTTP transport and serve registration are substituted.
// No timers, latency injection, network, real identities or provider response logs.
const BASE = 'https://backend-performance.invalid';
const id = (n: number) => `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), txid = id(101), unit = id(201);
const source = Deno.env.get('BACKEND_PERF_SOURCE') || new URL('../supabase/functions/transactions-api/index.ts', import.meta.url).href;
const output = Deno.env.get('BACKEND_PERF_OUTPUT');
const baseline = Deno.env.get('BACKEND_PERF_BASELINE') === '1';
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const bytes = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
const digest = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2, '0')).join('');
export function stats(values: number[]) {
  const a = [...values].sort((x,y) => x-y), q = (p: number) => a[Math.ceil(a.length*p)-1];
  return { count:a.length, min:a[0], avg:a.reduce((x,y)=>x+y,0)/a.length, p50:q(.5), p95:q(.95), p99:q(.99), max:a.at(-1) };
}
export type Options = {role?: string; fail?: string; inactive?: boolean; forced?: boolean; revoked?: boolean; accountDeny?: boolean; userAllow?: boolean; actionCount?:number; invisible?:boolean; authDenied?:boolean; missingTx?:boolean; directoryFail?:boolean};
export async function fixture(options: Options = {}, transport?: (respond: typeof fetch) => typeof fetch, importSource = source) {
  const originals = {fetch:globalThis.fetch, serve:Deno.serve, url:Deno.env.get('SUPABASE_URL'), key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')};
  const state = { ...options };
  const role = () => state.role || 'manager';
  const staff = Array.from({length:80}, (_,i) => ({canonical_key:`synthetic_${i+1}`,preferred_login:`synthetic_${i+1}`,display_name:`Synthetic ${i+1}`,role_code:i===0?role():'employee',org_name:'Synthetic sector',dept_names:['Synthetic department'],migrated_user_id:id(i+1),eligible:true}));
  const tx = {id:txid,number:'SYN-001',title:'Synthetic transaction',origin:'new',status:'open',priority:'عادي',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',last_activity_at:'2026-10-01T00:00:00Z',current_level:'manager',close_level:'manager',responsible_user_id:actor,responsible_login_name:'synthetic_1',responsible_name:'Synthetic 1',responsible_unit_id:unit,created_by:actor,created_by_name:'Synthetic 1',workflow_started:true};
  const tables: Record<string,any[]> = {
    user_roles:[{user_id:actor,role_code:role()}], role_permissions:['transactions.create','transactions.view_all','transactions.act_all'].map(permission_code=>({role_code:role(),permission_code})),
    account_migration_users:staff, account_permission_overrides:[], user_permissions:[],
    organizational_units:[{id:unit,name:'Synthetic department',unit_type:'department',parent_id:null,active:true}],
    user_memberships:[{user_id:actor,unit_id:unit,active:true,membership_role:'manager'}], transactions:[tx],
    transaction_assignments:[],transaction_routes:[],transaction_requests:[],transaction_history:[],transaction_periods:[],transaction_links:[],
    transaction_actions:Array.from({length:options.actionCount??12},(_,i)=>({id:id(301+i),transaction_id:txid,action_text:`Synthetic action ${i}`,actor_name:'Synthetic 1',created_at:'2026-10-01T00:00:00Z'})),
    transaction_action_versions:Array.from({length:options.actionCount??12},(_,i)=>({id:id(401+i),action_id:id(301+i),version_no:1,body:`Synthetic action ${i}`})),transaction_action_notes:[],notifications:[],audit_log:[]
  };
  let handler: (r:Request)=>Promise<Response>, reads: any[] = [], writes = 0, pending: (()=>void)[] = [], wave = 0, requestBytes=0,responseBytes=0;
  Deno.env.set('SUPABASE_URL',BASE); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',crypto.randomUUID());
  globalThis.fetch = async (input,init) => {
    const req = new Request(input,init), url = new URL(req.url), name = url.pathname.split('/').at(-1)!;
    assert(url.origin===BASE,'unrecognized transport origin');
    const raw = ['GET','HEAD'].includes(req.method)?'':await req.text();
    requestBytes += bytes(url.pathname+url.search)+bytes(raw);
    const batch = wave+1;
    if(!transport)await new Promise<void>(resolve=>{pending.push(resolve);if(pending.length===1)queueMicrotask(()=>{wave++;const now=pending;pending=[];now.forEach(done=>done());});});
    reads.push({name,method:req.method,wave:batch,select:url.searchParams.get('select'),filters:Object.fromEntries([...url.searchParams].filter(([k])=>k!=='select'))});
    const respond=(data:any,status=200,headers:Record<string,string>={})=>{const body=JSON.stringify(data);responseBytes+=bytes(body);return new Response(body,{status,headers:{'content-type':'application/json',...headers}});};
    if(state.directoryFail&&name==='account_migration_users'&&url.searchParams.get('select')!=='canonical_key')return respond({code:'SYN_DIRECTORY',message:'Synthetic directory failure'},500);
    if(state.fail===name && (name!=='account_migration_users'||url.searchParams.get('select')==='canonical_key'))return respond({code:'XX000',message:'synthetic transport failure'},500);
    if(url.pathname==='/auth/v1/user')return state.authDenied?respond({message:'Synthetic rejected identity'},401):respond({id:actor,email:'synthetic@fixture.invalid'});
    if(url.pathname.includes('/rpc/')) {
      if(name==='account_session_check_internal')return respond(!state.revoked);
      if(name==='user_context_internal')return respond({login_name:'synthetic_1',full_name:'Synthetic 1',role:role(),org_name:'Synthetic sector',dept_names:['Synthetic department'],active:!state.inactive,must_change_password:!!state.forced});
      if(name==='transaction_feedback_flags_internal')return respond({visible:!state.invisible,incoming:true,scope:true,shared:false,current_assignees:['Synthetic 1']});
      if(name==='list_transactions_internal') {const b=JSON.parse(raw);return respond({ok:true,total:1,page:b.p_page,page_size:b.p_page_size,counters:{incoming:1},rows:[tx]});}
      if(name==='next_transaction_number'){writes++;return respond('SYN-LOCAL');}
      throw new Error('unrecognized RPC');
    }
    assert(name in tables,'unrecognized table '+name);
    if(name==='account_permission_overrides')tables[name]=state.accountDeny?[{canonical_key:'synthetic_1',permission_code:'transactions.create',effect:'deny'}]:[];
    if(name==='user_permissions')tables[name]=state.userAllow?[{user_id:actor,permission_code:'transactions.create',effect:'allow'}]:[];
    let rows=(name==='transactions'&&state.missingTx?[]:tables[name]).filter(row=>[...url.searchParams].every(([k,v])=>{
      if(['select','order','limit','offset','columns'].includes(k))return true;
      if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
      if(v.startsWith('is.'))return v==='is.null'?row[k]==null:String(row[k])===v.slice(3);
      if(v.startsWith('in.('))return v.slice(4,-1).split(',').includes(String(row[k]));
      throw new Error('unrecognized filter');
    }));
    if(req.method==='HEAD')return new Response(null,{headers:{'content-range':`*/${rows.length}`}});
    if(req.method==='POST') {writes++;const data=JSON.parse(raw);rows=(Array.isArray(data)?data:[data]).map((row:any)=>({id:id(900+writes),created_at:'2026-10-01T00:00:00Z',...row}));tables[name].push(...rows);}
    else assert(req.method==='GET','unrecognized write');
    const limit=url.searchParams.get('limit');if(limit)rows=rows.slice(0,Number(limit));
    const select=url.searchParams.get('select');
    if(select && !select.includes('*'))rows=rows.map(row=>Object.fromEntries(select.split(',').filter(k=>k in row).map(k=>[k,row[k]])));
    const single=req.headers.get('accept')?.includes('vnd.pgrst.object');
    return respond(single?(rows[0]||null):rows,req.method==='POST'?201:200);
  };
  if(transport)globalThis.fetch=transport(globalThis.fetch);
  Object.defineProperty(Deno,'serve',{value:(fn:any)=>{handler=fn;return {};},configurable:true});
  await import(importSource+'?backend-perf='+crypto.randomUUID());
  const token=[crypto.randomUUID(),btoa(JSON.stringify({sub:actor,iss:BASE+'/auth/v1',role:'authenticated',session_id:id(800)})),crypto.randomUUID()].join('.');
  return {
    state,
    async call(action:string,body:Record<string,unknown>={}) {
      reads=[];writes=0;wave=0;requestBytes=0;responseBytes=0;
      const request=new Request('https://synthetic-client.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:'new',token,action,transaction_id:txid,title:'Synthetic local create',...body})});
      const start=performance.now(), response=await handler(request), text=await response.text(), elapsedMs=performance.now()-start;
      return {status:response.status,data:JSON.parse(text),elapsedMs,requestCount:reads.length,transportWaves:wave,requestBytes,responseBytes,payloadBytes:bytes(text),reads,writes};
    },
    close(){globalThis.fetch=originals.fetch;Object.defineProperty(Deno,'serve',{value:originals.serve,configurable:true});for(const [key,value] of [['SUPABASE_URL',originals.url],['SUPABASE_SERVICE_ROLE_KEY',originals.key]])if(value===undefined)Deno.env.delete(key!);else Deno.env.set(key!,value);}
  };
}
Deno.test('performance: unchanged actual Edge harness, 30 real samples per local path',async()=>{
  let denied=false;try{await fetch('https://network-must-be-denied.invalid');}catch(e){denied=e instanceof Deno.errors.NotCapable||e instanceof Deno.errors.PermissionDenied;}assert(denied,'run with --deny-net');
  const paths:Record<string,[string,Record<string,unknown>]>={directory:['directory',{}],list:['list',{}],tab:['list',{tab:'incoming'}],pagination:['list',{page:2,page_size:100}],search:['list',{search:'Synthetic'}],filter:['list',{status:'open'}],details:['details',{}],mutation_local:['create',{}],refresh:['list',{}]};
  const metrics:Record<string,any>={};
  for(const [name,[action,body]] of Object.entries(paths)) {
    const samples=[];
    for(let i=0;i<30;i++){const f=await fixture();try{const r=await f.call(action,body);assert(r.status===200,`${name} must succeed`);samples.push(r);}finally{f.close();}}
    metrics[name]={elapsedMs:stats(samples.map(s=>s.elapsedMs)),requestCount:stats(samples.map(s=>s.requestCount)),transportWaves:stats(samples.map(s=>s.transportWaves)),requestBytes:stats(samples.map(s=>s.requestBytes)),responseBytes:stats(samples.map(s=>s.responseBytes)),payloadBytes:stats(samples.map(s=>s.payloadBytes)),samples:samples.map(({reads,data,...r})=>r),trace:samples[0].reads,resultSha256:await digest(JSON.stringify(samples[0].data))};
  }
  if(output)await Deno.writeTextFile(output,JSON.stringify({kind:'LOCAL_SYNTHETIC_EDGE_WITH_REAL_SDK_FAKE_HTTP_BOUNDARY',networkDenied:true,sourceSha256:await digest(await Deno.readTextFile(new URL(source))),harnessSha256:await digest(await Deno.readTextFile(new URL(import.meta.url))),staff:80,samplesPerPath:30,paths:metrics,unmeasured:['live latency','network latency','database latency','render','login to usable screen','real-network roundtrip depth'],transportWavesDefinition:'Observed response-completion microtask batches with zero injected latency, not estimated real-network roundtrip depth. SDK scheduling may make independent reads occupy separate batches.',bytesDefinition:'UTF-8 URL path/query plus request JSON; response JSON and Edge output, excluding HTTP/TLS headers'},null,2));
});
Deno.test('performance: authorization is fresh across requests',async()=>{
  const f=await fixture();try{
    const r=await f.call('directory');assert(r.status===200,'initial authorization');
    f.state.accountDeny=true;const denied=await f.call('create');assert(denied.status===403&&denied.writes===0,'fresh account deny prevents all writes');
    f.state.userAllow=true;assert((await f.call('create')).status===200,'user override precedence unchanged');
    f.state.revoked=true;const revoked=await f.call('create');assert(revoked.status===401&&revoked.writes===0,'fresh session revocation prevents writes');
  }finally{f.close();}
});
Deno.test('performance: independent auth reads start together and still fail closed',async()=>{
  const f=await fixture({fail:'user_roles'});try{const r=await f.call('create');assert(r.status===401&&r.writes===0,'permission failure must prevent writes');if(!baseline)assert(r.reads.some(x=>x.name==='user_permissions')&&r.reads.some(x=>x.name==='account_migration_users'),'independent permission queries must have started before failed group returns');}finally{f.close();}
});
Deno.test('performance: details use bounded queries as action rows grow; warm pagination avoids directory reload',async()=>{
  const counts=[];for(const actionCount of [1,40]){const f=await fixture({actionCount});try{const detail=await f.call('details');assert(detail.status===200&&detail.data.actions.length===actionCount&&detail.data.action_versions.length===actionCount,'all opened-transaction actions returned');counts.push(detail.requestCount);const list=await f.call('list',{page:2});assert(!list.reads.some(r=>r.name==='account_migration_users'&&r.select!=='canonical_key'),'warm pagination must not reload directory');assert(!list.reads.some(r=>r.name==='transactions'||r.name.startsWith('transaction_')),'list must not fetch full transactions or details');}finally{f.close();}}assert(counts[0]===counts[1]&&counts[1]<=24,'details query count must not grow per action row');
});
for(const fail of ['user_roles','role_permissions','account_migration_users','account_permission_overrides','user_permissions','account_session_check_internal','user_context_internal'])Deno.test('performance fail closed: '+fail,async()=>{const f=await fixture({fail});try{const r=await f.call('create');assert(r.status===401&&r.writes===0,'failed auth read must deny without writes');}finally{f.close();}});
for(const role of ['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'])Deno.test('performance contracts: '+role,async()=>{const f=await fixture({role});try{const list=await f.call('list',{page_size:1000});assert(list.data.page_size===100,'page cap');const normal=await f.call('list');assert(normal.data.page_size===50,'page default');const detail=await f.call('details');assert(detail.data.actions.length===12&&detail.data.action_versions.length===12,'complete detail contract');assert(detail.reads.filter(r=>r.name.startsWith('transaction_')&&!r.name.includes('flags')).every(r=>r.filters.transaction_id==='eq.'+txid||r.filters.action_id?.startsWith('in.(')),'detail reads scoped to opened transaction');assert(!normal.data.rows.some((r:any)=>r.actions||r.history||r.routes||r.requests),'list projection stays slim');}finally{f.close();}});
for(const gate of ['inactive','forced'] as const)Deno.test('performance readiness gate: '+gate,async()=>{const f=await fixture({[gate]:true});try{const r=await f.call('create');assert(r.status===401&&r.writes===0,'readiness must fail closed');}finally{f.close();}});
