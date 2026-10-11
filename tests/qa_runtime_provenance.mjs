import test from 'node:test';
import {prerequisiteDDL,supportedRelations} from './qa_runtime_provenance_supported_fixture.mjs';
import {manageProvenanceRoles} from './qa_runtime_provenance_roles_fixture.mjs';
import {createParentOwnedProvenanceFixture,validateParentOwnedProvenanceEnvironment} from './qa_runtime_provenance_wsl_fixture.mjs';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign, createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {OWNED_CONTROL_INVENTORY_FACETS,OWNED_CONTROL_PRIMARY_METADATA_SELECT,OWNED_CONTROL_FUNCTION_SPECS} from '../scripts/qa-load-preparation/owned-attestation.mjs';
const scratch = process.env.QA_PROVENANCE_SCRATCH ?? 'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch';
if(process.env.QA_PROVENANCE_WSL_PARENT !== undefined)validateParentOwnedProvenanceEnvironment();
const stable = v => JSON.stringify(v === null || typeof v !== 'object' ? v : Array.isArray(v) ? v.map(x => JSON.parse(stable(x))) : Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(stable(v[k]))])));
const hash = v => createHash('sha256').update(v).digest('hex');
let api;
try { api = await import('../scripts/qa-runtime-provenance.mjs'); } catch {}
test('QA scopes require paired signed owned-controller fields before any read',t=>{
  const f=fixture(t),p=structuredClone(f.receipt.payload);p.scopes=['qa-create'];
  assert.throws(()=>api.createRuntimeProvenanceGate({reader:f.reader,receipt:f.envelope(p,'QA-PROVENANCE-APPROVAL-v1')}),/runtime_provenance_denied/);
  assert.equal(f.state.calls.length,0);
});
test('gate identity cannot be forged by a boolean or copied shape', () => {
  assert.ok(api, 'runtime provenance module is not implemented');
  assert.equal(api.isRuntimeProvenanceGate(true), false);
  assert.equal(api.isRuntimeProvenanceGate({assertBeforeWrite: async () => true}), false);
});

