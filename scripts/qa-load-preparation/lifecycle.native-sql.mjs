// Local bounded actual owned SQL proof. One transaction, always ROLLBACK.
// Synthetic plan anchor is NOT independent/native review approval.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const W='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-isolation-implementation-main2c605a0';
const OUT='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-autonomous-completion/external-round2/finding2-completion';
fs.mkdirSync(OUT,{recursive:true});
const owned=fs.readFileSync(W+'/scripts/qa-load-preparation/owned-control.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const guard=`DO $guard$ BEGIN IF current_database()<>'qa_isolation_step3_integrated_20261009' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>51771 OR current_setting('listen_addresses')<>'127.0.0.1' OR current_setting('data_directory')<>'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-local-postgres-ordering/data' OR EXISTS(SELECT 1 FROM pg_foreign_server) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE client_addr IS NOT NULL AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'wrong owned server';END IF;END $guard$;`;
const proof=`
DO $proof$
DECLARE run uuid:='00000000-0000-4000-8000-000000090001';plan uuid:='00000000-0000-4000-8000-000000090002';resources jsonb:='[]';units jsonb;protected jsonb;keys jsonb;roles text[]:=ARRAY['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'];j jsonb;src uuid;op uuid;receipt uuid;uid uuid;sid uuid;role text;unit uuid;ret jsonb;before jsonb;after jsonb;i integer;
BEGIN
 SELECT jsonb_agg(to_jsonb(u) ORDER BY id) INTO units FROM public.organizational_units u;
 SELECT jsonb_agg(id::text ORDER BY id) INTO protected FROM auth.users;
 SELECT jsonb_agg(canonical_key ORDER BY canonical_key) INTO keys FROM public.account_migration_users;
 SELECT id INTO unit FROM public.organizational_units WHERE unit_type='department' ORDER BY id LIMIT 1;
 SELECT jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p),'registry',(SELECT jsonb_agg(to_jsonb(a) ORDER BY canonical_key) FROM public.account_migration_users a),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY user_id,role_code) FROM public.user_roles r),'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY user_id,unit_id,membership_role) FROM public.user_memberships m),'defaults',(SELECT jsonb_agg(to_jsonb(r) ORDER BY role_code,permission_code) FROM public.role_permissions r)) INTO before;
 FOR i IN 1..57 LOOP
  src:=('00000000-0000-4000-8000-'||lpad((91000+i)::text,12,'0'))::uuid;op:=('00000000-0000-4000-8000-'||lpad((92000+i)::text,12,'0'))::uuid;receipt:=('00000000-0000-4000-8000-'||lpad((93000+i)::text,12,'0'))::uuid;
  role:=CASE WHEN i<=50 THEN 'employee' ELSE roles[i-50] END;
  resources:=resources||jsonb_build_array(jsonb_build_object('runId',run,'sourceId',src,'createOperation',op,'receiptId',receipt,'kind',CASE WHEN i<=50 THEN 'owned-load-qa' ELSE 'owned-role-e2e' END,'canonicalKey','owned-proof-'||i,'loginAlias','owned-proof-'||i,'displayName','synthetic owned '||i,'email','owned-proof-'||i||'@fixture.invalid','role',role,'memberships',jsonb_build_array(jsonb_build_object('unit_id',unit,'membership_role','member','is_primary',true))));
 END LOOP;
 INSERT INTO app_private.qa_owned_approved_plans VALUES(plan,jsonb_build_object('runId',run,'controlIdentityDigest',encode(sha256(convert_to(app_private.qa_owned_identity_snapshot()::text,'UTF8')),'hex'),'resources',resources,'units',units,'protectedUIDs',protected,'protectedCanonicalKeys',keys),'TEST-ONLY-NOT-AUTHORITY',repeat('a',64),repeat('b',64),clock_timestamp()+interval '1 hour');
 PERFORM set_config('role','service_role',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);PERFORM set_config('request.headers','{}',true);
 ret:=public.qa_owned_preflight_internal(plan,run);IF ret->'ok'<>'true'::jsonb THEN RAISE EXCEPTION 'preflight';END IF;
 ret:=public.qa_owned_prepare_internal(plan,run);IF ret->>'reserved'<>'57' THEN RAISE EXCEPTION 'reserve57';END IF;
 PERFORM set_config('role','none',true);
 FOR j IN SELECT value FROM jsonb_array_elements(resources) LOOP
  src:=(j->>'sourceId')::uuid;op:=(j->>'createOperation')::uuid;receipt:=(j->>'receiptId')::uuid;i:=right(j->>'canonicalKey',strpos(reverse(j->>'canonicalKey'),'-')-1)::integer;
  uid:=('00000000-0000-4000-8000-'||lpad((94000+i)::text,12,'0'))::uuid;sid:=('00000000-0000-4000-8000-'||lpad((95000+i)::text,12,'0'))::uuid;
  PERFORM set_config('role','service_role',true);
  PERFORM public.qa_owned_operation_internal(run,op,'create',src::text,'reserved','pending');PERFORM public.qa_owned_operation_internal(run,op,'create',src::text,'dispatched','pending');
  PERFORM set_config('role','none',true);
  INSERT INTO auth.users(id,email,raw_user_meta_data,created_at,email_confirmed_at) VALUES(uid,j->>'email',jsonb_build_object('run_id',run,'source_id',src,'operation_id',op,'receipt_id',receipt),clock_timestamp(),clock_timestamp());
  PERFORM set_config('role','service_role',true);PERFORM public.qa_owned_operation_internal(run,op,'create',src::text,'completed','fulfilled');
  ret:=public.qa_owned_bootstrap_internal(run,src,uid);IF ret->>'target_user_id'<>uid::text THEN RAISE EXCEPTION 'bootstrap UID';END IF;
  PERFORM set_config('role','none',true);
  IF NOT EXISTS(SELECT 1 FROM app_private.qa_account_manifest q JOIN public.account_migration_users a ON a.migrated_user_id=q.user_id AND a.canonical_key=q.canonical_key AND a.login_username=q.login_alias WHERE q.user_id=uid AND q.run_id=run AND q.owned_creation_receipt_id=receipt) THEN RAISE EXCEPTION 'persisted manifest';END IF;
  INSERT INTO auth.sessions(id,user_id,created_at) VALUES(sid,uid,clock_timestamp());
  PERFORM set_config('role','service_role',true);ret:=public.qa_owned_test_internal(run,src,sid);IF ret->'self_allowed'<>'true'::jsonb OR ret->'protected_denied'<>'true'::jsonb THEN RAISE EXCEPTION 'bounded test';END IF;
  PERFORM set_config('role','none',true);DELETE FROM auth.sessions WHERE id=sid AND user_id=uid;
  PERFORM set_config('role','service_role',true);ret:=public.qa_owned_dispose_internal(run,src);IF ret->'db_absent'<>'true'::jsonb THEN RAISE EXCEPTION 'dispose';END IF;
  PERFORM set_config('role','none',true);DELETE FROM auth.users WHERE id=uid;
  PERFORM set_config('role','service_role',true);ret:=public.qa_owned_absence_internal(run,src);IF ret->'absent'<>'true'::jsonb THEN RAISE EXCEPTION 'absence';END IF;PERFORM set_config('role','none',true);
 END LOOP;
 PERFORM set_config('role','service_role',true);ret:=public.qa_owned_complete_internal(run);PERFORM set_config('role','none',true);
 IF ret->>'absent_resources'<>'57' OR EXISTS(SELECT 1 FROM app_private.qa_owned_frames) OR EXISTS(SELECT 1 FROM app_private.qa_owned_sources) OR EXISTS(SELECT 1 FROM app_private.qa_owned_resources) OR EXISTS(SELECT 1 FROM app_private.qa_owned_operations) THEN RAISE EXCEPTION 'terminal zero';END IF;
 SELECT jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p),'registry',(SELECT jsonb_agg(to_jsonb(a) ORDER BY canonical_key) FROM public.account_migration_users a),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY user_id,role_code) FROM public.user_roles r),'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY user_id,unit_id,membership_role) FROM public.user_memberships m),'defaults',(SELECT jsonb_agg(to_jsonb(r) ORDER BY role_code,permission_code) FROM public.role_permissions r)) INTO after;
 IF before IS DISTINCT FROM after THEN RAISE EXCEPTION 'protected/native/default snapshot changed';END IF;
 RAISE NOTICE 'OWNED_SQL_57_COMPLETE';
END $proof$;
SET CONSTRAINTS app_private.qa_owned_native_closure IMMEDIATE;
ROLLBACK;
`;
const script='\\set ON_ERROR_STOP on\nBEGIN;\n'+guard+'\nALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb NOT NULL DEFAULT \'{}\', ADD COLUMN created_at timestamptz,ADD COLUMN email_confirmed_at timestamptz,ADD COLUMN banned_until timestamptz,ADD COLUMN deleted_at timestamptz;\n'+owned+`\nCREATE TRIGGER qa_owned_fixture_roles BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();CREATE TRIGGER qa_owned_fixture_memberships BEFORE INSERT OR UPDATE OR DELETE ON public.user_memberships FOR EACH ROW EXECUTE FUNCTION app_private.qa_reference_guard_before_row();\n`+proof;
const file=OUT+'/NATIVE57.sql';fs.writeFileSync(file,script);
const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','51771','-U','postgres','-d','qa_isolation_step3_integrated_20261009','-v','ON_ERROR_STOP=1','-f',file],{encoding:'utf8',timeout:120000,maxBuffer:1048576});
fs.writeFileSync(OUT+'/NATIVE57.stdout.txt',r.stdout||'');fs.writeFileSync(OUT+'/NATIVE57.stderr.txt',r.stderr||'');
console.log(JSON.stringify({exitCode:r.status,error:r.error?.code||null,stdout:r.stdout,stderr:r.stderr}));
assert.equal(r.status,0,'native SQL proof failed');assert.match(r.stderr,/OWNED_SQL_57_COMPLETE/);
