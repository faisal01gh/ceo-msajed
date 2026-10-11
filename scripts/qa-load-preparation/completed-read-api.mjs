// Inert completed-only ABI. No raw private selector, network or mutation handle.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
const deny=()=>{throw Error('runtime_provenance_denied');};
const need=v=>{if(!v)deny();};
export function pgJsonbText(v,seen=[]){
 if(v===null||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='string'){need(!v.includes('\u0000')&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v));return JSON.stringify(v);}
 if(typeof v==='number'){need(Number.isSafeInteger(v));return String(Object.is(v,-0)?0:v);}
 need(v&&typeof v==='object'&&!seen.includes(v));const ancestry=[...seen,v];
 {
  if(Array.isArray(v)){need(Object.keys(v).length===v.length&&Reflect.ownKeys(v).length===v.length+1);return '['+Array.from({length:v.length},(_,i)=>{need(Object.hasOwn(v,i)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,i),'value'));return pgJsonbText(v[i],ancestry);}).join(', ')+']';}
  need(Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===Object.keys(v).length);
  const keys=Object.keys(v).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b)));
  return '{'+keys.map(k=>{need(Object.getOwnPropertyDescriptor(v,k)?.get===undefined);return pgJsonbText(k,ancestry)+': '+pgJsonbText(v[k],ancestry);}).join(', ')+'}';
 }
}
export const pgJsonbDigest=v=>createHash('sha256').update(pgJsonbText(v),'utf8').digest('hex');

