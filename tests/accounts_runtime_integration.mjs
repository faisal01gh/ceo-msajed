import './accounts_executor_deny_network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fixture,OP,uuid,checkedResetFixture} from './accounts_executor_fixture.mjs';
import * as reset from '../scripts/accounts-official-reset.mjs';

test('legacy approval source_main/current_source fields are not execution authority; mapping evidence stays canonical',async()=>{
 const f=await fixture();delete f.approval.current_source;delete f.approval.source_main;
 const r=await f.build().run();assert.equal(r.status,'completed');assert.equal(f.approval.staff_inventory.source_main,'717375eee1e99d558af80eca91a7ea7e829edd20');
});
import {createOriginalStaffReceiptJournal} from '../scripts/accounts-create-originals.mjs';

test('last physical private-delivery availability await cannot hide completed identity drift',async()=>{
 const f=await fixture();f.users.push({id:uuid(999),email:f.rows[10].internal_email,email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{untouched:true}});
 const {provisionAccounts}=await import('../scripts/accounts-provision.mjs');
 const prepared=await provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:f.approval.staff_inventory});
 const checked=checkedResetFixture(f);let calls=0;
 const resetAdapter=checked.build({readAvailability:async()=>{if(++calls===7)f.projections.get('person_10').profile.active=false;return checked.availability();}});
 const runner=f.build({prepared,resetAdapter});const result=await runner.run();assert.equal(result.status,'quarantined');assert.equal(f.delivered.length,0);assert.equal(runner.pendingCount(),1);runner.finalize('destroy');
});

test('last physical pre-link availability await cannot hide protected snapshot drift',async()=>{
 const f=await fixture();f.users.push({id:uuid(999),email:f.rows[10].internal_email,email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{untouched:true}});
 const {provisionAccounts}=await import('../scripts/accounts-provision.mjs');
 const prepared=await provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:f.approval.staff_inventory});
 const checked=checkedResetFixture(f);let calls=0;
 const resetAdapter=checked.build({readAvailability:async()=>{if(++calls===4)f.rows[10].display_name='offline-drift';return checked.availability();}});
 const result=await f.build({prepared,resetAdapter}).run();assert.ok(['blocked','quarantined'].includes(result.status));assert.equal(f.calls.filter(x=>x==='linkCanonical').length,0);assert.equal(checked.calls.length,0);
});

test('reset readiness that settles after the physical admission cutoff does not issue a late endpoint POST',async()=>{
 const f=checkedResetFixture();let delayed=false,release;const held=new Promise(r=>release=r);
 const adapter=f.build({readAvailability:async()=>{if(delayed)await held;return f.availability();}});
 const c={canonical_key:'person_10',target_user_id:uuid(777),operation_id:uuid(888)};Object.defineProperty(c,'password',{value:'SyntheticOnly-A7!xxxx'});
 await adapter.assertAvailable({...c,operation_id:OP});delayed=true;
 const cutoff=Date.now()+10,actual=adapter.reset(c,{admitBefore:cutoff});await new Promise(r=>setTimeout(r,15));release();
 await assert.rejects(()=>actual);assert.equal(f.calls.length,0);await assert.rejects(()=>adapter.reset(c));
});

test('pending asynchronous admission retains physical custody but does not dispatch after its waiter deadline',async()=>{
 const f=await fixture();let release;const held=new Promise(r=>release=r);
 const runner=f.build({deadlineMs:80,syntheticBeforeWrite:async a=>{if(a.scope==='account-create')await held;}});
 const result=await runner.run();assert.equal(result.status,'quarantined');assert.equal(runner.pendingCount(),1);
 assert.equal(f.calls.filter(x=>x==='createUser').length,0);assert.equal(runner.state().mutating_io,1);assert.throws(()=>runner.finalize('destroy'));
 release();await new Promise(r=>setTimeout(r,5));assert.equal(runner.state().mutating_io,0);assert.equal(f.calls.filter(x=>x==='createUser').length,0);
 assert.deepEqual(await runner.run(),result);runner.finalize('destroy');
});
test('provenance denial after an earlier private ACK retains the later original candidate without delivery',async()=>{
 const f=await fixture(['person_10','person_11']);
 const runner=f.build({syntheticBeforeWrite:async()=>{await Promise.resolve();if(f.delivered.length)throw Error('post_ack_source_drift');}});
 const result=await runner.run();assert.equal(result.status,'quarantined');assert.equal(f.delivered.length,1);assert.equal(runner.pendingCount(),1);runner.finalize('destroy');
});

test('real durable journal cannot be constructed with a copied or Boolean authority',()=>{
 assert.throws(()=>createOriginalStaffReceiptJournal({directory:process.env.TMPDIR,canonicalKeys:['person_10'],executionMode:'real-apply',runtimeAuthority:{assertCurrent:async()=>true}}));
});

