// Network-free integration. Native/provider/Git actions are forbidden.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const evidence='C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-isolation-enforcement-evidence';
const adapter=path.resolve(import.meta.dirname,'qa_isolation_enforcement.mjs');
const red=process.argv.includes('--red');
const args=[path.join(evidence,'sql-isolation-attacks.mjs'),...(red?[]:['--guard-adapter',adapter])];
const loader=new URL('file:///C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/qa-isolation-enforcement-evidence/pglite-loader.mjs');
const result=spawnSync(process.execPath,args,{env:{...process.env,NODE_OPTIONS:`--import=${loader.href}`},encoding:'utf8',timeout:180000});
console.log(result.stdout);if(result.stderr)console.error(result.stderr);
const report=JSON.parse(fs.readFileSync(path.join(evidence,'results.json'),'utf8'));
assert.equal(report.summary.acceptance.total,3548,'all original assertions must run');
assert.equal(report.summary.harness_mechanics.total,35,'all original mechanics must run');
if(!red)assert.equal(report.summary.acceptance.failed,0);
process.exitCode=result.status??2;