function fixture(t,{owned=false}={}) {
  const dir = mkdtempSync(join(scratch, 'provenance-offline-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const root = join(dir, 'release'); mkdirSync(join(root, 'scripts'), {recursive:true});
  for (const name of ['accounts-create-originals.mjs','accounts-provision.mjs']) writeFileSync(join(root,'scripts',name), '// inert offline executor fixture\n');
  if(owned){mkdirSync(join(root,'scripts','qa-load-preparation'));for(const name of ['owned-control.sql','owned-deletion-fence.sql'])writeFileSync(join(root,'scripts','qa-load-preparation',name),readFileSync(new URL('../scripts/qa-load-preparation/'+name,import.meta.url)));}
  writeFileSync(join(root,'.gitattributes'),'*.mjs text\n');
  const git = (...args) => execFileSync('git', ['-C',root,...args], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','main');git('add','.');git('-c','user.name=Offline Fixture','-c','user.email=offline@example.invalid','commit','-m','offline release');
  const sha = git('rev-parse','HEAD');
  const {publicKey,privateKey} = generateKeyPairSync('ed25519');
  const pin = {schema:1,issuer:'independent-review',keyId:'offline-authority',publicKey:publicKey.export({type:'spki',format:'pem'}),statusUrl:'https://review.example.invalid/status'};
  const pinPath=join(dir,'authority.json');writeFileSync(pinPath,JSON.stringify(pin));
  const cfg={repositoryRoot:root,authorityPinPath:pinPath,authorityPinHash:hash(readFileSync(pinPath)),cloudflareAccountId:'0'.repeat(32),credentials:{supabaseManagementToken:'offline-transport-only',authAdminKey:'offline-transport-only',cloudflareToken:'offline-transport-only'}};
  const sqlInventory={readRole:'supabase_read_only_user',unfiltered:true,facets:Object.fromEntries(api.INVENTORY_FACETS.map(k=>[k,[]])),counts:Object.fromEntries(api.INVENTORY_FACETS.map(k=>[k,0]))};
  const metadata={schema:'public',name:'account_provision_link_internal',identity:'public.account_provision_link_internal(text,uuid,jsonb)',arguments:'p_key text, p_auth_user uuid, p_memberships jsonb',result:'jsonb',definition:'CREATE FUNCTION public.account_provision_link_internal(p_key text,p_auth_user uuid,p_memberships jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NULL; END $$;',owner:'postgres',language:'plpgsql',kind:'f',securityDefiner:true,leakproof:false,strict:false,volatility:'v',parallel:'u',config:['search_path=""'],acl:[],support:'-',cost:100,rows:0,argumentTypes:['text','uuid','jsonb'],argumentNames:['p_key','p_auth_user','p_memberships'],argumentModes:null,defaultArguments:null,overloadCount:1};
  const edges=api.REQUIRED_EDGE_SLUGS.map((slug,i)=>({slug,id:`edge-${i}`,version:i+1,status:'ACTIVE',ezbr_sha256:hash(`bundle-${slug}`)}));
  const frontend={id:'offline-deployment',url:'https://ceo-msajed.pages.dev',environment:'production',latest_stage:{name:'deploy',status:'success'},deployment_trigger:{metadata:{commit_hash:sha}}};
  const state={sqlInventory,metadata,edges,frontend,postgresVersion:170006,calls:[],hook:null,revoked:false,statusTransform:null,bodySuffix:'',users:new Map()};
  if(owned){
    const functions=OWNED_CONTROL_FUNCTION_SPECS.map((s,i)=>({oid:String(90000+i),identity:s.name+'('+s.arguments.replace(/ DEFAULT (false|NULL::uuid|NULL::bigint|NULL)/g,'')+')',definition:'SYNTHETIC OFFLINE '+s.name,owner:'postgres',acl:null,config:['search_path=""'],security_definer:true,volatile:'v',strict:false,parallel:'u',cost:100,rows:0,language:'plpgsql',support:'0',kind:'f',leakproof:false,arg_types:'',all_arg_types:null,arg_modes:null,arg_names:null,arg_defaults:null,args:s.arguments,result:s.result}));
    const tables=['public.profiles','public.user_roles','public.user_memberships','public.account_migration_users','app_private.account_credential_state','app_private.qa_account_manifest','app_private.qa_run_members','app_private.qa_core_provision_context','public.legacy_archive','public.migration_gate','public.migration_receipts','public.workspace_edits','public.workspace_versions','app_private.qa_owned_frames','app_private.qa_owned_frame_empty','app_private.qa_owned_deletions','app_private.qa_owned_deletion_fences','app_private.qa_owned_native_anchor','app_private.qa_owned_native_frames','app_private.qa_owned_native_effects'];
    const callback=name=>functions.find(f=>f.identity===name+'()').oid;
    state.ownedMetadata={functions,columns:tables.map(table=>({table,column:'id',type:'text',required:true,default:null,identity:'',generated:''})),triggers:[{oid:'1',tgrelid:'1',tgfoid:'90021'},{tgfoid:callback('app_private.qa_owned_native_root'),tgname:'qa_owned_auth_root',tgtype:11,tgenabled:'O',tgdeferrable:false,tgqual:null,tgnargs:0,tgattr:''},{tgfoid:callback('app_private.qa_owned_native_close'),tgname:'00_qa_owned_native_close',tgtype:5,tgenabled:'O',tgdeferrable:true,tginitdeferred:true,tgqual:null,tgnargs:0,tgattr:''}],closure:[{oid:'2',conname:'qa_owned_native_closure',contype:'f',condeferrable:true,condeferred:true}],controlIdentity:{functions:functions.filter(f=>!['app_private.qa_delete_catalog_closed()','app_private.qa_pw_frame_catalog_closed()'].includes(f.identity))},nativeCatalogDigest:hash('synthetic native catalog'),gateway:{role:{oid:'22',rolcanlogin:true,rolsuper:false,rolinherit:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false},memberships:[],businessWrite:false},nativeCatalog:{fk:[],triggers:[],callbacks:[]},relations:[...tables.slice(7,13),...tables.slice(-5)].map(table=>({table,owner:'postgres',kind:'r',partition:false}))};
    state.ownedIdentityDigest=hash('synthetic-PG-jsonb-text');
    const unit={id:'77777777-7777-4777-8777-777777777777',name:'fixture',unit_type:'department',parent_id:null,active:true};
    sqlInventory.facets.units.push(unit);sqlInventory.counts.units=1;
    sqlInventory.facets.roles.push({code:'employee',name_ar:'fixture'});sqlInventory.counts.roles=1;
    const resources=Array.from({length:57},(_,i)=>({runId:'66666666-6666-4666-8666-666666666666',sourceId:String(i),createOperation:String(i),receiptId:String(i),canonicalKey:'fixture-'+i,loginAlias:'fixture-'+i,displayName:'fixture',email:'fixture-'+i+'@example.invalid',role:'employee',memberships:[{unit_id:unit.id,membership_role:'member',is_primary:true}],kind:i<50?'owned-load-qa':'owned-role-e2e'}));
    const rolePlanDigest=hash(stable({resources,units:[unit]}));resources.forEach(r=>r.rolePlanDigest=rolePlanDigest);
    const sourceHash=hash(readFileSync(new URL('../scripts/qa-load-preparation/owned-control.sql',import.meta.url)));
    const payload={resources,units:[unit],runId:resources[0].runId,protectedUIDs:[],protectedCanonicalKeys:[],controlIdentityDigest:state.ownedIdentityDigest,rolePlanDigest,sourceHash,sourceHashes:Object.fromEntries(['owned-control.sql','owned-deletion-fence.sql'].map(n=>[n,hash(readFileSync(new URL('../scripts/qa-load-preparation/'+n,import.meta.url)))]))};
    const plan={plan_id:'88888888-8888-4888-8888-888888888888',payload,signature:sign(null,Buffer.from('QA-OWNED-ROLEPLAN-v1\n'+stable(payload)),privateKey).toString('base64'),signing_key_hash:hash(publicKey.export({type:'spki',format:'der'})),source_hash:sourceHash,expires_at:new Date(Date.now()+60000).toISOString()};
    state.sqlInventory={...sqlInventory,facets:{...sqlInventory.facets,...Object.fromEntries(Object.keys(OWNED_CONTROL_INVENTORY_FACETS).map(k=>[k,[]]))},counts:{...sqlInventory.counts,...Object.fromEntries(Object.keys(OWNED_CONTROL_INVENTORY_FACETS).map(k=>[k,0]))},ownedPlans:[plan],ownedRunPlans:[],ownedUnits:[unit]};
    state.sqlInventory.facets.qaOwnedNativeAnchor=[{id:1,gateway_oid:'22',catalog_digest:state.ownedMetadata.nativeCatalogDigest,gateway_metadata:{role:structuredClone(state.ownedMetadata.gateway.role),memberships:[]}}];state.sqlInventory.counts.qaOwnedNativeAnchor=1;
    state.sqlInventory.facets.qaOwnedPlans=[{plan_id:plan.plan_id,signing_key_hash:plan.signing_key_hash,source_hash:sourceHash,expires_at:plan.expires_at,role_plan_digest:rolePlanDigest,control_identity_digest:state.ownedIdentityDigest}];state.sqlInventory.counts.qaOwnedPlans=1;
  }
  const envelope=(payload,domain) => ({payload,signature:sign(null,Buffer.from(domain+'\n'+stable(payload)),privateKey).toString('base64')});
  const transport=async req=>{
    state.calls.push({method:req.method,url:req.url,body:req.body});
    if(state.hook) await state.hook(req);
    const u=new URL(req.url);
    if(u.hostname==='review.example.invalid') {
      const now=Date.now();const payload={schema:1,issuer:pin.issuer,keyId:pin.keyId,receiptId:u.searchParams.get('receiptId'),receiptDigest:u.searchParams.get('receiptDigest'),nonce:u.searchParams.get('nonce'),state:state.revoked?'REVOKED':'ACTIVE',checkedAt:now,expiresAt:now+10000};
      if(state.statusTransform)state.statusTransform(payload);
      return envelope(payload,'QA-PROVENANCE-STATUS-v1');
    }
    if(u.pathname.endsWith('/database/query/read-only')) {
      if(state.sqlRead)return state.sqlRead(req.body.query);
      if(req.body.query===api.RUNTIME_METADATA_SELECT) return [{metadata:structuredClone(state.metadata),postgres_version:state.postgresVersion}];
      if(req.body.query===api.RUNTIME_INVENTORY_SELECT) return [{inventory:structuredClone(state.sqlInventory)}];
      if(owned && req.body.query===api.RUNTIME_OWNED_CLOSING_SELECT) return [{metadata:structuredClone(state.ownedMetadata),control_identity_digest:state.ownedIdentityDigest,inventory:structuredClone(state.sqlInventory)}];
      if(owned && req.body.query===api.RUNTIME_OWNED_METADATA_SELECT) return [{metadata:structuredClone(state.ownedMetadata),control_identity_digest:state.ownedIdentityDigest}];
      if(owned && req.body.query===api.RUNTIME_OWNED_INVENTORY_SELECT) return [{inventory:structuredClone(state.sqlInventory)}];
      throw new Error('unexpected SQL');
    }
    if(u.pathname.endsWith('/functions')) return structuredClone(state.edges);
    if(u.pathname.includes('/functions/') && u.pathname.endsWith('/body')) {
      const slug=u.pathname.split('/').at(-2); return Buffer.from('bundle-'+slug+state.bodySuffix);
    }
    if(u.pathname.includes('/auth/v1/admin/users/'))return structuredClone(state.users.get(u.pathname.split('/').at(-1)));
    if(u.hostname==='api.cloudflare.com') return {success:true,result:{canonical_deployment:structuredClone(state.frontend),subdomain:'ceo-msajed.pages.dev',name:'ceo-msajed'}};
    throw new Error('unexpected read path');
  };
  const reader=api.createOfflineRuntimeReader({...cfg,transport});
  const approval=()=>{
    const now=Date.now();
    const payload={schema:1,issuer:pin.issuer,keyId:pin.keyId,receiptId:'11111111-1111-4111-8111-111111111111',verdict:'APPROVED',independent:true,projectRef:'movzojtnkkmdsjhmlgtq',frontendOrigin:'https://ceo-msajed.pages.dev',operationId:'22222222-2222-4222-8222-222222222222',scopes:api.MUTATION_SCOPES.filter(s=>owned || s.startsWith('account-')),issuedAt:now,expiresAt:now+60000,release:{sourceSha:sha,postMerge:true},localHashes:Object.fromEntries(['accounts-create-originals.mjs','accounts-provision.mjs'].map(n=>[n,hash(readFileSync(join(root,'scripts',n)))])),rpc:{identity:metadata.identity,metadataHash:api.canonicalMetadataHash(metadata)},edges:edges.map(e=>({slug:e.slug,id:e.id,version:e.version,sourceHash:hash(`bundle-${e.slug}`),ezbrHash:e.ezbr_sha256,sourceSha:sha})),runtime:{nodeVersion:process.version,postgresVersion:state.postgresVersion,sourceSha:sha},frontend:{deploymentId:frontend.id,sourceSha:sha},inventoryDigest:api.inventorySnapshotDigest(sqlInventory),inventoryCapturedAt:now};
    if(owned){payload.inventoryDigest=api.inventorySnapshotDigest(state.sqlInventory);payload.ownedControlMetadataHash=api.canonicalMetadataHash(state.ownedMetadata);payload.ownedRolePlanDigest=state.sqlInventory.ownedPlans[0].payload.rolePlanDigest;}
    return envelope(payload,'QA-PROVENANCE-APPROVAL-v1');
  };
  const receipt=approval();
  const gate=()=>api.createRuntimeProvenanceGate({reader,receipt});
  const args={inventoryDigest:receipt.payload.inventoryDigest,scope:'account-create',operationId:receipt.payload.operationId};
  return {cfg,reader,receipt,gate,args,state,root,pinPath,sha,approval,envelope,git};
}

test('authentic signed approval executes the concrete readback composition offline', async t=>{
  assert.equal(typeof api.createOfflineRuntimeReader,'function','concrete readback factory is missing');
  const f=fixture(t);const gate=f.gate();
  assert.equal(api.isRuntimeProvenanceGate(gate),false,'offline handles must never open real write gates');
  assert.equal(api.isRuntimeProvenanceGate({...gate}),false);
  assert.equal(await gate.assertBeforeWrite(f.args),undefined);
  assert.ok(f.state.calls.some(c=>c.body?.query===api.RUNTIME_METADATA_SELECT));
  assert.ok(f.state.calls.some(c=>c.body?.query===api.RUNTIME_INVENTORY_SELECT));
  assert.ok(f.state.calls.some(c=>c.url.endsWith('/body')));
  assert.equal(f.state.calls.filter(c=>new URL(c.url).hostname==='review.example.invalid').length,1);
  const nativeReader=api.createAuthorizedRuntimeReader({...f.cfg,repositoryRoot:fileURLToPath(new URL('..',import.meta.url))});
  const nativeGate=api.createRuntimeProvenanceGate({reader:nativeReader,receipt:f.receipt});
  assert.equal(api.isRuntimeProvenanceGate(nativeGate),true);
  assert.equal(api.isRuntimeProvenanceGate(Object.create(nativeGate)),false);
  assert.equal(Object.isFrozen(nativeGate),true);
});

test('native reader cannot attest a different repository than the executing helper', t=>{
  const f=fixture(t);
  assert.throws(()=>api.createAuthorizedRuntimeReader(f.cfg),/runtime_provenance_denied/);
});

test('inventory without SQL proof of an unfiltered complete snapshot denies',t=>{
  const f=fixture(t);
  delete f.state.sqlInventory.unfiltered;
  assert.throws(()=>api.inventorySnapshotDigest(f.state.sqlInventory),/runtime_provenance_denied/);
});

// Native PostgreSQL is an isolated local fixture; no approved migrations load.
// All exported readback SELECTs run inside READ ONLY transactions.
test('exported catalog and complete-inventory SELECTs execute on isolated PostgreSQL', async t=>{
  let nativeEvidence={},roleCustody,nativeFixture;
  // A present but incorrect handoff fails closed; it must never fall through
  // to the default Windows private-cluster fixture.
  if(process.env.QA_PROVENANCE_WSL_PARENT !== undefined){
    nativeFixture=createParentOwnedProvenanceFixture();
    t.after(()=>{
      let disposition;
      try{if(roleCustody){nativeEvidence.roleCustody=roleCustody.finish();roleCustody=null;}}
      finally{disposition=nativeFixture.finish();}
      assert.equal(existsSync(nativeFixture.dir),false);
      if(process.env.QA_PROVENANCE_EVIDENCE_DIR)writeFileSync(join(process.env.QA_PROVENANCE_EVIDENCE_DIR,'NATIVE_SELECT_MECHANICS.json'),JSON.stringify({...nativeEvidence,...disposition,fixtureDatabaseDisposition:'parent custody',qaClusterUntouched:true,temporaryFilesRemoved:true},null,2));
    });
  }else{
  const {createServer}=await import('node:net');
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;await new Promise(r=>server.close(r));
  const dir=mkdtempSync(join(scratch,'provenance-pg-')),data=join(dir,'data');
  const bin=process.env.QA_PROVENANCE_PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
  const pg=(name,args,input)=>execFileSync(join(bin,name+'.exe'),args,{encoding:'utf8',input,timeout:30000,stdio:['pipe','pipe','pipe'],env:{...process.env,TMPDIR:scratch,TEMP:scratch,TMP:scratch}}).trim();
  let started=false;
  t.after(()=>{try{if(roleCustody){nativeEvidence.roleCustody=roleCustody.finish();roleCustody=null;}if(started)pg('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}finally{rmSync(dir,{recursive:true,force:true});}assert.equal(existsSync(dir),false);if(process.env.QA_PROVENANCE_EVIDENCE_DIR)writeFileSync(join(process.env.QA_PROVENANCE_EVIDENCE_DIR,'NATIVE_SELECT_MECHANICS.json'),JSON.stringify({...nativeEvidence,clusterStopped:true,clusterRemoved:true},null,2));});
  pg('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
  execFileSync(join(bin,'pg_ctl.exe'),['-D',data,'-w','-t','20','-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`,'start'],{timeout:30000,stdio:'ignore',env:{...process.env,TMPDIR:scratch,TEMP:scratch,TMP:scratch}});started=true;
  const query=(sql)=>pg('psql',['-X','-q','-t','-A','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],sql);
  nativeFixture={query,port,data,database:'postgres'};
  }
  const {query,port,data,database}=nativeFixture;
  roleCustody=manageProvenanceRoles(query);
  const tables=[...api.RUNTIME_INVENTORY_SELECT.matchAll(/FROM \(SELECT ([a-z_,]+) FROM ([a-z_.]+)\) x/g)].map(m=>({fields:m[1].split(','),table:m[2]}));
  assert.equal(tables.length,api.INVENTORY_FACETS.length);
  query('CREATE SCHEMA auth;CREATE SCHEMA app_private;'+tables.map(x=>`CREATE TABLE ${x.table} (${x.fields.map(k=>k+' text').join(',')});`).join('')+`CREATE FUNCTION public.account_provision_link_internal(p_key text,p_auth_user uuid,p_memberships jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RETURN NULL;END$$; GRANT USAGE ON SCHEMA public,auth,app_private TO supabase_read_only_user;GRANT SELECT ON ALL TABLES IN SCHEMA public,auth,app_private TO supabase_read_only_user;`);
  const read=(sql)=>JSON.parse(query('BEGIN READ ONLY;SET LOCAL ROLE supabase_read_only_user;SELECT pg_catalog.row_to_json(x) FROM ('+sql.replace(/;\s*$/,'')+') x;COMMIT;'));
  const metadata=read(api.RUNTIME_METADATA_SELECT);
  assert.equal(metadata.metadata.identity,'public.account_provision_link_internal(text,uuid,jsonb)');
  const before=api.canonicalMetadataHash(metadata.metadata);
  assert.match(before,/^[0-9a-f]{64}$/);
  const inventory=read(api.RUNTIME_INVENTORY_SELECT);
  assert.equal(inventory.inventory.unfiltered,true);
  assert.match(api.inventorySnapshotDigest(inventory.inventory),/^[0-9a-f]{64}$/);
  query(`CREATE OR REPLACE FUNCTION public.account_provision_link_internal(p_key text,p_auth_user uuid,p_memberships jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RETURN '{}'::jsonb;END$$;`);
  assert.notEqual(api.canonicalMetadataHash(read(api.RUNTIME_METADATA_SELECT).metadata),before);
  query('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;');
  assert.equal(read(api.RUNTIME_INVENTORY_SELECT).inventory.unfiltered,false);
  assert.throws(()=>api.inventorySnapshotDigest(read(api.RUNTIME_INVENTORY_SELECT).inventory),/runtime_provenance_denied/);
  query('ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;');
  const identity=JSON.parse(query(`SELECT json_build_object('address',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),'listen',current_setting('listen_addresses'),'database',current_database(),'foreign', (SELECT count(*) FROM pg_foreign_server))`));
  assert.equal(identity.address,'127.0.0.1');assert.equal(identity.port,port);assert.equal(identity.listen,'127.0.0.1');assert.equal(identity.database,database);assert.equal(identity.foreign,0);assert.equal(identity.data.replaceAll('\\','/'),data.replaceAll('\\','/'));
  // Mechanics fixture ONLY: native catalog, inert ABI leaves, no approved SQL
  // applied and no controller/SDK product engine or target requests invoked.
  const specs=Object.values(OWNED_CONTROL_INVENTORY_FACETS).map(q=>({table:/ FROM ([a-z_.]+) ORDER BY /.exec(q)[1],columns:q.slice(7,q.indexOf(' FROM ')).split(',').map(x=>x.split(/->|::| AS /)[0])}));
  const nativeTypes={payload:'jsonb',plan_payload:'jsonb',source:'jsonb',pk:'jsonb',history:'jsonb',expires_at:'timestamptz',completed_at:'timestamptz',reserved_at:'timestamptz',disposed_at:'timestamptz',backend_pid:'integer',effect_sequence:'integer',closure:'integer',id:'integer',generation:'bigint',effect_slot:'integer',depth:'integer',observed_pid:'integer',prepared_at:'timestamptz',absence_observed_at:'timestamptz',completed_receipt:'jsonb',native_root_receipt:'jsonb',effect_old:'jsonb',effect_new:'jsonb',parent_pk:'jsonb',observed_xid:'xid8',gateway_oid:'oid',parent_table:'oid',fk_oid:'oid',ri_oid:'oid',guard_oid:'oid',gateway_metadata:'jsonb',sql_xid:'xid8',source_oid:'oid',effect_table:'oid',table_oid:'oid'};
  query(specs.map(s=>`CREATE TABLE ${s.table} (${[...new Set(s.columns)].map(k=>k+' '+(nativeTypes[k]??'text')).join(',')});`).join('')+'ALTER TABLE app_private.qa_owned_approved_plans ADD COLUMN signature text;'+`ALTER TABLE app_private.qa_owned_frame_empty ADD PRIMARY KEY(id),ADD CHECK(false);ALTER TABLE app_private.qa_owned_frames ADD CONSTRAINT qa_owned_native_closure FOREIGN KEY(closure) REFERENCES app_private.qa_owned_frame_empty(id) DEFERRABLE INITIALLY DEFERRED;`);
  query(`ALTER TABLE auth.users ADD COLUMN created_at timestamptz,ADD COLUMN raw_user_meta_data jsonb;ALTER TABLE app_private.qa_owned_sources ADD COLUMN auth_projection jsonb;ALTER TABLE app_private.qa_owned_resources ADD COLUMN full_row jsonb;`);
  query(OWNED_CONTROL_FUNCTION_SPECS.map(s=>`CREATE FUNCTION ${s.name}(${s.arguments}) RETURNS ${s.result} LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN ${s.result==='void'?'RETURN;':s.result.startsWith('TABLE')?'RETURN;':'RETURN NULL;'}END$$;`).join('')+['public.profiles','public.user_roles','public.user_memberships','public.account_migration_users'].map(table=>`CREATE TRIGGER owned_mechanics_guard BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();`).join('')+`CREATE TRIGGER qa_owned_auth_root BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION app_private.qa_owned_native_root();CREATE CONSTRAINT TRIGGER "00_qa_owned_native_close" AFTER INSERT ON app_private.qa_owned_native_frames DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.qa_owned_native_close();GRANT SELECT ON ALL TABLES IN SCHEMA app_private TO supabase_read_only_user;INSERT INTO app_private.qa_owned_native_anchor(id,gateway_oid,catalog_digest) VALUES(1,'native_fixture_gateway'::regrole::oid,'`+hash('initial')+`');`);
  query(prerequisiteDDL()+supportedRelations.map(table=>`CREATE TRIGGER qa_owned_deletion_fence BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION app_private.qa_owned_fence_before_row();`).join('')+'GRANT SELECT ON ALL TABLES IN SCHEMA public,app_private TO supabase_read_only_user;');
  let primary=read(api.RUNTIME_OWNED_METADATA_SELECT);query(`UPDATE app_private.qa_owned_native_anchor SET catalog_digest='${primary.metadata.nativeCatalogDigest}',gateway_metadata='${JSON.stringify({role:primary.metadata.gateway.role,memberships:primary.metadata.gateway.memberships}).replaceAll("'","''")}'::jsonb;`);primary=read(api.RUNTIME_OWNED_METADATA_SELECT);const inv=read(api.RUNTIME_OWNED_INVENTORY_SELECT);
  if(process.env.QA_PROVENANCE_EVIDENCE_DIR)writeFileSync(join(process.env.QA_PROVENANCE_EVIDENCE_DIR,'PRIMARY.json'),JSON.stringify(primary,null,2));assert.equal(primary.metadata.functions.length,48);assert.match(primary.control_identity_digest,/^[0-9a-f]{64}$/);assert.match(api.canonicalMetadataHash(primary.metadata),/^[0-9a-f]{64}$/);
  assert.ok(api.RUNTIME_OWNED_METADATA_SELECT.includes(OWNED_CONTROL_PRIMARY_METADATA_SELECT));
  assert.equal(Object.keys(inv.inventory.facets).length,30);assert.equal(inv.inventory.unfiltered,true);assert.match(api.inventorySnapshotDigest(inv.inventory),/^[0-9a-f]{64}$/);
  assert.deepEqual(read(api.RUNTIME_OWNED_CLOSING_SELECT).metadata,primary.metadata);
  const fenceSource=readFileSync(new URL('../scripts/qa-load-preparation/owned-deletion-fence.sql',import.meta.url),'utf8'),nativeDigestExpression=/CREATE FUNCTION app_private.qa_owned_native_catalog_digest\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(fenceSource)[1].trim();assert.equal(read(nativeDigestExpression+' AS actual_native_digest;').actual_native_digest,primary.metadata.nativeCatalogDigest);
  const actualSource=readFileSync(new URL('../scripts/qa-load-preparation/owned-control.sql',import.meta.url),'utf8'),protectedExpression=/CREATE FUNCTION app_private.qa_owned_protected_snapshot\(\)[\s\S]*?BEGIN RETURN \(([\s\S]*?)\);\s*END \$\$;/.exec(actualSource)[1],identityExpression=/CREATE FUNCTION app_private.qa_owned_identity_snapshot\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(actualSource)[1].trim().replace('app_private.qa_owned_protected_snapshot()','('+protectedExpression+')');assert.deepEqual(read(identityExpression+' AS source_identity;').source_identity,primary.metadata.controlIdentity);
  const f=fixture(t,{owned:true}),plan=f.state.sqlInventory.ownedPlans[0];
  query(`INSERT INTO public.organizational_units VALUES('77777777-7777-4777-8777-777777777777','fixture','department',NULL,'true');INSERT INTO public.roles VALUES('employee','fixture');`);
  const actualUnits=read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory.ownedUnits;
  plan.payload.units=actualUnits;plan.payload.controlIdentityDigest=primary.control_identity_digest;
  const roleDigest=hash(stable({resources:plan.payload.resources.map(({rolePlanDigest,...r})=>r),units:actualUnits}));plan.payload.rolePlanDigest=roleDigest;plan.payload.resources.forEach(r=>r.rolePlanDigest=roleDigest);
  const lit=x=>"'"+x.replaceAll("'","''")+"'";
  plan.signature=f.envelope(plan.payload,'QA-OWNED-ROLEPLAN-v1').signature;
  query(`INSERT INTO app_private.qa_owned_approved_plans(plan_id,payload,signature,signing_key_hash,source_hash,expires_at) VALUES(${lit(plan.plan_id)},${lit(JSON.stringify(plan.payload))}::jsonb,${lit(plan.signature)},${lit(plan.signing_key_hash)},${lit(plan.source_hash)},${lit(plan.expires_at)});`);
  Object.assign(f.state.metadata,read(api.RUNTIME_METADATA_SELECT).metadata);f.state.postgresVersion=read(api.RUNTIME_METADATA_SELECT).postgres_version;f.state.ownedMetadata=primary.metadata;f.state.ownedIdentityDigest=primary.control_identity_digest;f.state.sqlInventory=read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory;
  f.state.sqlRead=q=>[read(q)];
  let approval=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt:approval}),args={inventoryDigest:approval.payload.inventoryDigest,operationId:approval.payload.operationId,scope:'qa-create'};
  const {hash:adapterHash}=await import('../scripts/qa-load-preparation/official-owned-adapter.mjs');
  assert.equal(approval.payload.ownedControlMetadataHash,adapterHash(primary.metadata),'official adapter metadata hash seam must match primary canonical hash');
  for(const scope of ['qa-create','qa-session','qa-test','qa-cleanup','qa-receipt'])await gate.assertBeforeWrite({...args,scope});
  nativeEvidence={identity,newFunctionCount:44,totalCatalogFunctions:48,facetCount:30,ownedFacetCount:12,metadataHash:approval.payload.ownedControlMetadataHash,rolePlanDigest:roleDigest,inventoryDigest:approval.payload.inventoryDigest,readonlyTransaction:true,actualQueryCount:f.state.calls.filter(c=>c.body?.query).length,officialAdapterHashMatched:true,qaScopes:['qa-create','qa-session','qa-test','qa-cleanup','qa-receipt'],controllerBodies:'inert ABI mechanics leaves only; actual controller source/SDK acceptance remains F2 evidence',nativeAuthority:false};
  await t.test('sourceActualIdentityCONGRUENCE six canonical native relations',()=>{
    assert.deepEqual([...new Set(primary.metadata.columns.filter(c=>supportedRelations.includes(c.table)).map(c=>c.table))].sort(),[...supportedRelations].sort());
    assert.equal(read("SELECT encode(sha256(convert_to((source_identity)::jsonb::text,'UTF8')),'hex') AS source_digest FROM ("+identityExpression+' AS source_identity) x;').source_digest,primary.control_identity_digest);
    assert.equal(primary.metadata.relations.length,11);
    assert.equal(primary.metadata.functions.length,48);
    assert.equal(primary.metadata.controlIdentity.functions.length,46);
    assert.ok(primary.metadata.columns.some(c=>c.table==='public.workspace_edits' && c.column==='operations' && c.type==='jsonb'));
  });
  const nativeDrifts={
    coreRelationAbsent:['ALTER TABLE app_private.qa_core_provision_context RENAME TO unapproved_core_context','ALTER TABLE app_private.unapproved_core_context RENAME TO qa_core_provision_context'],
    workspaceRelationAbsent:['ALTER TABLE public.workspace_edits RENAME TO unapproved_workspace_edits','ALTER TABLE public.unapproved_workspace_edits RENAME TO workspace_edits'],
    corePK:['ALTER TABLE app_private.qa_core_provision_context DROP CONSTRAINT qa_core_provision_context_pkey','ALTER TABLE app_private.qa_core_provision_context ADD PRIMARY KEY(backend_pid,sql_xid,source_function,canonical_key,target_user)'],
    coreDefault:["ALTER TABLE app_private.qa_core_provision_context ALTER COLUMN login_name SET DEFAULT 'drift'",'ALTER TABLE app_private.qa_core_provision_context ALTER COLUMN login_name DROP DEFAULT'],
    coreTrigger:['ALTER TABLE app_private.qa_core_provision_context DISABLE TRIGGER qa_owned_deletion_fence','ALTER TABLE app_private.qa_core_provision_context ENABLE TRIGGER qa_owned_deletion_fence'],
    corePrivateACL:['GRANT SELECT ON app_private.qa_core_provision_context TO service_role','REVOKE SELECT ON app_private.qa_core_provision_context FROM service_role'],
    coreColumnACL:['GRANT SELECT(login_name) ON app_private.qa_core_provision_context TO service_role','REVOKE SELECT(login_name) ON app_private.qa_core_provision_context FROM service_role'],
    workspaceOperationType:['ALTER TABLE public.workspace_edits ALTER COLUMN operations TYPE text USING operations::text','ALTER TABLE public.workspace_edits ALTER COLUMN operations TYPE jsonb USING operations::jsonb'],
    workspaceOperationAbsent:['ALTER TABLE public.workspace_edits DROP COLUMN operations','ALTER TABLE public.workspace_edits ADD COLUMN operations jsonb NOT NULL'],
    workspaceTrigger:['ALTER TABLE public.workspace_edits DISABLE TRIGGER qa_owned_deletion_fence','ALTER TABLE public.workspace_edits ENABLE TRIGGER qa_owned_deletion_fence'],
    workspaceACL:['GRANT UPDATE ON public.workspace_edits TO authenticated','REVOKE UPDATE ON public.workspace_edits FROM authenticated'],
    unknownCatalog:['CREATE TABLE public.unapproved_catalog(id integer)','DROP TABLE public.unapproved_catalog']
  };
  for(const [name,[change,restore]] of Object.entries(nativeDrifts))await t.test('canonical native catalog drift denies before write: '+name,async()=>{
    primary=read(api.RUNTIME_OWNED_METADATA_SELECT);
    query(`UPDATE app_private.qa_owned_native_anchor SET catalog_digest='${primary.metadata.nativeCatalogDigest}';`);
    plan.payload.controlIdentityDigest=primary.control_identity_digest;plan.signature=f.envelope(plan.payload,'QA-OWNED-ROLEPLAN-v1').signature;
    query(`UPDATE app_private.qa_owned_approved_plans SET payload=${lit(JSON.stringify(plan.payload))}::jsonb,signature=${lit(plan.signature)};`);
    f.state.ownedMetadata=primary.metadata;f.state.ownedIdentityDigest=primary.control_identity_digest;f.state.sqlInventory=read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory;
    const signed=f.approval(),bound=api.createRuntimeProvenanceGate({reader:f.reader,receipt:signed});
    query(change);
    try{
      const drifted=read(api.RUNTIME_OWNED_METADATA_SELECT).metadata;
      if(name.endsWith('RelationAbsent'))assert.throws(()=>api.canonicalMetadataHash(drifted),/runtime_provenance_denied/);
      else assert.notEqual(api.canonicalMetadataHash(drifted),signed.payload.ownedControlMetadataHash);
      await rejectsWithoutMutation(bound,{...args,inventoryDigest:signed.payload.inventoryDigest});
    }finally{query(restore);}
  });
  primary=read(api.RUNTIME_OWNED_METADATA_SELECT);query(`UPDATE app_private.qa_owned_native_anchor SET catalog_digest='${primary.metadata.nativeCatalogDigest}';`);
  plan.payload.controlIdentityDigest=primary.control_identity_digest;plan.signature=f.envelope(plan.payload,'QA-OWNED-ROLEPLAN-v1').signature;
  query(`UPDATE app_private.qa_owned_approved_plans SET payload=${lit(JSON.stringify(plan.payload))}::jsonb,signature=${lit(plan.signature)};`);
  f.state.ownedMetadata=primary.metadata;f.state.ownedIdentityDigest=primary.control_identity_digest;f.state.sqlInventory=read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory;
  approval=f.approval();gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt:approval});args.inventoryDigest=approval.payload.inventoryDigest;
  await gate.assertBeforeWrite(args);
  nativeEvidence.supportedRelations=supportedRelations;nativeEvidence.sourceActualIdentityCONGRUENCE=true;nativeEvidence.nativeDriftLabels=Object.keys(nativeDrifts);nativeEvidence.controlIdentityDigest=primary.control_identity_digest;nativeEvidence.nativeCatalogDigest=primary.metadata.nativeCatalogDigest;nativeEvidence.supportedRelationMetadataCount=11;
  query(`INSERT INTO app_private.qa_owned_run_receipts(run_id,plan_id,plan_payload,completed_at) VALUES(${lit(plan.payload.runId)},${lit(plan.plan_id)},${lit(JSON.stringify(plan.payload))}::jsonb,NULL);`+plan.payload.resources.map(r=>`INSERT INTO app_private.qa_owned_sources(run_id,source_id,create_operation,creation_receipt,user_id,session_id,state,source) VALUES(${lit(r.runId)},${lit(r.sourceId)},${lit(r.createOperation)},${lit(r.receiptId)},NULL,NULL,'reserved',${lit(JSON.stringify(r))}::jsonb);`).join(''));
  f.state.sqlInventory=read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory;approval=f.approval();gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt:approval});args.inventoryDigest=approval.payload.inventoryDigest;
  for(const scope of ['qa-create','qa-session','qa-test','qa-cleanup','qa-receipt'])await gate.assertBeforeWrite({...args,scope});
  nativeEvidence.preparedSourceCount=57;nativeEvidence.preparedScopesVerified=true;nativeEvidence.actualQueryCount=f.state.calls.filter(c=>c.body?.query).length;
  query(`UPDATE app_private.qa_owned_sources SET source=jsonb_set(source,'{role}','"other"'::jsonb) WHERE source_id='0';`);
  f.state.sqlInventory=read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory;
  const tamperedApproval=f.approval(),tamperedGate=api.createRuntimeProvenanceGate({reader:f.reader,receipt:tamperedApproval});await rejectsWithoutMutation(tamperedGate,{...args,inventoryDigest:tamperedApproval.payload.inventoryDigest});
  query(`UPDATE app_private.qa_owned_sources SET source=jsonb_set(source,'{role}','"employee"'::jsonb) WHERE source_id='0';`);
  nativeEvidence.nativeSourceRoleTamperDeniedWithRefreshedApproval=true;
  // A real native RLS filtering proof and absent privilege both deny, no grants
  // are changed by the reader. Fixture-owner DDL stays in this exact owned database.
  for(const table of ['qa_owned_deletions','qa_owned_deletion_fences','qa_owned_native_anchor','qa_owned_native_frames','qa_owned_native_effects']){query(`ALTER TABLE app_private.${table} ENABLE ROW LEVEL SECURITY;`);assert.equal(read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory.unfiltered,false);await rejectsWithoutMutation(gate,args);query(`ALTER TABLE app_private.${table} DISABLE ROW LEVEL SECURITY;`);}
  nativeEvidence.fiveNewRlsRelationsDenied=true;nativeEvidence.nativeGatewayCreateRoleApproved=primary.metadata.gateway.role.rolcreaterole===true;
  query('ALTER TABLE app_private.qa_owned_sources ENABLE ROW LEVEL SECURITY;');
  assert.equal(read(api.RUNTIME_OWNED_INVENTORY_SELECT).inventory.unfiltered,false);await rejectsWithoutMutation(gate,args);
  query('ALTER TABLE app_private.qa_owned_sources DISABLE ROW LEVEL SECURITY;REVOKE SELECT ON app_private.qa_owned_sources FROM supabase_read_only_user;');
  await rejectsWithoutMutation(gate,args);
  query('GRANT SELECT ON app_private.qa_owned_sources TO supabase_read_only_user;DROP FUNCTION public.qa_owned_bootstrap_internal(uuid,uuid,uuid);');
  assert.throws(()=>api.canonicalMetadataHash(read(api.RUNTIME_OWNED_METADATA_SELECT).metadata),/runtime_provenance_denied/);await rejectsWithoutMutation(gate,args);
});


test('owned QA approval independently captures primary catalog and all seven SQL facets twice',async t=>{
  const f=fixture(t,{owned:true}),gate=f.gate();
  await gate.assertBeforeWrite({...f.args,scope:'qa-create'});
  assert.equal(f.state.calls.filter(c=>c.body?.query===api.RUNTIME_OWNED_METADATA_SELECT).length,4);
  assert.equal(f.state.calls.filter(c=>c.body?.query===api.RUNTIME_OWNED_INVENTORY_SELECT).length,4);
  assert.equal(f.state.calls.filter(c=>c.body?.query===api.RUNTIME_OWNED_CLOSING_SELECT).length,1);
  assert.equal(api.isRuntimeProvenanceGate(gate),false);
});


test('owned metadata drift during the last awaited inventory must deny before write',async t=>{
  const f=fixture(t,{owned:true}),gate=f.gate();
  f.state.hook=async req=>{if(req.body?.query===api.RUNTIME_OWNED_CLOSING_SELECT)f.state.ownedMetadata.functions[0].definition+=' drift during final await';};
  await rejectsWithoutMutation(gate,{...f.args,scope:'qa-create'});
});

const rejectsWithoutMutation=async(gate,args)=>{
  let writes=0;
  await assert.rejects(async()=>{await gate.assertBeforeWrite(args);writes++;},e=>e.message==='runtime_provenance_denied' && e.code==='runtime_provenance_denied');
  assert.equal(writes,0);
};


const ownedMetadataDrift={body:m=>m.functions[0].definition+=' changed',oid:m=>m.functions[0].oid='999999',owner:m=>m.functions[0].owner='other',acl:m=>m.functions[0].acl='{PUBLIC=X/postgres}',namedABI:m=>m.functions[0].args='renamed text',config:m=>m.functions[0].config=['search_path=public'],missingFunction:m=>m.functions.pop(),newFunction:m=>m.functions.push({...m.functions[0],oid:'999999',identity:'public.qa_owned_unreviewed()'}),missingColumns:m=>m.columns.pop(),trigger:m=>m.triggers[0].tgfoid='999999',closure:m=>m.closure[0].condeferred=false,missingBridge:m=>m.functions=null};
for(const [name,change]of Object.entries(ownedMetadataDrift))test('owned actual primary catalog drift denies: '+name,async t=>{
  const f=fixture(t,{owned:true}),gate=f.gate();change(f.state.ownedMetadata);await rejectsWithoutMutation(gate,{...f.args,scope:'qa-create'});
});
for(const facet of ['qaOwnedPlans','qaOwnedRunReceipts','qaOwnedSources','qaOwnedOperations','qaOwnedResources','qaOwnedFrames','qaOwnedClosureEmpty']){
  test('owned missing complete SQL facet denies: '+facet,async t=>{const f=fixture(t,{owned:true}),gate=f.gate();delete f.state.sqlInventory.facets[facet];await rejectsWithoutMutation(gate,{...f.args,scope:'qa-cleanup'});});
  test('owned independent SQL count mismatch denies: '+facet,async t=>{const f=fixture(t,{owned:true}),gate=f.gate();f.state.sqlInventory.counts[facet]++;await rejectsWithoutMutation(gate,{...f.args,scope:'qa-receipt'});});
}
for(const field of ['ownedControlMetadataHash','ownedRolePlanDigest']){
  test('owned paired signed fields cannot be incomplete: '+field,t=>{const f=fixture(t,{owned:true}),p=structuredClone(f.receipt.payload);delete p[field];assert.throws(()=>api.createRuntimeProvenanceGate({reader:f.reader,receipt:f.envelope(p,'QA-PROVENANCE-APPROVAL-v1')}),/runtime_provenance_denied/);assert.equal(f.state.calls.length,0);});
  test('owned actual binding rejects authentic but incorrect signed hash: '+field,async t=>{const f=fixture(t,{owned:true}),p=structuredClone(f.receipt.payload);p[field]='f'.repeat(64);const gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt:f.envelope(p,'QA-PROVENANCE-APPROVAL-v1')});await rejectsWithoutMutation(gate,{...f.args,scope:'qa-session'});});
}
const ownedPlanDrift={expired:s=>s.sqlInventory.ownedPlans[0].expires_at=new Date(Date.now()-1).toISOString(),payload:s=>s.sqlInventory.ownedPlans[0].payload.resources[0].role='other',units:s=>s.sqlInventory.ownedUnits[0].name='drift',signer:s=>s.sqlInventory.ownedPlans[0].signing_key_hash='f'.repeat(64),missing:s=>{s.sqlInventory.ownedPlans=[];s.sqlInventory.facets.qaOwnedPlans=[];s.sqlInventory.counts.qaOwnedPlans=0;},source:s=>s.sqlInventory.ownedPlans[0].source_hash='f'.repeat(64),filtered:s=>s.sqlInventory.unfiltered=false,extraProjection:s=>s.sqlInventory.facets.qaOwnedPlans[0].unreviewed=true};
for(const [name,change]of Object.entries(ownedPlanDrift))test('owned plan/current complete inventory drift denies: '+name,async t=>{const f=fixture(t,{owned:true}),gate=f.gate();change(f.state);await rejectsWithoutMutation(gate,{...f.args,scope:'qa-test'});});
test('owned actual payload recomputation rejects claimed plan digest even in refreshed signed inventory',async t=>{
  const f=fixture(t,{owned:true});f.state.sqlInventory.ownedPlans[0].payload.resources[0].displayName+=' tampered';
  const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});await rejectsWithoutMutation(gate,{...f.args,inventoryDigest:receipt.payload.inventoryDigest,scope:'qa-create'});
});
test('owned incomplete receipt/full-plan readback rejects refreshed signed inventory',async t=>{
  const f=fixture(t,{owned:true}),plan=f.state.sqlInventory.ownedPlans[0];
  f.state.sqlInventory.ownedRunPlans=[{run_id:plan.payload.runId,plan_id:plan.plan_id,plan_payload:{...plan.payload,sourceHash:'f'.repeat(64)},completed_at:null}];
  f.state.sqlInventory.facets.qaOwnedRunReceipts=[{run_id:plan.payload.runId,plan_id:plan.plan_id,role_plan_digest:plan.payload.rolePlanDigest,control_identity_digest:plan.payload.controlIdentityDigest,completed_at:null}];f.state.sqlInventory.counts.qaOwnedRunReceipts=1;
  const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});await rejectsWithoutMutation(gate,{...f.args,inventoryDigest:receipt.payload.inventoryDigest,scope:'qa-receipt'});
});

