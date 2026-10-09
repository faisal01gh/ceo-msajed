import {readFile,writeFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {exerciseLocal} from './local.mjs';
import {sha256,CONTRACT,TARGET,ROLES} from './gate.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const artifact=name=>new URL(name,import.meta.url);
const commands=[];const logs=[];
function command(args,expectedExit=0) {
  const started=performance.now();const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
  const output=(r.stdout||'')+(r.stderr||'');logs.push(`COMMAND: node ${args.join(' ')}\nEXIT: ${r.status}\n${output}`);
  const item={command:`node ${args.join(' ')}`,exitCode:r.status,durationMs:performance.now()-started,evidenceFile:'verification.txt'};commands.push(item);
  if(r.status!==expectedExit)throw new Error('LOCAL_VERIFICATION_FAILED');return {item,output};
}
try {
  // The parent never receives environment/CLI credential material or unbounded raw exceptions.
  for(const file of (await readdir(root)).filter(n=>/\.(mjs|cjs)$/.test(n)))command(['--check',file]);
  const repetitionResults=[];
  for(let i=0;i<2;i++){
    const r=command(['--require','./offline-network-guard.cjs','--test','runner.test.mjs']);
    const extract=name=>{const match=r.output.match(new RegExp(`(?:#|ℹ)\\s+${name}\\s+(\\d+)`));if(!match)throw new Error('TEST_RESULT_SCHEMA_DENIED');return Number(match[1]);};
    const counts={tests:extract('tests'),passed:extract('pass'),failed:extract('fail'),skipped:extract('skipped'),cancelled:extract('cancelled'),todo:extract('todo')};
    assert.equal(counts.failed,0);assert.equal(counts.skipped,0);assert.equal(counts.cancelled,0);assert.equal(counts.todo,0);assert.equal(counts.tests,counts.passed);repetitionResults.push(counts);
  }
  command(['--require','./offline-network-guard.cjs','native.mjs'],2);
  const started=performance.now();const local=await exerciseLocal();commands.push({command:'node --require ./offline-network-guard.cjs verify-local.mjs (actual loopback exercise)',exitCode:0,durationMs:performance.now()-started});
  assert.equal(local.final.counters.transmitted,2500);assert.equal(local.final.transportPeak,2500);assert.equal(local.final.serverReadback.peak,2500);assert.equal(local.drain.remainingClientRequests,0);
  const measurements={stage:'LocalHTTPFixture',nativeAcceptance:false,runId:local.runId,rounds:[...local.ramps,local.final,local.capacityControl].map(r=>({roundId:r.roundId,rows:r.rows}))};
  const serialized=JSON.stringify(measurements,null,2);if(/"(?:accessToken|refreshToken|password|headers|authorization|apiKey)"\s*:/.test(serialized))throw new Error('REDACTION_FAILED');
  await writeFile(artifact('MEASUREMENTS.json'),serialized+'\n','utf8');
  for(const round of [...local.ramps,local.final,local.capacityControl])delete round.rows;
  const sourceNames=(await readdir(root)).filter(n=>/\.(mjs|cjs|md)$/.test(n)||['JOURNEYS.json','CLEANUP_PLAN.json','provider-sources.json','citation-ledger.json'].includes(n)||/^provider-source-\d+\.txt$/.test(n)).sort();
  const sourceHashes={};for(const name of sourceNames)sourceHashes[name]=sha256(await readFile(artifact(name)));
  const inputPaths=[
    new URL('../../docs/auth/ACCOUNTS_SPEC.md',import.meta.url),
    new URL('../../docs/transactions/LOAD_TEST_2026-10-04.md',import.meta.url),
    new URL('../../supabase/functions/transactions-api/index.ts',import.meta.url),
    new URL('../../supabase/migrations/20261002_transactions_foundation.sql',import.meta.url),
    new URL('../../supabase/migrations/20261004174500_permissions_transactions_section.sql',import.meta.url)
  ];
  const inputs=[];for(const path of inputPaths)inputs.push({path,sha256:sha256(await readFile(path))});
  const report={version:1,generatedAt:new Date().toISOString(),sourceSHA:'717375eee1e99d558af80eca91a7ea7e829edd20',stage:'LocalHTTPFixture',status:'LOCAL_GREEN_NATIVE_PENDING',target:TARGET,
    scope:{ownedDirectory:root,repoFilesModified:[],externalProjectCalls:0,authCreates:0,passwordResets:0,providerMutations:0,deployments:0,policyChanges:0,purchases:0,realStaffCredentialsUsed:0,protectedReal57AndFaisal:'not queried or changed',protectedLegacy8:'not queried or changed'},
    contract:CONTRACT,roles:ROLES,commands,testRepetitions:repetitionResults,localHTTP:local,
    evidence:{measurementsFile:'MEASUREMENTS.json',measurementsSHA256:sha256(serialized+'\n'),measuredRows:measurements.rounds.reduce((a,r)=>a+r.rows.length,0),percentileArithmetic:'measured final rows independently sorted/recomputed, exact equality verified',hashConvention:'SHA-256 exact file bytes, no JSON normalization',sourceHashes,inputs,verificationOutputFile:'verification.txt'},
    preconditions:{isolationGate:'PENDING_PARENT_INDEPENDENT_APPROVED_RECEIPT; local signature fixtures are not approval',freshTargetAttestation:'PENDING_PARENT_READBACK_AFTER_ISOLATION_APPROVED',dedicatedLoadIdentities:'PENDING_50_DISTINCT_NATIVE_AUTH_UID_AND_SID_WITH_OFFICIAL_CREATION_AND_PERSISTED_GET_OWNERSHIP_RECEIPTS',nativeRoleCanaries:'PENDING_7_SEPARATE_OWNED_NATIVE_ROLE_CANARIES',credentials:'process-memory only, dedicated owned QA, public API key, lifetime covers round plus drain, no login/refresh inside pressure',protectedInventory:'exact native protected57/faisal and legacy8 inventory snapshots required; do not infer from counts/prefixes',readRoute:'POST transactions-api action=list app=new page=1 page_size=10 tab=all; main source inspected, native route review/readback still required',nativeGateTrust:'parent pins independently approved review public key and exact runtime hashes; arbitrary local keys are not authority'},
    pendingAcceptance:{realPostgreSQL:'NOT_EXECUTED_BY_THIS_RUNNER; parent isolation evidence is distinct',nativeAuthAndSessions:'NOT_EXECUTED',nativeBrowserFunctionalE2E:'NOT_EXECUTED; JOURNEYS.json prepared',native50x50HTTP:'NOT_EXECUTED',nativeProviderMetrics:'UNAVAILABLE_NOT_ESTIMATED',nativeCloudflareFrontendPerformance:'NOT_EXECUTED; Supabase load is not Pages capacity measurement',nativeCleanup:'NOT_EXECUTED; CLEANUP_PLAN.json and cleanup.mjs prepared, no mutation executor',advisors:'NOT_EXECUTED',deploymentParity:'NOT_EXECUTED'},
    providerDocumentation:{status:'REVIEWED_PUBLIC_PRIMARY_SOURCES_ONLY',receiptFile:'provider-sources.json',reportFile:'PROVIDER_LIMITS.md',targetConfiguredLimits:'NOT_QUERIED',actualProviderLimitsObserved:'NONE_IN_LOCAL_STAGE',noRetryOrEvasion:true},
    issues:[{status:'RESOLVED_LOCAL',description:'Initial single-tick 500-connection loopback diagnostic had 232 transmitted and 268 ECONNREFUSED; Windows accept backlog, not provider evidence. Local-only server-receipt admission batching retains all pending responses until 2500 overlap; native release remains unpaced. No rejected request was retried within a load round.'},{status:'RESOLVED_DOCUMENT_RETRIEVAL',description:'Configured web extraction backend cannot extract; urllib certificate errors on some documentation hosts recovered with TLS-verified curl; all seven primary pages saved.'},{status:'PENDING_NATIVE',description:'No operational gate approval, target attestation or native credentials was supplied or fabricated. Native provider E2E/load/cleanup must be run by parent only after approval.'}],
    tddEvidence:[{command:'node --test runner.test.mjs',exitCode:1,reason:'measured lifecycle summarizer missing (RED); then one passing metrics test'},{command:'node --test runner.test.mjs',exitCode:1,reason:'native approval gate missing (RED); then two passing tests'},{command:'node --test runner.test.mjs',exitCode:1,reason:'real HTTP fixture runner missing (RED); full loopback slice green after measured accept-queue diagnosis'},{command:"node --test --test-name-pattern='cleanup inventory' runner.test.mjs",exitCode:1,reason:'cleanup planner missing (RED); now green'},{command:"node --test --test-name-pattern='native executable|cleanup inventory|actual HTTP|local transport' runner.test.mjs",exitCode:1,reason:'native later-phase executable missing (RED); fault/guard/cleanup coverage already green; now all green'},{command:"node --require ./offline-network-guard.cjs --test --test-name-pattern='native read serialization|ownership markers' runner.test.mjs",exitCode:1,reason:'fixed native serialization missing and inherited ownership incorrectly admitted (RED); fixed serialization and signed-byte normalization now covered'}]};
  await writeFile(artifact('verification.txt'),logs.join('\n\n'),'utf8');
  await writeFile(artifact('SOURCE_HASHES.json'),JSON.stringify({hashConvention:report.evidence.hashConvention,files:sourceHashes},null,2)+'\n','utf8');
  const reportText=JSON.stringify(report,null,2)+'\n';if(/"(?:accessToken|refreshToken|password|headers|authorization|apiKey)"\s*:/.test(reportText))throw new Error('REDACTION_FAILED');
  await writeFile(artifact('REPORT.json'),reportText,'utf8');
  console.log(JSON.stringify({status:report.status,tests:repetitionResults,finalCounters:local.final.counters,peak:local.final.transportPeak,serverPeak:local.final.serverReadback.peak,latencyMs:local.final.latencyMs,errorRate:local.final.errorRate,drain:local.drain,measuredRows:report.evidence.measuredRows,reportSHA256:sha256(reportText),report:'REPORT.json'}));
} catch {
  await writeFile(artifact('verification.txt'),logs.join('\n\n'),'utf8');console.error('LOCAL_VERIFICATION_FAILED: see sanitized verification.txt; native phase not executed.');process.exitCode=1;
}
