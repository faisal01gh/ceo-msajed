// Executes pinned real SDK against an in-memory transport; Deno deny-net.
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import * as reset from '../scripts/accounts-official-reset.mjs';
assert.equal(typeof reset.createAccountResetActorPreflight,'function','read-only current native actor preflight must exist');
const {createAccountResetActorPreflight}=reset;
const target='https://movzojtnkkmdsjhmlgtq.supabase.co',uid='10000000-0000-4000-8000-000000000700',sid='10000000-0000-4000-8000-000000000701';
const permission='profiles.admin_reset_password';
const claims={sub:uid,iss:target+'/auth/v1',role:'authenticated',session_id:sid,exp:Math.floor(Date.now()/1000)+60,iat:Math.floor(Date.now()/1000)-1};
const token='fixture.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fixture';
let mode='ready',checks=0,permissionReads=0;const calls=[];
const transport=async(input,init)=>{
 const url=new URL(String(input));calls.push({path:url.pathname,method:init?.method??'GET'});
 let data;
 if(url.pathname==='/auth/v1/user'){assert.equal(init.headers.Authorization,'Bearer '+token);data={id:mode==='wrong-uid'?sid:uid,email:'offline-actor@fixture.invalid'};}
 else if(url.pathname==='/rest/v1/rpc/account_session_check_internal'){checks++;const body=JSON.parse(init.body);assert.deepEqual(body,{p_user:uid,p_session:sid,p_allow_forced:false});data=mode==='cutoff'||mode==='postawait-cutoff'&&checks>1?false:true;}
 else if(url.pathname==='/rest/v1/profiles')data=mode==='inactive'?{id:uid,active:false,must_change_password:false}:{id:uid,active:true,must_change_password:false};
 else if(url.pathname==='/rest/v1/account_migration_users')data={canonical_key:'office_fixture',migrated_user_id:uid,eligible:true,must_change_password:false};
 else if(url.pathname==='/rest/v1/user_roles')data=mode==='no-office'?[]:[{user_id:uid,role_code:'ceo_office_manager'}];
 else if(url.pathname==='/rest/v1/user_permissions')data=mode==='user-deny'?[{user_id:uid,permission_code:permission,effect:'deny'}]:[];
 else if(url.pathname==='/rest/v1/account_permission_overrides')data=mode==='canonical-deny'?[{canonical_key:'office_fixture',permission_code:permission,effect:'deny'}]:[];
 else if(url.pathname==='/rest/v1/role_permissions'){permissionReads++;data=mode==='no-role-permission'||mode==='postawait-permission'&&permissionReads>1?[]:[{role_code:'ceo_office_manager',permission_code:permission}];}
 else assert.fail('unallowlisted SDK request '+url.pathname);
 return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
};
const client=createClient(target,'synthetic-service-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}});
const preflight=createAccountResetActorPreflight({client,accessToken:token});
await preflight();assert.ok(checks>=2);
for(const denied of ['wrong-uid','cutoff','postawait-cutoff','inactive','no-office','user-deny','canonical-deny','no-role-permission','postawait-permission']){mode=denied;checks=0;permissionReads=0;await assert.rejects(()=>preflight());}
assert.equal(calls.filter(c=>c.path.includes('functions')||!['GET','POST'].includes(c.method)).length,0);
assert.ok(calls.filter(c=>c.method==='POST').every(c=>c.path==='/rest/v1/rpc/account_session_check_internal'));
// Actual pinned FunctionsClient serialization, not an object-only invoke mock.
const outer='20000000-0000-4000-8000-000000000001',resetId='20000000-0000-4000-8000-000000000002';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const proof={version:1,verdict:'APPROVED',independent:true,reviewer_id:'offline-sdk-fixture',evidence_kind:'synthetic-only',project_ref:'movzojtnkkmdsjhmlgtq',endpoint:'account-admin-reset-password',operation_id:outer,canonical_keys:['person_10'],issued_at:Date.now()-1,expires_at:Date.now()+60000,source_hashes:reset.officialResetSourceHashes(),edge_version:7,native_qa_proof:{reset_completed:true,candidate_binding_verified:true,forced_change_completed:true,old_session_denied:true,logout_verified:true,cleanup_verified:true,exit_code:0}};
const payload=JSON.stringify(proof),requests=[];
const invokeTransport=async(input,init)=>{
 assert.equal(String(input),target+'/functions/v1/account-admin-reset-password');
 const headers=new Headers(init.headers);assert.equal(headers.get('Authorization'),'Bearer '+token);
 const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['new_password','operation_id','target_key']);assert.equal(body.operation_id,resetId);assert.equal(body.target_key,'person_10');
 requests.push('reset');return new Response(JSON.stringify({ok:true,operation_id:resetId,login_username:'offline10',must_change_password:true}),{headers:{'content-type':'application/json'}});
};
const invokeClient=createClient(target,'synthetic-service-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:invokeTransport}});
const adapter=reset.createOfficialAccountResetAdapter({client:invokeClient,targetUrl:target,accessToken:token,operationId:outer,canonicalKeys:['person_10'],executionMode:'synthetic',trustedReviewerPublicKey:publicKey,signedQaResetReceipt:{payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')},readAvailability:async()=>({project_ref:proof.project_ref,endpoint:proof.endpoint,status:'ACTIVE',version:7,source_hashes:reset.officialResetSourceHashes()})});
assert.equal(reset.isNativeOfficialAccountResetAdapter(adapter),false);
await adapter.assertAvailable({canonical_key:'person_10',target_user_id:uid,operation_id:outer});
const candidate={canonical_key:'person_10',target_user_id:uid,operation_id:resetId};Object.defineProperty(candidate,'password',{value:'OfflineOnly-A7!xxxx'});
assert.equal((await adapter.reset(candidate)).must_change_password,true);await assert.rejects(()=>adapter.reset(candidate));assert.equal(requests.length,1);
console.log(JSON.stringify({sdk:'@supabase/supabase-js@2.57.4',offline:true,positive:2,negative:9,networkDenied:true,mutations:0,syntheticResetDispatches:1}));
