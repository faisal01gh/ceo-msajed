import '../../tests/accounts_executor_deny_network.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
test('Completed Replay actual reachable import and primitive audit',async()=>{let m;try{m=await import('./completed-cleanup-replay.mechanical.mjs');}catch{}assert.equal(typeof m?.auditCompletedReplay,'function','mechanical primitive verifier missing');const result=m.auditCompletedReplay();assert.equal(result.mutationPrimitives,0);assert.equal(result.sqlWriteStatements,0);assert(result.modules.length>=3);});

import {readFileSync} from 'node:fs';
import {auditCompletedReplay} from './completed-cleanup-replay.mechanical.mjs';
for(const mutation of ["import {writeFileSync} from 'node:fs';","import x from './owned-io.mjs';","fetch('https://x.invalid',{method:'DELETE'});","eval('x');","process.exit(0);","call('DELETE',MANAGEMENT+'/database/query/read-only',null);","call('POST',MANAGEMENT+'/database/query',null,{query:RUNTIME_INVENTORY_SELECT});","call('GET','https://x.invalid',null);"])test('mechanical audit rejects injected reachable primitive '+mutation,()=>{
 const url=new URL('./completed-cleanup-replay.mjs',import.meta.url).href;assert.throws(()=>auditCompletedReplay({override:{[url]:readFileSync(new URL(url),'utf8')+'\n'+mutation}}));
});
