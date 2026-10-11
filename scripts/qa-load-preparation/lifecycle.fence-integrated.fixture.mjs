// TEST ONLY. Actual SQL/autocommit and actual SDK; provider/Edge/F3 mocked.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {PGlite} from './lifecycle.fence-integrated.pg.mjs';
import {fixture,id,ORIGIN} from './lifecycle.test-fixture.mjs';
import {RUNTIME_OWNED_METADATA_SELECT,canonicalMetadataHash} from '../qa-runtime-provenance.mjs';
import {createTransactionFeedbackFixture} from '../../tests/qa_isolation_fixture.mjs';
export {id};
export const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const hash=x=>createHash('sha256').update(stable(x)).digest('hex');
export const sql=n=>fs.readFileSync(new URL('../../supabase/migrations/'+n,import.meta.url),'utf8');
export async function connect(user='postgres'){const d=new PGlite({user});await d.verified;return d;}
export async function scalar(d,s,a=[]){return Object.values((await d.query(s,a)).rows[0])[0];}
export async function rpc(name,args){assert.match(name,/^[a-z_]+$/);const d=await connect();try{await d.exec(`SET request.jwt.claims='{"role":"service_role"}';SET request.headers='{}';SET ROLE service_role;`);const k=Object.keys(args);assert(k.every(x=>/^[a-z_]+$/.test(x)));return await scalar(d,`SELECT public.${name}(${k.map((x,i)=>x+'=> $'+(i+1)).join(',')})`,k.map(x=>args[x]));}finally{await d.close();}}
export async function install(){
 const base=await createTransactionFeedbackFixture({modulePath:path.resolve(import.meta.dirname,'lifecycle.fence-integrated.pg.mjs')});const d=base.db;try{
 // Complete synthetic protected registry inventory before guards; no live values.
 for(let n=1;n<=57;n++){const key='synthetic_staff_'+n;await d.query("INSERT INTO public.account_migration_users(canonical_key,login_username,preferred_login,display_name,role_code,org_name,dept_names,internal_email,eligible,migrated_user_id,must_change_password) VALUES($1,$2,$2,$2,'employee','fixture root',ARRAY['fixture dept'],$3,true,$4,true)",[key,'synthetic_staff_'+n,'synthetic-staff-'+n+'@fixture.invalid',id(8000+n)]);}
 for(const n of ['20261008010000_qa_isolation_prerequisites.sql','20261008015000_qa_password_transport.sql','20261008018000_qa_rest_provenance.sql'])await d.exec(sql(n));
 const adapter=fs.readFileSync(new URL('../../tests/qa_isolation_enforcement.mjs',import.meta.url),'utf8');const setup=adapter.slice(adapter.indexOf(' // Empty dependency relations:'),adapter.indexOf(' for(const [cohort,run]'));
 await new (Object.getPrototypeOf(async function(){}).constructor)('db','fs',setup)(d,fs);
 for(const n of ['20261008018500_qa_core_rest_admission.sql','20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql'])await d.exec(sql(n));
 const m=sql('20261008020000_qa_isolation_enforcement.sql');await assert.rejects(d.exec(m),e=>e.code==='55000');await d.exec('ROLLBACK');
 await d.exec(m.split('-- BEGIN LOCAL VERIFIABLE SECTION\n')[1].split('-- END LOCAL VERIFIABLE SECTION')[0]);await d.exec(sql('20261008020500_qa_password_frame_composition.sql'));
 for(const t of ['profiles','user_roles','user_memberships','account_migration_users','audit_log','notifications','transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods'])await d.exec(`CREATE TRIGGER qa_integrated_reference BEFORE INSERT OR UPDATE OR DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row()`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await d.exec(`CREATE TRIGGER qa_integrated_capture BEFORE DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION app_private.qa_delete_capture()`);
 // Exact current source freeze after real graph attachments (fixture setup).
 const m195=sql('20261008019500_qa_delete_completion.sql');await d.exec(/DO \$freeze\$[\s\S]*?END \$freeze\$;/.exec(m195)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await d.exec(`GRANT USAGE ON SCHEMA public TO PUBLIC;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
 ALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb NOT NULL DEFAULT '{}',ADD COLUMN created_at timestamptz,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN banned_until timestamptz,ADD COLUMN deleted_at timestamptz;
 CREATE TABLE auth.refresh_tokens(id bigint PRIMARY KEY,session_id uuid REFERENCES auth.sessions(id));
 CREATE ROLE qa_fixture_auth_gateway LOGIN NOINHERIT;GRANT USAGE ON SCHEMA auth TO qa_fixture_auth_gateway;GRANT SELECT(id),DELETE ON auth.users TO qa_fixture_auth_gateway;`);
 const fks=await scalar(d,"SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY oid),'[]'::jsonb) FROM pg_constraint c WHERE contype='f'");
 await d.exec(fs.readFileSync(new URL('./owned-control.sql',import.meta.url),'utf8'));await d.exec(fs.readFileSync(new URL('./owned-deletion-fence.sql',import.meta.url),'utf8'));
 await d.exec("UPDATE app_private.qa_owned_native_anchor SET gateway_oid='qa_fixture_auth_gateway'::regrole; UPDATE app_private.qa_owned_native_anchor a SET gateway_metadata=jsonb_build_object('role',(SELECT to_jsonb(safe_role) FROM (SELECT r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolconnlimit,r.rolvaliduntil,r.rolbypassrls,encode(sha256(convert_to(coalesce(to_jsonb(r.rolconfig),'null'::jsonb)::text,'UTF8')),'hex') AS rolconfig_digest FROM pg_roles r WHERE r.oid=a.gateway_oid) safe_role),'memberships',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m WHERE m.member=a.gateway_oid OR m.roleid=a.gateway_oid),'[]'::jsonb));UPDATE app_private.qa_owned_native_anchor SET catalog_digest=app_private.qa_owned_native_catalog_digest()");
 await scalar(d,'SELECT app_private.qa_owned_fence_catalog_closed()');return {...base,fks,activationBarrier:'55000',migrationOrder:['100','150','180','185','190','195','bounded200','205','owned-control','owned-deletion-fence']};
 }catch(e){try{await d.exec('ROLLBACK');const source=fs.readFileSync(new URL('./owned-control.sql',import.meta.url),'utf8'),match=/format\('%I\.%I',n\.nspname,c\.relname\)<>ALL\(ARRAY\[([^\]]+)\]/.exec(source);const roster=match?[...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]):[];e.diagnostic={identity:d.connection,unsupportedRelations:(await d.query("SELECT format('%I.%I',n.nspname,c.relname) surface,c.relkind,c.relispartition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','f','v','m') ORDER BY 1")).rows.filter(x=>!roster.includes(x.surface)),sourceAnchor:'owned-control.sql:84-93',actualRelationCount:(await d.query("SELECT count(*) n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','f','v','m')")).rows[0].n};}catch(diagnosticError){e.diagnostic={error:diagnosticError.message};}await d.close();throw e;}
}
export async function primarySnapshot(d){const out={};for(const t of (await d.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','app_private','auth') AND tablename NOT LIKE 'qa_owned_%' ORDER BY 1,2")).rows){out[t.schemaname+'.'+t.tablename]=await scalar(d,`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM "${t.schemaname}"."${t.tablename}" t`);}return out;}
export async function makePlan(d,baseId=700000){
 const runId=id(baseId),planId=id(baseId+1),protectedSnapshot=await scalar(d,'SELECT app_private.qa_owned_protected_snapshot()'),protectedUIDs=protectedSnapshot.auth.map(x=>x.id),protectedCanonicalKeys=protectedSnapshot.registry.map(x=>x.canonical_key);
 // Explicit protected canonical probe; no real-account lookup.
 if(!protectedCanonicalKeys.includes('faisal'))protectedCanonicalKeys.push('faisal');
 const units=(await d.query('SELECT to_jsonb(t) row FROM public.organizational_units t ORDER BY id')).rows.map(x=>x.row),unit=units.find(x=>x.unit_type==='department').id;
 const roles=['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'];
 const resources=Array.from({length:57},(_,i)=>({runId,sourceId:id(baseId+100+i),createOperation:id(baseId+200+i),receiptId:id(baseId+300+i),kind:i<50?'owned-load-qa':'owned-role-e2e',canonicalKey:'integrated-'+baseId+'-'+i,loginAlias:'integrated-'+baseId+'-'+i,displayName:'local fixture '+i,email:'integrated-'+baseId+'-'+i+'@example.invalid',role:i<50?'employee':roles[i-50],memberships:[{unit_id:unit,membership_role:'member',is_primary:true}]}));
 const rolePlanDigest=hash({resources,units});resources.forEach(x=>x.rolePlanDigest=rolePlanDigest);
 const identity=await rpc('qa_owned_identity_snapshot_internal',{}),sourceHash=createHash('sha256').update(fs.readFileSync(new URL('./owned-control.sql',import.meta.url))).digest('hex');
 const sourceHashes=Object.fromEntries(['owned-control.sql','owned-deletion-fence.sql'].map(n=>[n,createHash('sha256').update(fs.readFileSync(new URL(n,import.meta.url))).digest('hex')]));
 const primary=(await d.query(RUNTIME_OWNED_METADATA_SELECT)).rows;assert.equal(primary.length,1);assert.equal(primary[0].control_identity_digest,identity.digest);
 const ownedMetadataHash=canonicalMetadataHash(primary[0].metadata),ownedControllerIdentityDigest=primary[0].control_identity_digest;
 const plan={runId,resources,units,protectedUIDs,protectedCanonicalKeys,controlIdentityDigest:identity.digest,rolePlanDigest,sourceHash,sourceHashes},payload=stable(plan),{publicKey,privateKey}=generateKeyPairSync('ed25519'),signature=sign(null,Buffer.from('QA-OWNED-ROLEPLAN-v1\n'+payload),privateKey).toString('base64');
 await d.query("INSERT INTO app_private.qa_owned_approved_plans VALUES($1,$2::jsonb,$3,$4,$5,clock_timestamp()+interval '1 hour')",[planId,payload,signature,createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex'),sourceHash]);
 return {plan,ownedMetadataHash,ownedControllerIdentityDigest,ownedControl:{planId,runId,identityDigest:identity.digest,rolePlanDigest,reviewerPublicKey:publicKey.export({type:'spki',format:'pem'}),signedPlan:{payload,signature}}};
}
export async function runtime(p,{modes=new Map(),events=[],fault={}}={}){
 let creates=0,sessions=0;const response=(x,status=200)=>new Response(status===204?null:JSON.stringify(x),{status,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});
 const readUser=async(uid)=>{const d=await connect();try{return (await d.query('SELECT id,email,raw_user_meta_data user_metadata,raw_app_meta_data app_metadata,created_at,email_confirmed_at,banned_until,deleted_at FROM auth.users WHERE id=$1',[uid])).rows[0];}finally{await d.close();}};
 const deleteRoot=async(uid)=>{const gateway=await connect('qa_fixture_auth_gateway');try{await gateway.query('DELETE FROM auth.users WHERE id=$1',[uid]);}finally{await gateway.close();}};
 const transport=async(input,init={})=>{
  const u=new URL(String(input));assert.equal(u.origin,ORIGIN);const method=init.method||'GET';events.push({method,path:u.pathname});
  const r=/^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);if(r){const a=JSON.parse(init.body||'{}');try{const mode=modes.get(a.p_operation);if(r[1]==='qa_owned_delete_finalize_internal'&&mode?.failFinalize)throw Object.assign(Error('test-only finalize transport failure'),{code:'42501'});return response(await rpc(r[1],a));}catch(e){events.push({rpc:r[1],sqlstate:e.code||null,message:e.message,where:e.where||null});return response({code:e.code||'P0001',message:e.message},403);}}
  if(u.pathname==='/auth/v1/admin/users'&&method==='POST'){
   const a=JSON.parse(init.body),uid=id(Number(p.plan.runId.slice(-12))+1000+ ++creates),d=await connect();try{await d.query("INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data,created_at,email_confirmed_at) VALUES($1,$2,$3::jsonb,'{\"provider\":\"email\"}',clock_timestamp(),clock_timestamp())",[uid,a.email,a.user_metadata]);}finally{await d.close();}return response(await readUser(uid));
  }
  const admin=/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(u.pathname);if(admin){const uid=admin[1],mode=modes.get(uid)||{};if(method==='DELETE'){
   assert.deepEqual(JSON.parse(init.body),{should_soft_delete:false});const d=await connect();try{const rows=(await d.query("SELECT state,xact_start FROM pg_stat_activity WHERE application_name='qa-fence-integrated' AND pid<>pg_backend_pid() AND client_addr IS NOT NULL")).rows;assert(rows.every(x=>x.state==='idle'&&x.xact_start===null),'NO_OUTER_SQL_TRANSACTION_ACROSS_HTTP');}finally{await d.close();}
   mode.started?.();mode.deleteEntered?.();if(mode.holdBefore)await mode.holdBefore;if(mode.lateFailure)return response({msg:'test-only late DELETE failure'},500);if(!mode.keepPresent)await deleteRoot(uid);if(mode.lostResponse)throw Error('test-only lost response');if(mode.holdBody)return new Response(new ReadableStream({start(c){mode.holdBody.then(()=>{c.enqueue(new TextEncoder().encode('{}'));c.close();});}}),{status:200,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});return response({});
  }const row=await readUser(uid);return row?response(row):response({code:'user_not_found',msg:'User not found'},404);}
  if(u.pathname==='/auth/v1/token'){
   const a=JSON.parse(init.body),d=await connect();let user,sid;try{user=(await d.query('SELECT id FROM auth.users WHERE email=$1',[a.email])).rows[0];assert(user);sid=id(Number(p.plan.runId.slice(-12))+2000+ ++sessions);await d.query('INSERT INTO auth.sessions(id,user_id,created_at) VALUES($1,$2,clock_timestamp())',[sid,user.id]);}finally{await d.close();}
   const token=['header',Buffer.from(JSON.stringify({sub:user.id,session_id:sid,iss:ORIGIN+'/auth/v1',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'local-not-provider-signature'].join('.');return response({user:await readUser(user.id),access_token:token,refresh_token:'ephemeral-local-only',token_type:'bearer',expires_in:3600});
  }
  if(u.pathname==='/auth/v1/user'||u.pathname==='/auth/v1/logout'){
   const t=new Headers(init.headers).get('Authorization')?.replace(/^Bearer /,''),c=JSON.parse(Buffer.from(t.split('.')[1],'base64url'));if(u.pathname.endsWith('/user'))return response(await readUser(c.sub));assert.equal(u.searchParams.get('scope'),'local');const d=await connect();try{await d.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[c.session_id,c.sub]);}finally{await d.close();}return response(null,204);
  }
  if(u.pathname==='/functions/v1/transactions-api'){const a=JSON.parse(init.body),c=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url')),d=await connect();try{assert.equal(await scalar(d,'SELECT allowed FROM app_private.qa_scope_internal($1,$1)',[c.sub]),true);}finally{await d.close();}return response({me:{user_id:c.sub},rows:[]});}
  throw Error('undeclared local transport denied');
 };
 const f=await fixture({fault,providerTransport:transport,nativeFactory:true,ownedControl:p.ownedControl,ownedMetadataHash:p.ownedMetadataHash,ownedControllerIdentityDigest:p.ownedControllerIdentityDigest});
 return {...f,events,modes,deleteRoot,readUser};
}
