import '../../tests/accounts_executor_deny_network.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
let m;try{m=await import('./completed-read-api.mjs');}catch{}
import {composedProtocol} from './completed-cleanup-replay.fixture.mjs';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
test('completed API body pin derives exact committed official211 bytes',t=>{
 assert.equal(typeof m?.completedApiBodyDigest,'function','dynamic final-source body pin missing');
 const f=composedProtocol(t),sql=readFileSync(new URL('../../supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql',import.meta.url),'utf8');
 const body=sql.split('AS $read$')[1].split('$read$;')[0];
 assert.equal(m.completedApiBodyDigest(f.root),createHash('sha256').update(body,'utf8').digest('hex'));
});

test('closed API query rejects unknown keys, unsafe numbers and appended SQL',()=>{
 const hex='a'.repeat(64),uuid='00000000-0000-4000-8000-000000000001';
 const request={runId:uuid,sourceId:uuid,operationId:uuid,generation:1,uid:uuid,canonicalKey:"x';DELETE FROM auth.users;--",...Object.fromEntries(m.REQUEST_KEYS.slice(6).map(k=>[k,hex]))},expected=Object.fromEntries(m.EXPECTED_KEYS.map(k=>[k,hex]));
 const query=m.completedReadQuery(request,expected);assert.equal(m.parseCompletedReadQuery(query).request.canonicalKey,request.canonicalKey);
 assert(!query.includes(request.canonicalKey));
 for(const r of [{...request,unknown:true},{...request,generation:1.5},{...request,generation:9007199254740992}])assert.throws(()=>m.completedReadQuery(r,expected),/runtime_provenance_denied/);
 assert.throws(()=>m.completedReadQuery(request,{...expected,unknown:hex}),/runtime_provenance_denied/);
 assert.throws(()=>m.parseCompletedReadQuery(query+'DELETE FROM auth.users;'),/runtime_provenance_denied/);
});

test('closed JSON renderer rejects array accessors and symbol properties',()=>{
 const getter=[];Object.defineProperty(getter,'0',{get:()=>1,enumerable:true});getter.length=1;
 const symbol=[1];symbol[Symbol('hidden')]=2;
 assert.throws(()=>m.pgJsonbText(getter),/runtime_provenance_denied/);
 assert.throws(()=>m.pgJsonbText(symbol),/runtime_provenance_denied/);
});
test('PG JSONB renderer uses UTF8 length then byte ordering and exact spaces',()=>{
 assert.equal(typeof m?.pgJsonbText,'function','closed PG renderer missing');
 assert.equal(m.pgJsonbText({'é':2,z:[true,null,'\n'],aaa:3,a:1}),'{'+'"a": 1, "z": [true, null, "\\n"], "é": 2, "aaa": 3}');
 for(const v of [1.1,NaN,Infinity,9007199254740992,undefined,()=>{},'\u0000','\ud800',new Date(),{x:undefined},Array(1)])assert.throws(()=>m.pgJsonbText(v),/runtime_provenance_denied/);
});
