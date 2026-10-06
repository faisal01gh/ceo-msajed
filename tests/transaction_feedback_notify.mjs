// Real notify helper extracted from actual source; synthetic DB sink, no network.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../supabase/functions/transactions-api/index.ts',import.meta.url),'utf8');
const start=s.indexOf('async function notify('),end=s.indexOf('async function notifyExec(',start);
const f=s.slice(start,end).replace(/login:string\|undefined\|null/,'login').replace(/name:string\|undefined\|null/,'name').replace(/txId:string|event:string|title:string/g,x=>x.split(':')[0]).replace('body:string|null=null','body=null');
let written,fail=false;const ctx={account:async()=>({user_id:'10000000-0000-4000-8000-000000000001',display_name:'مستقبل اختبار'}),db:{from:()=>({insert:async b=>{written=b;return{error:fail?new Error('offline_owned_insert_failed'):null}}})}};vm.createContext(ctx);vm.runInContext(f+';globalThis.n=notify',ctx);
await ctx.n('fixture_recipient','مستقبل اختبار','20000000-0000-4000-8000-000000000001','route','اختبار');assert.equal(written.user_id,'10000000-0000-4000-8000-000000000001','New notifications must bind canonical Auth recipient ID');
fail=true;await assert.rejects(ctx.n('fixture_recipient','مستقبل اختبار','20000000-0000-4000-8000-000000000001','route','اختبار'),/offline_owned_insert_failed/);
console.log('Actual notify helper passed: canonical recipient UID and failure propagation; no network');
