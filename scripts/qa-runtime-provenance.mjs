import {createHash, createPublicKey, verify, randomBytes} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {request as httpsRequest} from 'node:https';
import {completedApiBodyDigest,pgJsonbText,pgJsonbDigest,completedReadQuery,validateCompletedRequest,validateCompletedProof} from './qa-load-preparation/completed-read-api.mjs';
import {OWNED_CONTROL_PRIMARY_METADATA_SELECT,OWNED_CONTROL_INVENTORY_FACETS,OWNED_CONTROL_FUNCTION_SPECS} from './qa-load-preparation/owned-attestation.mjs';

// Inert import. Native readback is explicit and future-authorization-only.
const PROJECT = 'movzojtnkkmdsjhmlgtq';
const FRONTEND = 'https://ceo-msajed.pages.dev';
const ORIGIN = `https://${PROJECT}.supabase.co`;
const MANAGEMENT = `https://api.supabase.com/v1/projects/${PROJECT}`;
const LINK = 'public.account_provision_link_internal(text,uuid,jsonb)';
const HISTORICAL_MAPPING_BASE = '717375eee1e99d558af80eca91a7ea7e829edd20';
const EXECUTORS = Object.freeze(['accounts-create-originals.mjs', 'accounts-provision.mjs']);
const HEX = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_AGE = 60000;
export const MUTATION_SCOPES = Object.freeze(['account-create','account-link','account-reset','account-receipt','qa-create','qa-test','qa-session','qa-cleanup','qa-receipt']);
export const REQUIRED_EDGE_SLUGS = Object.freeze(['account-activate','account-admin-reset-password','account-confirm-password','account-resolve','legacy-login','legacy-read','session-logout','transactions-api']);
const readers = new WeakMap(), nativeGates = new WeakSet();
export function isRuntimeProvenanceGate(handle) { return nativeGates.has(handle); }
const deny = () => { const e = new Error('runtime_provenance_denied'); e.code = 'runtime_provenance_denied'; throw e; };
const need = v => { if (!v) deny(); };
const sha256 = v => createHash('sha256').update(v).digest('hex');
const keysExactly = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o,k));
const stable = v => {
  if (v === null || ['string','boolean'].includes(typeof v)) return JSON.stringify(v);
  if (typeof v === 'number') { need(Number.isFinite(v)); return JSON.stringify(v); }
  if (Array.isArray(v)) return '['+v.map(stable).join(',')+']';
  need(v && Object.getPrototypeOf(v) === Object.prototype);
  return '{'+Object.keys(v).sort().map(k => JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
};
const safe = fn => { try { return fn(); } catch { deny(); } };
const freeze = v => { if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; };
const timeValid = (p,now) => Number.isSafeInteger(p.issuedAt) && Number.isSafeInteger(p.expiresAt) && p.issuedAt <= now && now < p.expiresAt && p.expiresAt-p.issuedAt <= MAX_AGE;

// Catalog-only definition, named ABI, security properties, owner and effective
// ACL readback. No function execution, DDL or approved SQL edit.
export const RUNTIME_METADATA_SELECT = `SELECT
 pg_catalog.current_setting('server_version_num')::integer AS postgres_version,
 (SELECT pg_catalog.jsonb_build_object(
 'schema',n.nspname,'name',p.proname,
 'identity',n.nspname||'.'||p.proname||'('||(SELECT pg_catalog.string_agg(pg_catalog.format_type(t,NULL),',' ORDER BY ord) FROM pg_catalog.unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(t,ord))||')',
 'arguments',pg_catalog.pg_get_function_arguments(p.oid),
 'result',pg_catalog.pg_get_function_result(p.oid),
 'definition',pg_catalog.pg_get_functiondef(p.oid),
 'owner',pg_catalog.pg_get_userbyid(p.proowner),'language',l.lanname,
 'kind',p.prokind,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
 'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
 'config',pg_catalog.to_jsonb(p.proconfig),'support',p.prosupport::pg_catalog.regproc::text,
 'cost',p.procost,'rows',p.prorows,
 'argumentTypes',(SELECT pg_catalog.jsonb_agg(pg_catalog.format_type(t,NULL) ORDER BY ord) FROM pg_catalog.unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(t,ord)),
 'argumentNames',pg_catalog.to_jsonb(p.proargnames),'argumentModes',pg_catalog.to_jsonb(p.proargmodes),
 'defaultArguments',pg_catalog.pg_get_expr(p.proargdefaults,0),
 'acl',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'grantor',pg_catalog.pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
 'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb)
 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a),
 'overloadCount',(SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p2 WHERE p2.pronamespace=p.pronamespace AND p2.proname=p.proname))
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.oid=pg_catalog.to_regprocedure('public.account_provision_link_internal(text,uuid,jsonb)')) AS metadata;`;
const metadataKeys = Object.freeze(['schema','name','identity','arguments','result','definition','owner','language','kind','securityDefiner','leakproof','strict','volatility','parallel','config','acl','support','cost','rows','argumentTypes','argumentNames','argumentModes','defaultArguments','overloadCount']);

const ownedFunctionResults=Object.freeze(Object.fromEntries(OWNED_CONTROL_FUNCTION_SPECS.map(s=>[s.name,s.result])));
const ownedFunctionKeys=['oid','identity','definition','owner','acl','config','security_definer','volatile','strict','parallel','cost','rows','language','support','kind','leakproof','arg_types','all_arg_types','arg_modes','arg_names','arg_defaults','args','result'];
const ownedMetadataTables=['public.profiles','public.user_roles','public.user_memberships','public.account_migration_users','app_private.account_credential_state','app_private.qa_account_manifest','app_private.qa_run_members','app_private.qa_core_provision_context','public.legacy_archive','public.migration_gate','public.migration_receipts','public.workspace_edits','public.workspace_versions','app_private.qa_owned_frames','app_private.qa_owned_frame_empty','app_private.qa_owned_deletions','app_private.qa_owned_deletion_fences','app_private.qa_owned_native_anchor','app_private.qa_owned_native_frames','app_private.qa_owned_native_effects'];
function ownedMetadataHash(m){
  need(keysExactly(m,['functions','columns','triggers','closure','controlIdentity','nativeCatalogDigest','gateway','relations','nativeCatalog']) && Array.isArray(m.functions) && m.functions.length===Object.keys(ownedFunctionResults).length);
  const seen=new Set(),oids=new Set();
  for(const f of m.functions){
    need(keysExactly(f,ownedFunctionKeys) && typeof f.identity==='string');
    const name=f.identity.slice(0,f.identity.indexOf('('));
    need(Object.hasOwn(ownedFunctionResults,name) && !seen.has(name) && /^[1-9][0-9]*$/.test(f.oid) && !oids.has(f.oid));seen.add(name);oids.add(f.oid);
    need(f.result===ownedFunctionResults[name] && f.args===OWNED_CONTROL_FUNCTION_SPECS.find(s=>s.name===name).arguments && f.identity===name+'('+f.args.replace(/ DEFAULT (false|NULL::uuid|NULL::bigint|NULL)/g,'')+')' && typeof f.definition==='string' && f.definition.length>0 && typeof f.owner==='string' && f.owner.length>0 && typeof f.args==='string' && typeof f.arg_types==='string');
  }
  need(Array.isArray(m.columns) && m.columns.length>0 && m.columns.every(c=>keysExactly(c,['table','column','type','required','default','identity','generated'])) && ownedMetadataTables.every(t=>m.columns.some(c=>c.table===t)));
  need(Array.isArray(m.triggers) && m.triggers.length>0 && Array.isArray(m.closure) && m.closure.some(c=>c.conname==='qa_owned_native_closure' && c.contype==='f' && c.condeferrable===true && c.condeferred===true));
  need(m.nativeCatalog && Object.hasOwn(m.nativeCatalog,'fk') && Array.isArray(m.nativeCatalog.triggers) && Array.isArray(m.nativeCatalog.callbacks));
  need(HEX.test(m.nativeCatalogDigest) && m.gateway && m.gateway.role && m.gateway.businessWrite===false);
  const g=m.gateway.role;need(g.rolcanlogin===true && g.rolsuper===false && g.rolreplication===false);
  need(Array.isArray(m.relations) && m.relations.length===11 && [...ownedMetadataTables.slice(7,13),...ownedMetadataTables.slice(-5)].every(table=>m.relations.some(t=>t.table===table)) && m.relations.every(t=>t.owner==='postgres' && t.kind==='r' && t.partition===false));
  const root=m.functions.find(f=>f.identity==='app_private.qa_owned_native_root()'),close=m.functions.find(f=>f.identity==='app_private.qa_owned_native_close()');
  need(m.triggers.filter(t=>t.tgfoid===root.oid && t.tgname==='qa_owned_auth_root' && t.tgtype===11 && t.tgenabled==='O' && !t.tgdeferrable && t.tgqual===null && t.tgnargs===0 && (t.tgattr==='' || Array.isArray(t.tgattr) && t.tgattr.length===0)).length===1);
  need(m.triggers.filter(t=>t.tgfoid===close.oid && t.tgname==='00_qa_owned_native_close' && t.tgtype===5 && t.tgenabled==='O' && t.tgdeferrable && t.tginitdeferred && t.tgqual===null && t.tgnargs===0 && (t.tgattr==='' || Array.isArray(t.tgattr) && t.tgattr.length===0)).length===1);
  need(m.controlIdentity && Array.isArray(m.controlIdentity.functions) && m.controlIdentity.functions.length===46);
  return sha256(stable(m));
}
// Native PG's jsonb text digest is a distinct controller identity, not the
// canonical approval metadata hash. Derive both from the SAME primary SELECT.
export const RUNTIME_OWNED_METADATA_SELECT='SELECT metadata,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((metadata->\'controlIdentity\')::jsonb::text,\'UTF8\')),\'hex\') AS control_identity_digest FROM ('+OWNED_CONTROL_PRIMARY_METADATA_SELECT+' AS metadata) x;';

export function canonicalMetadataHash(metadata) { return safe(() => {
  if(metadata && Object.hasOwn(metadata,'functions'))return ownedMetadataHash(metadata);
  need(keysExactly(metadata,metadataKeys));
  need(metadata.schema==='public' && metadata.name==='account_provision_link_internal' && metadata.identity===LINK && metadata.overloadCount===1);
  need(metadata.result==='jsonb' && stable(metadata.argumentTypes)===stable(['text','uuid','jsonb']) && stable(metadata.argumentNames)===stable(['p_key','p_auth_user','p_memberships']));
  need(typeof metadata.definition==='string' && metadata.definition.length>0 && typeof metadata.arguments==='string' && Array.isArray(metadata.acl));
  return sha256(stable(metadata));
}); }

// Complete account/lifecycle inventory, not business/cleanup authorization.
// Explicit projections: never auth passwords, tokens, candidates, audit secrets.
const facets = Object.freeze({
 auth_users:['auth.users','id,email,email_confirmed_at,banned_until,deleted_at'],
 sessions:['auth.sessions','id,user_id,created_at,not_after'],
 registry:['public.account_migration_users','canonical_key,preferred_login,login_username,display_name,role_code,org_name,dept_names,internal_email,eligible,migrated_user_id,must_change_password'],
 profiles:['public.profiles','id,login_name,full_name,active,must_change_password'],
 units:['public.organizational_units','id,name,unit_type,parent_id,active'],
 roles:['public.roles','code,name_ar'],
 permissions:['public.permissions','code,name_ar'],
 role_permissions:['public.role_permissions','role_code,permission_code'],
 user_roles:['public.user_roles','user_id,role_code,is_primary'],
 memberships:['public.user_memberships','user_id,unit_id,membership_role,is_primary,active'],
 user_permissions:['public.user_permissions','user_id,permission_code,effect'],
 permission_overrides:['public.account_permission_overrides','canonical_key,permission_code,effect'],
 credential_state:['app_private.account_credential_state','user_id,generation,session_valid_after'],
 operations:['app_private.account_password_operations','operation_id,actor_id,actor_session_id,target_id,kind,status,generation,source'],
 qa_runs:['app_private.qa_runs','run_id,phase,active,expires_at'],
 qa_accounts:['app_private.qa_account_manifest','user_id,canonical_key,login_alias,principal_class,run_id,owned_creation_operation,owned_creation_receipt_id,tombstoned_at'],
 qa_members:['app_private.qa_run_members','run_id,user_id,role_code,active'],
 qa_transactions:['app_private.qa_transaction_manifest','transaction_id,run_id,owned_creation_operation,tombstoned_at'],
});
export const INVENTORY_FACETS = Object.freeze(Object.keys(facets));
export const RUNTIME_INVENTORY_SELECT = 'SELECT pg_catalog.jsonb_build_object(\'readRole\',current_user,\'unfiltered\',NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.rolname=current_user WHERE c.oid=ANY(ARRAY['+INVENTORY_FACETS.map(k=>`'${facets[k][0]}'::pg_catalog.regclass`).join(',')+']) AND c.relrowsecurity AND NOT(r.rolsuper OR r.rolbypassrls OR (c.relowner=r.oid AND NOT c.relforcerowsecurity))),\'facets\',pg_catalog.jsonb_build_object('+INVENTORY_FACETS.map(k => `'${k}',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY pg_catalog.to_jsonb(x)::text),'[]'::jsonb) FROM (SELECT ${facets[k][1]} FROM ${facets[k][0]}) x)`).join(',')+'),\'counts\',pg_catalog.jsonb_build_object('+INVENTORY_FACETS.map(k=>`'${k}',(SELECT pg_catalog.count(*) FROM ${facets[k][0]})`).join(',')+')) AS inventory;';

const ownedFacetKeys=Object.freeze({"qaOwnedPlans":["plan_id","signing_key_hash","source_hash","expires_at","role_plan_digest","control_identity_digest"],"qaOwnedRunReceipts":["run_id","plan_id","completed_at","role_plan_digest","control_identity_digest"],"qaOwnedSources":["run_id","source_id","create_operation","creation_receipt","user_id","session_id","state","canonical_key","login_alias","email","role_code","memberships","role_plan_digest"],"qaOwnedOperations":["run_id","operation_id","scope","resource_key","state","actual","history","reserved_at"],"qaOwnedResources":["receipt_id","run_id","create_operation","source_id","owner_uid","canonical_key","kind","surface","table_oid","pk","row_digest","auth_get_digest","session_id","disposed_at","effect_sequence"],"qaOwnedFrames":["backend_pid","sql_xid","source_oid","run_id","source_id","phase","effect_table","effect_op","effect_state","effect_sequence","closure"],"qaOwnedClosureEmpty":["id"],"qaOwnedDeletions":["operation_id","run_id","source_id","target_user_id","canonical_key","generation","status","ownership_receipt_digest","protected_snapshot_digest","prepared_at","auth_readback_digest","absence_observed_at","completed_receipt","native_root_receipt"],"qaOwnedDeletionFences":["target_user_id","canonical_key","run_id","operation_id","generation"],"qaOwnedNativeAnchor":["id","gateway_oid","catalog_digest","gateway_metadata"],"qaOwnedNativeFrames":["backend_pid","sql_xid","operation_id","generation","source_oid","gateway_oid","root_uid","root_state","closure"],"qaOwnedNativeEffects":["operation_id","generation","effect_slot","receipt_id","table_oid","pk","effect_old","effect_new","effect_op","parent_table","parent_pk","fk_oid","ri_oid","depth","effect_state","guard_oid","observed_pid","observed_xid"]});
export const OWNED_INVENTORY_FACETS=Object.freeze(Object.keys(ownedFacetKeys));
const ownedTables=Object.values(OWNED_CONTROL_INVENTORY_FACETS).map(q=>/ FROM ([a-z_.]+) ORDER BY /.exec(q)[1]);
// Preserve the original 18 facets; add seven complete projections, independent
// counts, and a single-statement unfiltered proof for every relation. Full plan
// payloads/receipts and current units prevent a claimed digest echo from passing.
const ownedArray=q=>'(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY pg_catalog.to_jsonb(x)::text),\'[]\'::jsonb) FROM ('+q+') x)';
export const RUNTIME_OWNED_INVENTORY_SELECT='SELECT (x.inventory || pg_catalog.jsonb_build_object(\'unfiltered\',(x.inventory->>\'unfiltered\')::boolean AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.rolname=current_user WHERE c.oid=ANY(ARRAY['+ownedTables.map(t=>"'"+t+"'::pg_catalog.regclass").join(',')+']) AND c.relrowsecurity AND NOT(r.rolsuper OR r.rolbypassrls OR (c.relowner=r.oid AND NOT c.relforcerowsecurity))),\'facets\',x.inventory->\'facets\' || pg_catalog.jsonb_build_object('+Object.entries(OWNED_CONTROL_INVENTORY_FACETS).map(([k,q])=>"'"+k+"',"+ownedArray(q)).join(',')+'),\'counts\',x.inventory->\'counts\' || pg_catalog.jsonb_build_object('+OWNED_INVENTORY_FACETS.map((k,i)=>"'"+k+"',(SELECT pg_catalog.count(*) FROM "+ownedTables[i]+')').join(',')+'),\'ownedPlans\','+ownedArray('SELECT plan_id,payload,signature,signing_key_hash,source_hash,expires_at FROM app_private.qa_owned_approved_plans')+',\'ownedRunPlans\','+ownedArray('SELECT run_id,plan_id,plan_payload,completed_at FROM app_private.qa_owned_run_receipts')+',\'ownedUnits\','+ownedArray('SELECT * FROM public.organizational_units')+')) AS inventory FROM ('+RUNTIME_INVENTORY_SELECT.replace(/;$/,'')+') x;';


function durableInventory(f,counts){
  need(counts.qaOwnedNativeFrames===0);
  const seen=new Set();
  for(const d of f.qaOwnedDeletions){
    need(UUID.test(d.operation_id) && UUID.test(d.run_id) && UUID.test(d.target_user_id) && !seen.has(d.operation_id) && Number.isSafeInteger(d.generation) && d.generation>0 && ['delete_prepared','auth_delete_in_flight','auth_delete_unknown','db_finalize_pending','completed'].includes(d.status) && HEX.test(d.ownership_receipt_digest) && HEX.test(d.protected_snapshot_digest) && Number.isFinite(Date.parse(d.prepared_at)));seen.add(d.operation_id);
    const fence=f.qaOwnedDeletionFences.filter(x=>x.operation_id===d.operation_id);
    need(fence.length===(d.status==='completed'?0:1));
    if(fence.length)need(stable(fence[0])===stable({target_user_id:d.target_user_id,canonical_key:d.canonical_key,run_id:d.run_id,operation_id:d.operation_id,generation:d.generation}));
    if(['db_finalize_pending','completed'].includes(d.status))need(HEX.test(d.auth_readback_digest) && Number.isFinite(Date.parse(d.absence_observed_at)) && !f.auth_users.some(u=>u.id===d.target_user_id) && !f.sessions.some(s=>s.user_id===d.target_user_id));
    else need(d.auth_readback_digest===null && d.absence_observed_at===null);
    if(d.native_root_receipt!==null){const x=d.native_root_receipt;need(keysExactly(x,['operation_id','generation','target_user_id','source_oid','gateway_oid','backend_pid','sql_xid','effect','closure','projection_digest']) && x.operation_id===d.operation_id && x.generation===d.generation && x.target_user_id===d.target_user_id && x.effect==='DELETE' && x.closure==='all_exact_native_effects_observed' && HEX.test(x.projection_digest));}
    if(d.status==='completed'){
      need(d.native_root_receipt!==null);
      const receipt={operation_id:d.operation_id,run_id:d.run_id,target_user_id:d.target_user_id,canonical_key:d.canonical_key,generation:d.generation,status:'completed',ownership_receipt_digest:d.ownership_receipt_digest,protected_snapshot_digest:d.protected_snapshot_digest,prepared_at:d.prepared_at,auth_readback_digest:d.auth_readback_digest,db_absent:true,auth_absent:true};
      need(stable(d.completed_receipt)===stable(receipt));
    }else need(d.completed_receipt===null);
  }
  need(f.qaOwnedDeletionFences.every(x=>seen.has(x.operation_id)));
  const slots=new Set();
  for(const e of f.qaOwnedNativeEffects){
    const ds=f.qaOwnedDeletions.filter(d=>d.operation_id===e.operation_id && d.generation===e.generation);need(ds.length===1);const d=ds[0];
    const key=e.operation_id+':'+e.generation+':'+e.effect_slot;need(!slots.has(key) && Number.isSafeInteger(e.effect_slot) && e.effect_slot>0 && UUID.test(e.receipt_id) && ['DELETE','UPDATE'].includes(e.effect_op) && [2,3].includes(e.depth) && ['captured','observed'].includes(e.effect_state) && e.effect_old && typeof e.effect_old==='object' && e.pk && typeof e.pk==='object');slots.add(key);
    need(['table_oid','parent_table','fk_oid','ri_oid'].every(k=>/^[1-9][0-9]*$/.test(e[k])) && (e.effect_op==='DELETE'?e.effect_new===null:e.effect_new && typeof e.effect_new==='object'));
    if(e.effect_state==='observed')need(/^[1-9][0-9]*$/.test(e.guard_oid) && Number.isSafeInteger(e.observed_pid) && e.observed_pid>0 && /^[1-9][0-9]*$/.test(e.observed_xid));
    else need(e.guard_oid===null && e.observed_pid===null && e.observed_xid===null);
    if(d.native_root_receipt!==null || d.status==='completed')need(e.effect_state==='observed');
  }
}

export function inventorySnapshotDigest(inventory) { return safe(() => {
  const owned=Object.hasOwn(inventory,'ownedPlans'),names=owned?[...INVENTORY_FACETS,...OWNED_INVENTORY_FACETS]:INVENTORY_FACETS;
  need(keysExactly(inventory,['readRole','unfiltered','facets','counts',...(owned?['ownedPlans','ownedRunPlans','ownedUnits']:[])]) && inventory.readRole==='supabase_read_only_user' && inventory.unfiltered===true && keysExactly(inventory.facets,names) && keysExactly(inventory.counts,names));
  const normalized={readRole:inventory.readRole,unfiltered:true,facets:{},counts:{}};
  for (const k of names) {
    const rows=inventory.facets[k],count=inventory.counts[k];
    need(Array.isArray(rows) && Number.isSafeInteger(count) && count>=0 && rows.length===count && rows.every(r=>keysExactly(r,ownedFacetKeys[k]??facets[k][1].split(','))));
    normalized.facets[k]=rows.map(r=>JSON.parse(stable(r))).sort((a,b)=>stable(a).localeCompare(stable(b),'en'));
    normalized.counts[k]=count;
  }
  if(owned){
    durableInventory(inventory.facets,inventory.counts);
    need(inventory.ownedPlans.length===inventory.counts.qaOwnedPlans && inventory.ownedRunPlans.length===inventory.counts.qaOwnedRunReceipts && inventory.ownedUnits.length===inventory.counts.units);
    for(const k of ['ownedPlans','ownedRunPlans','ownedUnits']){need(Array.isArray(inventory[k]));normalized[k]=inventory[k].map(r=>JSON.parse(stable(r))).sort((a,b)=>stable(a).localeCompare(stable(b),'en'));}
    need(inventory.ownedPlans.every(r=>keysExactly(r,['plan_id','payload','signature','signing_key_hash','source_hash','expires_at'])) && inventory.ownedRunPlans.every(r=>keysExactly(r,['run_id','plan_id','plan_payload','completed_at'])));
  }
  return sha256(stable(normalized));
}); }


export const RUNTIME_OWNED_CLOSING_SELECT='SELECT m.metadata,m.control_identity_digest,i.inventory FROM ('+RUNTIME_OWNED_METADATA_SELECT.replace(/;$/,'')+') m CROSS JOIN ('+RUNTIME_OWNED_INVENTORY_SELECT.replace(/;$/,'')+') i;';


function nativeReceiptsBound(m,i){
 const a=i.facets.qaOwnedNativeAnchor;need(a.length===1 && a[0].gateway_oid===m.gateway.role.oid && a[0].catalog_digest===m.nativeCatalogDigest && stable(a[0].gateway_metadata)===stable({role:m.gateway.role,memberships:m.gateway.memberships}));
 const root=m.functions.find(f=>f.identity==='app_private.qa_owned_native_root()');
 for(const d of i.facets.qaOwnedDeletions)if(d.native_root_receipt!==null){const x=d.native_root_receipt;need(String(x.source_oid)===root.oid && String(x.gateway_oid)===a[0].gateway_oid);}
 for(const e of i.facets.qaOwnedNativeEffects){
  const fk=(m.nativeCatalog.fk??[]).filter(c=>String(c.oid)===e.fk_oid && String(c.conrelid)===e.table_oid && String(c.confrelid)===e.parent_table && ['c','n'].includes(c.confdeltype));need(fk.length===1);
  need(m.nativeCatalog.triggers.some(t=>String(t.tgconstraint)===e.fk_oid && String(t.tgfoid)===e.ri_oid && t.tgisinternal===true));
  need(m.nativeCatalog.callbacks.some(f=>String(f.oid)===e.ri_oid && typeof f.body==='string' && f.body.length>0));
  if(e.effect_state==='observed')need(m.nativeCatalog.triggers.some(t=>String(t.tgrelid)===e.table_oid && String(t.tgfoid)===e.guard_oid && t.tgtype===31 && t.tgenabled==='O'));
 }
}

const ownedSourceHashes=root=>Object.fromEntries(['owned-control.sql','owned-deletion-fence.sql'].map(n=>[n,sha256(readFileSync(join(root,'scripts','qa-load-preparation',n)))]));
function ownedBinding(inventory,identityDigest,expected,root){
  need(HEX.test(identityDigest) && Object.hasOwn(inventory,'ownedPlans'));
  const anchors=inventory.facets.qaOwnedNativeAnchor;need(anchors.length===1 && anchors[0].id===1 && /^[1-9][0-9]*$/.test(anchors[0].gateway_oid) && HEX.test(anchors[0].catalog_digest));
  const now=Date.now(),sourceHash=sha256(readFileSync(join(root,'scripts','qa-load-preparation','owned-control.sql')));
  const sourceHashes=ownedSourceHashes(root);
  const candidates=inventory.ownedPlans.filter(r=>expected?r.payload?.rolePlanDigest===expected:Date.parse(r.expires_at)>now);
  need(candidates.length===1);const row=candidates[0],p=row.payload;
  need(keysExactly(p,['runId','controlIdentityDigest','rolePlanDigest','sourceHash','resources','units','protectedUIDs','protectedCanonicalKeys','sourceHashes']) && UUID.test(row.plan_id) && UUID.test(p.runId));
  need(HEX.test(row.signing_key_hash) && stable(p.sourceHashes)===stable(sourceHashes) && row.source_hash===sourceHash && p.sourceHash===sourceHash && typeof row.signature==='string' && row.signature.length>0 && Date.parse(row.expires_at)>now && p.controlIdentityDigest===identityDigest);
  need(Array.isArray(p.resources) && p.resources.length===57 && Array.isArray(p.units) && p.units.length>0 && Array.isArray(p.protectedUIDs) && Array.isArray(p.protectedCanonicalKeys));
  const digest=sha256(stable({resources:p.resources.map(({rolePlanDigest,...r})=>r),units:p.units}));
  need(HEX.test(p.rolePlanDigest) && digest===p.rolePlanDigest && (!expected || digest===expected));
  need(p.units.every(u=>inventory.ownedUnits.some(actual=>stable(actual)===stable(u))));
  need(p.resources.every(r=>r.runId===p.runId && r.rolePlanDigest===digest && inventory.facets.roles.some(role=>role.code===r.role) && Array.isArray(r.memberships) && r.memberships.length>0 && r.memberships.every(m=>p.units.some(u=>u.id===m.unit_id))));
  const planFacet=inventory.facets.qaOwnedPlans.filter(r=>r.plan_id===row.plan_id);need(planFacet.length===1);
  need(stable(planFacet[0])===stable({plan_id:row.plan_id,signing_key_hash:row.signing_key_hash,source_hash:row.source_hash,expires_at:row.expires_at,role_plan_digest:digest,control_identity_digest:identityDigest}));
  const receipts=inventory.ownedRunPlans.filter(r=>r.plan_id===row.plan_id || r.run_id===p.runId),sources=inventory.facets.qaOwnedSources.filter(r=>r.run_id===p.runId);
  need(receipts.length<=1 && sources.length===(receipts.length?p.resources.length:0) && new Set(sources.map(r=>r.source_id)).size===sources.length);
  for(const r of receipts){
    need(r.plan_id===row.plan_id && r.run_id===p.runId && stable(r.plan_payload)===stable(p));
    const projected=inventory.facets.qaOwnedRunReceipts.filter(x=>x.run_id===r.run_id || x.plan_id===r.plan_id);need(projected.length===1 && stable(projected[0])===stable({run_id:r.run_id,plan_id:r.plan_id,completed_at:r.completed_at,role_plan_digest:digest,control_identity_digest:identityDigest}));
  }
  for(const r of sources){
    const source=p.resources.filter(s=>s.sourceId===r.source_id);need(source.length===1);const s=source[0];
    need(r.create_operation===s.createOperation && r.creation_receipt===s.receiptId && r.role_plan_digest===digest && r.canonical_key===s.canonicalKey && r.login_alias===s.loginAlias && r.email===s.email && r.role_code===s.role && stable(r.memberships)===stable(s.memberships));
  }
  for(const d of inventory.facets.qaOwnedDeletions){const s=sources.filter(s=>s.source_id===d.source_id);need(s.length===1 && s[0].run_id===d.run_id && s[0].user_id===d.target_user_id && s[0].canonical_key===d.canonical_key);}
  need(inventory.counts.qaOwnedFrames===0 && inventory.counts.qaOwnedClosureEmpty===0 && inventory.counts.qaOwnedNativeFrames===0);
  return digest;
}

function readPin(config) { return safe(() => {
  need(isAbsolute(config.authorityPinPath) && HEX.test(config.authorityPinHash));
  const bytes=readFileSync(config.authorityPinPath); need(sha256(bytes)===config.authorityPinHash);
  const p=JSON.parse(bytes); need(keysExactly(p,['schema','issuer','keyId','publicKey','statusUrl']) && p.schema===1 && typeof p.issuer==='string' && p.issuer.length>0 && typeof p.keyId==='string' && p.keyId.length>0);
  const key=createPublicKey(p.publicKey);need(key.asymmetricKeyType==='ed25519');
  const url=new URL(p.statusUrl);need(url.protocol==='https:' && !url.username && !url.password && !url.hash && !url.search);
  return {...p,key};
}); }
function authenticated(envelope,pin,domain) {
  need(keysExactly(envelope,['payload','signature']) && typeof envelope.signature==='string' && /^[A-Za-z0-9+/]{86}==$/.test(envelope.signature));
  const p=envelope.payload;need(p.issuer===pin.issuer && p.keyId===pin.keyId);
  need(verify(null,Buffer.from(domain+'\n'+stable(p)),pin.key,Buffer.from(envelope.signature,'base64')));
  return p;
}
function validateApproval(envelope,pin,now) {
  const p=authenticated(envelope,pin,'QA-PROVENANCE-APPROVAL-v1');
  const qa=Array.isArray(p.scopes) && p.scopes.some(s=>typeof s==='string' && s.startsWith('qa-'));
  const ownedFields=['ownedControlMetadataHash','ownedRolePlanDigest'];
  const paired=ownedFields.every(k=>Object.hasOwn(p,k));
  need(!qa || paired);
  need(keysExactly(p,['schema','issuer','keyId','receiptId','verdict','independent','projectRef','frontendOrigin','operationId','scopes','issuedAt','expiresAt','release','localHashes','rpc','edges','runtime','frontend','inventoryDigest','inventoryCapturedAt',...(paired?ownedFields:[])]));
  if(paired)need(ownedFields.every(k=>HEX.test(p[k])));
  need(p.schema===1 && p.verdict==='APPROVED' && p.independent===true && p.projectRef===PROJECT && p.frontendOrigin===FRONTEND && UUID.test(p.receiptId) && UUID.test(p.operationId) && timeValid(p,now));
  need(keysExactly(p.release,['sourceSha','postMerge']) && SHA.test(p.release.sourceSha) && p.release.sourceSha!==HISTORICAL_MAPPING_BASE && p.release.postMerge===true);
  need(Array.isArray(p.scopes) && p.scopes.length>0 && new Set(p.scopes).size===p.scopes.length && p.scopes.every(s=>MUTATION_SCOPES.includes(s)));
  need(keysExactly(p.localHashes,EXECUTORS) && Object.values(p.localHashes).every(h=>HEX.test(h)));
  need(keysExactly(p.rpc,['identity','metadataHash']) && p.rpc.identity===LINK && HEX.test(p.rpc.metadataHash));
  need(keysExactly(p.runtime,['nodeVersion','postgresVersion','sourceSha']) && /^v\d+\.\d+\.\d+$/.test(p.runtime.nodeVersion) && Number.isSafeInteger(p.runtime.postgresVersion) && p.runtime.postgresVersion>0 && p.runtime.sourceSha===p.release.sourceSha);
  need(keysExactly(p.frontend,['deploymentId','sourceSha']) && typeof p.frontend.deploymentId==='string' && p.frontend.deploymentId.length>0 && p.frontend.sourceSha===p.release.sourceSha);
  need(Array.isArray(p.edges) && p.edges.length===REQUIRED_EDGE_SLUGS.length && new Set(p.edges.map(e=>e.slug)).size===REQUIRED_EDGE_SLUGS.length);
  for (const e of p.edges) need(keysExactly(e,['slug','id','version','sourceHash','ezbrHash','sourceSha']) && REQUIRED_EDGE_SLUGS.includes(e.slug) && typeof e.id==='string' && e.id.length>0 && Number.isSafeInteger(e.version) && e.version>0 && HEX.test(e.sourceHash) && HEX.test(e.ezbrHash) && e.sourceSha===p.release.sourceSha);
  need(HEX.test(p.inventoryDigest) && Number.isSafeInteger(p.inventoryCapturedAt) && p.inventoryCapturedAt<=now && now-p.inventoryCapturedAt<=MAX_AGE);
  return p;
}
function sourceReadback(config) { return safe(() => {
  const root=realpathSync(config.repositoryRoot);
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000,maxBuffer:1024*1024}).trim();
  const sourceSha=git('rev-parse','HEAD');need(SHA.test(sourceSha) && sourceSha!==HISTORICAL_MAPPING_BASE && git('rev-parse','refs/heads/main')===sourceSha);
  need(git('status','--porcelain','--untracked-files=all')==='');
  const localHashes={};
  for(const name of EXECUTORS) {
    const path=join(root,'scripts',name); need(realpathSync(path)===path);
    const bytes=readFileSync(path); const committed=execFileSync('git',['-C',root,'show',`${sourceSha}:scripts/${name}`],{stdio:['ignore','pipe','pipe'],timeout:5000,maxBuffer:16*1024*1024});
    // Git's clean text checkout can use CRLF. Only commit-linkage comparison
    // canonicalizes line endings; approval always binds exact RAW file bytes.
    const sourceText=v=>v.toString('utf8').replaceAll('\r\n','\n');
    need(sourceText(bytes)===sourceText(committed));localHashes[name]=sha256(bytes);
  }
  return {sourceSha,localHashes};
}); }
// No redirects or retry; bounded response and wall time; fixed HTTPS origins.
function nativeRequest(req) { return new Promise((resolve,reject)=>{
  let settled=false,timer;
  const fail=()=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error('runtime_provenance_denied'));}};
  const r=httpsRequest(req.url,{method:req.method,headers:req.headers},res=>{
    if(res.statusCode<200 || res.statusCode>=300){res.destroy();fail();return;}
    const chunks=[];let size=0;
    res.on('data',b=>{size+=b.length;if(size>32*1024*1024){res.destroy();fail();}else chunks.push(b);});
    res.on('error',fail);res.on('aborted',fail);
    res.on('end',()=>{if(settled)return;try{const bytes=Buffer.concat(chunks);const value=req.raw?bytes:JSON.parse(bytes.toString('utf8'));settled=true;clearTimeout(timer);resolve(value);}catch{fail();}});
  });
  r.on('error',fail);timer=setTimeout(()=>{r.destroy();fail();},5000);
  if(req.body)r.write(JSON.stringify(req.body));r.end();
}); }
function makeReader(config,native) { return safe(()=>{
  need(config && isAbsolute(config.repositoryRoot) && /^[0-9a-f]{32}$/.test(config.cloudflareAccountId));
  if(native) {
    need(!Object.hasOwn(config,'transport') && !Object.hasOwn(config,'verify'));
    need(realpathSync(config.repositoryRoot)===realpathSync(fileURLToPath(new URL('..',import.meta.url))));
  }
  else need(typeof config.transport==='function');
  const cfg={repositoryRoot:config.repositoryRoot,authorityPinPath:config.authorityPinPath,authorityPinHash:config.authorityPinHash,cloudflareAccountId:config.cloudflareAccountId};
  readPin(cfg);
  const creds=config.credentials;need(keysExactly(creds,['supabaseManagementToken','authAdminKey','cloudflareToken']) && Object.values(creds).every(v=>typeof v==='string' && v.length>0));
  const secrets={...creds},transport=native?nativeRequest:config.transport;
  const call=async(method,url,key,body,raw=false)=>{
    const headers={accept:raw?'application/octet-stream':'application/json'};
    if(key)headers.authorization=`Bearer ${key}`;
    if(new URL(url).origin===ORIGIN)headers.apikey=secrets.authAdminKey;
    if(body)headers['content-type']='application/json';
    return await transport({method,url,headers,body,raw});
  };
  const capture=async(owned=false,rolePlanDigest)=>{
    try {
      const startedAt=Date.now(),local=sourceReadback(cfg),sourceHashes=owned?ownedSourceHashes(cfg.repositoryRoot):null;
      const metadataRows=await call('POST',MANAGEMENT+'/database/query/read-only',secrets.supabaseManagementToken,{query:RUNTIME_METADATA_SELECT});
      need(Array.isArray(metadataRows) && metadataRows.length===1);
      const metadata=metadataRows[0].metadata,metadataHash=canonicalMetadataHash(metadata),postgresVersion=metadataRows[0].postgres_version;
      need(Number.isSafeInteger(postgresVersion) && postgresVersion>0);
      let ownedControlMetadataHash,ownedIdentityDigest,ownedRolePlanDigest,ownedMetadata;
      const captureOwnedMetadata=async()=>{
        const rows=await call('POST',MANAGEMENT+'/database/query/read-only',secrets.supabaseManagementToken,{query:RUNTIME_OWNED_METADATA_SELECT});
        need(Array.isArray(rows) && rows.length===1 && keysExactly(rows[0],['metadata','control_identity_digest']) && HEX.test(rows[0].control_identity_digest));
        return {hash:canonicalMetadataHash(rows[0].metadata),identity:rows[0].control_identity_digest,metadata:rows[0].metadata};
      };
      if(owned){const m=await captureOwnedMetadata();ownedControlMetadataHash=m.hash;ownedIdentityDigest=m.identity;ownedMetadata=m.metadata;}
      const inventoryQuery=owned?RUNTIME_OWNED_INVENTORY_SELECT:RUNTIME_INVENTORY_SELECT;
      const edgeRows=await call('GET',MANAGEMENT+'/functions',secrets.supabaseManagementToken);
      need(Array.isArray(edgeRows));const edges=[];
      for(const slug of REQUIRED_EDGE_SLUGS) {
        const matches=edgeRows.filter(e=>e.slug===slug);need(matches.length===1);
        const e=matches[0];need(e.status==='ACTIVE' && typeof e.id==='string' && e.id.length>0 && Number.isSafeInteger(e.version) && e.version>0 && HEX.test(e.ezbr_sha256));
        const body=await call('GET',MANAGEMENT+`/functions/${slug}/body`,secrets.supabaseManagementToken,undefined,true);
        need(Buffer.isBuffer(body) && body.length>0);
        edges.push({slug,id:e.id,version:e.version,sourceHash:sha256(body),ezbrHash:e.ezbr_sha256});
      }
      // Rollback-aware canonical deployment, not simply the newest deployment.
      const cf=await call('GET',`https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}/pages/projects/ceo-msajed`,secrets.cloudflareToken);
      need(cf?.success===true && cf.result?.name==='ceo-msajed' && cf.result.subdomain==='ceo-msajed.pages.dev');
      const d=cf.result.canonical_deployment;need(d && d.environment==='production' && d.latest_stage?.name==='deploy' && d.latest_stage.status==='success' && typeof d.id==='string' && d.id.length>0);
      const commit=d.deployment_trigger?.metadata?.commit_hash;need(SHA.test(commit));
      const inventoryRows=await call('POST',MANAGEMENT+'/database/query/read-only',secrets.supabaseManagementToken,{query:inventoryQuery});
      need(Array.isArray(inventoryRows) && inventoryRows.length===1);
      const inventory=inventoryRows[0].inventory,inventoryDigest=inventorySnapshotDigest(inventory);
      if(owned)nativeReceiptsBound(ownedMetadata,inventory);
      if(owned)ownedRolePlanDigest=ownedBinding(inventory,ownedIdentityDigest,rolePlanDigest,cfg.repositoryRoot);
      const seen=new Set();
      for(const u of inventory.facets.auth_users) {
        need(UUID.test(u.id) && !seen.has(u.id));seen.add(u.id);
        const got=await call('GET',ORIGIN+`/auth/v1/admin/users/${u.id}`,secrets.authAdminKey);
        need(got && got.id===u.id && got.email===u.email && got.email_confirmed_at===u.email_confirmed_at);
        // Typed database values supplement omissions, never inferred nulls.
        for(const field of ['banned_until','deleted_at']) need((u[field]===null || typeof u[field]==='string') && (!Object.hasOwn(got,field) || got[field]===u[field]));
      }
      // Closing readbacks detect changes in earlier observations during later
      // awaits. Every invocation uses this barrier; there is no initialized cache.
      const closingInventory=await call('POST',MANAGEMENT+'/database/query/read-only',secrets.supabaseManagementToken,{query:inventoryQuery});
      need(Array.isArray(closingInventory) && closingInventory.length===1 && inventorySnapshotDigest(closingInventory[0].inventory)===inventoryDigest);
      if(owned){const m=await captureOwnedMetadata();need(m.hash===ownedControlMetadataHash && m.identity===ownedIdentityDigest && ownedBinding(closingInventory[0].inventory,m.identity,rolePlanDigest,cfg.repositoryRoot)===ownedRolePlanDigest);}
      const closingMetadata=await call('POST',MANAGEMENT+'/database/query/read-only',secrets.supabaseManagementToken,{query:RUNTIME_METADATA_SELECT});
      need(Array.isArray(closingMetadata) && closingMetadata.length===1 && canonicalMetadataHash(closingMetadata[0].metadata)===metadataHash && closingMetadata[0].postgres_version===postgresVersion);
      const closingEdges=await call('GET',MANAGEMENT+'/functions',secrets.supabaseManagementToken);
      need(Array.isArray(closingEdges));
      for(const e of edges) {
        const matches=closingEdges.filter(x=>x.slug===e.slug);need(matches.length===1);
        const actual=matches[0];need(actual.status==='ACTIVE' && actual.id===e.id && actual.version===e.version && actual.ezbr_sha256===e.ezbrHash);
      }
      const closingFrontend=await call('GET',`https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}/pages/projects/ceo-msajed`,secrets.cloudflareToken);
      need(closingFrontend?.success===true && closingFrontend.result?.name==='ceo-msajed' && closingFrontend.result.subdomain==='ceo-msajed.pages.dev');
      const finalDeployment=closingFrontend.result.canonical_deployment;
      need(finalDeployment?.id===d.id && finalDeployment.environment==='production' && finalDeployment.latest_stage?.name==='deploy' && finalDeployment.latest_stage.status==='success' && finalDeployment.deployment_trigger?.metadata?.commit_hash===commit);
      need(stable(sourceReadback(cfg))===stable(local) && (!owned || stable(ownedSourceHashes(cfg.repositoryRoot))===stable(sourceHashes))); 
      const capturedAt=Date.now();need(capturedAt-startedAt<=MAX_AGE);
      return freeze({release:local.sourceSha,localHashes:local.localHashes,rpc:{identity:LINK,metadataHash},edges,runtime:{nodeVersion:process.version,postgresVersion},frontend:{deploymentId:d.id,sourceSha:commit},inventoryDigest,...(owned?{ownedControlMetadataHash,ownedRolePlanDigest}:{}),startedAt,capturedAt});
    } catch { deny(); }
  };
  const status=async(p,receiptDigest)=>{
    const pin=readPin(cfg),nonce=randomBytes(32).toString('hex'),url=new URL(pin.statusUrl);
    url.searchParams.set('receiptId',p.receiptId);url.searchParams.set('receiptDigest',receiptDigest);url.searchParams.set('nonce',nonce);
    const s=authenticated(await call('GET',url.href,null),pin,'QA-PROVENANCE-STATUS-v1');
    const now=Date.now();need(keysExactly(s,['schema','issuer','keyId','receiptId','receiptDigest','nonce','state','checkedAt','expiresAt']) && s.schema===1 && s.receiptId===p.receiptId && s.receiptDigest===receiptDigest && s.nonce===nonce && s.state==='ACTIVE' && Number.isSafeInteger(s.checkedAt) && Number.isSafeInteger(s.expiresAt) && s.checkedAt<=now && now-s.checkedAt<=5000 && s.expiresAt>now && s.expiresAt-s.checkedAt<=10000);
    return s;
  };
  const closeOwned=async p=>{
    // One closing SQL snapshot AFTER status awaits: bridge, roleplan and all
    // inventories cannot drift between separate closing metadata/data reads.
    const rows=await call('POST',MANAGEMENT+'/database/query/read-only',secrets.supabaseManagementToken,{query:RUNTIME_OWNED_CLOSING_SELECT});
    need(Array.isArray(rows) && rows.length===1 && keysExactly(rows[0],['metadata','control_identity_digest','inventory']));
    const x=rows[0];nativeReceiptsBound(x.metadata,x.inventory);need(canonicalMetadataHash(x.metadata)===p.ownedControlMetadataHash && inventorySnapshotDigest(x.inventory)===p.inventoryDigest && ownedBinding(x.inventory,x.control_identity_digest,p.ownedRolePlanDigest,cfg.repositoryRoot)===p.ownedRolePlanDigest);
    return freeze({ownedControlMetadataHash:p.ownedControlMetadataHash,ownedRolePlanDigest:p.ownedRolePlanDigest,ownedControllerIdentityDigest:x.control_identity_digest});
  };
  const reader=Object.freeze({readback:async(args={scope:'account-create'})=>{try{need(keysExactly(args,['scope']) && MUTATION_SCOPES.includes(args.scope));return await capture(args.scope.startsWith('qa-'));}catch{deny();}}});
  // Completed-only capture: no capture(false), inventory or private SQL fallback.
  const closeCompleted=async(query)=>{const rows=await call('POST',MANAGEMENT+'/database/query/read-only',secrets.supabaseManagementToken,{query});need(Array.isArray(rows)&&rows.length===1);return rows[0];};
  const captureCompleted=async(query)=>{try{
    const startedAt=Date.now(),local=sourceReadback(cfg);
    const row=await closeCompleted(query);need(Number.isSafeInteger(row.postgres_version)&&row.postgres_version>0);
    const metadataHash=canonicalMetadataHash(row.metadata);
    const edgeRows=await call('GET',MANAGEMENT+'/functions',secrets.supabaseManagementToken);need(Array.isArray(edgeRows));const edges=[];
    for(const slug of REQUIRED_EDGE_SLUGS){const matches=edgeRows.filter(e=>e.slug===slug);need(matches.length===1);const e=matches[0];need(e.status==='ACTIVE'&&typeof e.id==='string'&&e.id.length>0&&Number.isSafeInteger(e.version)&&e.version>0&&HEX.test(e.ezbr_sha256));
      const body=await call('GET',MANAGEMENT+`/functions/${slug}/body`,secrets.supabaseManagementToken,undefined,true);need(Buffer.isBuffer(body)&&body.length>0);edges.push({slug,id:e.id,version:e.version,sourceHash:sha256(body),ezbrHash:e.ezbr_sha256});}
    const cf=await call('GET',`https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}/pages/projects/ceo-msajed`,secrets.cloudflareToken);
    need(cf?.success===true&&cf.result?.name==='ceo-msajed'&&cf.result.subdomain==='ceo-msajed.pages.dev');const d=cf.result.canonical_deployment;
    need(d&&d.environment==='production'&&d.latest_stage?.name==='deploy'&&d.latest_stage.status==='success'&&typeof d.id==='string'&&d.id.length>0);
    const commit=d.deployment_trigger?.metadata?.commit_hash;need(SHA.test(commit));
    const closingFrontend=await call('GET',`https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}/pages/projects/ceo-msajed`,secrets.cloudflareToken);
    const finalDeployment=closingFrontend?.result?.canonical_deployment;need(closingFrontend?.success===true&&closingFrontend.result.name==='ceo-msajed'&&closingFrontend.result.subdomain==='ceo-msajed.pages.dev'&&finalDeployment?.id===d.id&&finalDeployment.environment==='production'&&finalDeployment.latest_stage?.name==='deploy'&&finalDeployment.latest_stage.status==='success'&&finalDeployment.deployment_trigger?.metadata?.commit_hash===commit);
    const closingEdges=await call('GET',MANAGEMENT+'/functions',secrets.supabaseManagementToken);need(Array.isArray(closingEdges));
    for(const e of edges){const matches=closingEdges.filter(x=>x.slug===e.slug);need(matches.length===1);const actual=matches[0];need(actual.status==='ACTIVE'&&actual.id===e.id&&actual.version===e.version&&actual.ezbr_sha256===e.ezbrHash);}
    need(stable(sourceReadback(cfg))===stable(local));const capturedAt=Date.now();need(capturedAt-startedAt<=MAX_AGE);
    return freeze({release:local.sourceSha,localHashes:local.localHashes,rpc:{identity:LINK,metadataHash},edges,runtime:{nodeVersion:process.version,postgresVersion:row.postgres_version},frontend:{deploymentId:d.id,sourceSha:commit},startedAt,capturedAt,row});
  }catch{deny();}};
  readers.set(reader,{cfg,native,capture,status,closeOwned,closeCompleted,captureCompleted});return reader;
}); }
export function createAuthorizedRuntimeReader(config) { return makeReader(config,true); }
// Same composed reader, deterministic offline protocol I/O, NEVER native brand.
export function createOfflineRuntimeReader(config) { return makeReader(config,false); }
function compare(p,o,owned=false) {
  if(owned)need(p.ownedControlMetadataHash===o.ownedControlMetadataHash && p.ownedRolePlanDigest===o.ownedRolePlanDigest);
  need(p.release.sourceSha===o.release && stable(p.localHashes)===stable(o.localHashes) && stable(p.rpc)===stable(o.rpc) && p.inventoryDigest===o.inventoryDigest);
  need(p.runtime.nodeVersion===o.runtime.nodeVersion && p.runtime.postgresVersion===o.runtime.postgresVersion && stable(p.frontend)===stable(o.frontend));
  const strip=edges=>edges.map(({slug,id,version,sourceHash,ezbrHash})=>({slug,id,version,sourceHash,ezbrHash})).sort((a,b)=>a.slug.localeCompare(b.slug,'en'));
  need(stable(strip(p.edges))===stable(strip(o.edges)));
}
export function createRuntimeProvenanceGate({reader,receipt}={}) { return safe(()=>{
  const r=readers.get(reader);need(r);
  const approved=freeze(JSON.parse(stable(receipt))),pin=readPin(r.cfg);
  validateApproval(approved,pin,Date.now());
  const receiptDigest=sha256(stable(approved.payload));
  const handle=Object.freeze({assertBeforeWrite:async args=>{
    try {
      need(keysExactly(args,['inventoryDigest','scope','operationId']));
      const initial=validateApproval(approved,readPin(r.cfg),Date.now());
      need(args.inventoryDigest===initial.inventoryDigest && initial.scopes.includes(args.scope) && args.operationId===initial.operationId);
      const owned=args.scope.startsWith('qa-');
      const first=await r.capture(owned,initial.ownedRolePlanDigest);compare(initial,first,owned);
      const second=await r.capture(owned,initial.ownedRolePlanDigest);compare(initial,second,owned);
      need(stable({...first,startedAt:0,capturedAt:0})===stable({...second,startedAt:0,capturedAt:0}));
      const status=await r.status(initial,receiptDigest);
      const closingProof=owned?await r.closeOwned(initial):undefined;
      const now=Date.now(),p=validateApproval(approved,readPin(r.cfg),now);
      need(status.expiresAt>now && now-first.startedAt<=MAX_AGE && now-second.capturedAt<=5000);
      const last=sourceReadback(r.cfg);need(last.sourceSha===p.release.sourceSha && stable(last.localHashes)===stable(p.localHashes));
      // No callbacks, writes or cached grants. Dispatch immediately; call again
      // after ANY intervening await and before EVERY individual mutation.
      return closingProof;
    } catch { deny(); }
  }});
  if(r.native)nativeGates.add(handle);return handle;
}); }

