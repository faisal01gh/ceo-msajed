import http from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {CONTRACT,ROLES,sha256} from './gate.mjs';
export async function createFixtureServer() {
  const runId=randomUUID(),challenge=randomBytes(32).toString('hex');
  const users=new Map(),tokens=new Map(),sockets=new Set(),rounds=new Map();
  const protectedState=Array.from({length:65},(_,i)=>({uid:randomUUID(),kind:i<57?'protected-staff':'legacy-manual-qa',unchanged:true}));
  const protectedDigest=sha256(JSON.stringify(protectedState));let validationErrors=0;
  function mint(kind,role,forced=false){const x={uid:randomUUID(),sid:randomUUID(),runId,kind,role,forced,username:`fixture-${randomUUID()}`,password:randomBytes(24).toString('base64url'),accessToken:randomBytes(32).toString('base64url'),active:true};users.set(x.uid,x);tokens.set(x.accessToken,x);return x;}
  const identities=Array.from({length:50},()=>mint('owned-load-qa','employee'));
  const roleIdentities=ROLES.map(role=>mint('owned-e2e-qa',role,true));
  function send(res,status,data){if(!res.destroyed){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}}
  function roundReadback(id){const r=rounds.get(id);if(!r)return null;return {roundId:id,expected:r.expected,received:r.ids.size,uniqueRequests:r.ids.size,peak:r.peak,active:r.active,ownershipErrors:r.ownershipErrors,perIdentity:[...r.perUID].map(([uid,count])=>({uid,count})),bodyResponsesFinished:r.finished};}
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.socket.remoteAddress!=='127.0.0.1'||req.headers['x-local-challenge']!==challenge)return send(res,403,{code:'LOCAL_HANDSHAKE_DENIED'});
      const u=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&u.pathname==='/handshake')return send(res,200,{stage:'LocalHTTPFixture',runId,challenge,instanceAddress:server.address().address,port:server.address().port,ownedIdentities:50});
      if(req.method==='GET'&&u.pathname==='/readback')return send(res,200,{runId,challengeDigest:sha256(challenge),round:roundReadback(u.searchParams.get('round')),ownedRemaining:users.size,protectedDigest,protectedUnchanged:protectedDigest===sha256(JSON.stringify(protectedState)),validationErrors});
      let body={};if(req.method==='POST'){let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>65536){req.destroy();return;}chunks.push(c);}try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{code:'BAD_JSON'});}}
      if(u.pathname==='/login'&&req.method==='POST') {const x=[...users.values()].find(x=>x.kind==='owned-e2e-qa'&&x.username===body.username&&x.password===body.password);if(!x)return send(res,401,{code:'LOGIN_DENIED'});tokens.delete(x.accessToken);x.active=true;x.sid=randomUUID();x.accessToken=randomBytes(32).toString('base64url');tokens.set(x.accessToken,x);return send(res,200,{uid:x.uid,sid:x.sid,accessToken:x.accessToken,mustChangePassword:x.forced});}
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const x=tokens.get(token);
      if(!x||!x.active||x.runId!==runId||!users.has(x.uid)){validationErrors++;return send(res,401,{code:'SESSION_DENIED'});}
      if(u.pathname==='/identity')return send(res,200,{uid:x.uid,sid:x.sid,runId,kind:x.kind,role:x.role,forced:x.forced});
      if(u.pathname==='/forced-change'&&req.method==='POST') {const pw=body.password;if(typeof pw!=='string'||Array.from(pw).length<8||!/[A-Z]/.test(pw)||!/[a-z]/.test(pw)||!/[0-9]/.test(pw)||!/[!-/:-@\[-`{-~]/.test(pw))return send(res,400,{code:'PASSWORD_POLICY'});tokens.delete(x.accessToken);x.password=pw;x.forced=false;x.sid=randomUUID();x.accessToken=randomBytes(32).toString('base64url');tokens.set(x.accessToken,x);return send(res,200,{uid:x.uid,sid:x.sid,accessToken:x.accessToken,mustChangePassword:false});}
      if(u.pathname==='/logout'&&req.method==='POST'){tokens.delete(x.accessToken);x.active=false;return send(res,200,{ok:true});}
      if(x.forced&&['/permissions','/transactions','/notifications','/allowed','/denied'].includes(u.pathname))return send(res,403,{code:'CHANGE_REQUIRED'});
      if(u.pathname==='/permissions')return send(res,200,{role:x.role,permissions:['fixture.read_owned'],deny:['fixture.cross_owner_write']});
      if(u.pathname==='/transactions')return send(res,200,{rows:[{id:`owned-${x.uid}`,owner:x.uid,runId}],foreignRows:0});
      if(u.pathname==='/allowed')return send(res,200,{ok:true,owner:x.uid,fixtureOnly:true});
      if(u.pathname==='/denied')return send(res,403,{code:'FORBIDDEN',writeIntents:0});
      if(u.pathname==='/notifications')return send(res,200,{rows:[{id:`n-${x.uid}`,owner:x.uid,read_at:null}]});
      if(u.pathname==='/session')return send(res,200,{uid:x.uid,sid:x.sid,active:x.active});
      if(u.pathname==='/fault/429')return send(res,429,{code:'FIXTURE_LIMIT'});
      if(u.pathname==='/fault/503')return send(res,503,{code:'FIXTURE_UNAVAILABLE'});
      if(u.pathname==='/fault/body'){res.writeHead(200,{'content-type':'application/json'});res.write('{');return;}
      if(u.pathname==='/fault/request')return;
      if(u.pathname==='/fault/disconnect'){req.socket.destroy();return;}
      if(u.pathname==='/load'&&req.method==='GET') {
        const r=rounds.get(req.headers['x-qa-round']);const id=Number(req.headers['x-qa-request-id']);
        if(!r||x.kind!=='owned-load-qa'||!identities.includes(x)||!Number.isInteger(id)||id<0||id>=r.expected||r.ids.has(id)){if(r)r.ownershipErrors++;return send(res,403,{code:'OWNERSHIP_DENIED'});}
        r.ids.add(id);r.perUID.set(x.uid,(r.perUID.get(x.uid)||0)+1);r.active++;r.peak=Math.max(r.peak,r.active);
        res.once('finish',()=>{r.finished++;r.active--;});
        const respond=()=>send(res,200,{uid:x.uid,sid:x.sid,runId,readOnly:true,requestId:id});
        if(r.barrier){r.pending.push(respond);if(r.ids.size===r.expected){clearTimeout(r.timer);const pending=r.pending.splice(0);setTimeout(()=>pending.forEach(f=>f()),20);}}
        else setTimeout(respond,5);
        return;
      }
      send(res,404,{code:'NOT_FOUND'});
    }catch {send(res,500,{code:'FIXTURE_ERROR'});}
  });
  server.requestTimeout=CONTRACT.requestMs;server.headersTimeout=CONTRACT.requestMs;server.keepAliveTimeout=CONTRACT.drainMs;
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0,backlog:4096},resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {stage:'LocalHTTPFixture',origin,runId,challenge,identities,roleIdentities,
    configureRound(id,requestsPerIdentity,{barrier=true}={}){if(rounds.has(id))throw new Error('ROUND_DUPLICATE');const r={expected:50*requestsPerIdentity,ids:new Set(),perUID:new Map(),active:0,peak:0,finished:0,ownershipErrors:0,pending:[],barrier};if(barrier)r.timer=setTimeout(()=>{for(const fn of r.pending.splice(0))fn();},CONTRACT.requestMs-1000);rounds.set(id,r);},
    waitReceived(id,count){const r=rounds.get(id);const end=Date.now()+5000;return new Promise((resolve,reject)=>{const poll=()=>{if(r.ids.size>=count)return resolve();if(Date.now()>=end)return reject(new Error('LOCAL_ADMISSION_TIMEOUT'));setTimeout(poll,5);};poll();});},
    async cleanupOwned(){if([...rounds.values()].some(r=>r.active||r.pending.length))throw new Error('CLEANUP_UNDRAINED');const inventory=[...users.values()].map(x=>({uid:x.uid,runId:x.runId,kind:x.kind,sidDigest:sha256(x.sid)}));if(inventory.length!==57||inventory.some(x=>x.runId!==runId||protectedState.some(p=>p.uid===x.uid)))throw new Error('CLEANUP_OWNERSHIP_DENIED');for(const x of users.values()){tokens.delete(x.accessToken);x.accessToken=null;x.password=null;}users.clear();return {stage:'LocalHTTPFixture',inventory,ownedRemaining:users.size,sessionTokensRemaining:tokens.size,protectedUnchanged:sha256(JSON.stringify(protectedState))===protectedDigest};},
    async close(){for(const r of rounds.values())clearTimeout(r.timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));const end=Date.now()+CONTRACT.drainMs;while(sockets.size&&Date.now()<end)await new Promise(r=>setTimeout(r,5));return {remainingServerSockets:sockets.size};}
  };
}
