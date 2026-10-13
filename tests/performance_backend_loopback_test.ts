// Actual Edge and cached Supabase SDK over real local TCP HTTP. Generated data only.
// No sleeps, latency injection, DB/server timing estimates, or native Supabase claims.
import { fixture, stats, type Options } from './performance_backend_test.ts';

const nativeFetch = globalThis.fetch, nativeServe = Deno.serve;
const baseline = Deno.env.get('BACKEND_PERF_BASELINE') === '1';
const output = Deno.env.get('BACKEND_LOOPBACK_OUTPUT');
const source = Deno.env.get('BACKEND_PERF_SOURCE') || new URL('../supabase/functions/transactions-api/index.ts', import.meta.url).href;
const assert = (v: unknown, m: string) => { if (!v) throw new Error(m); };
const digest = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2, '0')).join('');
type Trace = {name:string; method:string; select:string|null; filters:Record<string,string>; start:number; headers:number; end:number; arrived:number; responded:number; wave:number; requestBodyBytes:number; responseBodyBytes:number};

async function loopback(options: Options = {}, importSource = source) {
  let server: Deno.HttpServer<Deno.NetAddr>, trace: Trace[] = [], epoch = performance.now();
  const f = await fixture(options, respond => {
    server = nativeServe({hostname:'127.0.0.1',port:0,onListen:()=>{}}, async req => {
      const url = new URL(req.url), index = Number(req.headers.get('x-local-trace'));
      const t = trace[index]; t.arrived = performance.now()-epoch;
      const body = ['GET','HEAD'].includes(req.method)?undefined:await req.arrayBuffer();
      t.requestBodyBytes = body?.byteLength || 0;
      const response = await respond(new Request('https://backend-performance.invalid'+url.pathname+url.search,{method:req.method,headers:req.headers,body}));
      t.responded = performance.now()-epoch;
      return response;
    });
    const origin = `http://127.0.0.1:${server.addr.port}`;
    return async (input, init) => {
      const req = new Request(input,init), url = new URL(req.url);
      assert(url.origin==='https://backend-performance.invalid','unexpected SDK transport origin');
      const raw = ['GET','HEAD'].includes(req.method)?undefined:await req.arrayBuffer();
      const start = performance.now()-epoch;
      const t: Trace = {name:url.pathname.split('/').at(-1)!,method:req.method,select:url.searchParams.get('select'),filters:Object.fromEntries([...url.searchParams].filter(([k])=>k!=='select')),start,headers:0,end:0,arrived:0,responded:0,wave:1+Math.max(0,...trace.filter(t=>t.end>0&&t.end<=start).map(t=>t.wave)),requestBodyBytes:0,responseBodyBytes:0};
      const index=trace.length;trace.push(t);
      const headers=new Headers(req.headers);headers.set('x-local-trace',String(index));
      const response=await nativeFetch(origin+url.pathname+url.search,{method:req.method,headers,body:raw});
      t.headers=performance.now()-epoch;
      const body=await response.arrayBuffer();t.end=performance.now()-epoch;t.responseBodyBytes=body.byteLength;
      return new Response(req.method==='HEAD'?null:body,{status:response.status,headers:response.headers});
    };
  }, importSource);
  return {
    state:f.state,
    async call(action:string, body:Record<string,unknown>={}) {
      trace=[];epoch=performance.now();
      const r=await f.call(action,body);
      const events=trace.flatMap(t=>[{time:t.start,delta:1},{time:t.end,delta:-1}]).sort((a,b)=>a.time-b.time||a.delta-b.delta);
      let active=0,peak=0;for(const e of events){active+=e.delta;peak=Math.max(peak,active);}
      return {...r,trace,peakTransportOverlap:peak,observedCompletionWaves:Math.max(...trace.map(t=>t.wave)),transportSpanMs:Math.max(...trace.map(t=>t.end))-Math.min(...trace.map(t=>t.start))};
    },
    async close(){f.close();await server.shutdown();}
  };
}
type Result = Awaited<ReturnType<Awaited<ReturnType<typeof loopback>>['call']>>;
const one=(r:Result,name:string,select?:string)=>r.trace.find(t=>t.name===name&&(select===undefined||t.select===select))!;
const overlaps=(a:Trace,b:Trace)=>!!a&&!!b&&a.start<b.end&&b.start<a.end;

