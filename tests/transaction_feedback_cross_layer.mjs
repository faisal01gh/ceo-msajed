// Cross-layer contract: actual UI tab identifiers exercised against actual authenticated SQL RPC.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createTransactionFeedbackFixture} from './transaction_feedback_sql_fixture.mjs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('function tabsFor('),end=source.indexOf('function defaultTab(',start);const c={hasTxPerm:()=>false};vm.createContext(c);vm.runInContext(source.slice(start,end)+';globalThis.tabs=tabsFor',c);
const tab=c.tabs('assistant_secretary').find(t=>t[1]==='المعاملات لدى المساعد')?.[0];assert(tab,'Assistant queue UI missing');
const {db,scalar,actors,unit,tx,id,claims}=await createTransactionFeedbackFixture();
try{
 await db.query("update public.transactions set current_level='assistant',workflow_started=true where id=$1",[tx]);
 await db.query("insert into public.transaction_routes(transaction_id,route_type,from_user_id,from_login_name,to_user_id,to_login_name,to_name) values($1,'raise',$2,'manager',$3,'assistant','assistant display')",[tx,actors.manager,actors.assistant]);
 // A second own-created transaction is visible to the secretary but NOT held by the assistant.
 await db.query("insert into public.transactions(id,number,title,created_by,created_by_name,responsible_user_id,current_level) values($1,'FIX-OWN-SECRETARY','Own work not in assistant custody',$2,'secretary display',$2,'employee')",[id(990),actors.secretary]);
 await claims(actors.secretary);await db.exec('set role authenticated');
 const result=await scalar('select public.list_my_transactions($1)',[tab]);
 assert.equal(result.total,1,'UI queue identifier must select only current assistant-held work, not generic authorized/all records');assert.equal(result.rows[0].id,tx);assert.equal(result.rows[0].can_act,false);
 console.log('Cross-layer UI→actual SQL assistant queue passed: one current assistant-held row, excludes secretary own work, read-only');
}finally{await db.close()}