test('owned prepared run with incomplete source reservation denies refreshed signed inventory',async t=>{
  const f=fixture(t,{owned:true}),plan=f.state.sqlInventory.ownedPlans[0];
  f.state.sqlInventory.ownedRunPlans=[{run_id:plan.payload.runId,plan_id:plan.plan_id,plan_payload:structuredClone(plan.payload),completed_at:null}];
  f.state.sqlInventory.facets.qaOwnedRunReceipts=[{run_id:plan.payload.runId,plan_id:plan.plan_id,role_plan_digest:plan.payload.rolePlanDigest,control_identity_digest:plan.payload.controlIdentityDigest,completed_at:null}];f.state.sqlInventory.counts.qaOwnedRunReceipts=1;
  const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});await rejectsWithoutMutation(gate,{...f.args,inventoryDigest:receipt.payload.inventoryDigest,scope:'qa-receipt'});
});

test('owned new private frame denies even with freshly signed complete inventory',async t=>{
  const f=fixture(t,{owned:true});f.state.sqlInventory.facets.qaOwnedFrames=[{backend_pid:1,sql_xid:'1',source_oid:'90000',run_id:'66666666-6666-4666-8666-666666666666',source_id:'1',phase:'bootstrap',effect_table:'1',effect_op:'INSERT',effect_state:'armed',effect_sequence:1,closure:1}];f.state.sqlInventory.counts.qaOwnedFrames=1;
  const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});await rejectsWithoutMutation(gate,{...f.args,inventoryDigest:receipt.payload.inventoryDigest,scope:'qa-create'});
});
for(const facet of ['qaOwnedPlans','qaOwnedSources','qaOwnedOperations','qaOwnedResources','qaOwnedFrames'])test('owned drift after signed authority status await denies: '+facet,async t=>{
  const f=fixture(t,{owned:true}),gate=f.gate();f.state.hook=async req=>{if(new URL(req.url).hostname==='review.example.invalid')f.state.sqlInventory.counts[facet]++;};await rejectsWithoutMutation(gate,{...f.args,scope:'qa-cleanup'});
});
test('owned plan expires across closing asynchronous status readback',async t=>{
  const f=fixture(t,{owned:true});f.state.sqlInventory.ownedPlans[0].expires_at=new Date(Date.now()+2000).toISOString();f.state.sqlInventory.facets.qaOwnedPlans[0].expires_at=f.state.sqlInventory.ownedPlans[0].expires_at;
  const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});
  f.state.hook=async req=>{if(new URL(req.url).hostname==='review.example.invalid')await new Promise(r=>setTimeout(r,2200));};await rejectsWithoutMutation(gate,{...f.args,inventoryDigest:receipt.payload.inventoryDigest,scope:'qa-test'});
});
test('owned QA reader readback is independently derived and cannot add caller hash fields',async t=>{
  const f=fixture(t,{owned:true}),o=await f.reader.readback({scope:'qa-create'});
  assert.equal(o.ownedControlMetadataHash,api.canonicalMetadataHash(f.state.ownedMetadata));assert.equal(o.ownedRolePlanDigest,f.state.sqlInventory.ownedPlans[0].payload.rolePlanDigest);
  await assert.rejects(f.reader.readback({scope:'qa-create',ownedRolePlanDigest:'f'.repeat(64)}),/runtime_provenance_denied/);
});