test('pinned SDK current actor UID SID cutoff office and effective permission preflight runs offline under deny-net',()=>{
 const r=spawnSync('deno',['run','--cached-only','--deny-net','--allow-read','--allow-env',new URL('./account_reset_sdk_offline.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr);const evidence=JSON.parse(r.stdout);assert.equal(evidence.negative,9);assert.equal(evidence.mutations,0);
});
for(const scope of ['account-create','account-link','account-reset','account-receipt'])test(`awaited ${scope} provenance denial blocks that dispatch, including recovery receipts`,async()=>{
 const f=await fixture();
 if(scope==='account-reset')f.users.push({id:uuid(999),email:f.rows[10].internal_email,email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{untouched:true}});
 if(scope==='account-reset'){
  const {provisionAccounts}=await import('../scripts/accounts-provision.mjs');f.prepared=await provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:f.approval.staff_inventory});
 }
 const resetFixture=checkedResetFixture(f),resetAdapter=resetFixture.build();
 const runner=f.build({prepared:f.prepared,resetAdapter,syntheticBeforeWrite:async a=>{await Promise.resolve();if(a.scope===scope)throw Error('source_or_inventory_drift');}});
 const result=await runner.run();assert.ok(['blocked','quarantined'].includes(result.status));
 assert.equal(f.calls.filter(x=>x===({'account-create':'createUser','account-link':'linkCanonical','account-reset':'account-admin-reset-password'}[scope])).length,0);
 if(scope==='account-receipt'){assert.equal(f.receipts.length,0);assert.equal(result.receipt_persistence_failed,true);}
 assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
for(const value of [true,{assertBeforeWrite:async()=>true},{assertCurrent:async()=>true}])test('real entry rejects arbitrary or copied async-true authority without reads',async()=>{
 const f=await fixture();f.approval.source_main='717375eee1e99d558af80eca91a7ea7e829edd20';
 const result=await f.build({executionMode:'real-apply',runtimeAuthority:value,verifyIsolationReceipt:()=>true}).run();
 assert.equal(result.status,'blocked');assert.equal(result.blocked.code,'runtime_provenance_required');assert.equal(f.calls.length,0);
});

test('real reset is a conditional native SDK/source/runtime path, not a permanent synthetic lock',async()=>{
 assert.equal(typeof reset.createNativeOfficialAccountResetAdapter,'function');
 const source=readFileSync(new URL('../scripts/accounts-official-reset.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/requireFact\(executionMode==='synthetic'\);/);
 const f=checkedResetFixture();f.proof.evidence_kind='owned-native-qa-reset';
 await assert.rejects(()=>reset.createNativeOfficialAccountResetAdapter({client:f.client,runtimeAuthority:{assertCurrent:async()=>true},serviceRoleKey:'synthetic'}));
 assert.throws(()=>f.build({executionMode:'real-apply',runtimeAuthority:{assertCurrent:async()=>true}}));
 assert.equal(f.calls.length,0);
});
test('reset does not reuse an earlier availability result after an intervening await',async()=>{
 const f=checkedResetFixture();let ready=true;
 const adapter=f.build({readAvailability:async()=>({...await f.availability(),status:ready?'ACTIVE':'UNAVAILABLE'})});
 const c={canonical_key:'person_10',target_user_id:uuid(777),operation_id:uuid(888)};Object.defineProperty(c,'password',{value:'SyntheticOnly-A7!xxxx'});
 await adapter.assertAvailable({...c,operation_id:OP});await Promise.resolve();ready=false;
 await assert.rejects(()=>adapter.reset(c));assert.equal(f.calls.length,0);
});

test('account runtime authority exists and copied/caller-true authority cannot activate real execution',async()=>{
 assert.equal(typeof reset.createAccountRuntimeAuthority,'function');
 assert.equal(typeof reset.isAccountRuntimeAuthority,'function');
 assert.throws(()=>reset.createAccountRuntimeAuthority({reader:{readback:async()=>true},readApproval:async()=>true}));
 const f=await fixture();const runner=f.build({executionMode:'real-apply',runtimeAuthority:{assertCurrent:async()=>true},verifyIsolationReceipt:()=>true});
 assert.equal((await runner.run()).status,'blocked');assert.equal(f.calls.length,0);
});

test('every synthetic dispatch awaits the same scoped runtime barrier before the physical callback',async()=>{
 const f=await fixture(),events=[];
 const create=f.port.auth.createUser,link=f.port.linkCanonical;
 f.port.auth.createUser=async p=>{events.push('create');return create(p);};
 f.port.linkCanonical=async p=>{events.push('link');return link(p);};
 const runner=f.build({syntheticBeforeWrite:async a=>{await Promise.resolve();events.push(a.scope);assert.equal(a.operationId,OP);},persistReceipt:async r=>{events.push('receipt');return f.callbacks.persistReceipt(r);},deliver:async c=>{events.push('delivery');return f.callbacks.deliver(c);}});
 assert.equal((await runner.run()).status,'completed');
 for(const [event,scope] of [['create','account-create'],['link','account-link'],['receipt','account-receipt'],['delivery','account-receipt']])for(let i=0;i<events.length;i++)if(events[i]===event)assert.equal(events[i-1],scope);
});
