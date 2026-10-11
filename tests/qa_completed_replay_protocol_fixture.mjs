// TEST ONLY. Protocol fixture extraction; never import the original test callbacks.
// HTTP authority/provider/Edge/deployment are deterministic PROTOCOL MODELS.
// Only the parent's strict native adapter may execute the closed actual SELECTs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,createPublicKey} from 'node:crypto';
import * as api from '../scripts/qa-runtime-provenance.mjs';
import {pgJsonbDigest,parseCompletedReadQuery} from '../scripts/qa-load-preparation/completed-read-api.mjs';
import {readAsActualRole} from './qa_completed_read_native_reader.mjs';
export const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:stable(v)).digest('hex');
const queries=Object.freeze([api.RUNTIME_METADATA_SELECT,api.RUNTIME_INVENTORY_SELECT,api.RUNTIME_OWNED_METADATA_SELECT,api.RUNTIME_OWNED_INVENTORY_SELECT]);
export async function actualRead(d,query){
 assert(queries.includes(query),'closed immutable SELECT required');
 await d.query('BEGIN READ ONLY');
 try{assert.equal((await d.query("SELECT current_setting('transaction_read_only') value")).rows[0].value,'on');const r=await d.query(query);await d.query('COMMIT');return r.rows;}
 catch(e){await d.query('ROLLBACK');throw e;}
}
export async function protocolFixture(cleanups){
 const source=readFileSync(new URL('./qa_runtime_provenance.mjs',import.meta.url),'utf8');
 const start=source.indexOf('function fixture(t,'),end=source.indexOf("test('authentic signed approval");assert(start>=0&&end>start);
 const base=new URL('../scripts/qa-load-preparation/',import.meta.url).href;
 const body=source.slice(start,end).replace("  writeFileSync(join(root,'.gitattributes')","  mkdirSync(join(root,'supabase','migrations'),{recursive:true});writeFileSync(join(root,'supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql'),readFileSync(new URL("+JSON.stringify(new URL('../supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql',import.meta.url).href)+")));\n  writeFileSync(join(root,'.gitattributes')").replaceAll("new URL('../scripts/qa-load-preparation/'+name,import.meta.url)",`new URL(name,${JSON.stringify(base)})`).replaceAll("new URL('../scripts/qa-load-preparation/owned-control.sql',import.meta.url)",`new URL('owned-control.sql',${JSON.stringify(base)})`).replaceAll("new URL('../scripts/qa-load-preparation/'+n,import.meta.url)",`new URL(n,${JSON.stringify(base)})`);
 const module=await import('data:text/javascript;base64,'+Buffer.from(`
 import assert from 'node:assert/strict';import {generateKeyPairSync,sign,createHash} from 'node:crypto';
 import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
 const scratch=${JSON.stringify(process.env.QA_PROVENANCE_SCRATCH||'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch')};
 const api=await import(${JSON.stringify(new URL('../scripts/qa-runtime-provenance.mjs',import.meta.url).href)});
 const {OWNED_CONTROL_INVENTORY_FACETS,OWNED_CONTROL_FUNCTION_SPECS}=await import(${JSON.stringify(new URL('../scripts/qa-load-preparation/owned-attestation.mjs',import.meta.url).href)});
 const stable=v=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
 const hash=v=>createHash('sha256').update(v).digest('hex');${body};export {fixture};`).toString('base64'));
 const f=module.fixture({after:fn=>cleanups.push(fn)},{owned:true});
 f.state.hook=async req=>{
  const u=new URL(req.url);assert.equal(u.protocol,'https:');
  if(req.method==='POST'){assert.equal(u.hostname,'api.supabase.com');assert.equal(u.pathname,'/v1/projects/movzojtnkkmdsjhmlgtq/database/query/read-only');parseCompletedReadQuery(req.body?.query);}
  else{assert.equal(req.method,'GET');assert(
   (u.hostname==='review.example.invalid'&&u.pathname==='/status')||
   (u.hostname==='api.supabase.com'&&(/^\/v1\/projects\/movzojtnkkmdsjhmlgtq\/functions(?:\/[a-z-]+\/body)?$/).test(u.pathname))||
   (u.hostname==='movzojtnkkmdsjhmlgtq.supabase.co'&&(/^\/auth\/v1\/admin\/users\/[0-9a-f-]+$/).test(u.pathname))||
   (u.hostname==='api.cloudflare.com'&&u.pathname===`/client/v4/accounts/${f.cfg.cloudflareAccountId}/pages/projects/ceo-msajed`),'undeclared protocol path');}
 };
 return f;
}
// This is trusted fixture initialization BEFORE runtime preparation, not replay.
export async function pinPlanBeforePreparation(d,p,f){
 const pin=JSON.parse(readFileSync(f.pinPath));const signature=f.envelope(p.plan,'QA-OWNED-ROLEPLAN-v1').signature;
 const keyHash=hash(createPublicKey(pin.publicKey).export({type:'spki',format:'der'}));
 const before=(await d.query('SELECT payload FROM app_private.qa_owned_approved_plans WHERE plan_id=$1',[p.ownedControl.planId])).rows[0].payload;
 await d.query('UPDATE app_private.qa_owned_approved_plans SET signature=$2,signing_key_hash=$3 WHERE plan_id=$1',[p.ownedControl.planId,signature,keyHash]);
 const after=(await d.query('SELECT payload,signature,signing_key_hash FROM app_private.qa_owned_approved_plans WHERE plan_id=$1',[p.ownedControl.planId])).rows[0];assert.deepEqual(after.payload,before);assert.equal(after.signature,signature);assert.equal(after.signing_key_hash,keyHash);
 p.ownedControl.reviewerPublicKey=pin.publicKey;p.ownedControl.signedPlan.signature=signature;
}
export async function bindActual(d,f){
 const [m]=await actualRead(d,api.RUNTIME_METADATA_SELECT),[o]=await actualRead(d,api.RUNTIME_OWNED_METADATA_SELECT),[i]=await actualRead(d,api.RUNTIME_OWNED_INVENTORY_SELECT);
 // Exact native metadata, no field/function-definition translation or fabrication.
 Object.assign(f.state.metadata,m.metadata);f.state.postgresVersion=m.postgres_version;f.state.ownedMetadata=o.metadata;f.state.ownedIdentityDigest=o.control_identity_digest;f.state.sqlInventory=i.inventory;
 f.state.users=new Map(i.inventory.facets.auth_users.map(u=>[u.id,structuredClone(u)]));f.state.sqlRead=q=>actualRead(d,q);
 return {m,o,i};
}
export function requestFromActual(ds,plan){
 assert.equal(ds.length,57);const d=ds[0];return {runId:d.run_id,sourceId:d.source_id,operationId:d.operation_id,generation:d.generation,uid:d.target_user_id,canonicalKey:d.canonical_key,rolePlanDigest:plan.rolePlanDigest,ownershipReceiptDigest:d.ownership_receipt_digest,protectedSnapshotDigest:d.protected_snapshot_digest,authAbsenceDigest:d.auth_readback_digest,terminalReceiptDigest:hash(d.completed_receipt),nativeRootDigest:hash(d.native_root_receipt),finalCleanupDigest:hash(ds.map(d=>({sourceId:d.source_id,receipt:d.completed_receipt,nativeRoot:d.native_root_receipt})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId,'en')))};
}

