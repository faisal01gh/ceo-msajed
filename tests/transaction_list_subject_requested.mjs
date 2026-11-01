import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// A synthetic, local-only regression: no credentials or network access.
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const app=readFileSync(join(root,"app.js"),"utf8");
const css=readFileSync(join(root,"styles.css"),"utf8");
const index=readFileSync(join(root,"index.html"),"utf8");
const sql=readFileSync(join(root,"supabase/migrations/20261101101000_transaction_list_subject_requested.sql"),"utf8");
new Function(app);

function extract(name,next){
  const start=app.indexOf("function "+name+"(");
  const end=app.indexOf("function "+next+"(",start);
  assert.ok(start>=0&&end>start,"Expected function "+name);
  return app.slice(start,end);
}
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const rows=[{
  id:"synthetic",number:"2026-TEST",title:"عنوان",
  subject:"موضوع <للاختبار>",requested_text:"مطلوب <للاختبار>",
  responsible_unit_name:"إدارة",responsible_name:"موظف",
  priority:"عادي",status:"open",days:1,late:false,
  supporting_count:0,current_assignees:[],current_level:"employee"
}];
const listData={rows,page_size:50};
const host={innerHTML:""};
const renderTable=new Function(
  "document","listData","emptyState","searchText","activeFilterCount",
  "statusBadge","transactionReadMarker","esc","priorityClass","fmtDate",
  extract("renderTable","handleTableActionClick")+"return renderTable;"
)({getElementById:()=>host},listData,()=>"", "",()=>0,
  ()=>["جديدة","st-new"],()=>"",esc,()=>"pri-n",()=>"-");
renderTable();
assert.equal((host.innerHTML.match(/<th scope="col">/g)||[]).length,13);
assert.match(host.innerHTML,/data-label="الموضوع">موضوع &lt;للاختبار&gt;/);
assert.match(host.innerHTML,/data-label="المطلوب">مطلوب &lt;للاختبار&gt;/);
assert.match(host.innerHTML,/data-act="open"/);

const exported=[];
const exportListExcel=new Function(
  "listData","page","fmtDate","excelXml","download",
  extract("exportListExcel","exportTransactionExcel")+"return exportListExcel;"
)(listData,1,()=>"-",JSON.stringify,(...args)=>exported.push(args));
exportListExcel();
const excelRows=JSON.parse(exported[0][2]);
assert.deepEqual(excelRows[0].slice(2,5),["عنوان المعاملة","الموضوع","المطلوب"]);
assert.deepEqual(excelRows[1].slice(2,5),["عنوان","موضوع <للاختبار>","مطلوب <للاختبار>"]);
const excelXml=new Function(
  "xmlCell",extract("excelXml","exportListExcel")+"return excelXml;"
)(v=>'<Cell><Data ss:Type="String">'+esc(v)+'</Data></Cell>');
const xml=excelXml(excelRows);
assert.equal((xml.match(/<Column ss:Width="/g)||[]).length,11);
assert.match(xml,/<\/Row><\/Table>/);

let printed="";
const printList=new Function(
  "listData","page","esc","printHtml",
  extract("printList","printTransaction")+"return printList;"
)(listData,1,esc,(_title,body)=>{printed=body;});
printList();
assert.equal((printed.match(/<th>/g)||[]).length,8);
assert.match(printed,/موضوع &lt;للاختبار&gt;/);
assert.match(printed,/مطلوب &lt;للاختبار&gt;/);

rows[0].subject="";
rows[0].requested_text="";
renderTable();
assert.match(host.innerHTML,/data-label="الموضوع">—/);
assert.match(host.innerHTML,/data-label="المطلوب">—/);

assert.match(css,/\.tx-summary\{/);
assert.match(css,/tbody td:nth-child\(3\),tbody td:nth-child\(4\)/);
assert.match(index,/20261101-list-subject-requested-1/);
assert.match(sql,/requested_rows as \(/);
assert.match(sql,/from paged pg/);
assert.match(sql,/jsonb_agg\(to_jsonb\(requested_rows\)\)/);
assert.match(sql,/r\.status in \('completed','accepted'\)/);
console.log("transaction list subject/requested regressions: PASS");
