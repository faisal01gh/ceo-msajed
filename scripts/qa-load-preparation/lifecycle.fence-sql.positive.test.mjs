// Supplemental preserved ordinary central-Guard positive; fixture grants rollback.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from './lifecycle.fence-sql.pg.mjs';
import {OUT,guard,effect} from './lifecycle.fence-sql.harness.mjs';
const db=new PGlite();try{
 await db.verified;await guard(db);
 const a=(await db.query("SELECT p.id uid,s.id sid,p.full_name FROM public.profiles p JOIN auth.sessions s ON s.user_id=p.id WHERE app_private.qa_session_live(p.id,s.id,clock_timestamp()) AND (SELECT class FROM app_private.qa_identity_class(p.id))='ORDINARY' ORDER BY p.id LIMIT 1")).rows[0];assert(a,'positive fixture needs an ordinary native session');
 const before=(await db.query('SELECT app_private.qa_owned_protected_population_digest() digest')).rows[0].digest;
 await effect('BEGIN;GRANT UPDATE,SELECT ON public.profiles TO service_role;',db);
 await effect(`SET ROLE service_role;SET request.jwt.claims='{"role":"service_role"}';SET request.headers='${JSON.stringify({'x-qa-actor-user':a.uid,'x-qa-actor-sid':a.sid})}';`,db);
 const r=await effect(`UPDATE public.profiles SET full_name=full_name WHERE id='${a.uid}' RETURNING id`,db);assert.equal(r.rows.length,1);assert.equal(r.rows[0].id,a.uid);
 await effect('ROLLBACK;',db);await effect('RESET ROLE;',db);
 assert.equal((await db.query('SELECT app_private.qa_owned_protected_population_digest() digest')).rows[0].digest,before);
 const receipt={status:'GREEN',ordinaryNativeSession:true,actualCentralGuardUpdate:true,actor:a.uid,protectedDigestUnchanged:true,fixtureGrantRolledBack:true};fs.writeFileSync(OUT+'/ORDINARY_POSITIVE.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await db.close();}
