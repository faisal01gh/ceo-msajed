// TEST ONLY: role custody for the isolated provenance fixture.
import assert from 'node:assert/strict';
export const provenanceRoleSpecs=Object.freeze({anon:'NOLOGIN',authenticated:'NOLOGIN',service_role:'NOLOGIN',supabase_read_only_user:'NOLOGIN',native_fixture_gateway:'LOGIN NOINHERIT CREATEROLE'});
const safeRole=/^[a-z][a-z0-9_]*$/;
export function fixtureRoleSnapshot(query){
 return JSON.parse(query(`SELECT json_build_object('roles',(SELECT coalesce(json_agg(to_jsonb(r)),'[]') FROM (SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,encode(sha256(convert_to(coalesce(to_jsonb(rolconfig),'null'::jsonb)::text,'UTF8')),'hex') AS config_digest FROM pg_roles ORDER BY oid)r),'memberships',(SELECT coalesce(json_agg(to_jsonb(m)),'[]') FROM (SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor)m));`));
}
export function manageProvenanceRoles(query,specs=provenanceRoleSpecs){
 const before=fixtureRoleSnapshot(query),createdRoles=[];
 for(const [name,attrs] of Object.entries(specs)){
  assert(safeRole.test(name)&&/^(?:NOLOGIN|LOGIN NOINHERIT CREATEROLE)$/.test(attrs),'closed fixture role definition required');
  if(before.roles.some(r=>r.rolname===name))continue;
  // Preserve a role created by another owner rather than claiming it as ours.
  const result=JSON.parse(query(`DO $role$ BEGIN PERFORM set_config('qa.fixture_role_created','false',false);IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${name}') THEN EXECUTE 'CREATE ROLE ${name} ${attrs}';PERFORM set_config('qa.fixture_role_created','true',false); END IF; END $role$; SELECT row_to_json(r) FROM (SELECT oid,rolname,current_setting('qa.fixture_role_created')::boolean AS created FROM pg_roles WHERE rolname='${name}')r;`));
  assert.equal(result.rolname,name);if(result.created)createdRoles.push({name,oid:result.oid});
 }
 return {before,createdRoles,finish(){
  // Newly created roles have no pre-existing grants or membership authority.
  // Role-specific DROP OWNED is local to this exact verified QA database.
  for(const {name,oid} of createdRoles){
   const actual=JSON.parse(query(`SELECT row_to_json(r) FROM (SELECT oid,rolname FROM pg_roles WHERE rolname='${name}')r;`));assert.equal(actual.oid,oid,'created role identity drift');
   query(`DROP OWNED BY "${name}";DROP ROLE "${name}";`);
  }
  const after=fixtureRoleSnapshot(query);assert.deepEqual(after,before,'pre-existing role attributes/configuration/memberships changed');
  return {before,after,createdRoles,originalRolesUnchanged:true,originalMembershipsUnchanged:true,droppedRoles:createdRoles.map(r=>r.name)};
 }};
}
