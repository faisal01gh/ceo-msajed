import './accounts_executor_deny_network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import * as reset from '../scripts/accounts-official-reset.mjs';
import {OP,uuid,checkedResetFixture} from './accounts_executor_fixture.mjs';

test('official reset adapter uses only current checked product functions.invoke ABI',async()=>{
 assert.equal(typeof reset.createOfficialAccountResetAdapter,'function');const f=checkedResetFixture();const adapter=f.build();
 assert.equal(reset.isOfficialAccountResetAdapter(adapter),true);assert.equal(reset.isOfficialAccountResetAdapter({...adapter}),false);
 await adapter.assertAvailable({canonical_key:'person_10',target_user_id:uuid(777),operation_id:OP});
 const c={canonical_key:'person_10',target_user_id:uuid(777),operation_id:uuid(888)};Object.defineProperty(c,'password',{value:'SyntheticOnly-A7!xxxx'});
 const r=await adapter.reset(c);assert.equal(r.must_change_password,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'account-admin-reset-password');
 assert.deepEqual(Object.keys(f.calls[0].options.body).sort(),['new_password','operation_id','target_key']);assert.equal(f.calls[0].options.body.operation_id,c.operation_id);
 await assert.rejects(()=>adapter.reset(c));assert.equal(f.calls.length,1);
});
test('concurrent original-operation reconciliation reserves before read awaits',async()=>{
 const f=checkedResetFixture();let release;const held=new Promise(r=>release=r);let reads=0;
 const c={canonical_key:'person_10',target_user_id:uuid(777),operation_id:uuid(888),internal_email:'person-10@msajed.local'};Object.defineProperty(c,'password',{value:'SyntheticOnly-A7!xxxx',writable:true});
 f.client.rpc=async()=>{reads++;await held;return {data:{operation_id:c.operation_id,target_user_id:c.target_user_id,canonical_key:c.canonical_key,generation:1,status:'completed',write_allowed:false},error:null};};
 f.client.auth={admin:{getUserById:async()=>({data:{user:{id:c.target_user_id,email:c.internal_email,app_metadata:{msajed_password_operation:c.operation_id,msajed_password_generation:1}}},error:null})}};
 const adapter=f.build();await adapter.assertAvailable({...c,operation_id:OP});await adapter.reset(c);
 const a=adapter.reconcile(c),b=adapter.reconcile(c);await new Promise(r=>setTimeout(r,0));release();await Promise.all([a,b]);
 assert.equal(reads,1);assert.equal(f.calls.length,2,'exactly one original reset plus one official reconciliation');
});

test('native-shaped reset receipt without genuine runtime authority and owned SDK cannot activate real apply',()=>{
 const f=checkedResetFixture();f.proof.evidence_kind='owned-native-qa-reset';assert.throws(()=>f.build({executionMode:'real-apply'}));assert.equal(f.calls.length,0);
});

// Supplemental guard coverage: these invariants already pass the new flow.
for(const kind of ['canonical-key','UID','case-folded-UID'])test(`official reset protects Faisal by ${kind} independently`,async()=>{
 const f=checkedResetFixture(),adapter=f.build();const scope={canonical_key:kind==='canonical-key'?'faisal':'person_10',target_user_id:kind==='canonical-key'?uuid(777):'0a1df502-9232-4ef5-af2d-df585ad7f187',operation_id:OP};
 if(kind==='case-folded-UID')scope.target_user_id=scope.target_user_id.toUpperCase();await assert.rejects(()=>adapter.assertAvailable(scope));assert.equal(f.calls.length,0);
});
for(const field of ['target','invoke','version','source'])test(`availability ${field} drift is fail-closed before endpoint POST`,async()=>{
 const f=checkedResetFixture();const adapter=f.build({readAvailability:async()=>{const r=await f.availability();if(field==='target')f.client.supabaseUrl='https://wrong.invalid';if(field==='invoke')f.functions.invoke=async()=>({});if(field==='version')r.version++;if(field==='source')r.source_hashes={};return r;}});
 await assert.rejects(()=>adapter.assertAvailable({canonical_key:'person_10',target_user_id:uuid(777),operation_id:OP}));assert.equal(f.calls.length,0);
});
for(const mode of ['throws','provider-error','null','wrong-operation','not-forced','extra-field'])test(`official endpoint ${mode} retains one-shot exclusion and sanitizes candidate`,async()=>{
 const f=checkedResetFixture();let sends=0;const c={canonical_key:'person_10',target_user_id:uuid(777),operation_id:uuid(888)};Object.defineProperty(c,'password',{value:'SyntheticOnly-A7!xxxx'});
 f.functions.invoke=async()=>{sends++;if(mode==='throws')throw Error(c.password);if(mode==='provider-error')return {data:null,error:{message:c.password}};if(mode==='null')return null;const data={ok:true,operation_id:c.operation_id,login_username:'ameen10',must_change_password:true};if(mode==='wrong-operation')data.operation_id=uuid(889);if(mode==='not-forced')data.must_change_password=false;if(mode==='extra-field')data.password=c.password;return {data,error:null};};
 const adapter=f.build();await adapter.assertAvailable({...c,operation_id:OP});await assert.rejects(()=>adapter.reset(c),e=>!String(e).includes(c.password));await assert.rejects(()=>adapter.reset(c));assert.equal(sends,1);
});

for(const kind of ['boolean','wrong-signature','stale-source','expired','non-native-real','missing-native-proof'])test(`reset gate rejects ${kind} before endpoint dispatch`,async()=>{
 const f=checkedResetFixture();let opts={};if(kind==='boolean')opts.signedQaResetReceipt=true;
 if(kind==='wrong-signature')opts.trustedReviewerPublicKey=generateKeyPairSync('ed25519').publicKey;
 if(kind==='stale-source')f.proof.source_hashes={};if(kind==='expired')f.proof.expires_at=0;
 if(kind==='non-native-real')opts.executionMode='real-apply';if(kind==='missing-native-proof')f.proof.native_qa_proof.candidate_binding_verified=false;
 let adapter;try{adapter=f.build(opts);}catch{}if(adapter)await assert.rejects(()=>adapter.assertAvailable({canonical_key:'person_10',target_user_id:uuid(777),operation_id:OP}));assert.equal(f.calls.length,0);
});