test('signature authenticity cannot be replaced by arbitrary verifier callbacks',t=>{
  const f=fixture(t);
  const altered=structuredClone(f.receipt);altered.payload.inventoryDigest='f'.repeat(64);
  assert.throws(()=>api.createRuntimeProvenanceGate({reader:f.reader,receipt:altered,verify:()=>true}),/runtime_provenance_denied/);
  const foreign=generateKeyPairSync('ed25519');
  altered.payload=structuredClone(f.receipt.payload);
  altered.signature=sign(null,Buffer.from('QA-PROVENANCE-APPROVAL-v1\n'+stable(altered.payload)),foreign.privateKey).toString('base64');
  assert.throws(()=>api.createRuntimeProvenanceGate({reader:f.reader,receipt:altered}),/runtime_provenance_denied/);
  const wrongDomain=f.envelope(f.receipt.payload,'QA-PROVENANCE-STATUS-v1');
  assert.throws(()=>api.createRuntimeProvenanceGate({reader:f.reader,receipt:wrongDomain}),/runtime_provenance_denied/);
  assert.throws(()=>api.createRuntimeProvenanceGate({reader:{readback:async()=>true},receipt:f.receipt}),/runtime_provenance_denied/);
  assert.throws(()=>api.createAuthorizedRuntimeReader({...f.cfg,repositoryRoot:fileURLToPath(new URL('..',import.meta.url)),transport:async()=>true}),/runtime_provenance_denied/);
  assert.equal(f.state.calls.length,0);
});