// Completed-only capability. It is NEVER registered in nativeGates.
const completedGates=new WeakMap();
export function isCompletedReplayGate(handle){return completedGates.has(handle);}
export function isNativeCompletedReplayGate(handle){return completedGates.get(handle)===true;}
function retainedCompletedEvidence(retainedPlan,retainedMetadata,p,a,cfg){
 need(keysExactly(retainedPlan,['planId','envelope','expiresAt'])&&UUID.test(retainedPlan.planId)&&Date.parse(retainedPlan.expiresAt)>Date.now());
 const envelope=retainedPlan.envelope;need(keysExactly(envelope,['payload','signature'])&&typeof envelope.signature==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature));
 pgJsonbText(envelope.payload);const plan=envelope.payload,pin=readPin(cfg);
 need(verify(null,Buffer.from('QA-OWNED-ROLEPLAN-v1\n'+stable(plan)),pin.key,Buffer.from(envelope.signature,'base64')));
 need(keysExactly(plan,['runId','controlIdentityDigest','rolePlanDigest','sourceHash','resources','units','protectedUIDs','protectedCanonicalKeys','sourceHashes'])&&plan.runId===a.runId);
 const sources=ownedSourceHashes(cfg.repositoryRoot);need(stable(plan.sourceHashes)===stable(sources)&&plan.sourceHash===sources['owned-control.sql']);
 need(Array.isArray(plan.resources)&&plan.resources.length===57&&Array.isArray(plan.units)&&plan.units.length>0&&Array.isArray(plan.protectedUIDs)&&Array.isArray(plan.protectedCanonicalKeys));
 need(plan.protectedUIDs.every(u=>UUID.test(u))&&new Set(plan.protectedUIDs).size===plan.protectedUIDs.length&&plan.protectedCanonicalKeys.every(k=>typeof k==='string'&&k.length>0)&&new Set(plan.protectedCanonicalKeys).size===plan.protectedCanonicalKeys.length);
 const digest=sha256(stable({resources:plan.resources.map(({rolePlanDigest,...r})=>r),units:plan.units}));need(digest===p.ownedRolePlanDigest&&digest===plan.rolePlanDigest&&digest===a.rolePlanDigest);
 need(new Set(plan.units.map(u=>u.id)).size===plan.units.length&&plan.units.every(u=>UUID.test(u.id)));
 for(const k of ['sourceId','createOperation','receiptId','canonicalKey','loginAlias','email'])need(new Set(plan.resources.map(r=>r[k])).size===57);
 for(const r of plan.resources){need(keysExactly(r,['runId','sourceId','createOperation','receiptId','kind','canonicalKey','loginAlias','displayName','email','role','memberships','rolePlanDigest'])&&r.runId===a.runId&&r.rolePlanDigest===digest&&['sourceId','createOperation','receiptId'].every(k=>UUID.test(r[k]))&&['canonicalKey','loginAlias','displayName','email'].every(k=>typeof r[k]==='string'&&r[k].length>0)&&['owned-load-qa','owned-role-e2e'].includes(r.kind)&&['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'].includes(r.role));
  need(!plan.protectedCanonicalKeys.includes(r.canonicalKey)&&Array.isArray(r.memberships)&&r.memberships.length>0&&r.memberships.every(m=>keysExactly(m,['unit_id','membership_role','is_primary'])&&plan.units.some(u=>u.id===m.unit_id)&&typeof m.membership_role==='string'&&typeof m.is_primary==='boolean'));}
 need(plan.resources.filter(r=>r.sourceId===a.sourceId&&r.canonicalKey===a.canonicalKey).length===1&&!plan.protectedUIDs.includes(a.uid)&&!plan.protectedCanonicalKeys.includes(a.canonicalKey));
 pgJsonbText(retainedMetadata);need(canonicalMetadataHash(retainedMetadata)===p.ownedControlMetadataHash&&pgJsonbDigest(retainedMetadata.controlIdentity)===plan.controlIdentityDigest);
 return freeze({rolePlanDigest:digest,approvedPlanDigestPg:pgJsonbDigest(plan),signatureDigest:sha256(envelope.signature),signingKeyHash:sha256(pin.key.export({type:'spki',format:'der'})),metadataDigestPg:pgJsonbDigest(retainedMetadata),controlIdentityDigest:plan.controlIdentityDigest,ownershipReceiptDigest:a.ownershipReceiptDigest,protectedSnapshotDigest:a.protectedSnapshotDigest,authAbsenceDigest:a.authAbsenceDigest,terminalReceiptDigest:a.terminalReceiptDigest,nativeRootDigest:a.nativeRootDigest,finalCleanupDigest:a.finalCleanupDigest,apiBodyDigest:completedApiBodyDigest(cfg.repositoryRoot)});
}
export function createCompletedReplayGate({reader,receipt,retainedPlan,retainedMetadata}={}){return safe(()=>{
 const r=readers.get(reader);need(r);const approved=freeze(JSON.parse(stable(receipt)));validateApproval(approved,readPin(r.cfg),Date.now());need(approved.payload.scopes.includes('qa-cleanup'));
 // Copy only independently retained evidence; API never provides signed payload or metadata.
 pgJsonbText(retainedPlan);pgJsonbText(retainedMetadata);const original=freeze(JSON.parse(stable(retainedPlan))),metadata=freeze(JSON.parse(stable(retainedMetadata)));
 const handle=Object.freeze({readCompleted:async args=>{try{
  validateCompletedRequest(args);const a=freeze(JSON.parse(stable(args))),p=validateApproval(approved,readPin(r.cfg),Date.now());
  const expected=retainedCompletedEvidence(original,metadata,p,a,r.cfg),query=completedReadQuery(a,expected);
  const verifyRow=row=>validateCompletedProof(row,a,expected,original.planId,metadata,original.envelope.payload.sourceHashes);
  const first=await r.captureCompleted(query);verifyRow(first.row);const second=await r.captureCompleted(query);verifyRow(second.row);
  compare({...p,inventoryDigest:undefined},{...first,inventoryDigest:undefined});compare({...p,inventoryDigest:undefined},{...second,inventoryDigest:undefined});
  const observation=x=>{const {row,startedAt,capturedAt,...v}=x;return v;};need(stable(observation(first))===stable(observation(second))&&stable(first.row.proof)===stable(second.row.proof));
  const status=await r.status(p,sha256(stable(p))),last=await r.closeCompleted(query);verifyRow(last);
  need(canonicalMetadataHash(last.metadata)===p.rpc.metadataHash&&last.postgres_version===p.runtime.postgresVersion&&stable(last.proof)===stable(second.row.proof));
  const now=Date.now();validateApproval(approved,readPin(r.cfg),now);need(status.expiresAt>now&&now-first.startedAt<=MAX_AGE&&now-second.capturedAt<=5000);
  const source=sourceReadback(r.cfg);need(source.sourceSha===p.release.sourceSha&&stable(source.localHashes)===stable(p.localHashes));
  return freeze({status:'already_completed',runId:a.runId,sourceId:a.sourceId,operationId:a.operationId,generation:a.generation,uid:a.uid,canonicalKey:a.canonicalKey,terminalReceiptDigest:a.terminalReceiptDigest,finalCleanupDigest:a.finalCleanupDigest,authAbsenceDigest:a.authAbsenceDigest});
 }catch{deny();}}});completedGates.set(handle,r.native);return handle;
});}
