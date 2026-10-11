import {createHash,createPublicKey,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {createAuthorizedRuntimeReader,createRuntimeProvenanceGate,isRuntimeProvenanceGate} from './qa-runtime-provenance.mjs';
const runtimeAuthorities=new WeakSet();
export function isAccountRuntimeAuthority(value){return runtimeAuthorities.has(value);}
/** Trusted bootstrap, no network at construction. A fresh independently signed
 * approval is obtained after each intervening await/inventory-changing write.
 * Neither a predicted inventory nor a Boolean can refresh authority. */
export function createAccountRuntimeAuthority({runtimeReaderConfig,readApproval}={}){
 if(typeof readApproval!=='function')throw new Error('runtime_provenance_denied');
 const reader=createAuthorizedRuntimeReader(runtimeReaderConfig);
 const authority=Object.freeze({async assertCurrent({scope,operationId}){
  try{
   const receipt=structuredClone(await readApproval({scope,operationId}));
   const gate=createRuntimeProvenanceGate({reader,receipt});
   if(!isRuntimeProvenanceGate(gate))throw new Error();
   const closingProof=await gate.assertBeforeWrite({inventoryDigest:receipt.payload.inventoryDigest,scope,operationId});
   // Return only the exact payload used to construct/await this genuine gate.
   const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
   if(scope.startsWith('qa-')){
    if(closingProof?.ownedControlMetadataHash!==receipt.payload.ownedControlMetadataHash||closingProof?.ownedRolePlanDigest!==receipt.payload.ownedRolePlanDigest||!/^[0-9a-f]{64}$/.test(closingProof?.ownedControllerIdentityDigest))throw new Error();
    return freeze({...receipt.payload,ownedControllerIdentityDigest:closingProof.ownedControllerIdentityDigest});
   }
   return freeze(receipt.payload);
  }catch{throw new Error('runtime_provenance_denied');}
 }});
 runtimeAuthorities.add(authority);return authority;
}
const TARGET='https://movzojtnkkmdsjhmlgtq.supabase.co';
const ENDPOINT='account-admin-reset-password';
const FAISAL='0a1df502-9232-4ef5-af2d-df585ad7f187';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const adapters=new WeakSet(),nativeAdapters=new WeakSet();
export function isNativeOfficialAccountResetAdapter(adapter){return nativeAdapters.has(adapter);}
const requireFact=ok=>{if(!ok)throw new Error('official_reset_unverified');};
const sourceFiles=['accounts-official-reset.mjs','accounts-create-originals.mjs','accounts-provision.mjs','qa-runtime-provenance.mjs',
 '../supabase/functions/account-admin-reset-password/index.ts','../supabase/functions/_shared/password-command.ts',
 '../supabase/functions/_shared/password-port.ts','../supabase/functions/_shared/qa-context.ts'];
export function officialResetSourceHashes(){return Object.fromEntries(sourceFiles.map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex')]));}
export function isOfficialAccountResetAdapter(adapter){return adapters.has(adapter);}
/** Read-only SDK path, not a readiness Boolean supplied by a caller. getUser
 * authenticates the token before claims are used; the existing native session
 * RPC proves SID lifetime/cutoff/forced flags/unresolved operation exclusion.
 * Complete service-role SELECTs reproduce the existing effective-permission
 * precedence (user override > canonical override > role). Missing visibility,
 * error, duplicates or drift deny; no begin/reset/login RPC is a probe. */
export function createAccountResetActorPreflight({client,accessToken}={}){
 requireFact(client?.supabaseUrl===TARGET && typeof accessToken==='string' && accessToken.length>0);
 const auth=client.auth,getUser=auth?.getUser,rpc=client.rpc,from=client.from;
 requireFact(typeof getUser==='function' && typeof rpc==='function' && typeof from==='function');
 const fixed=()=>requireFact(client.supabaseUrl===TARGET && auth.getUser===getUser && client.rpc===rpc && client.from===from);
 const checked=async work=>{fixed();const r=await work();fixed();requireFact(r && !r.error);return r.data;};
 const identify=async()=>{
  const data=await checked(()=>getUser.call(auth,accessToken)),u=data?.user;
  const parts=accessToken.split('.');requireFact(parts.length===3);
  const c=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  requireFact(u && UUID.test(u.id) && typeof u.email==='string' && u.email.length>0 && c.sub===u.id && c.iss===TARGET+'/auth/v1' && c.role==='authenticated' && UUID.test(c.session_id) && Number.isSafeInteger(c.exp) && c.exp*1000>Date.now() && Number.isSafeInteger(c.iat) && c.iat*1000<=Date.now());
  return {id:u.id,email:u.email,session_id:c.session_id,expires:c.exp};
 };
 const session=async a=>requireFact(await checked(()=>rpc.call(client,'account_session_check_internal',{p_user:a.id,p_session:a.session_id,p_allow_forced:false}))===true);
 const permission='profiles.admin_reset_password';
 const snapshot=async a=>{
  const profile=await checked(()=>from.call(client,'profiles').select('id,active,must_change_password').eq('id',a.id).single());
  const registry=await checked(()=>from.call(client,'account_migration_users').select('canonical_key,migrated_user_id,eligible,must_change_password').eq('migrated_user_id',a.id).eq('eligible',true).single());
  requireFact(profile?.id===a.id && profile.active===true && profile.must_change_password===false && registry?.migrated_user_id===a.id && registry.eligible===true && registry.must_change_password===false && typeof registry.canonical_key==='string');
  const roles=await checked(()=>from.call(client,'user_roles').select('user_id,role_code').eq('user_id',a.id));
  requireFact(Array.isArray(roles) && roles.length>0 && roles.every(r=>r.user_id===a.id && typeof r.role_code==='string') && new Set(roles.map(r=>r.role_code)).size===roles.length && roles.some(r=>r.role_code==='ceo_office_manager'));
  const userOverrides=await checked(()=>from.call(client,'user_permissions').select('user_id,permission_code,effect').eq('user_id',a.id).eq('permission_code',permission));
  const canonicalOverrides=await checked(()=>from.call(client,'account_permission_overrides').select('canonical_key,permission_code,effect').eq('canonical_key',registry.canonical_key).eq('permission_code',permission));
  const rolePermissions=await checked(()=>from.call(client,'role_permissions').select('role_code,permission_code').in('role_code',roles.map(r=>r.role_code)).eq('permission_code',permission));
  requireFact(Array.isArray(userOverrides) && userOverrides.length<=1 && userOverrides.every(r=>r.user_id===a.id && r.permission_code===permission && ['allow','deny'].includes(r.effect)) && Array.isArray(canonicalOverrides) && canonicalOverrides.length<=1 && canonicalOverrides.every(r=>r.canonical_key===registry.canonical_key && r.permission_code===permission && ['allow','deny'].includes(r.effect)) && Array.isArray(rolePermissions) && rolePermissions.every(r=>roles.some(x=>x.role_code===r.role_code) && r.permission_code===permission));
  requireFact(userOverrides.length?userOverrides[0].effect==='allow':canonicalOverrides.length?canonicalOverrides[0].effect==='allow':rolePermissions.length>0);
  return {profile,registry,roles,userOverrides,canonicalOverrides,rolePermissions};
 };
 return async()=>{try{
  const actor=await identify();await session(actor);const first=await snapshot(actor);
  const second=await snapshot(actor);requireFact(equal(first,second) && equal(actor,await identify()));
  await session(actor);fixed();requireFact(actor.expires*1000>Date.now());
 }catch{throw new Error('official_reset_actor_unavailable');}};
}
const nativeClients=new WeakSet();
/** Owns the pinned SDK construction. No supplied client, fetch, custom transport,
 * constructor, availability Boolean or actor-preflight callback in real mode. */
export async function createNativeOfficialAccountResetAdapter(options={}){
 try{
  requireFact(!['client','fetch','transport','readAvailability','actorPreflight','executionMode'].some(k=>Object.hasOwn(options,k)) && isAccountRuntimeAuthority(options.runtimeAuthority) && typeof options.serviceRoleKey==='string' && options.serviceRoleKey.length>0);
  let sdk;
  if(globalThis.Deno)sdk=await import('npm:@supabase/supabase-js@2.57.4');
  else{
   const require=createRequire(import.meta.url),entry=require.resolve('@supabase/supabase-js');
   const pkg=JSON.parse(readFileSync(resolve(dirname(entry),'../../package.json'),'utf8'));
   requireFact(pkg.name==='@supabase/supabase-js' && pkg.version==='2.57.4');sdk=require('@supabase/supabase-js');
  }
  const client=sdk.createClient(TARGET,options.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  nativeClients.add(client);
  return createOfficialAccountResetAdapter({...options,client,targetUrl:TARGET,executionMode:'real-apply'});
 }catch{throw new Error('official_reset_unverified');}
}

/**
 * Inert server-owned adapter, not request JSON. Parent pins the independent
 * reviewer's Ed25519 public key from its trusted registry, never from the receipt.
 * signedQaResetReceipt is {payload:<exact signed JSON>,signature:<base64>}.
 * Real receipts require authenticated native proof; fixture signatures are
 * explicitly synthetic-only and cannot authorize real apply. Tokens stay in
 * closure memory, never in receipts/state. Availability is a Parent-owned
 * read-only exact-project Edge-version/source read, NOT an OPTIONS/POST probe.
 * Actual invoke settlement is returned intact to the executor's IO custody.
 * Existing product ABI accepts only target_key/operation_id/new_password;
 * candidate_handle/generation are server-private, never fabricated in the body.
 */
export function createOfficialAccountResetAdapter({client,targetUrl,accessToken,signedQaResetReceipt,trustedReviewerPublicKey,
 operationId,canonicalKeys,readAvailability,runtimeAuthority,executionMode='real-apply'}={}){
 try{
  requireFact(targetUrl===TARGET && client?.supabaseUrl===TARGET && ['real-apply','synthetic'].includes(executionMode));
  requireFact(typeof accessToken==='string' && accessToken.length>0 && UUID.test(operationId) && (executionMode==='synthetic'?typeof readAvailability==='function':nativeClients.has(client) && isAccountRuntimeAuthority(runtimeAuthority) && readAvailability===undefined));
  requireFact(Array.isArray(canonicalKeys) && canonicalKeys.length>0 && new Set(canonicalKeys).size===canonicalKeys.length && canonicalKeys.every(k=>typeof k==='string' && /^[a-z][a-z0-9_]*$/.test(k) && k!=='faisal'));
  const scope=structuredClone(canonicalKeys),functions=client.functions,invoke=functions?.invoke;
  requireFact(functions?.url===TARGET+'/functions/v1' && typeof invoke==='function');
  const publicKey=trustedReviewerPublicKey?.type==='public'?trustedReviewerPublicKey:createPublicKey(trustedReviewerPublicKey);
  requireFact(publicKey.asymmetricKeyType==='ed25519');
  requireFact(typeof signedQaResetReceipt?.payload==='string' && signedQaResetReceipt.payload.length<=32768 && typeof signedQaResetReceipt.signature==='string');
  requireFact(verify(null,Buffer.from(signedQaResetReceipt.payload),publicKey,Buffer.from(signedQaResetReceipt.signature,'base64')));
  const proof=JSON.parse(signedQaResetReceipt.payload),sources=officialResetSourceHashes();
  const gate=()=>{
   requireFact(executionMode==='synthetic' || nativeClients.has(client) && isAccountRuntimeAuthority(runtimeAuthority) && /^[0-9a-f]{40}$/.test(proof.release_sha));
   requireFact(client.supabaseUrl===TARGET && functions.url===TARGET+'/functions/v1' && functions.invoke===invoke);
   requireFact(proof.version===1 && proof.verdict==='APPROVED' && proof.independent===true && typeof proof.reviewer_id==='string' && proof.reviewer_id.length>0 &&
    proof.project_ref==='movzojtnkkmdsjhmlgtq' && proof.endpoint===ENDPOINT && proof.operation_id===operationId && equal(proof.canonical_keys,scope));
   requireFact(proof.evidence_kind===(executionMode==='synthetic'?'synthetic-only':'owned-native-qa-reset') &&
    Number.isSafeInteger(proof.issued_at) && proof.issued_at<=Date.now() && Number.isSafeInteger(proof.expires_at) && proof.expires_at>Date.now() &&
    Number.isSafeInteger(proof.edge_version) && proof.edge_version>0 && equal(proof.source_hashes,sources) && equal(sources,officialResetSourceHashes()));
   requireFact(proof.native_qa_proof?.exit_code===0 && ['reset_completed','candidate_binding_verified','forced_change_completed','old_session_denied','logout_verified','cleanup_verified'].every(k=>proof.native_qa_proof[k]===true));
  };
  gate();
  const actorPreflight=executionMode==='real-apply'?createAccountResetActorPreflight({client,accessToken}):null;
  const current=async()=>{
   gate();
   if(executionMode==='real-apply'){
    // Both prerequisites are actual current readbacks. F3 is last so the write
    // cannot use a grant that predates actor/permission/availability awaits.
    await actorPreflight();gate();
    const runtime=await runtimeAuthority.assertCurrent({scope:'account-reset',operationId});gate();
    const edges=runtime.edges.filter(e=>e.slug===ENDPOINT);
    requireFact(proof.release_sha===runtime.release.sourceSha && edges.length===1 && edges[0].version===proof.edge_version && edges[0].sourceSha===proof.release_sha && runtime.localHashes['accounts-create-originals.mjs']===sources['accounts-create-originals.mjs']);
   }else{
    const observed=await readAvailability({project_ref:'movzojtnkkmdsjhmlgtq',endpoint:ENDPOINT});gate();
    requireFact(observed && !observed.error && observed.project_ref===proof.project_ref && observed.endpoint===ENDPOINT && observed.status==='ACTIVE' && observed.version===proof.edge_version && equal(observed.source_hashes,sources));
   }
  };
  const admissions=new Map(),attempted=new Set(),operations=new Map(),inFlight=new Set(),reconciliations=new Map();
  const statusRpc=client.rpc,getUser=client.auth?.admin?.getUserById,admin=client.auth?.admin;
  const fingerprint=value=>createHash('sha256').update(value).digest('hex');
  const original=c=>{const o=operations.get(c?.operation_id);requireFact(o && o.candidate===c && o.key===c.canonical_key && o.id===c.target_user_id && o.fingerprint===fingerprint(c.password));return o;};
  const response=(r,c)=>{
    requireFact(r && !r.error && r.data && Object.keys(r.data).length===4 && ['ok','operation_id','login_username','must_change_password'].every(k=>Object.hasOwn(r.data,k)) &&
     r.data.ok===true && r.data.operation_id===c.operation_id && typeof r.data.login_username==='string' && r.data.login_username.length>0 && r.data.must_change_password===true);
    return structuredClone(r.data);
  };
  const identity=s=>requireFact(s && scope.includes(s.canonical_key) && s.canonical_key!=='faisal' && UUID.test(s.target_user_id) && s.target_user_id.toLowerCase()!==FAISAL);
  const adapter=Object.freeze({targetUrl:TARGET,transportMode:executionMode==='synthetic'?'synthetic':'official-account-reset',
   async assertAvailable(s){
    try{
     gate();identity(s);requireFact(s.operation_id===operationId);
     await current();gate();identity(s);
     const old=admissions.get(s.canonical_key);requireFact(!old || old===s.target_user_id);admissions.set(s.canonical_key,s.target_user_id);
    }catch{throw new Error('official_reset_unavailable');}
   },
   async reset(c,{admitBefore=Date.now()+30000}={}){
    try{
     gate();identity(c);requireFact(admissions.get(c.canonical_key)===c.target_user_id && UUID.test(c.operation_id) &&
      typeof c.password==='string' && c.password.length>=8 && c.password.length<=128 && /[A-Z]/.test(c.password) && /[a-z]/.test(c.password) && /[0-9]/.test(c.password) && /[^A-Za-z0-9]/.test(c.password) && !/[\x00-\x20\x7f]/.test(c.password));
     requireFact(!attempted.has(c.canonical_key) && !operations.has(c.operation_id));
     // Synchronous one-shot reservation, even on thrown/unknown invoke outcomes.
     attempted.add(c.canonical_key);operations.set(c.operation_id,{candidate:c,key:c.canonical_key,id:c.target_user_id,email:c.internal_email,fingerprint:fingerprint(c.password)});inFlight.add(c.operation_id);
     try{
      await current();gate();identity(c);original(c);requireFact(Number.isSafeInteger(admitBefore) && Date.now()<admitBefore);
      const r=await invoke.call(functions,ENDPOINT,{body:{target_key:c.canonical_key,operation_id:c.operation_id,new_password:c.password},headers:{Authorization:'Bearer '+accessToken}});
      return response(r,c);
     }finally{inFlight.delete(c.operation_id);}
    }catch{throw new Error('official_reset_uncertain');}
   },
   async reconcile(c,{admitBefore=Date.now()+30000}={}){
    try{
     gate();identity(c);const o=original(c);
     requireFact(!inFlight.has(c.operation_id) && typeof statusRpc==='function' && client.rpc===statusRpc && typeof getUser==='function' && admin.getUserById===getUser && typeof o.email==='string');
     if(reconciliations.has(c.operation_id))return await reconciliations.get(c.operation_id);
     // Reserve synchronously before either read await; even a failed/unknown
     // reconciliation remains excluded from automatic replay.
     const actual=Promise.resolve().then(async()=>{
      const status=await statusRpc.call(client,'account_password_status_internal',{p_operation_id:c.operation_id});
      gate();original(c);const s=status?.data;
      requireFact(status && !status.error && s && s.operation_id===c.operation_id && s.target_user_id===c.target_user_id && s.canonical_key===c.canonical_key &&
       s.write_allowed===false && ['completed','uncertain','pending'].includes(s.status) && Number.isSafeInteger(s.generation) && s.generation>0);
      const persisted=await getUser.call(admin,c.target_user_id);gate();original(c);
      const u=persisted?.data?.user;
      requireFact(persisted && !persisted.error && u?.id===o.id && u.email===o.email && u.app_metadata?.msajed_password_operation===c.operation_id && u.app_metadata.msajed_password_generation===s.generation);
      // Existing read-only journal + provider marker: official replay observes
      // SAME operation (write_allowed:false), verifies original candidate, may
      // finish it, but never repeats Auth. QA handle mismatch remains denial.
      await current();gate();identity(c);original(c);requireFact(Number.isSafeInteger(admitBefore) && Date.now()<admitBefore);
      const r=await invoke.call(functions,ENDPOINT,{body:{target_key:o.key,operation_id:c.operation_id,new_password:c.password},headers:{Authorization:'Bearer '+accessToken}});
      return response(r,c);
     });
     reconciliations.set(c.operation_id,actual);return await actual;
    }catch{throw new Error('official_reset_reconciliation_unverified');}
   }
  });
  adapters.add(adapter);if(executionMode==='real-apply')nativeAdapters.add(adapter);return adapter;
 }catch{throw new Error('official_reset_unverified');}
}
