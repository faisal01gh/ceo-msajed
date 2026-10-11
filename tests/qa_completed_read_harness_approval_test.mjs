import test from 'node:test';import assert from 'node:assert/strict';
import * as h from './qa_completed_replay_protocol_fixture.mjs';
test('completed approval protocol does not relabel or validate an owner inventory as a read-role inventory',async t=>{
 const cleanups=[];t.after(()=>{for(const c of cleanups.reverse())c();});const f=await h.protocolFixture(cleanups);
 f.retainedPlan={envelope:{payload:structuredClone(f.state.sqlInventory.ownedPlans[0].payload)}};
 f.retainedMetadata=structuredClone(f.state.ownedMetadata);
 const initial=structuredClone(f.receipt.payload),ownerInventory=structuredClone(f.state.sqlInventory);ownerInventory.readRole='postgres';f.state.sqlInventory=ownerInventory;
 assert.throws(()=>f.approval(),/runtime_provenance_denied/);
 assert.equal(typeof h.completedProtocolApproval,'function');
 const signed=h.completedProtocolApproval(f);assert.equal(signed.payload.inventoryDigest,initial.inventoryDigest);
 assert.equal(f.state.sqlInventory.readRole,'postgres');assert.equal(signed.payload.ownedRolePlanDigest,f.retainedPlan.envelope.payload.rolePlanDigest);
 assert.equal(f.completedApprovalEvidence.classification,'DETERMINISTIC_HTTP_APPROVAL_MODEL_NOT_NATIVE_INVENTORY');
});
