import assert from 'node:assert/strict';
import {verifySources} from './admit.mjs';
let sqlCalls=0;const run=(reader)=>{verifySources([{path:'fixture.sql',sha256:'abc',bytes:3}],reader);sqlCalls++;};
assert.throws(()=>run(()=>{const e=new Error('missing');e.code='ENOENT';throw e;}),/missing/);
assert.throws(()=>run(()=>Buffer.from('bad')),/SOURCE_HASH/);
assert.equal(sqlCalls,0);console.log('PASS missing and wrong hash reject before SQL');
