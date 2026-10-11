import './accounts_executor_deny_network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,uuid,checkedResetFixture} from './accounts_executor_fixture.mjs';
import {provisionAccounts} from '../scripts/accounts-provision.mjs';
import {createOriginalStaffReceiptJournal} from '../scripts/accounts-create-originals.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function reuseFixture(keys=['person_10']) {
 const f=await fixture(keys);
 f.users.push({id:uuid(777),email:'person-10@msajed.local',email_confirmed_at:'confirmed',banned_until:null,deleted_at:null,app_metadata:{provider:'email'},user_metadata:{existing:true}});
 const prepared=await provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:f.approval.staff_inventory});
 f.calls.length=0;return {...f,prepared,build:options=>f.build({prepared,...options})};
}

test('Finding1 reuse completes with fresh private temporary credential, never old password',async()=>{
 const f=await reuseFixture();let privateCandidate;const checked=checkedResetFixture(f);
 const resetAdapter=checked.build({readAvailability:async()=>{f.calls.push('resetPreflight');return checked.availability();}});
 const runner=f.build({resetAdapter,deliver:async c=>{privateCandidate=c;return f.callbacks.deliver(c);}});const r=await runner.run();
 assert.equal(r.status,'completed','old implementation returns needs_private_original_password_delivery');
 assert.equal(r.reused,1);assert.equal(f.calls.includes('createUser'),false);assert.equal(f.calls.filter(x=>x==='account-admin-reset-password').length,1);
 assert.equal(f.delivered.length,1);assert.equal(privateCandidate.password,null);assert.equal(runner.pendingCount(),0);
 assert.ok(f.calls.indexOf('resetPreflight')<f.calls.indexOf('linkCanonical'));assert.ok(f.calls.indexOf('linkCanonical')<f.calls.indexOf('account-admin-reset-password'));
 assert.equal(f.rows[10].profile_must_change,true);assert.equal(f.projections.get('person_10').profile.must_change_password,true);
 assert.doesNotMatch(JSON.stringify(r),/needs_private_original_password_delivery/);
});

test('copied official adapter marker cannot authorize canonical linking',async()=>{
 const f=await reuseFixture();const checked=checkedResetFixture(f),original=checked.build();const r=await f.build({resetAdapter:{...original}}).run();
 assert.equal(r.status,'blocked');assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(f.delivered.length,0);
});

test('linked receipt drift is detected before official reset dispatch',async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f);const persist=f.callbacks.persistReceipt;
 const runner=f.build({resetAdapter:checked.build(),persistReceipt:async r=>{const ack=await persist(r);if(r.phase==='linked_verified')f.projections.get('faisal').permission_overrides.push({outside_change:true});return ack;}});
 const r=await runner.run();assert.equal(r.status,'quarantined');assert.equal(checked.calls.length,0,'reset must not precede final current snapshot validation');assert.equal(f.delivered.length,0);runner.finalize('destroy');
});

test('durable reset intent binds original candidate operation before invoke',async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f);const runner=f.build({resetAdapter:checked.build()});assert.equal((await runner.run()).status,'completed');
 const intent=f.receipts.find(r=>r.phase==='reset_intent');assert.ok(intent,'reset needs its own durable no-repeat receipt');assert.equal(intent.reset_operation_id,checked.calls[0].options.body.operation_id);assert.ok(f.receipts.some(r=>r.phase==='reset_verified' && r.reset_operation_id===intent.reset_operation_id));
});

const tick=()=>new Promise(r=>setTimeout(r,0));
for(const mode of ['late-success','late-reject'])test(`physical reset ${mode} retains original operation and candidate beyond caller deadline`,async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f);let release,body,entered=false;const held=new Promise(r=>release=r),invoke=checked.functions.invoke;
 checked.functions.invoke=async(name,options)=>{entered=true;body=options.body;await held;if(mode==='late-reject')throw Error(body.new_password);return invoke(name,options);};
 const runner=f.build({resetAdapter:checked.build(),deadlineMs:150});const result=await runner.run();
 assert.equal(entered,true);assert.equal(result.status,'quarantined');assert.equal(runner.state().reset_io,1,'physical reset must remain in flight after timeout');assert.equal(runner.pendingCount(),1);
 assert.throws(()=>runner.finalize('destroy'));assert.equal((await runner.deliverPending()).status,'quarantined');assert.equal(f.delivered.length,0);
 const original=body.new_password,operation=body.operation_id;release();await tick();await tick();
 assert.equal(runner.state().reset_io,0);assert.equal(runner.pendingCount(),1);assert.equal(f.delivered.length,0);await runner.run();assert.equal(body.new_password,original);assert.equal(body.operation_id,operation);
 assert.ok(result.receipts.some(r=>r.phase==='quarantined' && r.reset_operation_id===operation));assert.equal(JSON.stringify(result).includes(original),false);runner.finalize('destroy');
});

