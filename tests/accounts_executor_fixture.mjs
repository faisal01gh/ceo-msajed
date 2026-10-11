import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionAccounts } from '../scripts/accounts-provision.mjs';
import { createOriginalStaffExecutor } from '../scripts/accounts-create-originals.mjs';
import {generateKeyPairSync,sign} from 'node:crypto';
import * as reset from '../scripts/accounts-official-reset.mjs';
const SOURCE = '717375eee1e99d558af80eca91a7ea7e829edd20';
const TARGET = 'https://movzojtnkkmdsjhmlgtq.supabase.co';
const F = '0a1df502-9232-4ef5-af2d-df585ad7f187';
const OP = '20000000-0000-4000-8000-000000000001';
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = v => structuredClone(v);
globalThis.fetch = async () => { throw Error('synthetic_network_forbidden'); };
// Entire inventory is synthetic. No native identity or credentials loaded.
async function fixture(keys=['person_10']) {
  const inventory = {source_main:SOURCE,authority:'parent-approved-original-staff-keys',canonical_keys:['faisal',...Array.from({length:56},(_,i)=>`person_${i+1}`)]};
  const units=[{id:uuid(100),name:'مكتب الرئيس التنفيذي',unit_type:'office',parent_id:null,active:true}];
  const rows=Array.from({length:57},(_,i)=>({canonical_key:i?`person_${i}`:'faisal',login_username:i?`ameen${i}`:'faisal',preferred_login:`اسم مصدر ${i}`,display_name:`موظف مصدر ${i}`,role_code:i?'employee':'ceo_office_manager',org_name:units[0].name,dept_names:[units[0].name],internal_email:i?`person-${i}@msajed.local`:'faisal@msajed.local',eligible:true,migrated_user_id:i===0?F:i<10?uuid(i):null,must_change_password:i!==0,profile_active:i<10?true:null,profile_must_change:i<10?i!==0:null}));
  const users=rows.filter(r=>r.migrated_user_id).map(r=>({id:r.migrated_user_id,email:r.internal_email,email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{untouched:true}}));
  const projections=new Map();
  const calls=[], receipts=[], delivered=[];
  const snapshot=(key,id)=>{const r=rows.find(r=>r.canonical_key===key);return clone(projections.get(key)??{registry:r,profile:null,roles:[],memberships:[],permission_overrides:[],page_overrides:[],login_conflicts:[],credential_generation:0,has_password_operations:false});};
  for(const r of rows.filter(r=>r.migrated_user_id)) projections.set(r.canonical_key,{registry:r,profile:{id:r.migrated_user_id,login_name:r.preferred_login,full_name:r.display_name,active:true,must_change_password:r.must_change_password},roles:[{role_code:r.role_code,is_primary:true}],memberships:[{unit_id:uuid(100),membership_role:'member',is_primary:true,active:true}],permission_overrides:[{opaque:'preserved'}],page_overrides:[],login_conflicts:[],credential_generation:0,has_password_operations:false});
  projections.get('faisal').memberships[0].membership_role='office';
  const port={targetUrl:TARGET,transportMode:'synthetic',
    async registry(){calls.push('registry');return clone(rows);},async units(){return clone(units);},
    async listAllUsers(){calls.push('listAllUsers');const pages=[];for(let i=0;i<users.length;i+=3)pages.push(...clone(users.slice(i,i+3)));return {complete:true,users:pages};},
    async readAccount(key,id){calls.push('readAccount');return snapshot(key,id);},
    auth:{async getUserById(id){calls.push('getUserById');return clone(users.find(u=>u.id===id));},
      async createUser(payload){calls.push('createUser');assert.equal(payload.email_confirm,true);assert.deepEqual(Object.keys(payload).sort(),['email','email_confirm','password','user_metadata']);assert.ok(Array.from(payload.password).length>=8);for(const re of [/[A-Z]/,/[a-z]/,/[0-9]/,/[^A-Za-z0-9]/])assert.match(payload.password,re);const u={id:uuid(1000+users.length),email:payload.email,email_confirmed_at:'persisted',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:clone(payload.user_metadata)};users.push(u);return {...clone(u),email_confirmed_at:'create-envelope',created_at:'different'};}},
    async linkCanonical(payload){calls.push('linkCanonical');assert.deepEqual(Object.keys(payload).sort(),['p_auth_user','p_key','p_memberships']);const r=rows.find(r=>r.canonical_key===payload.p_key);r.migrated_user_id=payload.p_auth_user;r.profile_active=true;r.profile_must_change=true;projections.set(r.canonical_key,{registry:r,profile:{id:r.migrated_user_id,login_name:r.preferred_login,full_name:r.display_name,active:true,must_change_password:true},roles:[{role_code:r.role_code,is_primary:true}],memberships:payload.p_memberships.map(m=>({...m,active:true})),permission_overrides:[],page_overrides:[],login_conflicts:[],credential_generation:0,has_password_operations:false});return {ok:true,status:'linked',target_user_id:r.migrated_user_id,canonical_key:r.canonical_key,login_username:r.login_username};}};
  const prepared=await provisionAccounts(port,()=>{}, {mode:'plan-only',staffInventory:inventory});
  assert.equal(prepared.status,'reviewed');calls.length=0;
  const approval={approved:true,current_source:true,source_main:SOURCE,staff_inventory:inventory,canonical_keys:keys,operation_id:OP,expires_at:Date.now()+60000,target:{origin:TARGET,project_ref:'movzojtnkkmdsjhmlgtq',official_admin:true}};
  const callbacks={async persistReceipt(r){receipts.push(clone(r));return {persisted:true,operation_id:r.operation_id,sequence:r.sequence,write_allowed:r.phase==='create_intent'};},async deliver(c){delivered.push({id:c.target_user_id,password:c.password});assert.equal(JSON.stringify(c).includes(c.password),false);return {acknowledged:true,operation_id:c.operation_id,target_user_id:c.target_user_id};}};
  const build=(options={})=>createOriginalStaffExecutor({prepared,approval,port,...callbacks,deadlineMs:5000,executionMode:'synthetic',...options});
  return {rows,users,projections,port,prepared,approval,callbacks,calls,receipts,delivered,build};
}


