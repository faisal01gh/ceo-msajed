import {isAccountRuntimeAuthority} from '../accounts-official-reset.mjs';
import {isRuntimeProvenanceGate} from '../qa-runtime-provenance.mjs';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const DIGEST=/^[0-9a-f]{64}$/;
export function requireOwned(fact,code){if(!fact)throw new Error(code);}

// Physical promises remain owned after caller deadlines. Neither timer expiry nor
// a process restart is cancellation. Durable reservations are NEVER retried.
export class OwnedIO {
  #pending=new Set(); #taken=new Set(); #history=[]; #quarantined=false;
  constructor({adapter,runtimeGate,runtimeAuthority,inventoryDigest,deadlineMs=5000}) {
    requireOwned(isRuntimeProvenanceGate(runtimeGate)||isAccountRuntimeAuthority(runtimeAuthority),'RUNTIME_PROVENANCE_REQUIRED');
    requireOwned(DIGEST.test(inventoryDigest)&&Number.isSafeInteger(deadlineMs)&&deadlineMs>0&&deadlineMs<=60000,'INVALID_IO_BOUNDARY');
    this.adapter=adapter;this.gate=runtimeGate;this.digest=inventoryDigest;this.deadlineMs=deadlineMs;
  }
  snapshot(){return {pending:this.#pending.size,quarantined:this.#quarantined,history:this.#history.map(x=>({...x}))};}
  async #bound(work,scope){
    const h={scope,state:'started',actual:'pending'};this.#history.push(h);
    const physical=Promise.resolve().then(work);this.#pending.add(physical);
    const settled=physical.then(()=>{h.actual='fulfilled';this.#pending.delete(physical);},()=>{h.actual='rejected';this.#pending.delete(physical);});
    globalThis.EdgeRuntime?.waitUntil?.(settled);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{h.state='timed_out';this.#quarantined=true;reject(new Error('OWNED_IO_UNSETTLED'));},this.deadlineMs);
      physical.then(value=>{clearTimeout(timer);if(h.state==='started'){h.state='completed';resolve(value);}},()=>{clearTimeout(timer);this.#quarantined=true;if(h.state==='started'){h.state='failed';reject(new Error('OWNED_IO_UNKNOWN'));}});
    });
  }
  read(scope,work){requireOwned(!this.#quarantined,'OWNED_IO_QUARANTINED');return this.#bound(work,scope);}
  async write({runId,operationId,scope,resourceKey},work){
    requireOwned(!this.#quarantined&&UUID.test(runId)&&UUID.test(operationId)&&typeof scope==='string'&&typeof resourceKey==='string','OWNED_IO_QUARANTINED');
    const key=JSON.stringify([runId,scope,resourceKey]);requireOwned(!this.#taken.has(key),'OWNED_NO_RETRY');this.#taken.add(key);
    // Every physical mutating statement, including reservation/history, checks
    // current F3 provenance inside the adapter immediately before dispatch.
    await this.#bound(()=>this.adapter.reserve({runId,operationId,scope,resourceKey}),'reserve');
    await this.#bound(()=>this.adapter.mark({runId,operationId,state:'dispatched',actual:'pending'}),'dispatch-history');
    const physical=Promise.resolve().then(work);
    // Retain the actual provider promise AND its durable settlement continuation.
    // An unknown/timed-out event is monotonic: late fulfillment doesn't reopen it.
    const custody=physical.then(async value=>{
      await this.adapter.mark({runId,operationId,state:'completed',actual:'fulfilled'});return value;
    },async()=>{
      await this.adapter.mark({runId,operationId,state:'unknown',actual:'rejected'});throw new Error('OWNED_IO_UNKNOWN');
    });
    try{return await this.#bound(()=>custody,scope);}catch{
      this.#quarantined=true;
      // This is also physical I/O; don't detach an unobserved journal promise.
      try{await this.#bound(()=>this.adapter.mark({runId,operationId,state:'unknown',actual:'pending'}),'unknown-history');}catch{}
      throw new Error('OWNED_MUTATION_QUARANTINED');
    }
  }
}