const invalidReceipts={
 verdict:p=>p.verdict='BLOCKED',independence:p=>p.independent=false,
 expired:p=>{p.issuedAt=Date.now()-2000;p.expiresAt=Date.now()-1;},
 future:p=>p.issuedAt=Date.now()+5000,
 tooLong:p=>p.expiresAt=p.issuedAt+60001,
 wrongProject:p=>p.projectRef='not-the-authorized-project',wrongFrontend:p=>p.frontendOrigin='https://other.pages.dev',
 historicalMappingAsRelease:p=>{p.release.sourceSha='717375eee1e99d558af80eca91a7ea7e829edd20';p.runtime.sourceSha=p.release.sourceSha;p.frontend.sourceSha=p.release.sourceSha;p.edges.forEach(e=>e.sourceSha=p.release.sourceSha);},
 postMergeMissing:p=>delete p.release.postMerge,
 executorMissing:p=>delete p.localHashes['accounts-provision.mjs'],
 rpcMissing:p=>delete p.rpc,rpcIdentity:p=>p.rpc.identity='public.account_provision_link_internal(text, uuid, jsonb)',
 runtimeMissing:p=>delete p.runtime,edgeMissing:p=>p.edges.pop(),edgeDuplicate:p=>p.edges[1]=p.edges[0],
 edgeSourceMissing:p=>delete p.edges[0].sourceSha,sourceIdentityMismatch:p=>p.edges[0].sourceSha='a'.repeat(40),
 malformedSha:p=>p.release.sourceSha='not-a-sha',
 staleInventory:p=>p.inventoryCapturedAt=Date.now()-60001,
 inventoryMissing:p=>delete p.inventoryDigest,
 duplicateScope:p=>p.scopes.push(p.scopes[0]),unknownScope:p=>p.scopes=['other-write'],
 extraUnreviewedField:p=>p.unreviewed='denied',
};
for(const [name,change]of Object.entries(invalidReceipts))test('signed incomplete or invalid approval denies: '+name,t=>{
  const f=fixture(t),p=structuredClone(f.receipt.payload);change(p);
  const receipt=f.envelope(p,'QA-PROVENANCE-APPROVAL-v1');
  assert.throws(()=>api.createRuntimeProvenanceGate({reader:f.reader,receipt}),/runtime_provenance_denied/);
  assert.equal(f.state.calls.length,0);
});

