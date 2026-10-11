// OFFLINE ONLY: parse source/labels; never import test callbacks or run SQL.
// Run with node --expose-internals (uses Node's bundled Acorn, no install).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {parse}=require('internal/deps/acorn/acorn/dist/acorn');
const [mode,sourcePath,evidenceDir]=process.argv.slice(2);
assert(['snapshot','verify'].includes(mode)&&sourcePath&&evidenceDir,'snapshot|verify SOURCE EVIDENCE_DIR');
const source=readFileSync(sourcePath,'utf8');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const ast=text=>parse(text,{ecmaVersion:'latest',sourceType:'module'});
const unknown=Symbol('unexecuted expression');
const isNamedTest=n=>n?.type==='CallExpression'&&(n.callee?.name==='test'||(n.callee?.type==='MemberExpression'&&n.callee.object?.name==='t'&&n.callee.property?.name==='test'));
function containsTest(n){return !!n&&typeof n==='object'&&(isNamedTest(n)||Object.values(n).some(x=>Array.isArray(x)?x.some(containsTest):containsTest(x)));}
function value(n,env){
 if(!n)return unknown;
 if(n.type==='Literal')return n.value;
 if(n.type==='Identifier')return env[n.name]??unknown;
 if(n.type==='ArrayExpression')return n.elements.map(x=>value(x,env));
 if(n.type==='ObjectExpression')return Object.fromEntries(n.properties.filter(p=>p.type==='Property').map(p=>[p.key.name??p.key.value,value(p.value,env)]));
 if(n.type==='BinaryExpression'&&n.operator==='+'){const a=value(n.left,env),b=value(n.right,env);return a===unknown||b===unknown?unknown:a+b;}
 if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='Object'&&n.callee.property.name==='entries'){const o=value(n.arguments[0],env);return o===unknown?unknown:Object.entries(o);}
 return unknown;
}
function bind(pattern,v,env){if(pattern.type==='Identifier')env[pattern.name]=v;else if(pattern.type==='ArrayPattern')pattern.elements.forEach((p,i)=>p&&bind(p,Array.isArray(v)?v[i]:unknown,env));}
function namedCases(text){
 const names=[];
 function visit(n,env){
  if(!n||typeof n!=='object')return;
  if(Array.isArray(n)){for(const child of n)visit(child,env);return;}
  if(n.type==='VariableDeclaration'){for(const d of n.declarations){bind(d.id,value(d.init,env),env);visit(d.init,env);}return;}
  if(n.type==='ForOfStatement'&&containsTest(n.body)){
   const iterable=value(n.right,env);assert(Array.isArray(iterable),'named loop must be statically enumerable');
   for(const item of iterable){const child={...env};bind(n.left.declarations[0].id,item,child);visit(n.body,child);}return;
  }
  if(isNamedTest(n)){const name=value(n.arguments[0],env);assert.equal(typeof name,'string','named case is not statically bound');names.push({kind:n.callee.name==='test'?'top-level':'native-subtest',name});}
  const child=n.type==='BlockStatement'?{...env}:env;
  for(const x of Object.values(n))if(x&&typeof x==='object')visit(x,child);
 }
 visit(ast(text),{});return names;
}
const cases=namedCases(source),counts={named:cases.length,topLevel:cases.filter(x=>x.kind==='top-level').length,nativeSubtests:cases.filter(x=>x.kind==='native-subtest').length};
assert.equal(counts.named,162,'original named case roster must remain 162');
assert.equal(counts.nativeSubtests,13);
const helperPath=join(dirname(sourcePath),'qa_runtime_provenance_wsl_fixture.mjs');
const rolesPath=join(dirname(sourcePath),'qa_runtime_provenance_roles_fixture.mjs');
const baselinePath=join(evidenceDir,'OFFLINE_BASELINE.json');
mkdirSync(evidenceDir,{recursive:true});
if(mode==='snapshot'){
 assert(!existsSync(baselinePath),'do not overwrite the original baseline');
 writeFileSync(join(evidenceDir,'qa_runtime_provenance.original.mjs'),readFileSync(sourcePath));
 const baseline={classification:'STATIC_SOURCE_ONLY',originalSourceSha256:sha256(readFileSync(sourcePath)),roleHelperSha256:sha256(readFileSync(rolesPath)),counts,cases};
 writeFileSync(baselinePath,JSON.stringify(baseline,null,2));console.log(JSON.stringify({mode,counts,originalSourceSha256:baseline.originalSourceSha256}));
}else{
 const baseline=JSON.parse(readFileSync(baselinePath,'utf8'));
 assert.deepEqual(cases,baseline.cases,'original named labels/order changed');
 assert.equal(sha256(readFileSync(rolesPath)),baseline.roleHelperSha256,'role custody helper must remain unchanged');
 const original=readFileSync(join(evidenceDir,'qa_runtime_provenance.original.mjs'),'utf8');
 // The native SQL/assertion/catalog body is unchanged apart from its exact DB
 // expectation and a scope-accurate fixture-owner comment.
 const tail=text=>text.slice(text.indexOf('  roleCustody=manageProvenanceRoles(query);'));
 assert.equal(sha256(tail(source)),sha256(tail(original).replace("assert.equal(identity.database,'postgres')","assert.equal(identity.database,database)").replace('Fixture-owner DDL stays in this fresh cluster.','Fixture-owner DDL stays in this exact owned database.')),'native test body/assertions/facets changed');
 const nativeLabel='exported catalog and complete-inventory SELECTs execute on isolated PostgreSQL';
 const prefix=text=>text.slice(0,text.indexOf("test('"+nativeLabel));
 assert.equal(sha256(prefix(source)),sha256(prefix(original).replace("import {manageProvenanceRoles} from './qa_runtime_provenance_roles_fixture.mjs';","import {manageProvenanceRoles} from './qa_runtime_provenance_roles_fixture.mjs';\nimport {createParentOwnedProvenanceFixture,validateParentOwnedProvenanceEnvironment} from './qa_runtime_provenance_wsl_fixture.mjs';").replace("const scratch = 'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch';","const scratch = process.env.QA_PROVENANCE_SCRATCH ?? 'C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch';\nif(process.env.QA_PROVENANCE_WSL_PARENT !== undefined)validateParentOwnedProvenanceEnvironment();")),'unrelated source prefix changed');
 const nativeCall=text=>ast(text).body.find(n=>n.type==='ExpressionStatement'&&isNamedTest(n.expression)&&n.expression.arguments[0].value===nativeLabel).expression;
 const originalSetup=original.slice(nativeCall(original).arguments[1].body.start+1,original.indexOf('  roleCustody=manageProvenanceRoles(query);')).trim();
 const branch=nativeCall(source).arguments[1].body.body.find(n=>n.type==='IfStatement');
 assert(branch.alternate?.type==='BlockStatement','default private fixture branch required');
 const windowsSetup=source.slice(branch.alternate.start+1,branch.alternate.end-1).trim().replace("  nativeFixture={query,port,data,database:'postgres'};",'').trim();
 assert.equal(sha256(windowsSetup),sha256(originalSetup.replace('let started=false,nativeEvidence={},roleCustody;','let started=false;')),'default Windows initialization/cleanup API changed');
 assert(existsSync(helperPath),'existing-local transport helper missing');
 const helper=readFileSync(helperPath,'utf8'),helperAst=ast(helper);
 const constants=Object.fromEntries(helperAst.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations.map(d=>[d.id.name,d.init?.value])));
 assert.deepEqual(constants,{HANDOFF:'AFTER_14_PARENT_SERIAL',HOST:'127.0.0.1',PORT:51771,DATA:'/home/faisal/ceo-msajed-qa-checkpoints/2026-10-09-durable-fence-blocked/run-wsl-20261009/pgdata',SCRATCH:'/home/faisal/ceo-msajed-qa-checkpoints/2026-10-09-durable-fence-blocked/run-wsl-20261009/scratch',PSQL:'/usr/lib/postgresql/16/bin/psql'},'closed literal target changed');
 assert(helperAst.body.every(n=>n.type==='ImportDeclaration'||n.type==='FunctionDeclaration'||n.type==='ExportNamedDeclaration'||(n.type==='VariableDeclaration'&&n.declarations.every(d=>d.init.type==='Literal'))),'helper import must remain inert');
 assert.deepEqual(helperAst.body.filter(n=>n.type==='ImportDeclaration').map(n=>n.source.value),['node:assert/strict','node:child_process','node:fs','node:path'],'test-only standard-library helper required');
 const psqlEnv=helperAst.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='psqlEnvironment').body.body.find(n=>n.type==='ReturnStatement').argument;
 assert.equal(psqlEnv.type,'ObjectExpression');assert(psqlEnv.properties.every(p=>p.type==='Property'),'no inherited/spread process environment');
 assert.deepEqual(psqlEnv.properties.map(p=>p.key.name),['PATH','LANG','LC_ALL','HOME','TMPDIR','TEMP','TMP','PGAPPNAME','PGCONNECT_TIMEOUT','PGSSLMODE','PGGSSENCMODE','PGPASSFILE','PGSYSCONFDIR'],'closed credential-free psql allowlist');
 const localBranch=source.slice(branch.consequent.start,branch.consequent.end);
 assert(!/initdb|pg_ctl|clusterStopped|clusterRemoved/.test(localBranch),'existing-local branch must not own cluster lifecycle');
 const calls=[];function collect(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression')calls.push(n);for(const v of Object.values(n))if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(collect);else collect(v);}}collect(helperAst);
 assert.equal(calls.filter(n=>n.callee.name==='execFileSync').length,1,'one closed installed-psql launch seam');
 assert(!/node:net|initdb|pg_ctl|pgctl|DROP\s+DATABASE|ALTER\s+ROLE|DROP\s+ROLE|DROP\s+SCHEMA/i.test(helper),'helper may not manage clusters/databases/roles');
 for(const text of ["QA_PROVENANCE_WSL_PARENT","AFTER_14_PARENT_SERIAL","QA_PROVENANCE_SCRATCH","QA_LOCAL_PG_DATABASE","PGDATA","/usr/lib/postgresql/16/bin/psql","qa_local_legacy_","inet_server_addr()","inet_client_addr()","inet_server_port()","data_directory","listen_addresses","current_database()","current_user","session_user","pg_foreign_server","pg_stat_activity","client backend","pg_backend_pid()","ON_ERROR_STOP=1","identityGate(target) + '\\n' + sql","env:psqlEnvironment(dir)","native_fixture_gateway","supabase_read_only_user"])assert(helper.includes(text),'missing helper contract: '+text);
 for(const text of ["process.env.QA_PROVENANCE_SCRATCH ??", "process.env.QA_PROVENANCE_WSL_PARENT !== undefined", "fixtureDatabaseDisposition:'parent custody'", "qaClusterUntouched:true", "temporaryFilesRemoved:true", "clusterStopped:true,clusterRemoved:true"])assert(source.includes(text),'missing source branch contract: '+text);
 assert(source.indexOf('roleCustody=manageProvenanceRoles(query)')<source.indexOf("query('CREATE SCHEMA auth;"),'role custody must precede fixture CREATE');
 const result={classification:'STATIC_SOURCE_CONTRACT_ONLY_NOT_NATIVE_ACCEPTANCE',importCallbacks:false,sqlExecution:false,nativeRunner:'NOT_RUN',network:false,counts,namedCasesPreserved:true,nativeBodyAssertionsAndFacetsPreserved:true,defaultWindowsInitializationAndCleanupPreserved:true,helperImportInert:true,psqlEnvironmentAllowlistClosed:true,roleHelperUnchanged:true,originalSourceSha256:baseline.originalSourceSha256,finalSourceSha256:sha256(readFileSync(sourcePath)),helperSha256:sha256(readFileSync(helperPath)),verifierSha256:sha256(readFileSync(new URL(import.meta.url))),roleHelperSha256:baseline.roleHelperSha256,checksPassed:true};
 writeFileSync(join(evidenceDir,'OFFLINE_CONTRACT.json'),JSON.stringify(result,null,2));
 writeFileSync(join(evidenceDir,'qa_runtime_provenance.final.mjs'),readFileSync(sourcePath));
 writeFileSync(join(evidenceDir,'qa_runtime_provenance_wsl_fixture.mjs'),readFileSync(helperPath));
 console.log(JSON.stringify(result));
}
