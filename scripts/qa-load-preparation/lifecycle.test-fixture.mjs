// TEST ONLY: actual source + pinned official UMD SDK, synthetic fetch/SQL I/O.
// The F3 brand substitute exists ONLY in this isolated VM. No native authority,
// review receipt, client credential, live network or provider response is saved.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
export const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const ORIGIN='https://movzojtnkkmdsjhmlgtq.supabase.co';
const sdkPath=process.env.QA_OWNED_SDK_UMD||'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-892044a-prep-verification/deno-cache/npm/registry.npmjs.org/@supabase/supabase-js/2.57.4/dist/umd/supabase.js';
export async function fixture({fault={},shared,sqlTransport,providerTransport,ownedControl,nativeFactory=false,ownedMetadataHash,ownedControllerIdentityDigest,realProvenance}={}){
 const state=shared||{users:new Map(),rows:new Map(),operations:new Map(),sessions:new Map(),calls:[],sql:[],gates:[],logs:[]};
 const response=(data,status=200)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});
 const jwt=(uid,sid)=>['header',Buffer.from(JSON.stringify({sub:uid,session_id:sid,iss:ORIGIN+'/auth/v1',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic-signature'].join('.');
 const transport=providerTransport||(async(input,init={})=>{
  const u=new URL(String(input));if(u.origin!==ORIGIN)throw new Error('OFFLINE_TARGET_DENIED');
  const method=init.method||'GET';state.calls.push({method,path:u.pathname});
  if(fault.rejectTransport)throw new Error(fault.rejectTransport);
  if(fault.holdFetch)await fault.holdFetch;
  if(u.pathname==='/auth/v1/admin/users'&&method==='POST'){
   const p=JSON.parse(init.body),uid=id(1000+state.calls.filter(c=>c.path==='/auth/v1/admin/users'&&c.method==='POST').length);const user={id:uid,email:p.email,email_confirmed_at:'2026-10-09T00:00:00Z',created_at:'2026-10-09T00:00:00Z',app_metadata:{provider:'email'},user_metadata:p.user_metadata,banned_until:null,deleted_at:null};state.users.set(uid,structuredClone(user));
   if(fault.createEnvelopeEmail)user.email='unowned@fixture.invalid';return response(user);
  }
  const admin=/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(u.pathname);
  if(admin){const uid=admin[1];
   if(method==='DELETE'){if(fault.deleteFailed)return response({msg:'Delete rejected'},500);if(!fault.deleteStillPresent)state.users.delete(uid);return response({});}
   const user=state.users.get(uid);if(!user)return response({msg:'User not found'},404);
   const returned=structuredClone(user);if(fault.getUIDMismatch)returned.id=id(9999);return response(returned);
  }
  if(u.pathname==='/auth/v1/token'){
   const p=JSON.parse(init.body),user=[...state.users.values()].find(x=>x.email===p.email);if(!user)return response({msg:'Invalid login credentials'},400);
   const sid=id(3000+state.calls.filter(c=>c.path==='/auth/v1/token').length);state.sessions.set(sid,{id:sid,user_id:user.id,created_at:'2026-10-09T00:00:00Z',not_after:null});
   return response({user,access_token:jwt(user.id,fault.omitSID?undefined:sid),refresh_token:'memory-only-refresh',token_type:'bearer',expires_in:3600});
  }
  if(u.pathname==='/auth/v1/user'){
   const token=new Headers(init.headers).get('Authorization')?.replace(/^Bearer /,'');const c=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));return response(state.users.get(c.sub));
  }
  if(u.pathname==='/auth/v1/logout'){
   if(u.searchParams.get('scope')!=='local')throw new Error('GLOBAL_LOGOUT_DENIED');
   const token=new Headers(init.headers).get('Authorization')?.replace(/^Bearer /,'');const c=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));state.sessions.delete(c.session_id);
   if(fault.holdLogoutBody)return new Response(new ReadableStream({start(controller){fault.holdLogoutBody.then(()=>{controller.enqueue(new TextEncoder().encode('{}'));controller.close();});}}),{status:200,headers:{'Content-Type':'application/json'}});
   return response(null,204);
  }
  if(u.pathname==='/functions/v1/transactions-api'){
   const body=JSON.parse(init.body),c=JSON.parse(Buffer.from(body.token.split('.')[1],'base64url'));return response({me:{user_id:c.sub},rows:[]});
  }
  throw new Error('UNEXPECTED_SYNTHETIC_TRANSPORT');
 });
 const db=sqlTransport||{query:async(text,values=[])=>{
  state.sql.push({text,values:structuredClone(values)});const tag=/\/\*qa-owned:([^*]+)\*\//.exec(text)?.[1];let rows;
  if(tag==='bootstrap-source')rows=[{definition:readFileSync(new URL('../../supabase/migrations/20261008020000_qa_isolation_enforcement.sql',import.meta.url),'utf8').split('CREATE OR REPLACE FUNCTION public.account_provision_link_internal')[1]}];
  else if(tag==='auth-status'){const u=state.users.get(values[0]);rows=u?[{id:u.id,email:u.email,banned_until:u.banned_until,deleted_at:u.deleted_at}]:[];}
  else if(tag==='auth-absence')rows=state.users.has(values[0])?[{id:values[0]}]:[];
  else if(tag==='reserve'){
   const [runId,operationId,scope,key]=values;const taken=[...state.operations.values()].some(o=>o.runId===runId&&(o.operation_id===operationId||o.scope===scope&&o.resource_key===key));
   if(taken)rows=[];else{state.operations.set(runId+operationId,{runId,operation_id:operationId,scope,resource_key:key,state:'reserved',actual:'pending',history:[{state:'reserved',actual:'pending'}]});rows=[{operation_id:operationId}];}
  }
  else if(tag==='operation'){const o=state.operations.get(values[0]+values[1]);rows=o?[structuredClone(o)]:[];}
  else if(tag==='mark'){
   const [runId,operationId,next,actual]=values,o=state.operations.get(runId+operationId);
   if(!o||o.state==='reserved'&&next!=='dispatched')rows=[];else{o.state=o.state==='unknown'||next==='unknown'?'unknown':next;if(o.actual==='pending')o.actual=actual;o.history.push({state:next,actual});rows=[{operation_id:operationId}];}
  }
  else if(tag==='pending')rows=[{count:[...state.operations.values()].filter(o=>o.runId===values[0]&&(['reserved','dispatched','unknown'].includes(o.state)||o.actual==='pending')).length}];
  else if(tag==='session')rows=[...state.sessions.values()].filter(s=>s.id===values[0]&&s.user_id===values[1]);
  else if(tag==='session-absence')rows=[...state.sessions.values()].filter(s=>s.id===values[0]&&s.user_id===values[1]).map(s=>({id:s.id}));
  else if(tag==='refresh-absence')rows=[];
  else if(tag==='uid-sessions')rows=[...state.sessions.values()].filter(s=>s.user_id===values[0]).map(s=>({id:s.id}));
  else if(tag==='pk'){const spec=state.rows.get(values[0]);rows=spec?[{columns:spec.pk}]:[];}
  else if(tag==='exact-read'){
   const surface=/FROM "([a-z_]+)"\."([a-z_]+)"/.exec(text);const spec=state.rows.get(surface[1]+'.'+surface[2]);const cols=[...text.matchAll(/t\."([a-z_]+)"=\$\d+/g)].map(x=>x[1]);rows=spec.rows.filter(r=>cols.every((c,i)=>r[c]===values[i])).map(row=>({row:structuredClone(row)}));
  }
  else if(tag==='exact-delete'){
   const surface=/FROM "([a-z_]+)"\."([a-z_]+)"/.exec(text);const spec=state.rows.get(surface[1]+'.'+surface[2]);const cols=[...text.matchAll(/t\."([a-z_]+)"=\$\d+/g)].map(x=>x[1]);const expected=JSON.parse(values.at(-1));
   const canonical=x=>JSON.stringify(Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])));
   const hits=spec.rows.filter(r=>cols.every((c,i)=>r[c]===values[i])&&canonical(r)===canonical(expected));spec.rows=spec.rows.filter(r=>!hits.includes(r));rows=hits.map(r=>Object.fromEntries(cols.map(c=>[c,r[c]])));
  }
  else throw new Error('UNIMPLEMENTED_SQL_TRANSPORT_MODEL');
  if(tag==='reserve'&&fault.holdReservationAck)await fault.holdReservationAck;
  return {rows:structuredClone(rows)};
 }};
 const logs=(...args)=>{state.logs.push(args);};
 const context=vm.createContext({Buffer,URL,URLSearchParams,Response,Headers,Request,Blob,FormData,AbortController,TextDecoder,TextEncoder,atob,btoa,setTimeout:fault.timers?.setTimeout||setTimeout,clearTimeout:fault.timers?.clearTimeout||clearTimeout,setInterval,clearInterval,structuredClone,Map,crypto:webcrypto,fetch:transport,console:{debug:logs,log:logs,warn:logs,error:logs,info:logs},WebSocket:class{constructor(){throw new Error('OFFLINE_WEBSOCKET_DENIED');}}});
 context.self=context;
 vm.runInContext(readFileSync(sdkPath,'utf8'),context,{filename:'official-supabase-2.57.4-umd.js'});
 let runtimeAuthority=Object.freeze({assertCurrent:async args=>{state.gates.push(structuredClone(args));if(fault.provenanceDenied)throw new Error('runtime_provenance_denied');return {inventoryDigest:'a'.repeat(64),ownedControlMetadataHash:ownedMetadataHash,ownedControllerIdentityDigest,ownedRolePlanDigest:ownedControl?.rolePlanDigest};}});
 const gate=Object.freeze({assertBeforeWrite:async args=>{state.gates.push(structuredClone(args));if(fault.provenanceDenied)throw new Error('runtime_provenance_denied');}});
 const modules=new Map();
 async function load(url){
  if(modules.has(url))return modules.get(url);
  if(url.endsWith('/qa-runtime-provenance.mjs')&&realProvenance){
   const issued=new WeakSet(),api=realProvenance.api;
   const obj={createAuthorizedRuntimeReader:()=>realProvenance.reader,createRuntimeProvenanceGate:args=>{const g=api.createRuntimeProvenanceGate(args);issued.add(g);return g;},isRuntimeProvenanceGate:value=>issued.has(value)};
   const m=new vm.SyntheticModule(Object.keys(obj),function(){for(const [k,v] of Object.entries(obj))this.setExport(k,v);},{context,identifier:url});modules.set(url,m);return m;
  }
  if(url.endsWith('/qa-runtime-provenance.mjs')){
   const m=new vm.SyntheticModule(['isRuntimeProvenanceGate'],function(){this.setExport('isRuntimeProvenanceGate',value=>value===gate);},{context,identifier:url});modules.set(url,m);return m;
  }
  if(url.endsWith('/accounts-official-reset.mjs')&&!realProvenance){const m=new vm.SyntheticModule(['isAccountRuntimeAuthority'],function(){this.setExport('isAccountRuntimeAuthority',value=>value===runtimeAuthority);},{context,identifier:url});modules.set(url,m);return m;}
  if(url==='node:module'&&nativeFactory){const obj=await import('node:module');const req=()=>context.supabase;req.resolve=()=>sdkPath.replace('/dist/umd/supabase.js','/dist/main/index.js');const m=new vm.SyntheticModule(Object.keys(obj),function(){for(const key of Object.keys(obj))this.setExport(key,key==='createRequire'?()=>req:obj[key]);},{context,identifier:url});modules.set(url,m);return m;}
  if(url.startsWith('node:')){const obj=await import(url);const names=Object.keys(obj);const m=new vm.SyntheticModule(names,function(){for(const key of names)this.setExport(key,obj[key]);},{context,identifier:url});modules.set(url,m);return m;}
  const m=new vm.SourceTextModule(readFileSync(new URL(url),'utf8'),{context,identifier:url,initializeImportMeta(meta){meta.url=url;}});modules.set(url,m);
  await m.link((specifier,ref)=>load(specifier.startsWith('node:')?specifier:new URL(specifier,ref.identifier).href));return m;
 }
 const root=pathToFileURL(path.resolve(import.meta.dirname,'official-owned-adapter.mjs')).href;
 if(realProvenance){const a=await load(new URL('../accounts-official-reset.mjs',root).href);await a.evaluate();}
 const module=await load(root);await module.evaluate();
 const io=await load(new URL('./owned-io.mjs',root).href);if(io.status!=='evaluated')await io.evaluate();
 const lifecycle=await load(new URL('./owned-lifecycle.mjs',root).href);if(lifecycle.status!=='evaluated')await lifecycle.evaluate();
 if(realProvenance){const authority=await load(new URL('../accounts-official-reset.mjs',root).href);if(authority.status!=='evaluated')await authority.evaluate();runtimeAuthority=authority.namespace.createAccountRuntimeAuthority({runtimeReaderConfig:{},readApproval:realProvenance.readApproval});}
 const options={db,runtimeGate:gate,inventoryDigest:'a'.repeat(64),approvalOperationId:id(80),serviceKey:'synthetic-memory-service-key',publicKey:'synthetic-memory-public-key',...(ownedControl?{ownedControl,runtimeAuthority}:{} )};
 const nativeOptions={...options};delete nativeOptions.db;
 const adapter=nativeFactory?await module.namespace.createNativeOwnedQAAdapter(nativeOptions):module.namespace.createOfficialOwnedQAAdapter({...options,createClient:context.supabase.createClient});
 const cleanup=await load(new URL('./cleanup.mjs',root).href);if(cleanup.status!=='evaluated')await cleanup.evaluate();
 const deletion=await load(new URL('./owned-deletion-coordinator.mjs',root).href);if(deletion.status!=='evaluated')await deletion.evaluate();
 return {state,adapter,gate,runtimeAuthority,hash:module.namespace.hash,OwnedIO:io.namespace.OwnedIO,lifecycle:lifecycle.namespace,cleanup:cleanup.namespace,createDeletionCoordinator:deletion.namespace.createDeletionCoordinator,sdkPath};
}