test('unavailable reset in later reuse blocks the entire mixed batch before any CREATE/link',async()=>{
 const f=await reuseFixture(['person_11','person_10']),checked=checkedResetFixture(f,{available:false});const r=await f.build({resetAdapter:checked.build()}).run();
 assert.equal(r.status,'blocked');assert.equal(f.calls.includes('createUser'),false);assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(f.delivered.length,0);
});

test('official reset accepts only its documented fresh timestamp effects and preserves current snapshots',async()=>{
 const f=await reuseFixture();f.rows[10].password_changed_at=null;
 const prepared=await provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:f.approval.staff_inventory});
 const link=f.port.linkCanonical;f.port.linkCanonical=async p=>{const r=await link(p);f.projections.get(p.p_key).profile.updated_at='2026-01-01T00:00:00.000Z';return r;};
 const checked=checkedResetFixture(f),invoke=checked.functions.invoke;checked.functions.invoke=async(n,o)=>{const r=await invoke(n,o);const now=new Date().toISOString();f.rows[10].password_changed_at=now;f.projections.get('person_10').profile.updated_at=now;return r;};
 const r=await f.build({prepared,resetAdapter:checked.build()}).run();assert.equal(r.status,'completed');assert.equal(f.delivered.length,1);
});

test('unknown reset reconciliation uses exact original candidate through official flow without another provider write',async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f);let first=true,originalBody,replays=0;const invoke=checked.functions.invoke;
 checked.functions.invoke=async(name,options)=>{
  if(first){first=false;originalBody={...options.body};await invoke(name,options);throw Error(options.body.new_password);}
  replays++;assert.deepEqual(options.body,originalBody);return {data:{ok:true,operation_id:options.body.operation_id,login_username:f.rows[10].login_username,must_change_password:true},error:null};
 };
 checked.client.rpc=async(name,args)=>{assert.equal(name,'account_password_status_internal');assert.equal(args.p_operation_id,originalBody.operation_id);return {data:{operation_id:originalBody.operation_id,target_user_id:uuid(777),canonical_key:'person_10',login_username:f.rows[10].login_username,generation:1,status:'completed',write_allowed:false},error:null};};
 checked.client.auth={admin:{getUserById:async id=>({data:{user:await f.port.auth.getUserById(id)},error:null})}};
 const runner=f.build({resetAdapter:checked.build()});assert.equal((await runner.run()).status,'quarantined');assert.equal(f.delivered.length,0);
 assert.equal(typeof runner.reconcileReset,'function','unknown candidate needs explicit original-operation reconciliation');
 const recovered=await runner.reconcileReset();assert.equal(recovered.status,'reset_reconciled');assert.equal(replays,1);
 await runner.reconcileReset();assert.equal(replays,1);assert.equal((await runner.deliverPending()).status,'delivered');assert.equal(f.delivered[0].password,originalBody.new_password);
 assert.equal(f.calls.filter(x=>x==='linkCanonical').length,1);assert.equal(checked.calls.length,1,'synthetic physical reset happened once; recovery boundary did not call original provider writer');runner.finalize('destroy');
});

test('reset generation must be exactly original generation plus one',async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f),invoke=checked.functions.invoke;
 checked.functions.invoke=async(n,o)=>{const r=await invoke(n,o);f.users.find(u=>u.id===uuid(777)).app_metadata.msajed_password_generation=2;f.projections.get('person_10').credential_generation=2;return r;};
 const runner=f.build({resetAdapter:checked.build()});assert.equal((await runner.run()).status,'quarantined');assert.equal(f.delivered.length,0);runner.finalize('destroy');
});

test('provider-proven unfinished original reset can reconcile before finish timestamps exist',async()=>{
 const f=await reuseFixture();f.rows[10].password_changed_at=null;
 const prepared=await provisionAccounts(f.port,()=>{},{mode:'plan-only',staffInventory:f.approval.staff_inventory});
 const checked=checkedResetFixture(f),invoke=checked.functions.invoke;let originalBody;
 checked.functions.invoke=async(n,o)=>{
  if(!originalBody){originalBody={...o.body};await invoke(n,o);throw Error('unknown original finish');}
  assert.deepEqual(o.body,originalBody);f.rows[10].password_changed_at=new Date().toISOString();return {data:{ok:true,operation_id:o.body.operation_id,login_username:f.rows[10].login_username,must_change_password:true},error:null};
 };
 checked.client.rpc=async()=>({data:{operation_id:originalBody.operation_id,target_user_id:uuid(777),canonical_key:'person_10',generation:1,status:'uncertain',write_allowed:false},error:null});
 checked.client.auth={admin:{getUserById:async id=>({data:{user:await f.port.auth.getUserById(id)},error:null})}};
 const runner=f.build({prepared,resetAdapter:checked.build()});assert.equal((await runner.run()).status,'quarantined');assert.equal((await runner.reconcileReset()).status,'reset_reconciled');assert.equal((await runner.deliverPending()).status,'delivered');runner.finalize('destroy');
});