for(const [label,action,a,b,select] of [
  ['verified session and context','details','account_session_check_internal','user_context_internal',undefined],
  ['access flags and transaction selectors','details','transaction_feedback_flags_internal','transactions',undefined],
  ['action IDs and independent details','details','transaction_actions','transaction_history','id'],
  ['directory and organizational units','directory','account_migration_users','organizational_units','canonical_key,preferred_login,display_name,role_code,org_name,dept_names,migrated_user_id,eligible'],
  ['detail directory and access selectors','details','account_migration_users','transactions','canonical_key,preferred_login,display_name,role_code,org_name,dept_names,migrated_user_id,eligible'],
  ['create membership and units','create','user_memberships','organizational_units',undefined],
] as const) Deno.test('loopback concurrency: '+label,async()=>{
  const f=await loopback();try{const r=await f.call(action);assert(r.status===200,'successful generated fixture');assert(overlaps(one(r,a,select),one(r,b)),label+' must overlap in actual body-complete HTTP intervals');}finally{await f.close();}
});

Deno.test('loopback contracts: action IDs exclusively scope dependent versions and notes',async()=>{
  for(const actionCount of [0,1,40]){
    const f=await loopback({actionCount});try{
      const r=await f.call('details'), ids=one(r,'transaction_actions','id');
      assert(r.status===200&&r.data.actions.length===actionCount&&r.data.action_versions.length===actionCount,'unchanged detail rows');
      for(const name of ['transaction_action_versions','transaction_action_notes']){
        const child=one(r,name);assert(child.start>=ids.end,'dependent selector must await action IDs');
        const expected=actionCount?Array.from({length:actionCount},(_,i)=>`71000000-0000-4000-8000-${String(301+i).padStart(12,'0')}`):['00000000-0000-0000-0000-000000000000'];
        assert(child.filters.action_id==='in.('+expected.join(',')+')','sole opened-action scope');
      }
      assert(r.requestCount===24,'fixed physical query budget independent of action count');
      assert(r.trace.filter(t=>t.name.startsWith('transaction_')&&!t.name.includes('flags')&&!['transaction_action_versions','transaction_action_notes'].includes(t.name)).every(t=>t.filters.transaction_id==='eq.71000000-0000-4000-8000-000000000101'),'sole transaction scope');
    }finally{await f.close();}
  }
});

for(const fail of ['account_session_check_internal','user_context_internal','user_roles','role_permissions','account_migration_users','account_permission_overrides','user_permissions','user_memberships','organizational_units','transaction_feedback_flags_internal','transaction_assignments','transaction_routes']) Deno.test('loopback fail closed: '+fail,async()=>{
  const f=await loopback({fail});try{
    const access=['transaction_feedback_flags_internal','transaction_assignments','transaction_routes'].includes(fail);
    const r=await f.call(access?'details':'create');
    const actionError=access||['user_memberships','organizational_units'].includes(fail);
    assert(r.status===(actionError?500:401)&&r.data.error===(actionError?'server_error':'unauthorized')&&r.writes===0,'original generic error contract and no writes');
    if(access)assert(!r.trace.some(t=>t.name==='transaction_actions'),'failed access cannot start detail payload');
  }finally{await f.close();}
});

Deno.test('loopback contracts: directory rejection keeps precedence over parallel access or units errors',async()=>{
  for(const [action,fail] of [['details','transaction_routes'],['directory','organizational_units']]){
    const f=await loopback({directoryFail:true,fail});try{
      let rejected=false;try{await f.call(action);}catch(e){rejected=(e as {code?:string}).code==='SYN_DIRECTORY';}
      assert(rejected,'directory error must retain its original uncaught boundary and precedence');
    }finally{await f.close();}
  }
});