for(const [name,args] of Object.entries({inventoryDigest:{inventoryDigest:'e'.repeat(64)},scope:{scope:'qa-nonexistent'},operationId:{operationId:'33333333-3333-4333-8333-333333333333'}}))test('wrong prewrite binding denies without readback: '+name,async t=>{
  const f=fixture(t);await rejectsWithoutMutation(f.gate(),{...f.args,...args});assert.equal(f.state.calls.length,0);
});

const metadataDrift={definition:m=>m.definition+=' -- drift',owner:m=>m.owner='other',acl:m=>m.acl=[{grantee:'PUBLIC',grantor:'postgres',privilege:'EXECUTE',grantable:false}],configuration:m=>m.config=['search_path=public'],namedABI:m=>m.argumentNames[0]='renamed',types:m=>m.argumentTypes[0]='varchar',overloads:m=>m.overloadCount=2,missing:m=>delete m.definition};
for(const [name,change]of Object.entries(metadataDrift))test('actual RPC readback drift denies before mutation: '+name,async t=>{
  const f=fixture(t),gate=f.gate();change(f.state.metadata);await rejectsWithoutMutation(gate,f.args);
});

const runtimeDrift={
 edgeVersion:s=>s.edges[0].version++,edgeId:s=>s.edges[0].id+='-changed',edgeStatus:s=>s.edges[0].status='THROTTLED',
 edgeBundleIdentity:s=>s.edges[0].ezbr_sha256='f'.repeat(64),edgeBody:s=>s.bodySuffix='-changed',edgeMissing:s=>s.edges.pop(),
 edgeMetadataMissing:s=>delete s.edges[0].ezbr_sha256,
 postgres:s=>s.postgresVersion++,frontendDeployment:s=>s.frontend.id+='-changed',frontendSource:s=>s.frontend.deployment_trigger.metadata.commit_hash='a'.repeat(40),frontendNotDeployed:s=>s.frontend.latest_stage.status='failure',
 inventoryCount:s=>s.sqlInventory.counts.profiles=1,
 inventoryComplete:s=>s.sqlInventory.unfiltered=false,
 inventoryFacet:s=>delete s.sqlInventory.facets.qa_accounts,
 inventoryChanged:s=>{s.sqlInventory.facets.roles.push({code:'offline',name_ar:'offline'});s.sqlInventory.counts.roles++;},
};
for(const [name,change]of Object.entries(runtimeDrift))test('actual deployed/runtime/inventory drift denies: '+name,async t=>{
  const f=fixture(t),gate=f.gate();change(f.state);await rejectsWithoutMutation(gate,f.args);
});

