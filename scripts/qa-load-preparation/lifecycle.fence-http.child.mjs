// Real fresh process; durable FILE model of SQL state, NOT a native database.
import {setup} from './lifecycle.fence-http.fixture.mjs';
import {readFileSync} from 'node:fs';
const file=process.argv[2];
const x=await setup({stateFile:file});
const r=await x.coordinator.resume({runId:x.runId,sourceId:x.sourceId,uid:x.uid,operationId:x.operationId,generation:1});
await x.coordinator.drain();
console.log(JSON.stringify({status:r.status,generation:r.generation,deleteCalls:JSON.parse(readFileSync(file,'utf8')).deleteCalls,pending:x.coordinator.snapshot().pending}));
