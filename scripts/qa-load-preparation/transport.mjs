import http from 'node:http';
import https from 'node:https';
import {performance} from 'node:perf_hooks';
import {CONTRACT,sha256,isNativePermit,TARGET,validateLoadIdentities} from './gate.mjs';
import {summarize} from './metrics.mjs';
export function serializeNativeRead(identity) {
  const payload=Object.assign(Object.create(null),{action:'list',app:'new',token:identity.accessToken,page:1,page_size:10,tab:'all'});
  return JSON.stringify(payload);
}
const clients=new WeakSet();
const now=()=>performance.now();
export function createClient({origin,localChallenge=null,permit=null,maxSockets=2500,deadlines={}}) {
  const u=new URL(origin); const native=isNativePermit(permit);
  if(native ? origin!==TARGET.backend : (!localChallenge||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.pathname!=='/'))throw new Error('TRANSPORT_DENIED');
  const d={...CONTRACT,...deadlines}; for(const k of ['requestMs','bodyMs','drainMs','roundMs','maxBodyBytes'])if(!Number.isFinite(d[k])||d[k]<=0||d[k]>CONTRACT[k])throw new Error('DEADLINE_DENIED');
  if(!Number.isInteger(maxSockets)||maxSockets<1||maxSockets>2500)throw new Error('CAPACITY_DENIED');
  const driver=native?https:http;
  const agent=new driver.Agent({keepAlive:true,maxSockets,maxTotalSockets:maxSockets,maxFreeSockets:maxSockets,scheduling:'fifo'});
  const sockets=new Set(),readySockets=new Set(),activeRequests=new Map();let active=0,peak=0,connectedPeak=0;
  function request({identity=null,path,method='GET',body=null,round=null,ordinal=null,capture=false}) {
    if(native) {
      if(Date.now()+d.roundMs+d.drainMs>permit.expiresAt||method!=='POST'||path!=='/functions/v1/transactions-api'||!identity||!permit.identities.includes(identity)||Date.now()+d.roundMs+d.drainMs>identity.credentialExpiresAt||body?.action!=='list'||Object.keys(body).some(k=>!['action','app','token','page','page_size','tab'].includes(k))||body.app!=='new'||body.token!==identity.accessToken||body.page!==1||body.page_size!==10||body.tab!=='all')throw new Error('REQUEST_DENIED');
    } else if(!path.startsWith('/')||path.startsWith('//')||/[\\\r\n]/.test(path))throw new Error('REQUEST_DENIED');
    const row={uid:identity?.uid??'local-control',sidDigest:identity?.sid?sha256(identity.sid):'none',ordinal,attemptedAt:now(),enqueuedAt:null,connectedAt:null,transmittedAt:null,headersAt:null,bodyCompleteAt:null,terminalAt:null,terminalConfirmed:false,wrapperSettledAt:null,status:null,error:null,uncertain:false,bytes:0};
    const wireBody=body===null?null:Buffer.from(native?serializeNativeRead(identity):JSON.stringify(body));
    return new Promise(resolve=>{
      let req,res,bodyTimer,requestTimer,drainTimer,done=false,captured=[],wasActive=false;
      const terminal=(confirmed=true)=>{if(done)return;done=true;clearTimeout(requestTimer);clearTimeout(bodyTimer);clearTimeout(drainTimer);row.wrapperSettledAt=now();row.terminalAt=confirmed?row.wrapperSettledAt:null;row.terminalConfirmed=confirmed;row.uncertain=row.transmittedAt!==null&&(row.bodyCompleteAt===null||!confirmed);const out={row,body:null};if(capture&&row.bodyCompleteAt!==null){try{out.body=JSON.parse(Buffer.concat(captured).toString('utf8'));}catch{row.error='BODY_INVALID';}}captured=[];resolve(out);};
      const abort=code=>{if(!row.error)row.error=code;if(req)req.destroy();if(res)res.destroy();if(done)return;clearTimeout(drainTimer);drainTimer=setTimeout(()=>{row.error='DRAIN_TIMEOUT';row.uncertain=row.transmittedAt!==null;terminal(false);},d.drainMs);};
      const headers={'content-type':'application/json'};
      if(identity)headers.authorization=`Bearer ${identity.accessToken}`;
      if(native){headers.apikey=identity.apiKey;headers.origin=TARGET.frontend;}else headers['x-local-challenge']=localChallenge;
      if(round){headers['x-qa-round']=round;headers['x-qa-request-id']=String(ordinal);}
      if(wireBody)headers['content-length']=String(wireBody.length);
      row.enqueuedAt=now();
      try {
        req=driver.request({protocol:u.protocol,hostname:u.hostname,port:u.port||443,path,method,headers,agent},r=>{
          res=r;row.status=r.statusCode;row.headersAt=now();bodyTimer=setTimeout(()=>abort('BODY_TIMEOUT'),d.bodyMs);
          r.on('data',chunk=>{row.bytes+=chunk.length;if(row.bytes>d.maxBodyBytes){abort('BODY_TOO_LARGE');return;}if(capture)captured.push(chunk);});
          r.on('end',()=>{if(r.complete)row.bodyCompleteAt=now();else if(!row.error)row.error='BODY_INCOMPLETE';clearTimeout(bodyTimer);});
          r.on('error',()=>{if(!row.error)row.error='NETWORK_ERROR';});
        });
        activeRequests.set(req,abort);
        req.on('socket',socket=>{
          if(!sockets.has(socket)){sockets.add(socket);socket.once('close',()=>{sockets.delete(socket);readySockets.delete(socket);});}
          const ready=()=>{row.connectedAt=now();readySockets.add(socket);connectedPeak=Math.max(connectedPeak,readySockets.size);}; if(socket.connecting)socket.once(native?'secureConnect':'connect',ready);else ready();
        });
        // finish is Node's socket write/flush boundary, not Promise creation or queue admission.
        // HTTP/1.1 agent has one outstanding request per socket; remote receipt is independently read back in local tests.
        req.on('finish',()=>{if(done)return;row.transmittedAt=now();active++;wasActive=true;peak=Math.max(peak,active);});
        req.on('error',e=>{if(!row.error)row.error='NETWORK_ERROR';row.networkCode=['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOBUFS','EMFILE','EADDRNOTAVAIL'].includes(e.code)?e.code:'OTHER';}); req.on('close',()=>{activeRequests.delete(req);if(wasActive){active--;wasActive=false;}terminal(true);});
        requestTimer=setTimeout(()=>abort('REQUEST_TIMEOUT'),d.requestMs);
        req.end(wireBody);
      }catch {row.error='NETWORK_ERROR';terminal();}
    });
  }
  const c={origin,native,deadlines:d,request,abortAll(code='ROUND_TIMEOUT'){for(const abort of activeRequests.values())abort(code);},resetPeak(){if(active)throw new Error('UNDRAINED');peak=0;connectedPeak=readySockets.size;},stats:()=>({active,peak,sockets:sockets.size,connectedPeak}),async close(){for(const abort of activeRequests.values())abort('DRAIN_TIMEOUT');agent.destroy();const end=now()+d.drainMs;while((sockets.size||activeRequests.size)&&now()<end)await new Promise(r=>setTimeout(r,5));return {remainingClientSockets:sockets.size,remainingClientRequests:activeRequests.size};}};
  clients.add(c);return c;
}
export async function runRound({client,identities,requestsPerIdentity=50,roundId='final',capture=false,localAdmissionProof=null}) {
  if(!clients.has(client))throw new Error('TRANSPORT_DENIED');validateLoadIdentities(identities);
  if(!Number.isInteger(requestsPerIdentity)||requestsPerIdentity<1||requestsPerIdentity>50)throw new Error('CONTRACT_DENIED');
  client.resetPeak();const startedAt=now();const tasks=[];let ordinal=0,admissionStopped=false;
  const roundTimer=setTimeout(()=>client.abortAll('ROUND_TIMEOUT'),client.deadlines.roundMs);
  try {
    // Common pressure window; round-robin ownership, never 50 serial requests per user.
    outer:for(let n=0;n<requestsPerIdentity;n++)for(const identity of identities) {
      const attemptedAt=now();
      try {tasks.push(client.request({identity,path:client.native?'/functions/v1/transactions-api':'/load',method:client.native?'POST':'GET',body:client.native?{action:'list',app:'new',token:identity.accessToken,page:1,page_size:10,tab:'all'}:null,round:roundId,ordinal:ordinal++,capture:capture||client.native}));}
      catch {admissionStopped=true;tasks.push(Promise.resolve({body:null,row:{uid:identity.uid,sidDigest:sha256(identity.sid),ordinal:ordinal++,attemptedAt,enqueuedAt:null,connectedAt:null,transmittedAt:null,headersAt:null,bodyCompleteAt:null,terminalAt:now(),status:null,error:'ADMISSION_DENIED',uncertain:false,bytes:0}}));break outer;}
      // Local fixture admission is acknowledged by the actual server, with all responses still held.
      // This drains Windows' accept backlog, not requests; in-flight grows to 2500, never capped at 50.
      // Native mode is unpaced and never uses a server barrier or local-only acknowledgement.
      if(!client.native&&ordinal%50===0){if(localAdmissionProof)await localAdmissionProof(ordinal);else await new Promise(r=>setTimeout(r,5));}
    }
  }catch {admissionStopped=true;client.abortAll('ROUND_TIMEOUT');}
  const results=await Promise.all(tasks);clearTimeout(roundTimer);
  if(client.native)for(const x of results)if(x.row.status>=200&&x.row.status<300&&(!x.body||x.body.me?.user_id!==x.row.uid||!Array.isArray(x.body.rows)))x.row.error='IDENTITY_RESPONSE_MISMATCH';
  const endedAt=now();const rows=results.map(x=>x.row);const stats=client.stats();
  return {...summarize(rows,{startedAt,endedAt,transportPeak:stats.peak,connectedSocketPeak:stats.connectedPeak}),roundId,requestsPerIdentity,plannedRequests:50*requestsPerIdentity,admissionStopped,releaseWindowMs:rows.length?rows.at(-1).attemptedAt-rows[0].attemptedAt:0,rows};
}
