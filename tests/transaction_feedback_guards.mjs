// Actual source-extracted authorization helpers; network-free.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const s=fs.readFileSync(new URL('../supabase/functions/transactions-api/index.ts',import.meta.url),'utf8');
function fn(name,next){return s.slice(s.indexOf('function '+name+'('),s.indexOf('function '+next+'(',s.indexOf('function '+name+'('))).replace(/who:Who|tx:any|flags:any|access:any/g,x=>x.split(':')[0]).replace(/\(a:any\)/g,'(a)').replace(/\(t:any\)/g,'(t)').replace(/\(r:any\)/g,'(r)');}
const ctx={arr:v=>Array.isArray(v)?v:[],hasPerm:(w,p)=>w.permissions.includes(p)};vm.createContext(ctx);vm.runInContext(fn('canAct','canSetDue')+fn('canRaiseCeo','ownedUnreadCount').split('async ')[0]+';globalThis.a=canAct;globalThis.r=canRaiseCeo',ctx);
const actor={role:'assistant',login_name:'fixture_asst',permissions:['transactions.act_all','transactions.raise_ceo']};
assert.equal(ctx.a(actor,{status:'closed',current_level:'assistant'},{visible:true,incoming:true,scope:true}),false,'terminal transactions reject work even with act_all');
assert.equal(ctx.r(actor,{tx:{status:'open',current_level:'ceo'},flags:{visible:true,incoming:false,scope:true},assigns:[],routes:[]}),false,'previous assistant cannot raise already-CEO custody');
assert.equal(ctx.r(actor,{tx:{status:'open',current_level:'assistant'},flags:{visible:true,incoming:true,scope:true},assigns:[],routes:[]}),true,'current authorized assistant may escalate');
console.log('Actual Edge helper guards passed: terminal mutation denied, stale custody escalation denied, current assistant escalation allowed');