export const READ_API_MIGRATION='supabase/migrations/20261008021100_qa_completed_cleanup_replay_read.sql';
export function completedApiBodyDigest(root){
 const raw=readFileSync(join(root,READ_API_MIGRATION));
 const committed=execFileSync('git',['-C',root,'show','HEAD:'+READ_API_MIGRATION],{stdio:['ignore','pipe','pipe'],timeout:5000,maxBuffer:16*1024*1024});need(raw.equals(committed));
 const start=Buffer.from('AS $read$'),end=Buffer.from('$read$;'),a=raw.indexOf(start),b=raw.indexOf(end,a+start.length);
 need(a>=0&&b>a&&raw.indexOf(start,a+1)===-1&&raw.indexOf(end,b+1)===-1&&!raw.includes(Buffer.from('\r')));
 return createHash('sha256').update(raw.subarray(a+start.length,b)).digest('hex');
}
export const EXPECTED_KEYS=Object.freeze(['rolePlanDigest','approvedPlanDigestPg','signatureDigest','signingKeyHash','metadataDigestPg','controlIdentityDigest','ownershipReceiptDigest','protectedSnapshotDigest','authAbsenceDigest','terminalReceiptDigest','nativeRootDigest','finalCleanupDigest','apiBodyDigest']);
export const COUNTERS=Object.freeze(['ownedSources','ownedOperations','ownedResources','ownedFrames','closureEmpty','nativeFrames','passwordFrames','sqlOperationFrames','coreFrames','passwordOperations','pending','fences','qaRuns','qaAccounts','qaMembers','qaTransactions','sessions','targetAuth']);
export const PROOF_KEYS=Object.freeze(['version','status','run_id','source_id','operation_id','generation','target_user_id','canonical_key','plan_id','approved_plan_digest_pg','signature_digest','signing_key_hash','role_plan_digest','source_hashes','control_identity_digest','metadata_digest_pg','native_catalog_digest','proof_source_digest','ownership_receipt_digest','creation_projection_digest','protected_snapshot_digest','current_protected_digest','auth_absence_digest','current_auth_absence_digest','terminal_receipt_digest_pg','native_root_digest_pg','terminal_receipt_digest_js','native_root_digest_js','final_cleanup_digest_pg','final_cleanup_digest_js','completion_counters','unfiltered','resource_count','current_final_readback_digest_pg']);
const HEX=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
export const REQUEST_KEYS=Object.freeze(['runId','sourceId','operationId','generation','uid','canonicalKey','rolePlanDigest','ownershipReceiptDigest','protectedSnapshotDigest','authAbsenceDigest','terminalReceiptDigest','nativeRootDigest','finalCleanupDigest']);
export function validateCompletedRequest(a){pgJsonbText(a);need(exact(a,REQUEST_KEYS)&&['runId','sourceId','operationId','uid'].every(k=>UUID.test(a[k]))&&Number.isSafeInteger(a.generation)&&a.generation>0&&typeof a.canonicalKey==='string'&&a.canonicalKey.length>0&&REQUEST_KEYS.slice(6).every(k=>HEX.test(a[k])));return a;}
const RPC_CATALOG_SQL="SELECT\n pg_catalog.current_setting('server_version_num')::integer AS postgres_version,\n (SELECT pg_catalog.jsonb_build_object(\n 'schema',n.nspname,'name',p.proname,\n 'identity',n.nspname||'.'||p.proname||'('||(SELECT pg_catalog.string_agg(pg_catalog.format_type(t,NULL),',' ORDER BY ord) FROM pg_catalog.unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(t,ord))||')',\n 'arguments',pg_catalog.pg_get_function_arguments(p.oid),\n 'result',pg_catalog.pg_get_function_result(p.oid),\n 'definition',pg_catalog.pg_get_functiondef(p.oid),\n 'owner',pg_catalog.pg_get_userbyid(p.proowner),'language',l.lanname,\n 'kind',p.prokind,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,\n 'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,\n 'config',pg_catalog.to_jsonb(p.proconfig),'support',p.prosupport::pg_catalog.regproc::text,\n 'cost',p.procost,'rows',p.prorows,\n 'argumentTypes',(SELECT pg_catalog.jsonb_agg(pg_catalog.format_type(t,NULL) ORDER BY ord) FROM pg_catalog.unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(t,ord)),\n 'argumentNames',pg_catalog.to_jsonb(p.proargnames),'argumentModes',pg_catalog.to_jsonb(p.proargmodes),\n 'defaultArguments',pg_catalog.pg_get_expr(p.proargdefaults,0),\n 'acl',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(\n 'grantor',pg_catalog.pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,\n 'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb)\n FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a),\n 'overloadCount',(SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p2 WHERE p2.pronamespace=p.pronamespace AND p2.proname=p.proname))\n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang\n WHERE p.oid=pg_catalog.to_regprocedure('public.account_provision_link_internal(text,uuid,jsonb)')) AS metadata";
const QUERY_START="WITH args AS (SELECT pg_catalog.convert_from(pg_catalog.decode('";
const QUERY_END="','base64'),'UTF8')::jsonb AS a), rpc AS ("+RPC_CATALOG_SQL+") SELECT pg_catalog.jsonb_build_object('session_user',session_user,'current_user',current_user,'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),'public_usage',pg_catalog.has_schema_privilege(current_user,'public','USAGE'),'private_usage',pg_catalog.has_schema_privilege(current_user,'app_private','USAGE'),'auth_usage',pg_catalog.has_schema_privilege(current_user,'auth','USAGE')) AS caller,rpc.metadata,rpc.postgres_version,public.qa_completed_cleanup_replay_read((a->>0)::uuid,(a->>1)::uuid,(a->>2)::uuid,(a->>3)::bigint,(a->>4)::uuid,a->>5,a->6) AS proof FROM args CROSS JOIN rpc;";
export function completedReadQuery(a,expected){
 validateCompletedRequest(a);pgJsonbText(expected);need(exact(expected,EXPECTED_KEYS)&&EXPECTED_KEYS.every(k=>HEX.test(expected[k])));
 const payload=[a.runId,a.sourceId,a.operationId,a.generation,a.uid,a.canonicalKey,expected];
 return QUERY_START+Buffer.from(JSON.stringify(payload),'utf8').toString('base64')+QUERY_END;
}
export function parseCompletedReadQuery(q){
 need(typeof q==='string'&&q.startsWith(QUERY_START)&&q.endsWith(QUERY_END));
 const b=q.slice(QUERY_START.length,-QUERY_END.length);need(/^[A-Za-z0-9+/]+={0,2}$/.test(b));
 const bytes=Buffer.from(b,'base64');need(bytes.toString('base64')===b);
 const v=JSON.parse(bytes.toString('utf8'));pgJsonbText(v);need(Array.isArray(v)&&v.length===7);
 const a={runId:v[0],sourceId:v[1],operationId:v[2],generation:v[3],uid:v[4],canonicalKey:v[5],...Object.fromEntries(REQUEST_KEYS.slice(6).map(k=>[k,v[6][k]]))};
 need(completedReadQuery(a,v[6])===q);return {request:a,expected:v[6]};
}
export function validateCompletedProof(row,a,e,planId,metadata,sourceHashes){
 pgJsonbText(row);need(exact(row,['caller','metadata','postgres_version','proof']));
 const c=row.caller;need(exact(c,['session_user','current_user','transaction_read_only','public_usage','private_usage','auth_usage'])&&c.session_user==='postgres'&&c.current_user==='supabase_read_only_user'&&c.transaction_read_only==='on'&&c.public_usage===true&&c.private_usage===false&&c.auth_usage===false);
 const x=row.proof;need(exact(x,PROOF_KEYS)&&x.version===1&&x.status==='already_completed'&&x.unfiltered===true&&x.resource_count===57);
 const bindings={run_id:a.runId,source_id:a.sourceId,operation_id:a.operationId,generation:a.generation,target_user_id:a.uid,canonical_key:a.canonicalKey,plan_id:planId,approved_plan_digest_pg:e.approvedPlanDigestPg,signature_digest:e.signatureDigest,signing_key_hash:e.signingKeyHash,role_plan_digest:e.rolePlanDigest,control_identity_digest:e.controlIdentityDigest,metadata_digest_pg:e.metadataDigestPg,proof_source_digest:e.apiBodyDigest,ownership_receipt_digest:e.ownershipReceiptDigest,protected_snapshot_digest:e.protectedSnapshotDigest,current_protected_digest:e.protectedSnapshotDigest,auth_absence_digest:e.authAbsenceDigest,current_auth_absence_digest:e.authAbsenceDigest,terminal_receipt_digest_js:e.terminalReceiptDigest,native_root_digest_js:e.nativeRootDigest,final_cleanup_digest_js:e.finalCleanupDigest,native_catalog_digest:pgJsonbDigest(metadata.nativeCatalog)};
 need(Object.entries(bindings).every(([k,v])=>x[k]===v)&&pgJsonbText(x.source_hashes)===pgJsonbText(sourceHashes));
 need(PROOF_KEYS.filter(k=>k.endsWith('digest')||k.endsWith('digest_pg')||k.endsWith('digest_js')||k==='signing_key_hash').every(k=>HEX.test(x[k])));
 need(exact(x.completion_counters,COUNTERS)&&COUNTERS.every(k=>x.completion_counters[k]===0));
 const {current_final_readback_digest_pg,...body}=x;need(pgJsonbDigest(body)===current_final_readback_digest_pg);return x;
}