for(const name of ['accounts-create-originals.mjs','accounts-provision.mjs'])test('current executor hash is revalidated each time: '+name,async t=>{
  const f=fixture(t),gate=f.gate();await gate.assertBeforeWrite(f.args);
  await Promise.resolve();writeFileSync(join(f.root,'scripts',name),'// changed after an await\n');
  await rejectsWithoutMutation(gate,f.args);
});

test('changed source HEAD and dirty release are rejected',async t=>{
  const f=fixture(t),gate=f.gate();writeFileSync(join(f.root,'release-extra.txt'),'public offline data');f.git('add','.');
  f.git('-c','user.name=Offline Fixture','-c','user.email=offline@example.invalid','commit','-m','different release');
  await rejectsWithoutMutation(gate,f.args);
});

test('runtime source is read again across intervening readback awaits',async t=>{
  const f=fixture(t),gate=f.gate();let inventories=0;
  f.state.hook=async req=>{if(req.body?.query===api.RUNTIME_INVENTORY_SELECT && ++inventories===2) f.state.metadata.definition+=' -- changed between captures';};
  await rejectsWithoutMutation(gate,f.args);
});

test('revocation is read every mutation, not cached from initialization',async t=>{
  const f=fixture(t),gate=f.gate();await gate.assertBeforeWrite(f.args);await Promise.resolve();f.state.revoked=true;
  await rejectsWithoutMutation(gate,f.args);
  assert.equal(f.state.calls.filter(c=>new URL(c.url).hostname==='review.example.invalid').length,2);
});
for(const [name,change]of Object.entries({nonce:s=>s.nonce='bad',digest:s=>s.receiptDigest='f'.repeat(64),receipt:s=>s.receiptId='bad',expired:s=>s.expiresAt=Date.now()-1,stale:s=>s.checkedAt=Date.now()-5001,missing:s=>delete s.state}))test('signed status replay/expiry/incompleteness denies: '+name,async t=>{
  const f=fixture(t),gate=f.gate();f.state.statusTransform=change;await rejectsWithoutMutation(gate,f.args);
});

test('expiry is checked again after real asynchronous readback',async t=>{
  const f=fixture(t),p=structuredClone(f.receipt.payload);p.expiresAt=Date.now()+100;
  const gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt:f.envelope(p,'QA-PROVENANCE-APPROVAL-v1')});
  f.state.hook=async()=>{await new Promise(r=>setTimeout(r,10));};
  await rejectsWithoutMutation(gate,f.args);
});

test('out-of-band pin changes during an await deny with sanitized error',async t=>{
  const f=fixture(t),gate=f.gate();
  f.state.hook=async req=>{if(req.body?.query===api.RUNTIME_INVENTORY_SELECT)writeFileSync(f.pinPath,'{}');};
  await rejectsWithoutMutation(gate,f.args);
});

test('official per-ID GET is mandatory for every complete SQL Auth inventory row',async t=>{
  const f=fixture(t),u={id:'44444444-4444-4444-8444-444444444444',email:'offline@example.invalid',email_confirmed_at:'2026-10-09T00:00:00Z',banned_until:null,deleted_at:null};
  f.state.sqlInventory.facets.auth_users.push(u);f.state.sqlInventory.counts.auth_users=1;f.state.users.set(u.id,{id:u.id,email:u.email,email_confirmed_at:u.email_confirmed_at});
  const receipt=f.approval(),args={...f.args,inventoryDigest:receipt.payload.inventoryDigest},gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});
  await gate.assertBeforeWrite(args);
  assert.equal(f.state.calls.filter(c=>c.url.includes('/auth/v1/admin/users/'+u.id)).length,2);
  f.state.users.get(u.id).id='55555555-5555-4555-8555-555555555555';
  await rejectsWithoutMutation(gate,args);
});

