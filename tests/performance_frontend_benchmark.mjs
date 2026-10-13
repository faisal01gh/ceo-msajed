import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {repo,artifactRoot,hash,environment,measure,stats} from './performance_frontend_fixture.mjs';

const phase=process.argv[2]||'BEFORE';
assert(['BEFORE','AFTER','SMOKE'].includes(phase));
const destination=path.join(artifactRoot,phase);
// An existing baseline is immutable. Use a separate SMOKE folder during harness development.
fs.mkdirSync(destination,{recursive:true});
if(fs.existsSync(path.join(destination,'benchmark.json'))&&phase!=='SMOKE')throw Error('immutable_result_exists');
const source=path.join(destination,'source');fs.mkdirSync(source,{recursive:true});
const inputSource=process.env.FRONTEND_PERF_SOURCE_ROOT?path.resolve(process.env.FRONTEND_PERF_SOURCE_ROOT):repo;
for(const name of ['app.js','styles.css','index.html','service-worker.js'])fs.copyFileSync(path.join(inputSource,name),path.join(source,name));
const sourceHashes=Object.fromEntries(['app.js','styles.css','index.html','service-worker.js'].map(name=>[name,hash(fs.readFileSync(path.join(source,name)))]));
const harnessHashes=Object.fromEntries(['performance_frontend_benchmark.mjs','performance_frontend_fixture.mjs'].map(name=>[name,hash(fs.readFileSync(path.join(repo,'tests',name)))]));
const env=await environment(source),samples=[],warmups=[];
const count=phase==='SMOKE'?1:30,warmupCount=phase==='SMOKE'?0:3;
const readyList='document.querySelector("#tableHost tbody tr") && document.querySelector("#tableHost").getAttribute("aria-busy")!=="true"';
async function run(index){
  const {page,context}=await env.newPage();const metrics={};
  try{
    await page.locator('#username').fill('synthetic-fixture');await page.locator('#password').fill('SyntheticFixture9!');
    metrics.A=await measure(page,'document.querySelector("#loginForm").requestSubmit()',readyList);
    await page.locator('[data-section="profile"]').click();await page.waitForSelector('#profileName');
    metrics.B=await measure(page,'document.querySelector("[data-section=transactions]").click()',readyList);
    metrics.C=await measure(page,'document.querySelector("[data-tab=shared]").click()',readyList);
    metrics.D=await measure(page,'document.querySelector("#nextPage").click()',readyList);
    metrics.E=await measure(page,'{const input=document.querySelector("#search");input.value="معاملة";input.dispatchEvent(new Event("input",{bubbles:true}));}',`__fixture.calls.slice(from).some(c=>c.name==='list_my_transactions'&&c.end)&&${readyList}`);
    metrics.F=await measure(page,'{const select=document.querySelector("#priorityFilter");select.value="عادي";select.dispatchEvent(new Event("change",{bubbles:true}));}',readyList);
    metrics.G=await measure(page,'document.querySelector("[data-act=open]").click()','document.querySelector(".transaction-workspace")');
    await page.locator('.transaction-workspace [data-close]').click();
    metrics.H=await measure(page,'document.querySelector("[data-section=permissions]").click()','document.querySelector("#permissionsGrid")');
    metrics.I=await measure(page,'document.querySelector("[data-section=profile]").click()','document.querySelector("#profileName")');
    await page.locator('[data-section="transactions"]').click();await page.locator('[data-act="open"]').first().click();await page.waitForSelector('#subjectField');
    await page.locator('#subjectField').click();await page.locator('#newSubject').fill(`تعديل تجريبي ${index}`);
    metrics.J=await measure(page,'document.querySelector("#saveSubject").click()',`!document.querySelector('#saveSubject')&&${readyList}`);
    metrics.K=await measure(page,'refresh()',readyList);
    const renderCpu=await page.evaluate(()=>{
      const measured={};for(const fn of [renderTable,renderListOnly,renderApp]){const start=performance.now();fn();measured[fn.name]=performance.now()-start;}return measured;
    });
    assert.equal(await page.evaluate(()=>__fixture.external),0);
    for(const metric of Object.values(metrics))for(const call of metric.calls)if(call.name==='list_my_transactions')assert(call.rows<=50&&call.args.pageSize===50);
    return {index,metrics,renderCpu};
  }finally{await context.close();}
}
try{
  for(let i=0;i<warmupCount;i++)warmups.push(await run(i));
  for(let i=0;i<count;i++){samples.push(await run(i));if((i+1)%10===0)console.log(JSON.stringify({phase,completed:i+1}));}
  assert.deepEqual(env.blocked,[]);assert.deepEqual(env.errors,[]);
  const summary=Object.fromEntries(Object.keys(samples[0].metrics).map(key=>[key,Object.fromEntries(['clientTotalMs','syntheticTransportMs','postResponseToUsableMs','requests','requestBytes','responseBytes',...(key==='J'?['finalAckMs']:[])].map(field=>[field,stats(samples.map(s=>s.metrics[key][field]))]))]));
  const result={phase,createdAt:new Date().toISOString(),mode:'REAL_CHROMIUM_NATIVE_APP_SYNTHETIC_FETCH_ONLY',nativePerformance:'LIVE_PERF_MEASUREMENT_PENDING',networkRTT:null,serverEdgeMs:null,databaseMs:null,renderDefinition:'postResponseToUsable includes client continuation, DOM/layout and two animation frames; separate renderCpu probes are native synchronous render calls and exclude paint',node:process.version,chromium:env.browser.version(),sampleCount:count,warmupCount,sourceHashes,harnessHashes,fixture:{staff:80,transactions:160,pageSize:50},externalRequests:env.blocked.length,pageErrors:env.errors.length,summary,renderCpu:Object.fromEntries(Object.keys(samples[0].renderCpu).map(k=>[k,stats(samples.map(s=>s.renderCpu[k]))])),warmups,samples};
  fs.writeFileSync(path.join(destination,'benchmark.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({phase,sampleCount:count,clientP50P95:Object.fromEntries(Object.entries(summary).map(([key,value])=>[key,[value.clientTotalMs.p50,value.clientTotalMs.p95]])),renderCpu:result.renderCpu,artifact:path.join(destination,'benchmark.json')}));
}finally{await env.close();}
