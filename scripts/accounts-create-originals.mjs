import {randomBytes,createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {planProvision,loadCanonicalStaffInventory,inventoryDigest,isOfficialAuthAdminAdapter} from './accounts-provision.mjs';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join,isAbsolute} from 'node:path';
import {mkdir,open} from 'node:fs/promises';

const SOURCE='717375eee1e99d558af80eca91a7ea7e829edd20';
const TARGET='https://movzojtnkkmdsjhmlgtq.supabase.co';
const FAISAL='0a1df502-9232-4ef5-af2d-df585ad7f187';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields=['canonical_key','login_username','preferred_login','display_name','role_code','org_name','dept_names','internal_email','eligible'];
const authFields=['id','email','email_confirmed_at','banned_until','deleted_at','app_metadata','user_metadata'];
const guardCodes=new WeakMap();
const guardError=code=>{const error=new Error(code);guardCodes.set(error,code);return error;};
const fail=code=>{throw guardError(code);};
const requireFact=(ok,code)=>{if(!ok)fail(code);};
const stableAuth=u=>Object.fromEntries(authFields.map(k=>[k,u?.[k]]));
const markerMatches=(value,marker)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(marker).every(k=>Object.hasOwn(value,k) && (marker[k] && typeof marker[k]==='object'?markerMatches(value[k],marker[k]):equal(value[k],marker[k])));
const immutable=row=>Object.fromEntries(fields.map(k=>[k,row?.[k]]));
const memberEqual=(a,b)=>a.unit_id===b.unit_id && a.membership_role===b.membership_role && a.is_primary===b.is_primary;
const publicCopy=v=>structuredClone(v);
const frozenCopy=v=>{const freeze=x=>{if(x && typeof x==='object'){for(const child of Object.values(x))freeze(child);Object.freeze(x);}return x;};return freeze(publicCopy(v));};

const journalWriters=new WeakMap();
/**
 * Nonsecret durable, cross-restart CREATE reservations. Use one Parent-approved
 * persistent shared directory for the exact project, not ephemeral storage.
 * Exclusive files + fsync; no lease, expiry, overwrite, delete or automatic retry.
 * Ambiguous failures leave claims in place for Parent read-only reconciliation.
 */
export function createOriginalStaffReceiptJournal({directory,canonicalKeys,targetProject='movzojtnkkmdsjhmlgtq'}={}){
  requireFact(typeof directory==='string' && isAbsolute(directory) && targetProject==='movzojtnkkmdsjhmlgtq' && Array.isArray(canonicalKeys) &&
    canonicalKeys.length>0 && canonicalKeys.length<=56 && new Set(canonicalKeys).size===canonicalKeys.length && canonicalKeys.every(k=>typeof k==='string' && /^[a-z][a-z0-9_]*$/.test(k) && k!=='faisal'),'invalid_receipt_journal');
  const ownedReservations=new Map(),ownedLinks=new Map();
  const allowed=new Set(canonicalKeys),root=resolve(directory),keys=['operation_id','sequence','phase','canonical_key','target_user_id','ownership_proven','can_retry_create'];
  const durableWrite=async(path,text)=>{let file;try{file=await open(path,'wx',0o600);await file.writeFile(text,'utf8');await file.sync();}finally{if(file)await file.close();}};
  const writer=async receipt=>{
    try{
      requireFact(receipt && Object.keys(receipt).length===keys.length && keys.every(k=>Object.hasOwn(receipt,k)) && UUID.test(receipt.operation_id) &&
        Number.isSafeInteger(receipt.sequence) && receipt.sequence>0 && allowed.has(receipt.canonical_key) &&
        ['create_intent','create_returned_unproven','auth_proven','link_intent','linked_verified','blocked','quarantined'].includes(receipt.phase) &&
        (receipt.target_user_id===null || UUID.test(receipt.target_user_id) && receipt.target_user_id.toLowerCase()!==FAISAL) &&
        typeof receipt.ownership_proven==='boolean' && receipt.can_retry_create===false,'invalid_nonsecret_receipt');
      const clean=Object.fromEntries(keys.map(k=>[k,receipt[k]])),content=JSON.stringify(clean)+'\n';
      if(['auth_proven','link_intent','linked_verified'].includes(clean.phase) && existsSync(join(root,`reservation-${clean.canonical_key}.json`)))requireFact(ownedReservations.get(clean.canonical_key)===clean.operation_id,'unsettled_prior_create_reservation');
      if(['auth_proven','link_intent','linked_verified'].includes(clean.phase) && existsSync(join(root,`link-reservation-${clean.canonical_key}.json`)))requireFact(ownedLinks.get(clean.canonical_key)===clean.operation_id && clean.phase!=='link_intent','unsettled_prior_link_reservation');
      await mkdir(root,{recursive:true});
      if(clean.phase==='create_intent'){
        requireFact(clean.target_user_id===null && clean.ownership_proven===false,'invalid_create_intent');
        try{await durableWrite(join(root,`reservation-${clean.canonical_key}.json`),content);}
        catch{return {persisted:false,operation_id:clean.operation_id,sequence:clean.sequence,write_allowed:false};}
      }
      if(clean.phase==='link_intent')await durableWrite(join(root,`link-reservation-${clean.canonical_key}.json`),content);
      await durableWrite(join(root,`${clean.operation_id}-${clean.sequence}.json`),content);
      if(clean.phase==='create_intent')ownedReservations.set(clean.canonical_key,clean.operation_id);
      if(clean.phase==='link_intent')ownedLinks.set(clean.canonical_key,clean.operation_id);
      return {persisted:true,operation_id:clean.operation_id,sequence:clean.sequence,write_allowed:clean.phase==='create_intent'};
    }catch{throw guardError('receipt_journal_unverified');}
  };
  journalWriters.set(writer,{reservation_domain:createHash('sha256').update(TARGET+'\n'+root).digest('hex')});
  Object.defineProperty(writer,'reservationDomain',{value:journalWriters.get(writer).reservation_domain});
  return Object.freeze(writer);
}