test('provider errors, getters and handles cannot expose credentials in output',async t=>{
  const f=fixture(t),gate=f.gate();
  assert.equal(JSON.stringify(gate),'{}');assert.equal(JSON.stringify(f.reader),'{}');
  f.state.hook=async()=>{throw new Error('synthetic-private-error-sentinel');};
  await assert.rejects(gate.assertBeforeWrite(f.args),e=>JSON.stringify({message:e.message,code:e.code})==='{"message":"runtime_provenance_denied","code":"runtime_provenance_denied"}');
  const bad={...f.args};Object.defineProperty(bad,'scope',{get(){throw new Error('synthetic-private-error-sentinel');},enumerable:true});
  await rejectsWithoutMutation(gate,bad);
  assert.throws(()=>api.inventorySnapshotDigest({...f.state.sqlInventory,privatePayload:'not-accepted'}),/runtime_provenance_denied/);
});

test('receipt is immutable internally, and each assert performs fresh readbacks',async t=>{
  const f=fixture(t),gate=f.gate();f.receipt.payload.verdict='BLOCKED';
  await gate.assertBeforeWrite(f.args);const count=f.state.calls.length;
  await Promise.resolve();await gate.assertBeforeWrite(f.args);assert.equal(f.state.calls.length,count*2);
  for(const call of f.state.calls){
    assert.ok(['GET','POST'].includes(call.method));
    if(call.method==='POST')assert.ok(call.url.endsWith('/database/query/read-only'));
    assert.ok(!/password|reset|create|delete/.test(new URL(call.url).search));
  }
});

test('approved Node runtime version and execution source SHA must match readback',async t=>{
  const f=fixture(t);
  for(const change of [p=>p.runtime.nodeVersion='v0.0.0',p=>{p.release.sourceSha='b'.repeat(40);p.runtime.sourceSha=p.release.sourceSha;p.frontend.sourceSha=p.release.sourceSha;p.edges.forEach(e=>e.sourceSha=p.release.sourceSha);}]) {
    const p=structuredClone(f.receipt.payload);change(p);
    const gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt:f.envelope(p,'QA-PROVENANCE-APPROVAL-v1')});
    await rejectsWithoutMutation(gate,f.args);
  }
});

test('all explicitly approved account and QA mutation scopes execute prewrite checks',async t=>{
  const accounts=fixture(t),qa=fixture(t,{owned:true});
  for(const scope of api.MUTATION_SCOPES){const f=scope.startsWith('qa-')?qa:accounts;await f.gate().assertBeforeWrite({...f.args,scope});}
  assert.equal([...accounts.state.calls,...qa.state.calls].filter(c=>new URL(c.url).hostname==='review.example.invalid').length,api.MUTATION_SCOPES.length);
});

test('approved exact raw executor hashes can bind a clean Windows CRLF checkout',async t=>{
  const f=fixture(t);f.git('config','core.autocrlf','true');
  for(const name of ['accounts-create-originals.mjs','accounts-provision.mjs'])writeFileSync(join(f.root,'scripts',name),'// inert offline executor fixture\r\n');
  f.git('add','.'); // Refresh fixture index stat data after the EOL-only checkout.
  assert.equal(f.git('status','--porcelain'),'', 'CRLF fixture must be a clean checkout');
  const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});
  await gate.assertBeforeWrite(f.args);
});


test('final durable catalog and five private inventories are closed primary read projections',()=>{
  assert.equal(api.OWNED_INVENTORY_FACETS.length,12);
  for(const table of ['qa_owned_deletions','qa_owned_deletion_fences','qa_owned_native_anchor','qa_owned_native_frames','qa_owned_native_effects'])assert.ok(OWNED_CONTROL_PRIMARY_METADATA_SELECT.includes('app_private.'+table));
  assert.ok(OWNED_CONTROL_PRIMARY_METADATA_SELECT.includes('qa_owned_native_close'));
  assert.ok(OWNED_CONTROL_PRIMARY_METADATA_SELECT.includes('pg_roles'));
});

const durableRow=()=>({operation_id:'99999999-9999-4999-8999-999999999999',run_id:'66666666-6666-4666-8666-666666666666',source_id:'0',target_user_id:'44444444-4444-4444-8444-444444444444',canonical_key:'fixture-0',generation:1,status:'delete_prepared',ownership_receipt_digest:hash('ownership'),protected_snapshot_digest:hash('protected'),prepared_at:new Date().toISOString(),auth_readback_digest:null,absence_observed_at:null,completed_receipt:null,native_root_receipt:null});
for(const facet of ['qaOwnedDeletions','qaOwnedDeletionFences','qaOwnedNativeAnchor','qaOwnedNativeFrames','qaOwnedNativeEffects'])test('final five private facets require complete rows and independent counts: '+facet,t=>{
  const f=fixture(t,{owned:true});delete f.state.sqlInventory.facets[facet];assert.throws(()=>api.inventorySnapshotDigest(f.state.sqlInventory),/runtime_provenance_denied/);
  f.state.sqlInventory.facets[facet]=[];f.state.sqlInventory.counts[facet]=1;assert.throws(()=>api.inventorySnapshotDigest(f.state.sqlInventory),/runtime_provenance_denied/);
});
for(const [label,change] of Object.entries({state:r=>r.status='unreviewed',generation:r=>r.generation=0,ownership:r=>r.ownership_receipt_digest=null,absence:r=>r.status='db_finalize_pending',completion:r=>r.status='completed',root:r=>r.native_root_receipt={operation_id:'foreign'},fenceGeneration:r=>r.generation=2}))test('final durable state invariants reject refreshed inventory: '+label,t=>{
  const f=fixture(t,{owned:true}),r=durableRow(),i=f.state.sqlInventory;i.facets.qaOwnedDeletions=[r];i.counts.qaOwnedDeletions=1;i.facets.qaOwnedDeletionFences=[{target_user_id:r.target_user_id,canonical_key:r.canonical_key,run_id:r.run_id,operation_id:r.operation_id,generation:r.generation}];i.counts.qaOwnedDeletionFences=1;change(r);assert.throws(()=>api.inventorySnapshotDigest(i),/runtime_provenance_denied/);
});
test('final native effects reject orphan operation even in refreshed inventory',t=>{
  const f=fixture(t,{owned:true}),q=OWNED_CONTROL_INVENTORY_FACETS.qaOwnedNativeEffects,cols=q.slice(7,q.indexOf(' FROM ')).split(',').map(c=>c.split(' AS ').at(-1));f.state.sqlInventory.facets.qaOwnedNativeEffects=[Object.fromEntries(cols.map(k=>[k,null]))];f.state.sqlInventory.counts.qaOwnedNativeEffects=1;assert.throws(()=>api.inventorySnapshotDigest(f.state.sqlInventory),/runtime_provenance_denied/);
});
test('final deferred closure callback identity is structurally closed',t=>{const f=fixture(t,{owned:true});f.state.ownedMetadata.triggers[2].tgname='foreign_close';assert.throws(()=>api.canonicalMetadataHash(f.state.ownedMetadata),/runtime_provenance_denied/);});

for(const name of ['owned-control.sql','owned-deletion-fence.sql'])test('final both raw SQL sources are independently pinned in signed inventory: '+name,async t=>{
 const f=fixture(t,{owned:true});f.state.sqlInventory.ownedPlans[0].payload.sourceHashes[name]='f'.repeat(64);const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});await rejectsWithoutMutation(gate,{...f.args,scope:'qa-create',inventoryDigest:receipt.payload.inventoryDigest});
});
test('final primary foreign gateway metadata cannot replace installer anchor',async t=>{const f=fixture(t,{owned:true});f.state.ownedMetadata.gateway.role.oid='23';const receipt=f.approval(),gate=api.createRuntimeProvenanceGate({reader:f.reader,receipt});await rejectsWithoutMutation(gate,{...f.args,scope:'qa-cleanup',inventoryDigest:receipt.payload.inventoryDigest});});

for(const [name,change]of Object.entries({newCallback:m=>m.functions.find(f=>f.identity==='app_private.qa_owned_native_close()').definition+=' callback drift',changedFenceABI:m=>m.functions.find(f=>f.identity.startsWith('public.qa_owned_delete_transition_internal(')).args='renamed uuid, p_generation bigint, p_status text',gatewayAttributes:m=>m.gateway.role.rolcreaterole=!m.gateway.role.rolcreaterole}))test('final callback ABI and approved role attributes deny drift: '+name,async t=>{const f=fixture(t,{owned:true}),gate=f.gate();f.state.hook=async req=>{if(new URL(req.url).hostname==='review.example.invalid')change(f.state.ownedMetadata);};await rejectsWithoutMutation(gate,{...f.args,scope:'qa-cleanup'});});
for(const name of ['owned-control.sql','owned-deletion-fence.sql'])test('final raw SQL source drift during combined closing read denies: '+name,async t=>{const f=fixture(t,{owned:true}),gate=f.gate();f.state.hook=async req=>{if(req.body?.query===api.RUNTIME_OWNED_CLOSING_SELECT)writeFileSync(join(f.root,'scripts','qa-load-preparation',name),'-- source changed at final read');};await rejectsWithoutMutation(gate,{...f.args,scope:'qa-cleanup'});});