export {fixture, OP, uuid};
// Ephemeral fixture signing key: NEVER a native gate or real authorization.
export function checkedResetFixture(f,{available=true}={}){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const proof={version:1,verdict:'APPROVED',independent:true,reviewer_id:'offline-independent-fixture',evidence_kind:'synthetic-only',project_ref:'movzojtnkkmdsjhmlgtq',endpoint:'account-admin-reset-password',operation_id:OP,canonical_keys:['person_10'],issued_at:Date.now()-1,expires_at:Date.now()+60000,source_hashes:reset.officialResetSourceHashes(),edge_version:7,native_qa_proof:{reset_completed:true,candidate_binding_verified:true,forced_change_completed:true,old_session_denied:true,logout_verified:true,cleanup_verified:true,exit_code:0}};
 const seal=p=>{const payload=JSON.stringify(p);return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};
 const calls=[];
 const functions={url:TARGET+'/functions/v1',async invoke(name,options){calls.push({name,options});if(f){f.calls.push(name);const c=options.body;const u=f.users.find(u=>u.email===f.rows.find(r=>r.canonical_key===c.target_key).internal_email);u.app_metadata={...u.app_metadata,msajed_password_operation:c.operation_id,msajed_password_generation:1};const s=f.projections.get(c.target_key);s.credential_generation=1;s.has_password_operations=true;return {data:{ok:true,operation_id:c.operation_id,login_username:f.rows[10].login_username,must_change_password:true},error:null};}return {data:{ok:true,operation_id:options.body.operation_id,login_username:'ameen10',must_change_password:true},error:null};}};
 const client={supabaseUrl:TARGET,functions};
 const availability=async()=>({project_ref:'movzojtnkkmdsjhmlgtq',endpoint:proof.endpoint,status:available?'ACTIVE':'UNAVAILABLE',version:7,source_hashes:reset.officialResetSourceHashes()});
 const build=(options={})=>reset.createOfficialAccountResetAdapter({client,targetUrl:TARGET,accessToken:'synthetic-memory-token',signedQaResetReceipt:seal(proof),trustedReviewerPublicKey:publicKey,operationId:OP,canonicalKeys:['person_10'],readAvailability:availability,executionMode:'synthetic',...options});
 return {build,proof,seal,publicKey,calls,client,functions,availability};
}
