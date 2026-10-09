import {createHash,verify} from 'node:crypto';
export const TARGET = Object.freeze({projectRef:'movzojtnkkmdsjhmlgtq',frontend:'https://ceo-msajed.pages.dev',backend:'https://movzojtnkkmdsjhmlgtq.supabase.co'});
export const ROLES = Object.freeze(['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary']);
export const CONTRACT = Object.freeze({identities:50,requestsPerIdentity:50,total:2500,targetTransportPeak:2500,ramps:[1,5,10,25],requestMs:30000,bodyMs:15000,drainMs:10000,roundMs:55000,maxBodyBytes:4*1024*1024});
export const sha256 = value=>createHash('sha256').update(value).digest('hex');
const permits=new WeakSet();
const denied=()=>{throw new Error('GATE_DENIED');};
const uuid = x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const hex = x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
function signed(envelope,key) {
  try {if(!envelope||!envelope.payload||typeof envelope.signature!=='string')denied();const bytes=JSON.stringify(envelope.payload);if(!verify(null,Buffer.from(bytes),key,Buffer.from(envelope.signature,'base64')))denied();return JSON.parse(bytes);}catch {denied();}
}
export function createNativePermit({approval,attestation,identities,trust,now=Date.now()}) {
  try {
    if(!trust?.publicKey||!/^[0-9a-f]{40}$/.test(trust.sourceSHA))denied();
    const a=signed(approval,trust.publicKey),t=signed(attestation,trust.publicKey);
    if(a.purpose!=='native-qa-load'||a.gate!=='APPROVED'||a.independentReviewer!==true||a.sourceSHA!==trust.sourceSHA||!hex(a.evidenceDigest))denied();
    if(!Number.isFinite(a.issuedAt)||a.issuedAt>now||!Number.isFinite(a.expiresAt)||a.expiresAt<now+CONTRACT.roundMs+CONTRACT.drainMs)denied();
    if(JSON.stringify(a.runnerHashes)!==JSON.stringify(trust.runnerHashes)||!Object.keys(trust.runnerHashes||{}).length||Object.values(trust.runnerHashes).some(x=>!hex(x)))denied();
    if(t.purpose!=='fresh-native-load-target'||t.sourceSHA!==a.sourceSHA||t.projectRef!==TARGET.projectRef||t.frontend!==TARGET.frontend||t.backend!==TARGET.backend||t.isolationReceiptDigest!==sha256(JSON.stringify(a)))denied();
    if(!Number.isFinite(t.capturedAt)||t.capturedAt>now||now-t.capturedAt>300000||!Number.isFinite(t.expiresAt)||t.expiresAt<now+CONTRACT.roundMs+CONTRACT.drainMs||typeof t.runId!=='string'||!t.runId)denied();
    if(t.readOnlyAction!=='list'||t.nativeRouteReviewed!==true||!hex(t.protectedSnapshotDigest)||!Array.isArray(t.staffUIDs)||t.staffUIDs.length!==57||!Array.isArray(t.legacyQAUIDs)||t.legacyQAUIDs.length!==8)denied();
    const protectedIDs=[...t.staffUIDs,...t.legacyQAUIDs]; if(protectedIDs.some(x=>!uuid(x))||new Set(protectedIDs).size!==65||!t.staffUIDs.includes(t.faisalUID))denied();
    if(!Array.isArray(identities)||identities.length!==50||!Array.isArray(t.ownership)||t.ownership.length!==50)denied();
    if(new Set(identities.map(x=>x.uid)).size!==50||new Set(identities.map(x=>x.sid)).size!==50||new Set(t.ownership.map(x=>x.uid)).size!==50||new Set(t.ownership.map(x=>x.canonicalKey)).size!==50)denied();
    for(const x of identities) {
      if(!uuid(x.uid)||!uuid(x.sid)||protectedIDs.includes(x.uid)||x.runId!==t.runId||x.kind!=='owned-load-qa'||typeof x.accessToken!=='string'||typeof x.apiKey!=='string'||!x.apiKey)denied();
      if(!x.apiKey.startsWith('sb_publishable_')){const keyClaims=JSON.parse(Buffer.from(x.apiKey.split('.')[1]||'','base64url').toString('utf8'));if(keyClaims.role!=='anon')denied();}
      const claims=JSON.parse(Buffer.from(x.accessToken.split('.')[1]||'','base64url').toString('utf8'));
      if(claims.sub!==x.uid||claims.session_id!==x.sid||claims.iss!==TARGET.backend+'/auth/v1'||claims.role!=='authenticated'||!Number.isFinite(claims.exp)||claims.exp*1000<now+CONTRACT.roundMs+CONTRACT.drainMs)denied();
      const o=t.ownership.find(o=>o.uid===x.uid);
      if(!o||['uid','sidDigest','canonicalKey','runId','kind','createdThisRun','nativeAuthReadback','nativeSessionReadback','profileReady','createReceiptDigest','persistedGETReceiptDigest'].some(k=>!Object.hasOwn(o,k))||o.sidDigest!==sha256(x.sid)||o.runId!==t.runId||o.kind!=='owned-load-qa'||o.createdThisRun!==true||o.nativeAuthReadback!==true||o.nativeSessionReadback!==true||o.profileReady!==true||!hex(o.createReceiptDigest)||!hex(o.persistedGETReceiptDigest)||typeof o.canonicalKey!=='string'||!o.canonicalKey)denied();
    }
    // JWT decoding is only consistency validation. Signed official Auth GET/session readbacks are mandatory.
    const p=Object.freeze({stage:'NativeProvider',target:TARGET,runId:t.runId,approvalDigest:sha256(JSON.stringify(a)),attestationDigest:sha256(JSON.stringify(t)),expiresAt:Math.min(a.expiresAt,t.expiresAt),sourceSHA:a.sourceSHA,runnerHashes:Object.freeze({...a.runnerHashes}),ownership:Object.freeze(t.ownership.map(o=>Object.freeze({...o}))),identities:Object.freeze(identities.map(x=>Object.freeze({...x,credentialExpiresAt:JSON.parse(Buffer.from(x.accessToken.split('.')[1],'base64url').toString('utf8')).exp*1000})))});
    permits.add(p);return p;
  } catch {denied();}
}
export function isNativePermit(p){return permits.has(p);}
export function validateLoadIdentities(ids) {
  if(!Array.isArray(ids)||ids.length!==50||new Set(ids.map(x=>x.uid)).size!==50||new Set(ids.map(x=>x.sid)).size!==50||ids.some(x=>!uuid(x.uid)||!uuid(x.sid)||typeof x.accessToken!=='string'))throw new Error('IDENTITY_DENIED');
}
