// Actual repository lifecycle + actual pinned SDK + actual native owned SQL.
// Synthetic Auth/Edge transports and VM-only authority/SDK-loader seams.
// NO native approval/real provider/real target request is performed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {fixture,id,ORIGIN} from './lifecycle.test-fixture.mjs';
import {PGlite} from 'file:///C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/parent-integration/local-adapter.mjs';
const OUT='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/finding2-completion';
fs.mkdirSync(OUT,{recursive:true});
const source=fs.readFileSync(new URL('./owned-control.sql',import.meta.url),'utf8');
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=x=>createHash('sha256').update(stable(x)).digest('hex');
const sourceHash=createHash('sha256').update(source).digest('hex');
const db=new PGlite();let result,phase='setup';const calls=[],countertests=[];let creates=0,logins=0;const users=new Map();let bootstrapCounters=false,testCounters=false,disposeCounters=false;let diagnostic=null;let holdCreate=null;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const assertTarget=async()=>{const i=await scalar("SELECT jsonb_build_object('db',current_database(),'addr',host(inet_server_addr()),'port',inet_server_port(),'dir',current_setting('data_directory'),'listen',current_setting('listen_addresses'),'foreigns',(SELECT count(*)::int FROM pg_foreign_server),'others',(SELECT count(*)::int FROM pg_stat_activity WHERE client_addr IS NOT NULL AND pid<>pg_backend_pid()))");assert.deepEqual(i,{db:'qa_isolation_step3_integrated_20261009',addr:'127.0.0.1',port:51771,dir:'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-local-postgres-ordering/data',listen:'127.0.0.1',foreigns:0,others:0});};
const snapshot=async()=>scalar("SELECT jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.profiles x),'registry',(SELECT jsonb_agg(to_jsonb(x) ORDER BY canonical_key) FROM public.account_migration_users x),'roles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY user_id,role_code) FROM public.user_roles x),'memberships',(SELECT jsonb_agg(to_jsonb(x) ORDER BY user_id,unit_id,membership_role) FROM public.user_memberships x),'permissions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY user_id,permission_code) FROM public.user_permissions x),'overrides',(SELECT jsonb_agg(to_jsonb(x) ORDER BY canonical_key,permission_code) FROM public.account_permission_overrides x),'defaults',(SELECT jsonb_agg(to_jsonb(x) ORDER BY role_code,permission_code) FROM public.role_permissions x),'auth',(SELECT jsonb_agg(jsonb_build_object('id',id,'email',email) ORDER BY id) FROM auth.users),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM auth.sessions x))");
const response=(data,status=200)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});
const rpc=async(name,args)=>{
 await assertTarget();const keys=Object.keys(args);await db.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true),set_config('request.headers','{}',true)");await db.exec('SET LOCAL ROLE service_role');
 let failed=false;try{return await scalar(`SELECT public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]));}catch(e){failed=true;throw e;}finally{try{await db.exec('RESET ROLE');}catch(e){if(!failed)throw e;}}
};
const deny=async(name,work,codes=['42501','55000','23503','P0002'])=>{
 const before=await snapshot();await db.exec('SAVEPOINT owned_negative');let failure;
 try{await work();}catch(e){failure=e;}finally{await db.exec('ROLLBACK TO SAVEPOINT owned_negative;RESET ROLE;RELEASE SAVEPOINT owned_negative');}
 if(!failure||!codes.includes(failure.code))diagnostic={counter:name,SQLSTATE:failure?.code||null,message:failure?.message||'unexpected success'};
 assert(failure,name+' unexpectedly succeeded');assert(codes.includes(failure.code),name+': '+failure.code);assert.deepEqual(await snapshot(),before,name+' changed protected tables');countertests.push({name,SQLSTATE:failure.code,zeroProtectedEffects:true});
};
try{
 await db.verified;await assertTarget();await db.exec('BEGIN');
 const before=await snapshot();const oldGuard=await scalar("SELECT pg_get_functiondef('app_private.qa_reference_guard_before_row()'::regprocedure)");
 const abiBefore=(await db.query("SELECT oid::text,proowner::text,proacl::text,proconfig,provolatile,prosecdef,pg_get_function_arguments(oid) args,pg_get_function_result(oid) result FROM pg_proc WHERE oid='app_private.qa_reference_guard_before_row()'::regprocedure")).rows;
 await assertTarget();await db.exec("ALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb NOT NULL DEFAULT '{}',ADD COLUMN created_at timestamptz,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN banned_until timestamptz,ADD COLUMN deleted_at timestamptz;CREATE TABLE auth.refresh_tokens(id bigint PRIMARY KEY,session_id uuid REFERENCES auth.sessions(id));");
 await db.exec(source.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
 await db.exec('CREATE TRIGGER qa_owned_fixture_roles BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();CREATE TRIGGER qa_owned_fixture_memberships BEFORE INSERT OR UPDATE OR DELETE ON public.user_memberships FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();');
 const newGuard=await scalar("SELECT pg_get_functiondef('app_private.qa_reference_guard_before_row()'::regprocedure)");
 assert.equal(newGuard.replace(/^ IF app_private\.qa_owned_consume.*\r?\n/m,''),oldGuard);
 const abiAfter=(await db.query("SELECT oid::text,proowner::text,proacl::text,proconfig,provolatile,prosecdef,pg_get_function_arguments(oid) args,pg_get_function_result(oid) result FROM pg_proc WHERE oid='app_private.qa_reference_guard_before_row()'::regprocedure")).rows;assert.deepEqual(abiAfter,abiBefore);
 const protectedUIDs=(await db.query('SELECT id FROM auth.users ORDER BY id')).rows.map(r=>r.id);assert.equal(protectedUIDs.length,65);
 const protectedCanonicalKeys=(await db.query('SELECT canonical_key FROM public.account_migration_users ORDER BY canonical_key')).rows.map(r=>r.canonical_key);
 const units=(await db.query('SELECT to_jsonb(t) row FROM public.organizational_units t ORDER BY id')).rows.map(r=>r.row);
 const unit=units.find(u=>u.unit_type==='department').id;
 const roles=['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'];
 const runId=id(96000),planId=id(96001);
 const resources=Array.from({length:57},(_,i)=>({runId,kind:i<50?'owned-load-qa':'owned-role-e2e',sourceId:id(96100+i),createOperation:id(96200+i),receiptId:id(96300+i),canonicalKey:'owned-sdk-proof-'+i,loginAlias:'owned-sdk-proof-'+i,displayName:'synthetic owned SDK '+i,email:'owned-sdk-proof-'+i+'@fixture.invalid',role:i<50?'employee':roles[i-50],memberships:[{unit_id:unit,membership_role:'member',is_primary:true}]}));
 const rolePlanDigest=hash({resources,units});resources.forEach(r=>r.rolePlanDigest=rolePlanDigest);
 const identity=await rpc('qa_owned_identity_snapshot_internal',{});
 const {RUNTIME_OWNED_METADATA_SELECT,canonicalMetadataHash}=await import('../qa-runtime-provenance.mjs');
 const primary=(await db.query(RUNTIME_OWNED_METADATA_SELECT)).rows;assert.equal(primary.length,1);assert.deepEqual(primary[0].metadata.controlIdentity,identity.snapshot,'independent controller projection differs from actual runtime metadata');assert.equal(primary[0].control_identity_digest,identity.digest);
 const ownedMetadataHash=canonicalMetadataHash(primary[0].metadata),ownedControllerIdentityDigest=primary[0].control_identity_digest;
 const sourceHashes=Object.fromEntries(['owned-control.sql','owned-deletion-fence.sql'].map(n=>[n,createHash('sha256').update(fs.readFileSync(new URL(n,import.meta.url))).digest('hex')]));
 const plan={runId,resources,units,protectedUIDs,protectedCanonicalKeys,controlIdentityDigest:identity.digest,rolePlanDigest,sourceHash,sourceHashes};
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');const payload=stable(plan),signature=sign(null,Buffer.from('QA-OWNED-ROLEPLAN-v1\n'+payload),privateKey).toString('base64');
 // This anchor belongs ONLY to the rollback fixture; no real approval is minted.
 await assertTarget();await db.query("INSERT INTO app_private.qa_owned_approved_plans VALUES($1,$2::jsonb,$3,$4,$5,clock_timestamp()+interval '1 hour')",[planId,payload,signature,createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex'),sourceHash]);
 const transport=async(input,init={})=>{
  const url=new URL(String(input));assert.equal(url.origin,ORIGIN);const method=init.method||'GET';calls.push({method,path:url.pathname});
  const matched=/^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
  if(matched){
   const name=matched[1],a=JSON.parse(init.body||'{}');assert.match(name,/^qa_owned_/);
   if(name==='qa_owned_bootstrap_internal'&&!bootstrapCounters){
    bootstrapCounters=true;
    await deny('protected-existing-UID bootstrap denies',()=>rpc(name,{...a,p_uid:protectedUIDs[0]}));
    await deny('foreign/unreserved run bootstrap denies',()=>rpc(name,{...a,p_run:id(99999)}));
    await deny('non-persisted UID bootstrap denies',()=>rpc(name,{...a,p_uid:id(99998)}));
    await deny('service caller cannot INSERT private native frame',async()=>{await db.exec('SET LOCAL ROLE service_role');await db.exec("INSERT INTO app_private.qa_owned_frames(backend_pid,sql_xid,source_oid,run_id,source_id,phase) VALUES(pg_backend_pid(),pg_current_xact_id(),'public.qa_owned_bootstrap_internal(uuid,uuid,uuid)'::regprocedure,'"+a.p_run+"','"+a.p_source+"','bootstrap')");});
    await deny('service caller cannot INSERT role-plan anchor',async()=>{await db.exec('SET LOCAL ROLE service_role');await db.exec("INSERT INTO app_private.qa_owned_approved_plans VALUES('"+id(99997)+"','{}','fake',repeat('a',64),repeat('b',64),clock_timestamp())");});
    for(const role of ['anon','authenticated'])await deny(role+' has no bootstrap EXECUTE',async()=>{await db.exec('SET LOCAL ROLE '+role);await db.query('SELECT public.qa_owned_bootstrap_internal($1,$2,$3)',[a.p_run,a.p_source,a.p_uid]);});
    await deny('new BEFORE INSERT suppressor rejects admission without old-trigger disable',async()=>{await db.exec('CREATE FUNCTION public.owned_fixture_suppress() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER owned_fixture_suppress BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.owned_fixture_suppress();');await rpc(name,a);});
    await deny('unfinished private frame fails native deferred FK closure',async()=>{await db.query("INSERT INTO app_private.qa_owned_frames(backend_pid,sql_xid,source_oid,run_id,source_id,phase) VALUES(pg_backend_pid(),pg_current_xact_id(),'public.qa_owned_bootstrap_internal(uuid,uuid,uuid)'::regprocedure,$1,$2,'bootstrap')",[a.p_run,a.p_source]);await db.exec('SET CONSTRAINTS app_private.qa_owned_native_closure IMMEDIATE');},['23503']);
    await deny('duplicate durable CREATE reservation denies',()=>rpc('qa_owned_operation_internal',{p_run:a.p_run,p_operation:resources[0].createOperation,p_scope:'create',p_key:a.p_source,p_state:'reserved',p_actual:'pending'}),['23505']);
   }
   if(name==='qa_owned_test_internal'&&!testCounters){
    testCounters=true;const uid=await scalar('SELECT user_id FROM app_private.qa_owned_sources WHERE run_id=$1 AND source_id=$2',[a.p_run,a.p_source]);
    await deny('reentrant/replayed bootstrap refuses already-issued source',()=>rpc('qa_owned_bootstrap_internal',{p_run:a.p_run,p_source:a.p_source,p_uid:uid}));
    await deny('wrong native SID bounded test denies',()=>rpc(name,{...a,p_sid:id(99996)}));
    const ordinary=(await db.query("SELECT s.user_id uid,s.id sid FROM auth.sessions s JOIN public.profiles p ON p.id=s.user_id WHERE app_private.qa_session_live(s.user_id,s.id,clock_timestamp()) AND (SELECT class='ORDINARY' FROM app_private.qa_identity_class(s.user_id)) ORDER BY s.id LIMIT 1")).rows[0];if(!ordinary)diagnostic={counter:'ordinary readiness',message:'positive ordinary native actor absent in existing fixture'};assert(ordinary,'positive ordinary native actor required');
    const actor=async(u,sid)=>{await db.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true),set_config('request.headers',$1,true)",[JSON.stringify({'x-qa-actor-user':u,'x-qa-actor-sid':sid})]);await db.exec('SET LOCAL ROLE service_role');};
    await deny('positive ordinary native actor still cannot write QA profile',async()=>{await actor(ordinary.uid,ordinary.sid);await db.query("UPDATE public.profiles SET full_name='foreign' WHERE id=$1",[uid]);});
    await deny('positive QA native actor still cannot write protected ordinary profile',async()=>{await actor(uid,a.p_sid);await db.query("UPDATE public.profiles SET full_name='foreign' WHERE id=$1",[ordinary.uid]);});
    await deny('owned row drift invalidates role/session test without restoring protected data',async()=>{await actor(uid,a.p_sid);await db.query("UPDATE public.profiles SET full_name='own drift' WHERE id=$1",[uid]);await db.exec('RESET ROLE');await rpc(name,a);});
   }
   if(name==='qa_owned_dispose_internal'&&!disposeCounters){
    disposeCounters=true;const uid=await scalar('SELECT user_id FROM app_private.qa_owned_sources WHERE run_id=$1 AND source_id=$2',[a.p_run,a.p_source]);
    await deny('foreign FK referencing exact Auth UID prevents disposal',async()=>{await db.exec('CREATE TABLE public.owned_fk_probe(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id));');await db.query('INSERT INTO public.owned_fk_probe VALUES($1,$2)',[id(99994),uid]);await rpc(name,a);});
    await deny('foreign non-FK nested canonical reference prevents disposal',async()=>{await db.exec('CREATE TABLE public.owned_nonfk_probe(id uuid PRIMARY KEY,refs jsonb);');await db.query('INSERT INTO public.owned_nonfk_probe VALUES($1,$2::jsonb)',[id(99993),{canonical:resources[0].canonicalKey}]);await rpc(name,a);});
    await deny('mismatched source disposal cannot clean another resource',()=>rpc(name,{...a,p_source:id(99992)}));
   }
   return response(await rpc(name,a));
  }
  if(url.pathname==='/auth/v1/admin/users'&&method==='POST'){
   await assertTarget();const p=JSON.parse(init.body),uid=id(97000+ ++creates);
   await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data,created_at,email_confirmed_at) VALUES($1,$2,$3::jsonb,'{\"provider\":\"email\"}',clock_timestamp(),clock_timestamp())",[uid,p.email,p.user_metadata]);
   const row=(await db.query('SELECT id,email,raw_user_meta_data user_metadata,raw_app_meta_data app_metadata,created_at,email_confirmed_at,banned_until,deleted_at FROM auth.users WHERE id=$1',[uid])).rows[0];users.set(uid,row);if(holdCreate)await holdCreate;return response(row);
  }
  const admin=/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(url.pathname);
  if(admin){const uid=admin[1];
   if(method==='DELETE'){await assertTarget();await db.query('DELETE FROM auth.users WHERE id=$1 RETURNING id',[uid]);users.delete(uid);return response({});}
   const row=(await db.query('SELECT id,email,raw_user_meta_data user_metadata,raw_app_meta_data app_metadata,created_at,email_confirmed_at,banned_until,deleted_at FROM auth.users WHERE id=$1',[uid])).rows[0];return row?response(row):response({msg:'User not found'},404);
  }
  if(url.pathname==='/auth/v1/token'){
   const p=JSON.parse(init.body),u=[...users.values()].find(u=>u.email===p.email);assert(u);const sid=id(98000+ ++logins);await assertTarget();await db.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES($1,$2,clock_timestamp())',[sid,u.id]);
   const token=['header',Buffer.from(JSON.stringify({sub:u.id,session_id:sid,iss:ORIGIN+'/auth/v1',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic-not-provider-signature'].join('.');
   return response({user:u,access_token:token,refresh_token:'synthetic-memory-only',token_type:'bearer',expires_in:3600});
  }
  if(url.pathname==='/auth/v1/user'||url.pathname==='/auth/v1/logout'){
   const token=new Headers(init.headers).get('Authorization')?.replace(/^Bearer /,'');const c=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
   if(url.pathname.endsWith('/user'))return response(users.get(c.sub));
   assert.equal(url.searchParams.get('scope'),'local');await assertTarget();await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2 RETURNING id',[c.session_id,c.sub]);return response(null,204);
  }
  if(url.pathname==='/functions/v1/transactions-api'){
   const p=JSON.parse(init.body),c=JSON.parse(Buffer.from(p.token.split('.')[1],'base64url'));
   const allowed=await scalar('SELECT allowed FROM app_private.qa_scope_internal($1,$1)',[c.sub]);assert.equal(allowed,true);
   return response({me:{user_id:c.sub},rows:[]});
  }
  throw new Error('UNKNOWN_OFFLINE_PROVIDER_PATH');
 };
 phase='SDK-lifecycle';const f=await fixture({sqlTransport:db,providerTransport:transport,nativeFactory:true,ownedMetadataHash,ownedControllerIdentityDigest,ownedControl:{planId,runId,identityDigest:identity.digest,rolePlanDigest,reviewerPublicKey:publicKey.export({type:'spki',format:'pem'}),signedPlan:{payload,signature}}});
 const population=f.lifecycle.compileOwnedPopulation({runId,resources,protectedUIDs,protectedCanonicalKeys,rolePlanDigest});
 // Actual SDK physical response custody + actual native SQL monotonic journal.
 await db.exec('SAVEPOINT owned_unknown_fixture');await f.adapter.preflightOwnedBootstrap({population});await f.adapter.prepareOwnedRun();
 let releaseCreate;holdCreate=new Promise(resolve=>releaseCreate=resolve);
 const uncertain=new f.OwnedIO({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,inventoryDigest:rolePlanDigest,deadlineMs:500});
 const r0=resources[0],marker0={run_id:runId,source_id:r0.sourceId,operation_id:r0.createOperation,receipt_id:r0.receiptId,canonical_key:r0.canonicalKey,kind:r0.kind};
 await assert.rejects(uncertain.write({runId,operationId:r0.createOperation,scope:'create',resourceKey:r0.sourceId},()=>f.adapter.createOwned({email:r0.email,password:'SyntheticUnknownFixture!Aa9',marker:marker0})),/OWNED_MUTATION_QUARANTINED/);
 assert.equal(uncertain.snapshot().pending,1);assert.equal(uncertain.snapshot().quarantined,true);
 assert.equal(await scalar('SELECT state FROM app_private.qa_owned_operations WHERE run_id=$1 AND operation_id=$2',[runId,r0.createOperation]),'unknown');
 const uncertainCreates=creates;await db.exec('SAVEPOINT owned_retry');const nextWorker=new f.OwnedIO({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,inventoryDigest:rolePlanDigest,deadlineMs:500});
 await assert.rejects(nextWorker.write({runId,operationId:r0.createOperation,scope:'create',resourceKey:r0.sourceId},()=>f.adapter.createOwned({email:r0.email,password:'SyntheticUnknownFixture!Aa9',marker:marker0})));
 await db.exec('ROLLBACK TO SAVEPOINT owned_retry;RESET ROLE;RELEASE SAVEPOINT owned_retry');assert.equal(creates,uncertainCreates);
 releaseCreate();holdCreate=null;const drainBefore=Date.now()+10000;while(uncertain.snapshot().pending&&Date.now()<drainBefore)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(uncertain.snapshot().pending,0);
 const durable=(await db.query('SELECT state,actual,history FROM app_private.qa_owned_operations WHERE run_id=$1 AND operation_id=$2',[runId,r0.createOperation])).rows[0];assert.equal(durable.state,'unknown');assert.equal(durable.actual,'fulfilled');assert.equal(await f.adapter.readPending(runId),1);
 fs.writeFileSync(OUT+'/UNKNOWN_NATIVE_SQL_SDK.json',JSON.stringify({SDK:'2.57.4',nativeAuthorization:0,physicalStarted:1,callerTimedOut:true,latePhysicalFulfilled:true,nativeJournalState:durable.state,nativeJournalActual:durable.actual,nativeJournalHistory:durable.history,createAttempts:uncertainCreates,noRetryProviderDispatch:true,processRestartClaimed:false},null,2));
 await db.exec('ROLLBACK TO SAVEPOINT owned_unknown_fixture;RESET ROLE;RELEASE SAVEPOINT owned_unknown_fixture');users.clear();
 const beforePositiveCreates=creates;
 const candidates=new Map(resources.map(r=>[r.sourceId,'SyntheticFixtureOnly!Aa9']));
 result=await f.lifecycle.runOwnedNativeLifecycle({adapter:f.adapter,runtimeAuthority:f.runtimeAuthority,population,privateCandidates:candidates,deadlineMs:15000});
 assert.equal(result.status,'complete',JSON.stringify({status:result.status,created:result.resourcesCreated,tested:result.testsExecuted,cleaned:result.resourcesCleaned}));
 assert.equal(creates-beforePositiveCreates,57);assert.equal(result.resourcesCreated,57);assert.equal(result.testsExecuted,57);assert.equal(result.resourcesCleaned,57);assert.equal(candidates.size,0);
 assert.deepEqual(await snapshot(),before);
 assert.equal(await scalar('SELECT count(*)::int FROM app_private.qa_owned_frames'),0);assert.equal(await scalar('SELECT count(*)::int FROM app_private.qa_owned_sources'),0);assert.equal(await scalar('SELECT count(*)::int FROM app_private.qa_owned_resources'),0);assert.equal(await scalar('SELECT count(*)::int FROM app_private.qa_owned_operations'),0);
 await db.exec('SET CONSTRAINTS app_private.qa_owned_native_closure IMMEDIATE');
 const abi=(await db.query("SELECT p.oid::text,pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) result,pg_get_functiondef(p.oid) definition,p.proacl::text,p.proowner::regrole::text owner FROM pg_proc p WHERE proname LIKE 'qa_owned_%' AND oid IS DISTINCT FROM to_regprocedure('public.qa_owned_session_check_internal(uuid,uuid,uuid,bigint,uuid)') ORDER BY oid")).rows;
 fs.writeFileSync(OUT+'/NEW_SQL_ABI.json',JSON.stringify(abi,null,2));
 fs.writeFileSync(OUT+'/SDK57_RESULT.json',JSON.stringify({status:'PASS_LOCAL_ROLLBACK_FIXTURE',nativeAuthorization:0,providerCalls:0,sourceHash,identityDigest:identity.digest,resources:result.proofs,terminal:result.terminal,countertests,counts:{countertests:countertests.length,totalCreateDispatches:creates,positiveCreates:creates-beforePositiveCreates,logins,resourceTests:result.testsExecuted,cleaned:result.resourcesCleaned,rpc:calls.filter(c=>c.path.startsWith('/rest/v1/rpc/')).length,providerSDKCalls:calls.filter(c=>c.path.startsWith('/auth/')).length,edgeSDKCalls:calls.filter(c=>c.path.startsWith('/functions/')).length,authorityAssertions:f.state.gates.length},SDK:'2.57.4',metadataABIUnchanged:true,oldGuardBranchesByteEquivalent:true},null,2));
 console.log(JSON.stringify({status:'PASS_LOCAL_SQL_SDK_57',counts:{countertests:countertests.length,totalCreateDispatches:creates,positiveCreates:creates-beforePositiveCreates,logins,tested:result.testsExecuted,cleaned:result.resourcesCleaned,rpc:calls.filter(c=>c.path.startsWith('/rest/v1/rpc/')).length},nativeAuthorization:0}));
}catch(e){fs.writeFileSync(OUT+'/SDK57_FAILURE.json',JSON.stringify({phase,name:e.name,code:e.code||null,message:e.message,diagnostic,countertests,lastCalls:calls.slice(-8),result:result?{status:result.status,created:result.resourcesCreated,tested:result.testsExecuted,cleaned:result.resourcesCleaned}:null},null,2));console.error(JSON.stringify({phase,name:e.name,code:e.code||null,message:e.message,diagnostic,countertests,lastCalls:calls.slice(-8)}));process.exitCode=1;}
finally{try{await db.exec('ROLLBACK;RESET ROLE');}finally{await db.close();}}
