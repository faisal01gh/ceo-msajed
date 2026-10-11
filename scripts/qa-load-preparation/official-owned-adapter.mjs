import {createHash,createPublicKey,verify} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {isAccountRuntimeAuthority} from '../accounts-official-reset.mjs';
import {isRuntimeProvenanceGate} from '../qa-runtime-provenance.mjs';
import {UUID,DIGEST,requireOwned} from './owned-io.mjs';
import {createDeletionFenceSQL} from './lifecycle.fence-sql.mjs';
const ORIGIN='https://movzojtnkkmdsjhmlgtq.supabase.co';
const branded=new WeakSet(),nativeBranded=new WeakSet();
export const isNativeOwnedQAAdapter=value=>nativeBranded.has(value);
export async function createNativeOwnedQAAdapter(options={}) {
 requireOwned(options.ownedControl&&isAccountRuntimeAuthority(options.runtimeAuthority)&&!['createClient','fetch','transport','db'].some(k=>Object.hasOwn(options,k)),'NATIVE_OWNED_ADAPTER_REQUIRED');
 const require=createRequire(import.meta.url),entry=require.resolve('@supabase/supabase-js'),pkg=JSON.parse(readFileSync(resolve(dirname(entry),'../../package.json'),'utf8'));
 requireOwned(pkg.name==='@supabase/supabase-js'&&pkg.version==='2.57.4','PINNED_OFFICIAL_SDK_REQUIRED');
 const sdk=require('@supabase/supabase-js');
 const reader=sdk.createClient(ORIGIN,options.serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:physicalCredentialFetch()}});
 const db={query:async(text,values=[])=>{
  const facet=/\/\*qa-owned:([^*]+)\*\//.exec(text)?.[1];
  requireOwned(['auth-status','auth-absence','session','session-absence','refresh-absence','uid-sessions','manifest-read','pending','disposition'].includes(facet),'NATIVE_OWNED_READ_FACET_DENIED');
  let uid=null,sid=null;
  if(['auth-status','auth-absence','uid-sessions','disposition'].includes(facet))uid=values[0];
  if(['session','session-absence'].includes(facet)){sid=values[0];uid=values[1];}
  if(['manifest-read','disposition'].includes(facet))uid=values[1];if(facet==='refresh-absence')sid=values[0];
  const r=await reader.rpc('qa_owned_read_internal',{p_run:options.ownedControl.runId,p_facet:facet,p_uid:uid,p_sid:sid});
  requireOwned(r&&!r.error&&Array.isArray(r.data),'NATIVE_OWNED_READ_UNVERIFIED');return {rows:r.data};
 }};
 const adapter=createOfficialOwnedQAAdapter({...options,db,createClient:sdk.createClient});nativeBranded.add(adapter);return adapter;
}
export const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const hash=value=>createHash('sha256').update(stable(value)).digest('hex');
const ident=s=>{requireOwned(typeof s==='string'&&/^[a-z_][a-z0-9_]*$/.test(s),'UNSAFE_SQL_IDENTIFIER');return '"'+s+'"';};
const relation=surface=>{requireOwned(typeof surface==='string'&&surface.split('.').length===2,'UNSAFE_SURFACE');return surface.split('.').map(ident).join('.');};
// No business graph table is a cleanup delete surface. Business references are
// blockers, never implicitly promoted to a cascade or expanded delete allowlist.
export const DELETE_SURFACES=Object.freeze([
 'public.profiles','public.user_roles','public.user_memberships','public.user_permissions',
 'public.account_migration_users','public.account_permission_overrides',
 'app_private.account_credential_state',
 'app_private.qa_run_members','app_private.qa_account_manifest','app_private.qa_transaction_manifest'
]);
export function isOfficialOwnedQAAdapter(adapter){return branded.has(adapter);}
export function physicalCredentialFetch(transport=globalThis.fetch.bind(globalThis)){
 return async(input,init)=>{try{
  const url=new URL(typeof input==='string'?input:input.url||String(input));
  requireOwned(url.origin===ORIGIN&&!url.username&&!url.password&&!url.hash,'WRONG_PROVIDER_TARGET');
  const response=await transport(input,{...init,redirect:'error'});
  const bytes=await response.arrayBuffer();
  const replay=new Response(response.body===null?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
  Object.defineProperties(replay,{url:{value:response.url},redirected:{value:response.redirected},type:{value:response.type}});
  return replay;
 }catch{throw new Error('Owned credential transport failed');}};
}

// Official SDK construction is inert. The caller supplies its documented
// createClient export and a private server DB transport, NEVER a fake RPC name.
// No key/password/session token is persisted or returned in a public receipt.
export function createOfficialOwnedQAAdapter({createClient,db,runtimeGate,inventoryDigest,approvalOperationId,provenance,serviceKey,publicKey,runtimeAuthority,ownedControl}={}){
 requireOwned(typeof createClient==='function'&&typeof db?.query==='function'&&(isRuntimeProvenanceGate(runtimeGate)||isAccountRuntimeAuthority(runtimeAuthority)),'OFFICIAL_OWNED_ADAPTER_REQUIRED');
 requireOwned(DIGEST.test(inventoryDigest)&&UUID.test(approvalOperationId)&&typeof serviceKey==='string'&&typeof publicKey==='string','INVALID_OWNED_BOUNDARY');
 let control=null;const operations=new Map();
 if(ownedControl){
  const c=structuredClone(ownedControl),key=createPublicKey(c.reviewerPublicKey);
  requireOwned(UUID.test(c.planId)&&UUID.test(c.runId)&&DIGEST.test(c.identityDigest)&&DIGEST.test(c.rolePlanDigest)&&typeof c.signedPlan?.payload==='string'&&typeof c.signedPlan.signature==='string'&&key.asymmetricKeyType==='ed25519','OWNED_CONTROL_PROOF_REQUIRED');
  requireOwned(verify(null,Buffer.from('QA-OWNED-ROLEPLAN-v1\n'+c.signedPlan.payload),key,Buffer.from(c.signedPlan.signature,'base64')),'OWNED_ROLE_PLAN_SIGNATURE_DENIED');
  const plan=JSON.parse(c.signedPlan.payload);
  requireOwned(Object.keys(plan).sort().join(',')==='controlIdentityDigest,protectedCanonicalKeys,protectedUIDs,resources,rolePlanDigest,runId,sourceHash,sourceHashes,units'&&Array.isArray(plan.resources)&&plan.resources.length===57,'OWNED_PLAN_SCHEMA_DENIED');
  for(const r of plan.resources)requireOwned(Object.keys(r).sort().join(',')==='canonicalKey,createOperation,displayName,email,kind,loginAlias,memberships,receiptId,role,rolePlanDigest,runId,sourceId','OWNED_SOURCE_SCHEMA_DENIED');
  requireOwned(plan.runId===c.runId&&plan.controlIdentityDigest===c.identityDigest&&plan.rolePlanDigest===c.rolePlanDigest&&plan.sourceHash===createHash('sha256').update(readFileSync(new URL('./owned-control.sql',import.meta.url))).digest('hex'),'OWNED_PLAN_RUNTIME_SOURCE_MISMATCH');
  const sourceHashes=Object.fromEntries(['owned-control.sql','owned-deletion-fence.sql'].map(n=>[n,createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex')]));
  requireOwned(stable(plan.sourceHashes)===stable(sourceHashes),'OWNED_PLAN_RUNTIME_SOURCE_MISMATCH');
  requireOwned(hash({resources:plan.resources.map(({rolePlanDigest,...r})=>r),units:plan.units})===plan.rolePlanDigest&&plan.resources.every(r=>r.rolePlanDigest===plan.rolePlanDigest),'OWNED_ROLE_PLAN_DIGEST_DENIED');
  control=Object.freeze({...c,plan});
 }
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:physicalCredentialFetch()}};
 const admin=createClient(ORIGIN,serviceKey,options);
 const identity=async()=>{requireOwned(control,'OWNED_QA_BOOTSTRAP_BRIDGE_REQUIRED');const r=await checked(()=>admin.rpc('qa_owned_identity_snapshot_internal',{}));requireOwned(r.digest===control.identityDigest&&r.snapshot&&Array.isArray(r.snapshot.functions),'OWNED_BRIDGE_RUNTIME_IDENTITY_DENIED');return r;};
 const permit=async scope=>{
  if(runtimeAuthority){
   requireOwned(isAccountRuntimeAuthority(runtimeAuthority),'RUNTIME_PROVENANCE_REQUIRED');
   const observed=control?await identity():null;
   const approved=await runtimeAuthority.assertCurrent({scope,operationId:approvalOperationId});
   // Genuine F3 has independently checked the signed FULL primary metadata
   // hash. Its final single-statement closing snapshot supplies the separate
   // PostgreSQL controller identity digest; never hash/compare a subset here.
   requireOwned(control&&DIGEST.test(approved.ownedControlMetadataHash)&&approved.ownedControllerIdentityDigest===control.identityDigest&&approved.ownedControllerIdentityDigest===observed.digest&&approved.ownedRolePlanDigest===control.rolePlanDigest,'OWNED_PRIMARY_PROVENANCE_REQUIRED');return;
  }
  const p=provenance?await provenance():{runtimeGate,inventoryDigest,operationId:approvalOperationId};
  requireOwned(isRuntimeProvenanceGate(p?.runtimeGate)&&DIGEST.test(p.inventoryDigest)&&UUID.test(p.operationId),'RUNTIME_PROVENANCE_REQUIRED');
  await p.runtimeGate.assertBeforeWrite({inventoryDigest:p.inventoryDigest,scope,operationId:p.operationId});
 };
 const query=async(text,values=[])=>{try{const r=await db.query(text,values);requireOwned(r&&Array.isArray(r.rows),'SQL_RESULT_UNVERIFIED');return r.rows;}catch{throw new Error('OWNED_SQL_UNVERIFIED');}};
 const write=async(scope,text,values)=>{await permit(scope);return query(text,values);};
 const checked=async fn=>{try{const r=await fn();requireOwned(r&&!r.error&&r.data,'OFFICIAL_RESPONSE_UNVERIFIED');return r.data;}catch{throw new Error('OFFICIAL_RESPONSE_UNVERIFIED');}};
 const exactRow=async(surface,pk)=>{
  requireOwned(DELETE_SURFACES.includes(surface),'DELETE_SURFACE_DENIED');
  const keys=Object.keys(pk).sort();requireOwned(keys.length>0&&keys.every(k=>pk[k]!==null&&['string','number','boolean'].includes(typeof pk[k])),'INVALID_PK_TUPLE');
  const primary=await query(`/*qa-owned:pk*/ SELECT to_jsonb(array_agg(a.attname ORDER BY k.ord)) AS columns FROM pg_catalog.pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.contype='p' AND c.conrelid=$1::regclass GROUP BY c.oid`,[surface]);
  requireOwned(primary.length===1&&Array.isArray(primary[0].columns)&&stable([...primary[0].columns].sort())===stable(keys),'INCOMPLETE_COMPOSITE_KEY');
  const rows=await query(`/*qa-owned:exact-read*/ SELECT to_jsonb(t) AS row FROM ${relation(surface)} t WHERE ${keys.map((k,i)=>`t.${ident(k)}=$${i+1}`).join(' AND ')}`,keys.map(k=>pk[k]));
  requireOwned(rows.length<=1,'AMBIGUOUS_PK');return rows[0]?.row??null;
 };
 const dispatchTickets=new WeakMap(),dispatchOperations=new Map();
 const fence=createDeletionFenceSQL({rpc:async(name,args)=>{
  if(name!=='qa_owned_delete_read_internal')await permit('qa-cleanup');
  try{const result=await admin.rpc(name,args);return result?.error?{data:null,error:new Error('OWNED_DELETION_RPC_UNVERIFIED')}:result;}catch{throw new Error('OWNED_DELETION_RPC_UNVERIFIED');}
 }});
 const bindDeletion=(r,observed)=>{requireOwned(r&&UUID.test(r.operation_id)&&UUID.test(r.target_user_id)&&Number.isSafeInteger(r.generation)&&r.generation>0,'OWNED_DELETION_RECEIPT_REQUIRED');if(control)requireOwned(r.run_id===control.runId&&!control.plan.protectedUIDs.includes(r.target_user_id)&&!control.plan.protectedCanonicalKeys.includes(r.canonical_key)&&r.canonical_key.toLowerCase()!=='faisal','PROTECTED_DELETION_DENIED');if(observed)requireOwned(['operation_id','run_id','target_user_id','canonical_key','generation','ownership_receipt_digest','protected_snapshot_digest'].every(k=>r[k]===observed[k]),'OWNED_DELETION_BINDING_DENIED');return r;};
 const adapter={
  bindOwnedDeletionResource(receipt,args){
   const r=bindDeletion(receipt);
   requireOwned(control&&r.run_id===args.runId&&r.operation_id===args.operationId&&(args.generation===undefined||r.generation===args.generation)&&(args.uid===undefined||r.target_user_id===args.uid),'OWNED_DELETION_BINDING_DENIED');
   const matches=control.plan.resources.filter(s=>s.canonicalKey===r.canonical_key);
   requireOwned(matches.length===1&&matches[0].runId===r.run_id&&matches[0].sourceId===args.sourceId&&control.plan.resources.filter(s=>s.sourceId===args.sourceId).length===1,'OWNED_DELETION_SOURCE_BINDING_DENIED');
   return Object.freeze({receipt:r,sourceId:matches[0].sourceId,uid:r.target_user_id});
  },
  async prepareOwnedDeletion(args){const r=await fence.prepare(args);return bindDeletion(r);},
  async readOwnedDeletion(args){return bindDeletion(await fence.read(args));},
  async transitionOwnedDeletion(r,status){bindDeletion(r);const next=bindDeletion(await fence.transition({operationId:r.operation_id,generation:r.generation,status}),r);if(status==='auth_delete_in_flight'){const ticket={used:false,revoked:false};dispatchTickets.set(next,ticket);dispatchOperations.set(r.operation_id,ticket);}else{const ticket=dispatchOperations.get(r.operation_id);if(ticket)ticket.revoked=true;}return next;},
  async dispatchOwnedDeletion(r){
   const ticket=dispatchTickets.get(r);requireOwned(ticket&&!ticket.used&&!ticket.revoked,'OWNED_DELETION_DISPATCH_DENIED');ticket.used=true;
   const current=bindDeletion(await fence.read({operationId:r.operation_id}),r);
   requireOwned(current.status==='auth_delete_in_flight','OWNED_DELETION_DISPATCH_DENIED');
   await permit('qa-cleanup');
   requireOwned(!ticket.revoked,'OWNED_DELETION_DISPATCH_DENIED');
   await checked(()=>admin.auth.admin.deleteUser(current.target_user_id,false));
   return {operation_id:r.operation_id,generation:r.generation,settlement:'fulfilled'};
  },
  async readDeletionAuthAbsence(r){
   bindDeletion(r);let result;try{result=await admin.auth.admin.getUserById(r.target_user_id);}catch{throw new Error('OWNED_AUTH_READBACK_UNVERIFIED');}
   if(!result?.error&&result?.data?.user?.id===r.target_user_id)return {absent:false};
   requireOwned(result?.error?.status===404&&result.error.code==='user_not_found'&&result.data?.user===null,'OFFICIAL_ABSENCE_UNVERIFIED');
   return {absent:true,readbackDigest:hash({protocol:'official-get-user-not-found-v1',operation_id:r.operation_id,generation:r.generation,target_user_id:r.target_user_id,status:404,user:null})};
  },
  async recordOwnedDeletionAbsence(r,readbackDigest){bindDeletion(r);return bindDeletion(await fence.absence({operationId:r.operation_id,generation:r.generation,targetUserId:r.target_user_id,readbackDigest}),r);},
  async finalizeOwnedDeletion(r){bindDeletion(r);return bindDeletion(await fence.finalize({operationId:r.operation_id,generation:r.generation}),r);},
  async preflightOwnedDeletion(){
   requireOwned(control&&isAccountRuntimeAuthority(runtimeAuthority),'OWNED_QA_DISPOSAL_BRIDGE_REQUIRED');
   const observed=await identity();
   const signatures=['public.qa_owned_delete_prepare_internal(p_run uuid, p_source uuid, p_operation uuid)','public.qa_owned_delete_transition_internal(p_operation uuid, p_generation bigint, p_status text)','public.qa_owned_delete_absence_internal(p_operation uuid, p_generation bigint, p_uid uuid, p_readback_digest text)','public.qa_owned_delete_finalize_internal(p_operation uuid, p_generation bigint)','public.qa_owned_delete_read_internal(p_operation uuid)'];
   for(const signature of signatures){const found=observed.snapshot.functions.filter(f=>f.identity===signature);requireOwned(found.length===1&&found[0].result==='jsonb'&&found[0].owner==='postgres'&&found[0].security_definer===true&&typeof found[0].definition==='string','OWNED_DURABLE_PREPARER_UNAVAILABLE');}
   // F3 binds the independently captured primary catalog, not this RPC's echo.
   await permit('qa-cleanup');
  },
  async preflightOwnedBootstrap({population}={}){
   if(control){
    await identity();const r=await checked(()=>admin.rpc('qa_owned_preflight_internal',{p_plan:control.planId,p_run:control.runId}));
    requireOwned(r.ok===true&&stable(r.plan)===stable(control.plan),'OWNED_APPROVED_PLAN_READBACK_DENIED');
    if(population)requireOwned(population.runId===control.runId&&population.rolePlanDigest===control.rolePlanDigest&&stable(population.resources)===stable(r.plan.resources),'OWNED_POPULATION_PLAN_MISMATCH');requireOwned(r.external_auth_delete_window_attested===true,'OWNED_EXTERNAL_AUTH_DELETE_WINDOW_UNATTESTED');await adapter.preflightOwnedDeletion();return r;
   }
   // The accepted final Core source explicitly permits staff57 only. We do not
   // bypass it with direct INSERTs, forged frames, fake RPCs or grant changes.
   const rows=await query(`/*qa-owned:bootstrap-source*/ SELECT pg_get_functiondef(to_regprocedure('public.account_provision_link_internal(text,uuid,jsonb)')) AS definition`);
   requireOwned(rows.length===1&&typeof rows[0].definition==='string','CORE_SOURCE_UNVERIFIED');
   throw new Error('OWNED_QA_BOOTSTRAP_BRIDGE_REQUIRED');
  },
  async preflightOwnedCleanup(){
   if(control){await adapter.preflightOwnedDeletion();return {ok:true};}
   // Profiles/support deletion after exact session disposal requires a named,
   // reviewed disposal source. The current final Guard provides none here.
   throw new Error('OWNED_QA_DISPOSAL_BRIDGE_REQUIRED');
  },
  async prepareOwnedRun(){await permit('qa-receipt');const r=await checked(()=>admin.rpc('qa_owned_prepare_internal',{p_plan:control.planId,p_run:control.runId}));requireOwned(r.ok===true&&r.reserved===57,'OWNED_RUN_RESERVATION_DENIED');return r;},
  async reserve({runId,operationId,scope,resourceKey}){
   if(control){requireOwned(runId===control.runId,'OWNED_RUN_MISMATCH');await permit('qa-receipt');const r=await checked(()=>admin.rpc('qa_owned_operation_internal',{p_run:runId,p_operation:operationId,p_scope:scope,p_key:resourceKey,p_state:'reserved',p_actual:'pending'}));requireOwned(r.ok===true&&r.operation_id===operationId,'OWNED_NO_RETRY');operations.set(operationId,{scope,resourceKey});return;}
   const rows=await write('qa-receipt',`/*qa-owned:reserve*/ INSERT INTO app_private.qa_owned_operations(run_id,operation_id,scope,resource_key,state,actual,history) VALUES($1,$2,$3,$4,'reserved','pending','[{"state":"reserved","actual":"pending"}]'::jsonb) ON CONFLICT DO NOTHING RETURNING operation_id`,[runId,operationId,scope,resourceKey]);
   requireOwned(rows.length===1&&rows[0].operation_id===operationId,'OWNED_NO_RETRY');
   const read=await query('/*qa-owned:operation*/ SELECT operation_id,scope,resource_key,state,actual,history FROM app_private.qa_owned_operations WHERE run_id=$1 AND operation_id=$2',[runId,operationId]);
   requireOwned(read.length===1&&read[0].state==='reserved'&&read[0].resource_key===resourceKey&&read[0].scope===scope,'RESERVATION_UNVERIFIED');
  },
  async mark({runId,operationId,state,actual}){
   if(control){const o=operations.get(operationId);requireOwned(runId===control.runId&&o,'OWNED_OPERATION_BINDING_REQUIRED');await permit('qa-receipt');const r=await checked(()=>admin.rpc('qa_owned_operation_internal',{p_run:runId,p_operation:operationId,p_scope:o.scope,p_key:o.resourceKey,p_state:state,p_actual:actual}));requireOwned(r.ok===true&&r.operation_id===operationId,'SETTLEMENT_UNVERIFIED');return;}
   requireOwned(['dispatched','completed','unknown'].includes(state)&&['pending','fulfilled','rejected'].includes(actual),'INVALID_SETTLEMENT');
   const rows=await write('qa-receipt',`/*qa-owned:mark*/ UPDATE app_private.qa_owned_operations SET state=CASE WHEN state='unknown' OR $3='unknown' THEN 'unknown' ELSE $3 END, actual=CASE WHEN actual<>'pending' THEN actual ELSE $4 END,history=history||jsonb_build_array(jsonb_build_object('state',$3::text,'actual',$4::text)) WHERE run_id=$1 AND operation_id=$2 AND (state<>'reserved' OR $3='dispatched') RETURNING operation_id`,[runId,operationId,state,actual]);
   requireOwned(rows.length===1&&rows[0].operation_id===operationId,'SETTLEMENT_UNVERIFIED');
  },
  async readAuth(uid){
   requireOwned(UUID.test(uid),'INVALID_UID');const data=await checked(()=>admin.auth.admin.getUserById(uid));
   const user=data.user;requireOwned(user?.id===uid&&typeof user.email==='string','OFFICIAL_GET_IDENTITY_MISMATCH');
   const rows=await query('/*qa-owned:auth-status*/ SELECT id,email,banned_until,deleted_at FROM auth.users WHERE id=$1',[uid]);
   requireOwned(rows.length===1&&rows[0].id===uid&&rows[0].email===user.email&&['banned_until','deleted_at'].every(k=>Object.hasOwn(rows[0],k)&&(rows[0][k]===null||typeof rows[0][k]==='string')),'AUTH_STATUS_UNVERIFIED');
   for(const k of ['banned_until','deleted_at']){requireOwned(!Object.hasOwn(user,k)||user[k]===rows[0][k],'AUTH_STATUS_MISMATCH');user[k]=rows[0][k];}
   return user;
  },
  async createOwned({email,password,marker}){
   requireOwned(typeof email==='string'&&typeof password==='string'&&marker&&UUID.test(marker.run_id)&&UUID.test(marker.source_id)&&UUID.test(marker.operation_id)&&UUID.test(marker.receipt_id),'CREATE_RECEIPT_REQUIRED');
   if(control){requireOwned(Object.keys(marker).sort().join(',')==='canonical_key,kind,operation_id,receipt_id,run_id,source_id'&&marker.run_id===control.runId,'OWNED_RUN_MISMATCH');const before=await checked(()=>admin.rpc('qa_owned_create_preflight_internal',{p_run:marker.run_id,p_source:marker.source_id,p_operation:marker.operation_id,p_receipt:marker.receipt_id,p_email:email}));requireOwned(before.ok===true&&before.source_id===marker.source_id,'OWNED_BEFORE_CREATE_DENIED');}
   await permit('qa-create');const data=await checked(()=>admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{...marker}}));
   requireOwned(UUID.test(data.user?.id)&&data.user.email===email,'CREATE_ENVELOPE_MISMATCH');return data.user;
  },
  async linkOwned({canonicalKey,uid,memberships,runId,sourceId}){
   if(control){requireOwned(runId===control.runId&&UUID.test(sourceId),'OWNED_SOURCE_RECEIPT_REQUIRED');await permit('qa-create');const r=await checked(()=>admin.rpc('qa_owned_bootstrap_internal',{p_run:runId,p_source:sourceId,p_uid:uid}));requireOwned(r.ok===true&&r.status==='linked'&&r.target_user_id===uid&&r.canonical_key===canonicalKey&&r.source_id===sourceId,'OWNED_LINK_UNVERIFIED');return r;}
   // Existing, documented product RPC, never a made-up bridge. Preflight denies
   // this native lifecycle before CREATE because this source excludes owned QA.
   await permit('qa-create');const data=await checked(()=>admin.rpc('account_provision_link_internal',{p_key:canonicalKey,p_auth_user:uid,p_memberships:memberships}));
   requireOwned(data.ok===true&&data.status==='linked'&&data.target_user_id===uid&&data.canonical_key===canonicalKey,'OWNED_LINK_UNVERIFIED');return data;
  },
  async loginOwned({email,password,uid}){
   const client=createClient(ORIGIN,publicKey,options);await permit('qa-session');
   const data=await checked(()=>client.auth.signInWithPassword({email,password}));
   const token=data.session?.access_token;requireOwned(typeof token==='string','NATIVE_SESSION_REQUIRED');
   const verified=await checked(()=>admin.auth.getUser(token));requireOwned(verified.user?.id===uid&&verified.user.email===email&&data.user?.id===uid,'SESSION_PROVIDER_IDENTITY_MISMATCH');
   let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{throw new Error('NATIVE_SESSION_REQUIRED');}
   requireOwned(UUID.test(claims.session_id)&&claims.sub===uid&&claims.iss===ORIGIN+'/auth/v1'&&claims.role==='authenticated','NATIVE_SESSION_REQUIRED');
   const rows=await query('/*qa-owned:session*/ SELECT id,user_id,created_at,not_after FROM auth.sessions WHERE id=$1 AND user_id=$2',[claims.session_id,uid]);
   requireOwned(rows.length===1&&rows[0].id===claims.session_id&&rows[0].user_id===uid&&typeof rows[0].created_at==='string'&&(rows[0].not_after===null||Date.parse(rows[0].not_after)>Date.now()),'NATIVE_SID_READBACK_REQUIRED');
   return {uid,sid:claims.session_id,token};
  },
  async persistRunManifest({runId,uid,canonicalKey,loginAlias,role,operationId,receiptId}){
   if(control){const r=await adapter.readManifest({runId,uid});requireOwned(r.canonical_key===canonicalKey&&r.login_alias===loginAlias&&r.role_code===role&&r.owned_creation_operation===operationId&&r.owned_creation_receipt_id===receiptId,'MANIFEST_READBACK_UNVERIFIED');return r;}
   const rows=await write('qa-receipt',`/*qa-owned:manifest*/ INSERT INTO app_private.qa_account_manifest(user_id,canonical_key,login_alias,principal_class,run_id,owned_creation_operation,owned_creation_receipt_id) VALUES($1,$2,$3,'current_owned_QA',$4,$5,$6) RETURNING user_id`,[uid,canonicalKey,loginAlias,runId,operationId,receiptId]);
   requireOwned(rows.length===1&&rows[0].user_id===uid,'MANIFEST_INSERT_UNVERIFIED');
   await write('qa-receipt','/*qa-owned:member*/ INSERT INTO app_private.qa_run_members(run_id,user_id,role_code,active) VALUES($1,$2,$3,true) RETURNING user_id',[runId,uid,role]);
   const proof=await adapter.readManifest({runId,uid});requireOwned(proof.canonical_key===canonicalKey&&proof.login_alias===loginAlias&&proof.owned_creation_operation===operationId&&proof.owned_creation_receipt_id===receiptId&&proof.role_code===role,'MANIFEST_READBACK_UNVERIFIED');return proof;
  },
  async readManifest({runId,uid}){
   const rows=await query(`/*qa-owned:manifest-read*/ SELECT m.*,x.role_code,x.active AS member_active,r.phase,r.active AS run_active,r.expires_at FROM app_private.qa_account_manifest m JOIN app_private.qa_run_members x ON (x.run_id,x.user_id)=(m.run_id,m.user_id) JOIN app_private.qa_runs r ON r.run_id=m.run_id WHERE m.run_id=$1 AND m.user_id=$2`,[runId,uid]);
   requireOwned(rows.length===1&&rows[0].principal_class==='current_owned_QA'&&rows[0].tombstoned_at===null&&rows[0].run_active===true&&rows[0].phase==='active'&&rows[0].member_active===true&&Date.parse(rows[0].expires_at)>Date.now(),'OWNED_RUN_MANIFEST_REQUIRED');return rows[0];
  },
  async testOwnedRead({uid,token}){
   const response=await checked(()=>admin.functions.invoke('transactions-api',{body:{action:'list',app:'new',token,page:1,page_size:10,tab:'all'}}));
   requireOwned(response.me?.user_id===uid&&Array.isArray(response.rows),'PRODUCT_READ_TEST_FAILED');
   return {uid,readListPassed:true,nativeRoleE2EAccepted:false};
  },
  async testOwnedBounded({runId,sourceId,session}){await adapter.testOwnedRead(session);await permit('qa-test');const r=await checked(()=>admin.rpc('qa_owned_test_internal',{p_run:runId,p_source:sourceId,p_sid:session.sid}));requireOwned(r.ok===true&&r.uid===session.uid&&r.sid===session.sid&&r.self_allowed===true&&r.protected_denied===true,'OWNED_BOUNDED_TEST_FAILED');return r;},
  async disposeOwnedSQL({runId,sourceId,uid}){requireOwned(!control,'DURABLE_DELETION_COORDINATOR_REQUIRED');await adapter.preflightOwnedCleanup();await permit('qa-cleanup');const r=await checked(()=>admin.rpc('qa_owned_dispose_internal',{p_run:runId,p_source:sourceId}));requireOwned(r.ok===true&&r.uid===uid&&r.db_absent===true,'OWNED_DISPOSAL_UNVERIFIED');return r;},
  async verifyOwnedAbsence({runId,sourceId,uid}){requireOwned(!control,'DURABLE_DELETION_COORDINATOR_REQUIRED');await adapter.assertAuthAbsent(uid);await adapter.assertSessionsAbsent(uid);await permit('qa-receipt');const r=await checked(()=>admin.rpc('qa_owned_absence_internal',{p_run:runId,p_source:sourceId}));requireOwned(r.ok===true&&r.uid===uid&&r.absent===true,'OWNED_ABSENCE_UNVERIFIED');return r;},
  async readOwnedDisposition({runId,sourceId,uid}){requireOwned(control&&runId===control.runId,'OWNED_RUN_MISMATCH');const rows=await query('/*qa-owned:disposition*/ SELECT user_id,state,auth_projection,source,create_operation,creation_receipt FROM app_private.qa_owned_sources WHERE run_id=$1 AND user_id=$2',[runId,uid]);requireOwned(rows.length===1&&rows[0].user_id===uid&&rows[0].source.sourceId===sourceId,'OWNED_EXACT_DISPOSITION_DENIED');return rows[0];},
  async completeOwnedRun(){await permit('qa-receipt');const r=await checked(()=>admin.rpc('qa_owned_complete_internal',{p_run:control.runId}));requireOwned(r.ok===true&&r.absent_resources===57&&r.ephemeral_rows===0&&r.pending===0,'OWNED_COMPLETION_UNVERIFIED');return r;},
  async readProtectedSnapshot({staffUIDs,legacyUIDs,faisalUID,canonicalKeys}){
   requireOwned(Array.isArray(staffUIDs)&&staffUIDs.length===57&&Array.isArray(legacyUIDs)&&legacyUIDs.length===8&&staffUIDs.includes(faisalUID)&&new Set([...staffUIDs,...legacyUIDs]).size===65&&[...staffUIDs,...legacyUIDs].every(u=>UUID.test(u))&&Array.isArray(canonicalKeys)&&canonicalKeys.length>=65,'PROTECTED_INVENTORY_REQUIRED');
   const uids=[...staffUIDs,...legacyUIDs].sort(),auth=[];
   for(const uid of uids){const u=await adapter.readAuth(uid);auth.push({id:u.id,email:u.email,email_confirmed_at:u.email_confirmed_at,banned_until:u.banned_until,deleted_at:u.deleted_at,user_metadata:u.user_metadata,app_metadata:u.app_metadata});}
   const projection=await query(`/*qa-owned:protected*/ SELECT jsonb_build_object('profiles',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) FROM public.profiles p WHERE p.id=ANY($1::uuid[])),'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.user_id,r.role_code),'[]'::jsonb) FROM public.user_roles r WHERE r.user_id=ANY($1::uuid[])),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.user_id,m.unit_id),'[]'::jsonb) FROM public.user_memberships m WHERE m.user_id=ANY($1::uuid[])),'permissions',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.user_id,p.permission_code),'[]'::jsonb) FROM public.user_permissions p WHERE p.user_id=ANY($1::uuid[])),'registry',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.canonical_key),'[]'::jsonb) FROM public.account_migration_users a WHERE a.migrated_user_id=ANY($1::uuid[]) OR a.canonical_key=ANY($2::text[])),'overrides',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.canonical_key,o.permission_code),'[]'::jsonb) FROM public.account_permission_overrides o WHERE o.canonical_key=ANY($2::text[]))) AS snapshot`,[uids,canonicalKeys]);
   requireOwned(projection.length===1&&['profiles','roles','memberships','permissions','registry','overrides'].every(k=>Array.isArray(projection[0].snapshot?.[k]))&&projection[0].snapshot.profiles.length===65&&projection[0].snapshot.profiles.some(p=>p.id===faisalUID&&p.must_change_password===false),'PROTECTED_SNAPSHOT_UNVERIFIED');
   return hash({auth,projection:projection[0].snapshot});
  },
  async readReceiptInventory(runId){
   requireOwned(UUID.test(runId),'INVALID_RUN');
   return query(`/*qa-owned:receipts*/ SELECT r.* FROM app_private.qa_owned_resources r JOIN app_private.qa_owned_operations o ON (o.run_id,o.operation_id)=(r.run_id,r.create_operation) WHERE r.run_id=$1 AND r.disposed_at IS NULL AND o.state='completed' AND o.actual='fulfilled' ORDER BY r.surface,r.pk::text`,[runId]);
  },
  exactRow,
  async fkCatalog(){
   return query(`/*qa-owned:fk*/ SELECT c.oid::text AS oid,c.conrelid::regclass::text AS child,c.confrelid::regclass::text AS parent,c.confdeltype AS delete_action,to_jsonb(ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.ord)) AS child_columns,to_jsonb(ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.ord)) AS parent_columns FROM pg_constraint c WHERE c.contype='f' ORDER BY c.oid`);
  },
  async incomingRows(fk,parentRow){
   requireOwned(Array.isArray(fk.child_columns)&&Array.isArray(fk.parent_columns)&&fk.child_columns.length>0&&fk.child_columns.length===fk.parent_columns.length,'FK_CATALOG_UNVERIFIED');
   requireOwned(fk.parent_columns.every(k=>Object.hasOwn(parentRow,k)),'FK_PARENT_PROJECTION_REQUIRED');
   // auth row reads project ONLY exact FK/PK fields, never a token/hash column.
   const columns=fk.child_columns;
   if(fk.child.startsWith('auth.')){
    const safe=new Set(['id','user_id','session_id','instance_id']);requireOwned(columns.every(c=>safe.has(c)),'AUTH_FK_PROJECTION_BLOCKED');
    const rows=await query(`/*qa-owned:incoming-auth*/ SELECT ${columns.map(ident).join(',')} FROM ${relation(fk.child)} WHERE ${columns.map((k,i)=>`${ident(k)}=$${i+1}`).join(' AND ')}`,fk.parent_columns.map(k=>parentRow[k]));
    return rows.map(row=>({row}));
   }
   return query(`/*qa-owned:incoming*/ SELECT to_jsonb(t) AS row FROM ${relation(fk.child)} t WHERE ${columns.map((k,i)=>`t.${ident(k)}=$${i+1}`).join(' AND ')}`,fk.parent_columns.map(k=>parentRow[k]));
  },
  async readPending(runId){
   const rows=await query(`/*qa-owned:pending*/ SELECT count(*)::int AS count FROM app_private.qa_owned_operations WHERE run_id=$1 AND (state IN ('reserved','dispatched','unknown') OR actual='pending')`,[runId]);
   requireOwned(rows.length===1&&Number.isSafeInteger(rows[0].count),'PENDING_UNVERIFIED');return rows[0].count;
  },
  async disposeOwnedSession({uid,sid,token}){
   const verified=await checked(()=>admin.auth.getUser(token));requireOwned(verified.user?.id===uid,'SESSION_OWNERSHIP_UNVERIFIED');
   let c;try{c=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{throw new Error('SESSION_OWNERSHIP_UNVERIFIED');}
   requireOwned(c.sub===uid&&c.session_id===sid&&c.iss===ORIGIN+'/auth/v1'&&c.role==='authenticated','SESSION_OWNERSHIP_UNVERIFIED');
   const rows=await query('/*qa-owned:session*/ SELECT id,user_id,created_at,not_after FROM auth.sessions WHERE id=$1 AND user_id=$2',[sid,uid]);requireOwned(rows.length===1,'SESSION_OWNERSHIP_UNVERIFIED');
   await permit('qa-session');const response=await admin.auth.admin.signOut(token,'local');requireOwned(response&&!response.error,'OWNED_SESSION_DISPOSAL_FAILED');
   const after=await query('/*qa-owned:session-absence*/ SELECT id FROM auth.sessions WHERE id=$1 AND user_id=$2',[sid,uid]);requireOwned(after.length===0,'OWNED_SESSION_STILL_PRESENT');
   const refresh=await query('/*qa-owned:refresh-absence*/ SELECT id FROM auth.refresh_tokens WHERE session_id=$1',[sid]);requireOwned(refresh.length===0,'OWNED_REFRESH_STILL_PRESENT');
   return {uid,sid,absent:true};
  },
  async deleteExact({receipt,row}){
   requireOwned(DELETE_SURFACES.includes(receipt.surface),'DELETE_SURFACE_DENIED');
   const current=await exactRow(receipt.surface,receipt.pk);requireOwned(current&&hash(current)===receipt.row_digest&&hash(row)===receipt.row_digest,'ROW_DRIFT');
   const keys=Object.keys(receipt.pk).sort();const values=keys.map(k=>receipt.pk[k]);values.push(stable(row));
   const rows=await write('qa-cleanup',`/*qa-owned:exact-delete*/ DELETE FROM ${relation(receipt.surface)} t WHERE ${keys.map((k,i)=>`t.${ident(k)}=$${i+1}`).join(' AND ')} AND to_jsonb(t)=$${values.length}::jsonb RETURNING ${keys.map(k=>`t.${ident(k)}`).join(',')}`,values);
   requireOwned(rows.length===1&&keys.every(k=>rows[0][k]===receipt.pk[k]),'EXACT_DELETE_UNVERIFIED');
   requireOwned(await exactRow(receipt.surface,receipt.pk)===null,'EXACT_ROW_STILL_PRESENT');return {absent:true};
  },
  // Historical standalone SDK primitive; controlled/native cleanup is coordinator-only.
  async deleteOwnedAuth(uid){requireOwned(!control,'DURABLE_DELETION_COORDINATOR_REQUIRED');requireOwned(UUID.test(uid),'INVALID_UID');await permit('qa-cleanup');await checked(()=>admin.auth.admin.deleteUser(uid,false));return {uid};},
  async assertAuthAbsent(uid){
   const result=await admin.auth.admin.getUserById(uid);
   requireOwned(result?.error?.status===404&&!result.data?.user,'OFFICIAL_AUTH_STILL_PRESENT');
   const rows=await query('/*qa-owned:auth-absence*/ SELECT id FROM auth.users WHERE id=$1',[uid]);requireOwned(rows.length===0,'DB_AUTH_STILL_PRESENT');return {uid,absent:true};
  },
  async assertSessionsAbsent(uid){
   const rows=await query('/*qa-owned:uid-sessions*/ SELECT id FROM auth.sessions WHERE user_id=$1',[uid]);requireOwned(rows.length===0,'OWNED_SESSIONS_STILL_PRESENT');return {uid,absent:true};
  }
 };
 branded.add(adapter);return Object.freeze(adapter);
}
