import assert from 'node:assert/strict';
import {PGlite} from './lifecycle.fence-sql.pg.mjs';
import {guard,effect,service} from './lifecycle.fence-sql.harness.mjs';
const db=new PGlite();try{
 const m=await import('./lifecycle.fence-sql.mjs');assert.equal(typeof m.createDeletionFenceSQL,'function');
 await db.verified;await guard(db);await service(db);
 const binding={rpc:async(name,args)=>{const literal=x=>typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";return {data:(await effect(`SELECT public.${name}(${Object.values(args).map(literal).join(',')}) receipt`,db)).rows[0].receipt,error:null};}};
 const api=m.createDeletionFenceSQL(binding);
 const op='00000000-0000-4000-8000-000000099001';
 const read=await api.read({operationId:op});assert.equal(read.status,'completed');
 const final=await api.finalize({operationId:op,generation:1});assert.deepEqual(final,read);
 await assert.rejects(api.finalize({operationId:op,generation:2}));
 await assert.rejects(api.absence({operationId:op,generation:1,targetUserId:read.target_user_id,readbackDigest:'200'}));
 console.log(JSON.stringify({ABI:1,actualSQLRead:true,duplicateFinalizeSameReceipt:true,rejectedWrongGeneration:true,rejectedCaller200:true}));
}finally{await db.close();}