/**
 * Inert import; trusted backend-only dependency injection, NOT a request-body API.
 * prepared is the repaired planner's reviewed result including nonenumerable baseline.
 * Parent independently verifies exact source/key join and supplies short-lived approval.
 * No reset/update/delete methods are accepted or inspected. No native client, CLI,
 * env reads or network implementation. Synthetic test coverage is not native acceptance.
 * persistReceipt must durably reserve each create_intent by operation/key and return
 * {persisted:true,operation_id,sequence,write_allowed:true} exactly once. On restart,
 * deny prior uncertain intents; never turn can_retry_create:false into a retry.
 * deliver receives a nonenumerable password only for linked_verified identities;
 * explicit {acknowledged:true,operation_id,target_user_id} is the clearing boundary.
 * finalize('destroy') is a deliberate lifecycle decision, not recipient receipt.
 * Deadlines stop awaiting; they cannot cancel a transmitted provider mutation.
 * Adapter reads return plain nonsecret projections, or {data,error}; errors are checked.
 * linkCanonical maps ONLY to the reviewed service-role RPC ABI:
 * account_provision_link_internal(p_key text,p_auth_user uuid,p_memberships jsonb).
 */
export function createOriginalStaffExecutor({prepared,approval,port,persistReceipt,deliver,deadlineMs=30000,executionMode='real-apply',verifyIsolationReceipt}={}) {
  let baseline,plan,approved,initError;
  try {baseline=publicCopy(prepared?.baseline);plan=publicCopy(prepared?.plan);approved=publicCopy(approval);}catch{initError=true;}
  const pending=new Map(),used=new Set(),finished=new Set(),completed=new Map(),deliveryInFlight=new Set(),mutationsInFlight=new Set(),phases=new Map();
  const transition=(key,next,from)=>{requireFact(from.includes(phases.get(key)),'invalid_operation_phase');phases.set(key,next);};
  const result={status:'blocked',created:0,reused:0,receipts:[],needs_private_original_password_delivery:[]};
  let promise,sequence=0,currentKey=null,currentId=null,mutation=false,active=false,deliveryActive=false,deliveryLoopActive=false,deliveryAllowed=false,end=0;
  const target=()=>requireFact((port?.targetUrl===TARGET || port?.targetUrl===TARGET+'/') && approved?.target?.origin===TARGET &&
    approved.target.project_ref==='movzojtnkkmdsjhmlgtq' && approved.target.official_admin===true,'wrong_target');
  let realGateInitialized=false,destroyed=false;
  const activationGate=()=>{
    requireFact(['synthetic','real-apply'].includes(executionMode),'invalid_execution_mode');
    if(executionMode==='synthetic'){requireFact(port?.transportMode==='synthetic','synthetic_transport_required');return;}
    const r=approved?.isolation_approval;
    requireFact(r?.verdict==='APPROVED' && r.independent===true && r.issuer==='Parent' && UUID.test(r.receipt_id) &&
      r.project_ref==='movzojtnkkmdsjhmlgtq' && r.source_main===SOURCE && r.operation_id===approved.operation_id &&
      equal(r.canonical_keys,approved.canonical_keys) && Number.isSafeInteger(r.expires_at) && r.expires_at>Date.now() &&
      typeof verifyIsolationReceipt==='function','independent_isolation_approval_required');
    const i=approved.fresh_inventory;
    requireFact(i?.verified===true && i.pages_complete===true && i.official_get_verified===true &&
      i.project_ref===r.project_ref && Number.isSafeInteger(i.captured_at) && i.captured_at<=Date.now() &&
      Date.now()-i.captured_at<=60000 && Number.isSafeInteger(i.expires_at) && i.expires_at>Date.now() &&
      i.baseline_digest===inventoryDigest(baseline) && r.baseline_digest===i.baseline_digest,'fresh_verified_inventory_required');
    requireFact(isOfficialAuthAdminAdapter(port),'official_auth_admin_required');
    requireFact(journalWriters.has(persistReceipt) && r.reservation_domain===journalWriters.get(persistReceipt).reservation_domain,'durable_reservation_domain_required');
    if(!realGateInitialized){
      const inventory=loadCanonicalStaffInventory();
      requireFact(equal(inventory,baseline.staff_inventory),'canonical_source_join_required');
      for(const identity of inventory.identities){
        const row=baseline.registry.find(r=>r.canonical_key===identity.canonical_key);
        // Historical SQL is identity/mapping evidence, never current-login authority.
        // Current preferred/login usernames are preserved by the frozen live baseline.
        requireFact(row && ['display_name','role_code','org_name','dept_names','internal_email'].every(k=>equal(row[k],identity[k])),'canonical_mapping_conflict');
      }
      const hashes=Object.fromEntries(['accounts-create-originals.mjs','accounts-provision.mjs'].map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex')]));
      requireFact(equal(r.executor_hashes,hashes),'executor_source_receipt_mismatch');
      // Parent owns receipt authenticity (signature/approved exact receipt registry).
      // No boolean request-body approval or self-signed receipt is trusted here.
      requireFact(verifyIsolationReceipt(frozenCopy(r))===true,'independent_isolation_receipt_unverified');
      realGateInitialized=true;
    }
  };
  const gate=()=>{target();activationGate();requireFact(approved?.expires_at>Date.now(),'approval_expired');};
  const bounded=async(fn,args,ms,mutating=false,observe=null)=>{
    requireFact(ms>0,'deadline_exceeded');let timer;
    // Reserve synchronously; timeout ends only the waiter, never the real IO.
    const reservation={};if(mutating)mutationsInFlight.add(reservation);
    const actual=Promise.resolve().then(()=>fn(...args)).then(r=>{
      requireFact(!r?.error,'adapter_error');const value=r && Object.hasOwn(r,'data')?r.data:r;
      if(observe)observe(value);return value;
    }).finally(()=>{if(mutating)mutationsInFlight.delete(reservation);});
    try {return await Promise.race([actual,new Promise((_,reject)=>{timer=setTimeout(()=>reject(guardError('deadline_exceeded')),ms);})]);}
    finally{clearTimeout(timer);}
  };
  const call=async(fn,...args)=>{gate();return bounded(fn,args,end-Date.now());};
  const write=async(fn,args,observe=null)=>{gate();return bounded(fn,args,end-Date.now(),true,observe);};
  const receipt=async(phase,owned=false,recovery=false)=>{
    const origins={create_intent:['preflight'],create_returned_unproven:['create_in_flight'],auth_proven:['preflight','create_returned_unproven'],link_intent:['auth_proven'],linked_verified:['link_in_flight']};
    if(origins[phase])transition(currentKey,phase,origins[phase]);
    else{requireFact(['blocked','quarantined'].includes(phase),'invalid_receipt_phase');phases.set(currentKey,phase);}
    const r={operation_id:approved.operation_id,sequence:++sequence,phase,canonical_key:currentKey,target_user_id:currentId,ownership_proven:owned,can_retry_create:false};
    result.receipts.push(r);target();const ack=recovery?await bounded(persistReceipt,[publicCopy(r)],Math.min(deadlineMs,100),true):await write(persistReceipt,[publicCopy(r)]);
    requireFact(ack?.persisted===true && ack.operation_id===r.operation_id && ack.sequence===r.sequence,'receipt_not_persisted');
    if(phase==='create_intent')requireFact(ack.write_allowed===true,'one_shot_create_reservation_required');
  };
  const readUser=async(account,id)=>{
    const u=await call(port.auth.getUserById.bind(port.auth),id);
    requireFact(u && u.id===id && u.email===account.internal_email,'auth_identity_conflict');
    const missing=['banned_until','deleted_at'].filter(k=>!Object.hasOwn(u,k));
    if(missing.length){
      requireFact(typeof port.readAuthStatusFacts==='function','auth_status_unknown');
      const facts=await call(port.readAuthStatusFacts.bind(port),id,account.internal_email);
      requireFact(facts?.id===id && facts.email===account.internal_email && ['banned_until','deleted_at'].every(k=>Object.hasOwn(facts,k) && (facts[k]===null || typeof facts[k]==='string' && facts[k].length>0)),'auth_status_facts_conflict');
      for(const k of ['banned_until','deleted_at']){if(Object.hasOwn(u,k))requireFact(u[k]===facts[k],'auth_status_facts_conflict');else u[k]=facts[k];}
    }
    return u;
  };
  const checkUser=(account,u,id,marker=null)=>{
    requireFact(u && UUID.test(u.id) && u.id===id && u.id.toLowerCase()!==FAISAL && u.email===account.internal_email,'auth_identity_conflict');
    requireFact(['banned_until','deleted_at'].every(k=>Object.hasOwn(u,k) && (u[k]===null || typeof u[k]==='string' && u[k].length>0)),'auth_status_unknown');
    requireFact(typeof u.email_confirmed_at==='string' && u.email_confirmed_at.length>0 && u.banned_until===null && u.deleted_at===null,'auth_not_ready');
    requireFact(u.app_metadata && typeof u.app_metadata==='object' && !Array.isArray(u.app_metadata) && u.user_metadata && typeof u.user_metadata==='object' && !Array.isArray(u.user_metadata),'auth_metadata_unknown');
    if(marker)requireFact(markerMatches(u.user_metadata,marker),'registration_marker_conflict');
  };
  const projection=(a,s,linked,id)=>{
    const original=baseline.registry.find(r=>r.canonical_key===a.canonical_key);
    requireFact(s && equal(immutable(s.registry),immutable(original)),'registry_drift');
    requireFact(s.registry.migrated_user_id===(linked?id:null) && s.registry.must_change_password===true,'link_or_flag_conflict');
    requireFact(['roles','memberships','permission_overrides','page_overrides','login_conflicts'].every(k=>Array.isArray(s[k])) && s.login_conflicts.length===0,'projection_unknown');
    requireFact(equal(s.permission_overrides,baseline.accounts[a.canonical_key].projection.permission_overrides) && equal(s.page_overrides,baseline.accounts[a.canonical_key].projection.page_overrides),'override_drift');
    if(linked || s.profile){const p=s.profile;requireFact(p && p.id===id && p.active===true && p.login_name===a.preferred_login && p.full_name===a.display_name && p.must_change_password===true,'profile_conflict');}
    if(linked)requireFact(s.registry.profile_active===true && s.registry.profile_must_change===true,'forced_flag_conflict');
    requireFact(s.roles.length<=1 && s.roles.every(r=>r?.role_code===a.role_code && r.is_primary===true),'role_conflict');
    requireFact(s.memberships.every((m,i,all)=>m?.active===true && a.memberships.some(e=>memberEqual(e,m)) && all.findIndex(n=>memberEqual(m,n))===i),'membership_conflict');
    if(linked)requireFact(s.roles.length===1 && s.memberships.length===a.memberships.length,'authorization_incomplete');
    requireFact(s.credential_generation===0 && s.has_password_operations===false,'credential_state_conflict');
  };
  const checkCompleted=async(registry=null)=>{
    for(const [key,c] of completed){
      if(registry)requireFact(equal(registry.find(r=>r.canonical_key===key),c.projection.registry),'completed_registry_drift');
      const s=await call(port.readAccount.bind(port),key,c.user.id);
      requireFact(equal(s,c.projection),'completed_projection_drift');
      const u=await readUser(c.account,c.user.id);checkUser(c.account,u,c.user.id);
      requireFact(equal(stableAuth(u),c.user),'completed_auth_drift');
    }
  };
  const reconcile=async()=>{
    const registry=await call(port.registry.bind(port)),units=await call(port.units.bind(port)),inventory=await call(port.listAllUsers.bind(port));
    requireFact(inventory?.complete===true && Array.isArray(inventory.users),'incomplete_auth_inventory');
    requireFact(equal(units,baseline.units),'unit_drift');
    // Completed snapshots own the oracle before generic forced-flag classification.
    await checkCompleted(registry);
    const fresh=planProvision(registry,inventory.users,units,baseline.staff_inventory);
    requireFact(fresh.status==='ready',fresh.blocked?.code??'planner_blocked');
    requireFact(registry.length===baseline.registry.length,'registry_drift');
    for(const original of baseline.registry){
      const row=registry.find(r=>r.canonical_key===original.canonical_key);
      requireFact(equal(immutable(row),immutable(original)),'registry_drift');
      if(!finished.has(original.canonical_key)) requireFact(equal(row,original),'original_row_drift');
    }
    // Preserve ALL existing original links verbatim, not just Faisal or template roles.
    for(const a of plan.accounts.filter(a=>!['create','reuse'].includes(a.action))){
      const s=await call(port.readAccount.bind(port),a.canonical_key,a.auth_user_id);
      requireFact(equal(s,baseline.accounts[a.canonical_key].projection),'protected_projection_drift');
      const u=await readUser(a,a.auth_user_id);
      requireFact(equal(stableAuth(u),stableAuth(baseline.accounts[a.canonical_key].user)),'protected_auth_drift');
    }
    for(const key of approved.canonical_keys.filter(k=>!finished.has(k))){
      const a=fresh.accounts.find(a=>a.canonical_key===key),expected=plan.accounts.find(a=>a.canonical_key===key);
      requireFact(a && ['create','reuse'].includes(a.action) && equal(a,expected),'stale_plan');
    }
    return fresh;
  };
  const deliverPending=async(internal=false)=>{
    if(deliveryActive || active && !internal)return {status:'busy',pending:pending.size};
    if(!internal && !deliveryAllowed)return {status:'quarantined',pending:pending.size};
    deliveryActive=true;deliveryLoopActive=true;let deliveryValidated=false;
    if(!internal)end=Date.now()+deadlineMs;
    try {
    if(!pending.size){await reconcile();deliveryValidated=true;}
    for(const [id,c] of pending){
      if(!c.verified)continue;
      currentKey=c.canonical_key;currentId=c.target_user_id;deliveryValidated=false;
      // Previous delivery/ACK may have changed any protected or completed fact.
      await reconcile();deliveryValidated=true;
      gate();requireFact(end-Date.now()>0,'deadline_exceeded');
      const transfer=Object.freeze({candidate:c,id,operation_id:approved.operation_id});
      // A deadline only stops awaiting. Keep the reservation until the real IO settles.
      transition(c.canonical_key,'delivery_in_flight',['linked_verified','awaiting_ack']);
      deliveryInFlight.add(transfer);
      const actual=Promise.resolve().then(()=>deliver(c)).then(raw=>{
        requireFact(!raw?.error,'adapter_error');
        const ack=raw && Object.hasOwn(raw,'data')?raw.data:raw;
        if(ack?.acknowledged===true && ack.operation_id===transfer.operation_id && ack.target_user_id===transfer.id && pending.get(transfer.id)===transfer.candidate){
          transfer.candidate.password=null;pending.delete(transfer.id);phases.set(transfer.candidate.canonical_key,'acknowledged');
        }
        if(pending.get(transfer.id)===transfer.candidate)phases.set(transfer.candidate.canonical_key,'awaiting_ack');
        return ack;
      }).catch(error=>{if(pending.get(transfer.id)===transfer.candidate)phases.set(transfer.candidate.canonical_key,'awaiting_ack');throw error;}).finally(()=>{deliveryInFlight.delete(transfer);if(!deliveryLoopActive && !deliveryInFlight.size)deliveryActive=false;});
      await bounded(()=>actual,[],end-Date.now());
    }
    return {status:pending.size?'quarantined':'delivered',pending:pending.size};
    }catch(error){if(!deliveryValidated){
      deliveryAllowed=false;if(internal)throw error;
      result.status='quarantined';result.blocked={canonical_key:currentKey,code:guardCodes.get(error)??'uncertain_adapter_outcome'};
      try{if(currentKey)await receipt('quarantined',false,true);}catch{result.receipt_persistence_failed=true;}
      return {status:'quarantined',pending:pending.size,blocked:publicCopy(result.blocked)};
    }return {status:'quarantined',pending:pending.size};}finally{deliveryLoopActive=false;if(!deliveryInFlight.size)deliveryActive=false;}
  };
  const runOnce=async()=>{
    active=true;end=Date.now()+deadlineMs;
    try {
      requireFact(!destroyed,'executor_finalized');
      requireFact(Number.isSafeInteger(deadlineMs) && deadlineMs>0 && deadlineMs<=300000,'invalid_deadline');
      requireFact(!initError && prepared?.status==='reviewed' && baseline && plan?.status==='ready','reviewed_plan_required');
      requireFact(approved?.approved===true && approved.current_source===true && approved.source_main===SOURCE && UUID.test(approved.operation_id),'parent_approval_required');
      gate();
      requireFact(equal(approved.staff_inventory,baseline.staff_inventory),'staff_inventory_mismatch');
      requireFact(equal(plan,planProvision(baseline.registry,baseline.users,baseline.units,baseline.staff_inventory)),'plan_baseline_mismatch');
      requireFact(plan.accounts.every(a=>baseline.accounts[a.canonical_key]?.projection),'baseline_incomplete');
      requireFact(Array.isArray(approved.canonical_keys) && approved.canonical_keys.length>0 && new Set(approved.canonical_keys).size===approved.canonical_keys.length,'invalid_scope');
      for(const key of approved.canonical_keys){const a=plan.accounts.find(a=>a.canonical_key===key);requireFact(a && key!=='faisal' && ['create','reuse'].includes(a.action) && a.auth_user_id!==FAISAL,'create_reuse_only');}
      requireFact(['registry','units','listAllUsers','readAccount','linkCanonical'].every(k=>typeof port[k]==='function') && typeof port.auth?.getUserById==='function' && typeof port.auth?.createUser==='function' && typeof persistReceipt==='function' && typeof deliver==='function','invalid_adapter');
      for(const key of approved.canonical_keys){
        currentKey=key;currentId=null;transition(key,'preflight',[undefined]);
        let a=(await reconcile()).accounts.find(a=>a.canonical_key===key);
        let id=a.auth_user_id,user,marker=null;
        projection(a,await call(port.readAccount.bind(port),key,id),false,id);
        if(a.action==='create'){
          await receipt('create_intent');
          // The durable writer may yield to another provisioning operation.
          a=(await reconcile()).accounts.find(x=>x.canonical_key===key);
          requireFact(a?.action==='create','duplicate_pre_dispatch');
          let password,fingerprint;
          do{password='';while(password.length<20){for(const byte of randomBytes(32)){if(byte<188 && password.length<20)password+=String.fromCharCode(33+byte%94);}}
            fingerprint=createHash('sha256').update(password).digest('hex');
          }while(!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password) || used.has(fingerprint));
          used.add(fingerprint);
          const c={operation_id:approved.operation_id,canonical_key:key,target_user_id:null};
          Object.defineProperties(c,{password:{value:password,writable:true},verified:{value:false,writable:true}});pending.set(key,c);
          marker={original_registration:{operation_id:approved.operation_id,source_main:SOURCE}};
          mutation=true;
          transition(key,'create_in_flight',['create_intent']);
          const created=await write(port.auth.createUser.bind(port.auth),[{email:a.internal_email,email_confirm:true,password,user_metadata:publicCopy(marker)}],observed=>{
            // Late return records an observed UID only: never link, deliver or claim ownership.
            if(UUID.test(observed?.id)){currentId=observed.id;c.target_user_id=observed.id;}
          });
          await receipt('create_returned_unproven');
          requireFact(created && UUID.test(created.id) && created.id.toLowerCase()!==FAISAL && created.email===a.internal_email && markerMatches(created.user_metadata,marker),'create_identity_conflict');
          id=created.id;pending.delete(key);pending.set(id,c);
        }
        currentId=id;
        user=await readUser(a,id);checkUser(a,user,id,marker);
        if(a.action==='reuse')requireFact(equal(stableAuth(user),stableAuth(baseline.accounts[key].user)),'reuse_auth_drift');
        await receipt('auth_proven',a.action==='create');
        await receipt('link_intent',a.action==='create');
        // Reconcile AFTER the last durable await, immediately before atomic link.
        const registry=await call(port.registry.bind(port)),inventory=await call(port.listAllUsers.bind(port));
        requireFact(inventory?.complete===true && Array.isArray(inventory.users),'incomplete_auth_inventory');
        const units=await call(port.units.bind(port));requireFact(equal(units,baseline.units),'unit_drift');
        requireFact(registry.length===baseline.registry.length,'registry_drift');
        for(const original of baseline.registry){
          const row=registry.find(r=>r.canonical_key===original.canonical_key);
          requireFact(equal(immutable(row),immutable(original)),'registry_drift');
          if(!finished.has(original.canonical_key))requireFact(equal(row,original),'original_row_drift');
        }
        const fresh=planProvision(registry,inventory.users,units,baseline.staff_inventory);
        requireFact(fresh.status==='ready',fresh.blocked?.code??'planner_blocked');
        const live=fresh.accounts.find(x=>x.canonical_key===key);
        requireFact(live?.action==='reuse' && live.auth_user_id===id,'link_identity_conflict');
        // Existing protected state must still match, not restored from snapshots.
        for(const p of plan.accounts.filter(p=>!['create','reuse'].includes(p.action))){
          requireFact(equal(await call(port.readAccount.bind(port),p.canonical_key,p.auth_user_id),baseline.accounts[p.canonical_key].projection),'protected_projection_drift');
          requireFact(equal(stableAuth(await readUser(p,p.auth_user_id)),stableAuth(baseline.accounts[p.canonical_key].user)),'protected_auth_drift');
        }
        projection(a,await call(port.readAccount.bind(port),key,id),false,id);
        await checkCompleted(await call(port.registry.bind(port)));
        const dispatchUser=await readUser(a,id);checkUser(a,dispatchUser,id,marker);
        requireFact(equal(stableAuth(dispatchUser),stableAuth(user)),'pre_dispatch_auth_drift');
        mutation=true;
        transition(key,'link_in_flight',['link_intent']);
        const linked=await write(port.linkCanonical.bind(port),[{p_key:key,p_auth_user:id,p_memberships:publicCopy(a.memberships)}]);
        requireFact(linked?.ok===true && ['linked','already_linked'].includes(linked.status) && linked.target_user_id===id && linked.canonical_key===key && linked.login_username===a.login_username,'link_result_conflict');
        const persisted=await readUser(a,id);checkUser(a,persisted,id,marker);
        requireFact(equal(stableAuth(persisted),stableAuth(user)),'persisted_auth_drift');
        const linkedProjection=await call(port.readAccount.bind(port),key,id);
        projection(a,linkedProjection,true,id);
        const after=await call(port.registry.bind(port));requireFact(Array.isArray(after) && after.length===baseline.registry.length,'registry_drift');
        for(const original of baseline.registry){
          const row=after.find(r=>r.canonical_key===original.canonical_key);requireFact(equal(immutable(row),immutable(original)),'registry_drift');
          if(original.canonical_key!==key && !finished.has(original.canonical_key))requireFact(equal(row,original),'original_row_drift');
        }
        for(const p of plan.accounts.filter(p=>!['create','reuse'].includes(p.action))){
          requireFact(equal(await call(port.readAccount.bind(port),p.canonical_key,p.auth_user_id),baseline.accounts[p.canonical_key].projection),'protected_projection_drift');
          requireFact(equal(stableAuth(await readUser(p,p.auth_user_id)),stableAuth(baseline.accounts[p.canonical_key].user)),'protected_auth_drift');
        }
        await receipt('linked_verified',a.action==='create');finished.add(key);
        completed.set(key,frozenCopy({account:a,user:stableAuth(persisted),projection:linkedProjection}));
        if(a.action==='create'){result.created++;pending.get(id).verified=true;}
        else {result.reused++;result.needs_private_original_password_delivery.push({canonical_key:key,target_user_id:id});}
      }
      deliveryAllowed=true;
      const delivery=await deliverPending(true);
      result.status=delivery.status==='quarantined' || pending.size?'quarantined':result.reused?'needs_private_original_password_delivery':'completed';
    }catch(error){deliveryAllowed=false;result.status=mutation?'quarantined':'blocked';result.blocked={canonical_key:currentKey,code:guardCodes.get(error)??'uncertain_adapter_outcome'};
      try{if(currentKey)await receipt(result.status,false,true);}catch{result.receipt_persistence_failed=true;}
    }finally{active=false;}
    if(!pending.size)used.clear();
    return publicCopy(result);
  };
  return Object.freeze({run(){if(!promise)promise=runOnce();return promise;},deliverPending:()=>deliverPending(false),pendingCount:()=>pending.size,
    state:()=>publicCopy({phases:Object.fromEntries(phases),mutating_io:mutationsInFlight.size,delivery_io:deliveryInFlight.size,pending:pending.size,finalized:destroyed}),
    finalize(decision){requireFact(!active && !deliveryActive && !deliveryInFlight.size && !mutationsInFlight.size && decision==='destroy','explicit_final_decision_required');for(const c of pending.values()){c.password=null;phases.set(c.canonical_key,'destroyed');}pending.clear();used.clear();completed.clear();deliveryAllowed=false;destroyed=true;}});
}