// Supplemental coverage; no claim that already-passing guard cases were RED.
for(const field of ['registry','protected-auth','target-auth'])test(`final awaited reset availability ${field} drift blocks canonical link`,async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f);let checks=0;
 const resetAdapter=checked.build({readAvailability:async()=>{if(++checks===3){if(field==='registry')f.rows[20].display_name+=' outside change';if(field==='protected-auth')f.users[0].user_metadata.outside=true;if(field==='target-auth')f.users.find(u=>u.id===uuid(777)).user_metadata.outside=true;}return checked.availability();}});
 const runner=f.build({resetAdapter}),r=await runner.run();assert.equal(r.status,'blocked');assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(checked.calls.length,0);assert.equal(f.delivered.length,0);runner.finalize('destroy');
});
for(const phase of ['reset_intent','reset_verified'])test(`actual ${phase} receipt settlement outlives deadline without repeat reset or delivery`,async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f);let release,entered=false;const held=new Promise(r=>release=r),persist=f.callbacks.persistReceipt;
 const runner=f.build({resetAdapter:checked.build(),deadlineMs:250,persistReceipt:async r=>{if(r.phase===phase){entered=true;await held;}return persist(r);}});
 const r=await runner.run();assert.equal(entered,true);assert.equal(r.status,'quarantined');assert.equal(runner.state().receipt_io,1);assert.equal(runner.state().reset_io,0);assert.throws(()=>runner.finalize('destroy'));assert.equal(f.delivered.length,0);release();await tick();await tick();
 assert.equal(runner.state().receipt_io,0);await runner.run();assert.equal(checked.calls.length,phase==='reset_intent'?0:1);assert.equal(runner.pendingCount(),1);runner.finalize('destroy');
});
for(const ack of ['wrong-batch-operation','wrong-UID','exact-late'])test(`reused candidate ${ack} acknowledgement is bound to reset operation, not batch approval`,async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f);let exposed,release;const held=new Promise(r=>release=r);
 const runner=f.build({resetAdapter:checked.build(),deadlineMs:250,deliver:async c=>{exposed=c;return held;}});assert.equal((await runner.run()).status,'quarantined');assert.ok(exposed.password);assert.notEqual(exposed.operation_id,f.approval.operation_id);assert.equal(runner.state().delivery_io,1);assert.throws(()=>runner.finalize('destroy'));
 release({acknowledged:true,operation_id:ack==='wrong-batch-operation'?f.approval.operation_id:exposed.operation_id,target_user_id:ack==='wrong-UID'?uuid(778):exposed.target_user_id});await tick();await tick();
 assert.equal(runner.pendingCount(),ack==='exact-late'?0:1);assert.equal(exposed.password===null,ack==='exact-late');assert.equal(checked.calls.length,1);runner.finalize('destroy');assert.equal(exposed.password,null);
});
test('real durable reuse journal retains original reset reservation across restart and denies repeated reset intent',async()=>{
 const f=await reuseFixture(),checked=checkedResetFixture(f),directory=await mkdtemp(join(process.env.TMPDIR,'finding1-reset-journal-'));
 try{
  const writer=createOriginalStaffReceiptJournal({directory,canonicalKeys:['person_10']});const runner=f.build({resetAdapter:checked.build(),persistReceipt:writer});const r=await runner.run();assert.equal(r.status,'completed');
  const intent=r.receipts.find(r=>r.phase==='reset_intent');const saved=JSON.parse(await readFile(join(directory,'reset-reservation-person_10.json'),'utf8'));assert.deepEqual(saved,intent);assert.doesNotMatch(JSON.stringify(saved),/password|token|secret|candidate/i);
  const restarted=createOriginalStaffReceiptJournal({directory,canonicalKeys:['person_10']});await assert.rejects(()=>restarted({...intent,sequence:99}));await assert.rejects(()=>writer({...intent,sequence:100}));assert.equal(checked.calls.length,1);runner.finalize('destroy');
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('unavailable official reset stops before link, Auth writes, credential delivery',async()=>{
 const f=await reuseFixture();const runner=f.build();const r=await runner.run();assert.equal(r.status,'blocked');
 assert.equal(f.calls.includes('linkCanonical'),false);assert.equal(f.calls.includes('createUser'),false);assert.equal(f.delivered.length,0);assert.equal(runner.pendingCount(),0);
});
