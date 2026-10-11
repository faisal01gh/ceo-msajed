import net from 'node:net';
import assert from 'node:assert/strict';
assert(!Object.keys(process.env).some(k=>/^(SUPABASE|SERVICE_ROLE|PGPASSWORD)/i.test(k)), 'no provider credentials in native fixture environment');
assert(!process.env.QA_LOCAL_PG_DATABASE||/^qa_local_(composed|legacy)_[a-z0-9_]+$/.test(process.env.QA_LOCAL_PG_DATABASE),'owned fixture database name required');
export const TARGET=Object.freeze({host:'127.0.0.1',port:51771,database:process.env.QA_LOCAL_PG_DATABASE||'qa_isolation_durable_fence_20261009',dataDirectory:'/home/faisal/ceo-msajed-qa-checkpoints/2026-10-09-durable-fence-blocked/run-wsl-20261009/pgdata',listen:'127.0.0.1'});
const active=new Set();let poison=null;
export const literal=v=>v===null?'NULL':Array.isArray(v)?`ARRAY[${v.map(literal).join(',')}]`:typeof v==='number'?String(v):typeof v==='boolean'?(v?'true':'false'):"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
const i32=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b};
export class Wire{
 constructor({role='postgres',socketFactory=()=>net.createConnection({host:TARGET.host,port:TARGET.port}),startupMs=10000,queryMs=20000}={}){
  this.buffer=Buffer.alloc(0);this.fields=[];this.rows=[];this.notices=[];this.pending=null;this.error=null;this.closed=false;this.queryMs=queryMs;this.role=role;
  this.ready=new Promise((a,b)=>{this.startResolve=a;this.startReject=b});this.ready.catch(()=>{});
  this.socket=socketFactory();this.closedPromise=new Promise(a=>this.socket.once('close',()=>{this.closed=true;a()}));
  this.timer=setTimeout(()=>this.abort(Object.assign(Error('startup deadline'),{code:'FIXTURE_STARTUP_TIMEOUT'})),startupMs);
  this.socket.on('error',e=>this.abort(e));this.socket.on('end',()=>this.abort(Object.assign(Error('wire ended'),{code:'FIXTURE_WIRE_END'})));this.socket.on('close',()=>this.abort(Object.assign(Error('wire closed'),{code:'FIXTURE_WIRE_CLOSED'}),false));
  this.socket.on('connect',()=>{const b=Buffer.from(`user\0${role}\0database\0${TARGET.database}\0application_name\0qa-fence-integrated\0\0`);this.socket.write(Buffer.concat([i32(b.length+8),i32(196608),b]));});
  this.socket.on('data',b=>{try{this.buffer=Buffer.concat([this.buffer,b]);while(this.buffer.length>=5){const n=this.buffer.readInt32BE(1);if(n<4||n>67108864)throw Error('invalid wire length');if(this.buffer.length<n+1)break;const t=String.fromCharCode(this.buffer[0]),d=this.buffer.subarray(5,n+1);this.buffer=this.buffer.subarray(n+1);this.receive(t,d)}}catch(e){this.abort(e)}});
 }
 abort(e,destroy=true){clearTimeout(this.timer);this.startReject?.(e);this.startReject=null;this.startResolve=null;this.pending?.reject(e);this.pending=null;if(destroy&&!this.socket.destroyed)this.socket.destroy();}
 receive(t,b){
  if(t==='R'&&b.readInt32BE(0)!==0)return this.abort(Object.assign(Error('trust authentication required'),{code:'FIXTURE_AUTH_DENIED'}));
  if(t==='T'){this.rows=[];this.fields=[];let o=2;for(let n=b.readInt16BE(0);n;n--){const z=b.indexOf(0,o),name=b.toString('utf8',o,z);o=z+1;const oid=b.readInt32BE(o+6);o+=18;this.fields.push({name,oid});}}
  if(t==='D'){let o=2,row={};for(let k=0;k<b.readInt16BE(0);k++){const n=b.readInt32BE(o);o+=4;let v=n===-1?null:b.toString('utf8',o,o+n);if(n!==-1)o+=n;const f=this.fields[k];if(v!==null){if(f.oid===16)v=v==='t';else if([20,21,23,26].includes(f.oid))v=Number(v);else if([114,3802].includes(f.oid))v=JSON.parse(v);}row[f.name]=v;}this.rows.push(row);}
  if(t==='E'||t==='N'){let o=0,f={};while(o<b.length&&b[o]){const k=String.fromCharCode(b[o++]),z=b.indexOf(0,o);f[k]=b.toString('utf8',o,z);o=z+1;}if(t==='N')this.notices.push(f.M);else{const e=Object.assign(Error(f.M),{code:f.C,where:f.W,severity:f.V||f.S});if(['FATAL','PANIC'].includes(e.severity)||this.startResolve)return this.abort(e);this.error=e;}}
  if(t==='C')this.affectedRows=Number(b.toString('utf8').replaceAll('\0','').split(' ').at(-1))||0;
  if(t==='Z'){clearTimeout(this.timer);if(this.startResolve){this.startResolve();this.startResolve=null;this.startReject=null;}else if(this.pending){const p=this.pending;this.pending=null;this.error?p.reject(this.error):p.resolve({rows:this.rows,affectedRows:this.affectedRows});this.error=null;}}
 }
 raw(sql){if(this.closed||this.socket.destroyed)return Promise.reject(Error('closed native wire'));if(this.pending)return Promise.reject(Error('concurrent wire query forbidden'));this.rows=[];this.error=null;this.affectedRows=0;return new Promise((resolve,reject)=>{this.pending={resolve,reject};this.timer=setTimeout(()=>this.abort(Object.assign(Error('query deadline; physical SQL outcome unknown'),{code:'FIXTURE_QUERY_TIMEOUT',physicalOutcome:'UNKNOWN'})),this.queryMs);const b=Buffer.from(sql+'\0');this.socket.write(Buffer.concat([Buffer.from('Q'),i32(b.length+4),b]));});}
 async close(){if(this.closed)return;clearTimeout(this.timer);if(!this.socket.destroyed)this.socket.end(Buffer.from([88,0,0,0,4]));const timer=setTimeout(()=>this.socket.destroy(),1000);try{await this.closedPromise}finally{clearTimeout(timer)}}
}
async function checkedPreflight(exclude=[]){
 if(process.env.QA_WSL_HANDOFF!=='AFTER_14_PARENT_SERIAL')throw Error('NO_DB_WITHOUT_PARENT_SERIAL_HANDOFF');if(poison)throw poison;
 const w=new Wire();try{await w.ready;const r=(await w.raw(`SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') "dataDirectory",current_setting('listen_addresses') listen,version() engine,pg_backend_pid() pid,(SELECT count(*)::int FROM pg_foreign_server) foreign_servers,(SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid() AND pid NOT IN (${[0,...active,...exclude].map(Number).join(',')})) other_clients`)).rows[0];for(const[k,v]of Object.entries(TARGET))assert.equal(r[k],v,'exact target '+k);assert.equal(r.foreign_servers,0);assert.equal(r.other_clients,0);assert(r.pid>0);assert.match(r.engine,/PostgreSQL 16\./);return r;}finally{await w.close();}
}
let guardQueue=Promise.resolve();
function admission(job){const p=guardQueue.then(job);guardQueue=p.catch(()=>{});return p;}
export function preflight(exclude=[]){return admission(()=>checkedPreflight(exclude));}
export class PGlite{
 constructor(options={}){
  this.notices=[];this.role=options.user||options.role||'postgres';this.verified=admission(()=>this.initialize());this.verified.catch(()=>{});this.ready=this.verified;
 }
 async initialize(){
  // Keep the whole opening/registration interval in the same strict gate as
  // query preflight. No unregistered owned backend can race another probe.
  await checkedPreflight();this.wire=new Wire({role:this.role});await this.wire.ready;
  const r=(await this.wire.raw('SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,pg_backend_pid() pid,version() engine,current_user role')).rows[0];assert.equal(r.database,TARGET.database);assert.equal(r.host,TARGET.host);assert.equal(r.port,TARGET.port);assert.equal(r.role,this.role);assert(r.pid>0);active.add(r.pid);this.connection=r;this.notices=this.wire.notices;
  await checkedPreflight();await this.wire.raw("SET statement_timeout='12s';SET lock_timeout='3s'");return this;
 }
 async query(sql,args=[]){await this.verified;if(poison)throw poison;await preflight();try{return await this.wire.raw(args.length?sql.replace(/\$(\d+)\b/g,(_,n)=>literal(args[Number(n)-1])):sql)}catch(e){if(!/^[0-9A-Z]{5}$/.test(e.code||''))poison=e;throw e;}}
 async exec(sql){return this.query(sql.replace(/create role (anon|authenticated|service_role)( bypassrls)?;/gi,(s,name)=>`DO $role$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${name.toLowerCase()}') THEN ${s} END IF;END $role$;`));}
 async guard(){return preflight();}
 async close(){try{await this.wire?.close()}finally{if(this.connection)active.delete(this.connection.pid)}}
}
export async function resetOwnedSchemas(){const identity=await preflight();const db=new PGlite();try{await db.verified;await db.exec('DROP SCHEMA IF EXISTS auth CASCADE;DROP SCHEMA IF EXISTS app_private CASCADE;DROP SCHEMA IF EXISTS public CASCADE;CREATE SCHEMA public;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');return identity;}finally{await db.close();}}

