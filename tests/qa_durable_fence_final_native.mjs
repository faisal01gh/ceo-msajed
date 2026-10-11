// TEST ONLY: original14 cases against official final composition on WSL QA.
import fs from 'node:fs';import assert from 'node:assert/strict';import * as h from '../scripts/qa-load-preparation/lifecycle.fence-final.fixture.mjs';import {cases} from '../scripts/qa-load-preparation/lifecycle.fence-integrated.cases.mjs';
const F=process.env.QA_DURABLE_REPORT_DIR;assert(F);fs.mkdirSync(F,{recursive:true});
const report={status:'RUNNING',requirements:Array.from({length:14},(_,i)=>({id:i+1,status:'NOT_RUN',cases:[]})),full200:'blocked_by_design',productionActivation:'not_authorized'};const save=()=>fs.writeFileSync(F+'/REPORT.json',JSON.stringify(report,null,2));let d;
const check=(id,name,detail={})=>{const r=report.requirements[id-1];r.status='PASS';r.cases.push({name,...detail});save();};
try{const f=await h.install();d=f.db;report.target=d.connection;report.migrationManifest=f.manifest;const before=await h.primarySnapshot(d);report.protectedBefore=h.hash(before);save();await cases({h,d,F,check,report,before,baseId:1200000,finalNativeRestart:true});assert(report.requirements.every(r=>r.status==='PASS'));report.summary={passed:14,failed:0,skipped:0,xfail:0};report.status='PASS';}
catch(e){report.status='FAIL';report.error={message:e.message,code:e.code,where:e.where,stack:e.stack};process.exitCode=1;}
finally{await d?.close();save();console.log(JSON.stringify({status:report.status,summary:report.summary||null,error:report.error||null}));}
