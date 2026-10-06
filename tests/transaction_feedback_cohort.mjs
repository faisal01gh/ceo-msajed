// Actual routing selection helpers; no provider calls.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../supabase/functions/transactions-api/index.ts',import.meta.url),'utf8');const start=s.indexOf('async function assistantForOrg('),end=s.indexOf('async function txAccess(',start);const body=s.slice(start,end).replace(/org:string/g,'org').replace(/who\??:Who/g,'who').replace(/\(u:any\)/g,'(u)').replace(/\(x:string\)/g,'(x)');
const real={canonical_key:'original_assistant',login_name:'original_asst',role:'assistant',org_name:'sector',dept_names:[]},test={...real,canonical_key:'test_admin_assistant',login_name:'test_admin_assistant'},mgr={canonical_key:'original_manager',login_name:'original_mgr',role:'manager',org_name:'sector',dept_names:['dept']},tmgr={...mgr,canonical_key:'test_admin_manager',login_name:'test_admin_manager'};
const ctx={directory:async()=>[test,real,tmgr,mgr],unique:xs=>[...new Set(xs)]};vm.createContext(ctx);vm.runInContext(body+';globalThis.as=assistantForOrg;globalThis.m=managerFor',ctx);
assert.equal((await ctx.as('sector',{login_name:'original_actor'})).login_name,real.login_name,'real workflows must not automatically target synthetic test assistant');
assert.equal((await ctx.as('sector',{login_name:'test_admin_manager'})).login_name,test.login_name,'test workflow targets test assistant in same sector');
assert.equal((await ctx.m({login_name:'original_employee',org_name:'sector',dept_name:'dept',dept_names:['dept']})).login_name,mgr.login_name);
assert.equal((await ctx.m({login_name:'test_admin_employee',org_name:'sector',dept_name:'dept',dept_names:['dept']})).login_name,tmgr.login_name);
console.log('Actual routing cohort fixtures passed: real/test automatic assistant and manager targets stay separate without organizational changes');