// Owner-only retained original context BEFORE any preparation/lifecycle/replay.
export async function retainBeforePreparation(d,p,f){
 await d.query("SET search_path=''");await bindActual(d,f);
 const row=f.state.sqlInventory.ownedPlans.find(x=>x.plan_id===p.ownedControl.planId);assert(row);
 f.retainedPlan={planId:row.plan_id,envelope:{payload:structuredClone(row.payload),signature:row.signature},expiresAt:row.expires_at};
 f.retainedMetadata=structuredClone(f.state.ownedMetadata);
 assert.deepEqual(row.payload,p.plan);assert.equal(api.canonicalMetadataHash(f.retainedMetadata),p.ownedMetadataHash);
 assert.equal(pgJsonbDigest(f.retainedMetadata.controlIdentity),p.plan.controlIdentityDigest);
 assert.equal(pgJsonbDigest(f.retainedMetadata.nativeCatalog),f.retainedMetadata.nativeCatalogDigest);
 return {metadataHash:api.canonicalMetadataHash(f.retainedMetadata),metadataDigestPg:pgJsonbDigest(f.retainedMetadata),approvedPlanDigestPg:pgJsonbDigest(row.payload)};
}
// HTTP approval/status are protocol models, NOT real database inventory evidence.
// Retain the initial model's opaque inventory commitment; never re-label a
// trusted owner-only setup inventory or pass it to the strict read-role digest.
// Completed F3's primary evidence is exclusively the separately observed public
// API under the actual readonly role. The legacy writer remains unchanged.
export function completedProtocolApproval(f){
 assert(f.retainedPlan?.envelope?.payload&&f.retainedMetadata&&f.receipt?.payload);
 const now=Date.now(),payload=structuredClone(f.receipt.payload);
 payload.issuedAt=now;payload.expiresAt=now+60000;payload.inventoryCapturedAt=now;
 payload.rpc={identity:f.state.metadata.identity,metadataHash:api.canonicalMetadataHash(f.state.metadata)};
 payload.runtime={...payload.runtime,postgresVersion:f.state.postgresVersion};
 payload.ownedControlMetadataHash=api.canonicalMetadataHash(f.retainedMetadata);
 payload.ownedRolePlanDigest=f.retainedPlan.envelope.payload.rolePlanDigest;
 f.completedApprovalEvidence={classification:'DETERMINISTIC_HTTP_APPROVAL_MODEL_NOT_NATIVE_INVENTORY',originalModelInventoryCommitmentRetained:true,ownerInventoryRole:f.state.sqlInventory.readRole,roleTranslated:false};
 return f.envelope(payload,'QA-PROVENANCE-APPROVAL-v1');
}
export function bindCompletedApiReader(d,f){
 f.state.sqlRead=async q=>{const rows=await readAsActualRole(d,q);f.lastCompletedObservation={caller:rows[0].caller,proofPresent:rows[0].proof!==null,proofStatus:rows[0].proof?.status||null};return rows;};
}