// CLI is local-only. Real apply must be a reviewed Parent-owned server adapter,
// never env credentials, a direct CLI fallback, a login or a retired reset path.
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length===3 && process.argv[2]==='--synthetic-self-test'){
    void (async()=>{try{
      await import('../tests/accounts_executor_deny_network.mjs');
      const {fixture}=await import('../tests/accounts_executor_fixture.mjs');
      const f=await fixture(Array.from({length:47},(_,i)=>`person_${i+10}`));
      const runner=f.build({deadlineMs:30000});const r=await runner.run();
      const out={synthetic:true,status:r.status,created:r.created,reused:r.reused,
        auth_create_dispatches:f.calls.filter(c=>c==='createUser').length,
        canonical_link_dispatches:f.calls.filter(c=>c==='linkCanonical').length,pending:runner.pendingCount()};
      runner.finalize('destroy');f.delivered.length=0;
      process.stdout.write(JSON.stringify(out)+'\n');if(r.status!=='completed' || r.created!==47)process.exitCode=1;
    }catch{process.stdout.write(JSON.stringify({synthetic:true,status:'blocked',code:'synthetic_self_test_failed'})+'\n');process.exitCode=1;}})();
  }else{process.stdout.write(JSON.stringify({status:'blocked',code:'parent_owned_real_apply_adapter_required',target_project_ref:'movzojtnkkmdsjhmlgtq'})+'\n');process.exitCode=2;}
}