Deno.test('loopback contracts: fresh deny, override precedence, revoked session and invisible transaction',async()=>{
  const f=await loopback();try{
    assert((await f.call('directory')).status===200,'initial authorization');
    f.state.accountDeny=true;let r=await f.call('create');assert(r.status===403&&r.writes===0,'fresh deny');
    f.state.userAllow=true;assert((await f.call('create')).status===200,'fresh user allow wins');
    f.state.revoked=true;r=await f.call('create');assert(r.status===401&&r.writes===0&&!r.trace.some(t=>t.name==='user_roles'),'revocation prevents permission and mutation reads');
  }finally{await f.close();}
  for(const state of [{invisible:true},{missingTx:true},{inactive:true},{forced:true}]){
    const f=await loopback(state);try{const r=await f.call('details');assert(r.status===('invisible' in state||'missingTx' in state?403:401)&&r.writes===0&&!r.trace.some(t=>t.name==='transaction_actions'),'guard prevents payload reads');}finally{await f.close();}
  }
});

Deno.test('loopback contracts: native verification precedes reads and denied session precedes failed context',async()=>{
  for(const state of [{authDenied:true},{revoked:true,fail:'user_context_internal'}]){
    const f=await loopback(state);try{
      const r=await f.call('create');assert(r.status===401&&r.data.error==='unauthorized'&&r.writes===0,'generic denial with no writes');
      assert(!r.trace.some(t=>t.name==='user_roles'),'no permissions before verified session and context');
      if(state.authDenied)assert(r.requestCount===1,'no context/session RPC before native verification');
    }finally{await f.close();}
  }
  const f=await loopback();try{
    const r=await f.call('details'),auth=one(r,'user'),session=one(r,'account_session_check_internal'),context=one(r,'user_context_internal');
    assert(session.start>=auth.end&&context.start>=auth.end,'both identity RPCs follow complete verified Auth response');
    assert(r.trace.filter(t=>['user_roles','user_permissions'].includes(t.name)).every(t=>t.start>=Math.max(session.end,context.end)),'fresh permissions wait for both guards');
    const ur=one(r,'user_roles'),acct=one(r,'account_migration_users','canonical_key');
    assert(overlaps(ur,acct)&&overlaps(ur,one(r,'user_permissions')),'three independent fresh permission selectors overlap');
    assert(one(r,'role_permissions').start>=ur.end&&one(r,'account_permission_overrides').start>=acct.end,'role and canonical account dependencies retained');
  }finally{await f.close();}
});