export async function fullSnapshot(d){
 await d.query('BEGIN READ ONLY');try{
 const tables={},sequences={};
 for(const t of (await d.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','app_private','auth') ORDER BY 1,2")).rows){const q='"'+t.schemaname+'"."'+t.tablename.replaceAll('"','""')+'"';tables[t.schemaname+'.'+t.tablename]=(await d.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') snapshot FROM ${q} t`)).rows[0].snapshot;}
 for(const s of (await d.query("SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN ('public','app_private','auth') ORDER BY 1,2")).rows){const q='"'+s.schemaname+'"."'+s.sequencename.replaceAll('"','""')+'"';sequences[s.schemaname+'.'+s.sequencename]=(await d.query(`SELECT last_value,is_called FROM ${q}`)).rows;}
 const roles=(await d.query('SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig FROM pg_roles ORDER BY oid')).rows;
 const memberships=(await d.query('SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor')).rows;
 const relationACL=(await d.query("SELECT c.oid,n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private','auth') ORDER BY c.oid")).rows;
 const columnACL=(await d.query("SELECT a.attrelid,a.attnum,a.attname,a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app_private','auth') AND a.attnum>0 ORDER BY 1,2")).rows;
 const functionACL=(await d.query("SELECT p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private','auth') AND p.prokind='f' ORDER BY p.oid")).rows;
 const schemaACL=(await d.query("SELECT oid,nspname,nspowner,nspacl FROM pg_namespace WHERE nspname IN ('public','app_private','auth') ORDER BY oid")).rows;
 const sequenceCatalog=(await d.query('SELECT * FROM pg_sequence ORDER BY seqrelid')).rows;
 await d.query('COMMIT');return {tables,sequences,roles,memberships,relationACL,columnACL,functionACL,schemaACL,sequenceCatalog};
 }catch(e){await d.query('ROLLBACK');throw e;}
}