Deno.test('loopback benchmark: unchanged harness, 30 body-complete samples per path',async()=>{
  assert((await Deno.permissions.query({name:'net',host:'non-loopback.invalid:443'})).state!=='granted','non-loopback network must not be granted');
  let denied=false;try{await nativeFetch('https://non-loopback.invalid');}catch(e){denied=e instanceof Deno.errors.NotCapable||e instanceof Deno.errors.PermissionDenied;}assert(denied,'runtime must deny non-loopback before traffic');
  const paths:Record<string,[string,Record<string,unknown>]>={directory:['directory',{}],list:['list',{}],tab:['list',{tab:'incoming'}],pagination:['list',{page:2,page_size:100}],search:['list',{search:'Synthetic'}],filter:['list',{status:'open'}],details:['details',{}],mutation_local:['create',{}],refresh:['list',{}]};
  const beforeSource=Deno.env.get('BACKEND_PERF_BEFORE');
  if(beforeSource){
    const paired:Record<string,any>={before:{},after:{}};
    const measured=['elapsedMs','requestCount','requestBytes','responseBytes','payloadBytes','peakTransportOverlap','observedCompletionWaves','transportSpanMs'] as const;
    for(const [name,[action,body]] of Object.entries(paths)){
      const samples:Record<string,Result[]>={before:[],after:[]};
      for(let i=0;i<30;i++)for(const phase of i%2?['after','before']:['before','after']){
        const f=await loopback({},phase==='before'?beforeSource:source);
        try{const r=await f.call(action,body);assert(r.status===200,'paired request succeeds');samples[phase].push(r);}finally{await f.close();}
      }
      for(const phase of ['before','after'])paired[phase][name]={...Object.fromEntries(measured.map(key=>[key,stats(samples[phase].map(s=>s[key]))])),samples:await Promise.all(samples[phase].map(async({data,reads,transportWaves,...s})=>({...s,resultSha256:await digest(JSON.stringify(data))})))};
      assert(paired.before[name].samples.every((s:any,i:number)=>s.resultSha256===paired.after[name].samples[i].resultSha256),'all paired response bodies identical');
      for(const key of ['requestCount','requestBytes','responseBytes','payloadBytes'])assert(paired.before[name][key].avg===paired.after[name][key].avg,'unchanged physical queries and payloads');
    }
    if(output)await Deno.writeTextFile(output,JSON.stringify({kind:'LOCAL_SYNTHETIC_PAIRED_REAL_SDK_LOOPBACK_TCP_HTTP',beforeSourceSha256:await digest(await Deno.readTextFile(new URL(beforeSource))),afterSourceSha256:await digest(await Deno.readTextFile(new URL(source))),harnessSha256:await digest(await Deno.readTextFile(new URL(import.meta.url))),fixtureSha256:await digest(await Deno.readTextFile(new URL('./performance_backend_test.ts',import.meta.url))),staff:80,samplesPerPathPerPhase:30,totalSamples:540,order:'alternating AB then BA, fresh Edge module and local HTTP server for every sample; identical fixture and harness',phases:paired,network:'Only 127.0.0.1 allowed; non-loopback fetch denied before traffic; no sleeps or injected delay',intervalDefinition:'Real SDK fetch dispatch through complete HTTP body consumption. Observed waves are longest chain of completed non-overlapping intervals; source dependency groups reported separately.',bytesDefinition:'UTF-8 request path/query and JSON body; response body and Edge output; HTTP/TLS headers excluded. Trace body byte counts recorded; no tokens or raw bodies logged.',unmeasured:['production latency','native Supabase','database execution','internet latency','browser rendering','login-to-usable screen'],split:'No network/server/database timing split inferred'},null,2));
    return;
  }
  const metrics:Record<string,unknown>={};
  for(const [name,[action,body]] of Object.entries(paths)){
    const samples:Result[]=[];
    for(let i=0;i<30;i++){const f=await loopback();try{const r=await f.call(action,body);assert(r.status===200,'benchmark request succeeds');samples.push(r);}finally{await f.close();}}
    const measured=['elapsedMs','requestCount','requestBytes','responseBytes','payloadBytes','peakTransportOverlap','observedCompletionWaves','transportSpanMs'] as const;
    metrics[name]={...Object.fromEntries(measured.map(key=>[key,stats(samples.map(s=>s[key]))])),samples:await Promise.all(samples.map(async({data,reads,transportWaves,...s})=>({...s,resultSha256:await digest(JSON.stringify(data))})))};
  }
  if(output)await Deno.writeTextFile(output,JSON.stringify({kind:'LOCAL_SYNTHETIC_ACTUAL_EDGE_REAL_SDK_REAL_LOOPBACK_TCP_HTTP',baseline,sourceSha256:await digest(await Deno.readTextFile(new URL(source))),harnessSha256:await digest(await Deno.readTextFile(new URL(import.meta.url))),fixtureSha256:await digest(await Deno.readTextFile(new URL('./performance_backend_test.ts',import.meta.url))),staff:80,samplesPerPath:30,totalSamples:270,paths:metrics,network:'Only 127.0.0.1 explicitly allowed; no non-loopback permissions; no network delay injection',intervalDefinition:'SDK fetch dispatch through complete HTTP response body consumption; headers, server arrival and response return also traced. Peak counts overlapping measured intervals. Observed waves are longest chain of non-overlapping completed intervals, not claimed production RTT depth or a fabricated microtask batch.',bytesDefinition:'UTF-8 URL path/query plus request JSON; response body and Edge output excluding headers; each trace also records body bytes. No tokens, headers, or raw bodies recorded.',unmeasured:['production latency','native Supabase','database execution','internet latency','browser rendering','login-to-usable screen'],split:'No network/server/database split inferred'},null,2));
});
