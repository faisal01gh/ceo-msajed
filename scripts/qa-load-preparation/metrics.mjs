export function summarize(rows, {startedAt, endedAt, transportPeak, connectedSocketPeak=null}) {
  const has = (r,k) => Number.isFinite(r[k]);
  const count = key => rows.filter(r => has(r,key)).length;
  const times = rows.filter(r => has(r,'terminalAt')).map(r => r.terminalAt-r.attemptedAt).sort((a,b)=>a-b);
  const rank = p => times.length ? times[Math.max(0,Math.ceil(p*times.length)-1)] : null;
  const statuses = {}; const perIdentity = new Map();
  for (const r of rows) {
    if (r.status !== null && r.status !== undefined) statuses[r.status]=(statuses[r.status]||0)+1;
    if (!perIdentity.has(r.uid)) perIdentity.set(r.uid,{uid:r.uid,sidDigest:r.sidDigest,attempts:0,enqueued:0,transmitted:0,bodyComplete:0,terminal:0});
    const a=perIdentity.get(r.uid); a.attempts++; for(const [k,v] of [['enqueuedAt','enqueued'],['transmittedAt','transmitted'],['bodyCompleteAt','bodyComplete'],['terminalAt','terminal']]) if(has(r,k))a[v]++;
  }
  const success=rows.filter(r=>r.status>=200&&r.status<300&&!r.error&&has(r,'bodyCompleteAt')&&has(r,'terminalAt')).length;
  const errors=rows.length-success;
  return {uniqueUIDs:new Set(rows.map(r=>r.uid)).size,uniqueSIDs:new Set(rows.map(r=>r.sidDigest)).size,
    counters:{attempts:rows.length,enqueued:count('enqueuedAt'),connected:count('connectedAt'),transmitted:count('transmittedAt'),responseHeaders:count('headersAt'),bodyComplete:count('bodyCompleteAt'),terminal:count('terminalAt')},
    transportPeak,connectedSocketPeak,success,errors,errorRate:rows.length?errors/rows.length:0,
    timeouts:rows.filter(r=>['REQUEST_TIMEOUT','BODY_TIMEOUT','DRAIN_TIMEOUT','ROUND_TIMEOUT'].includes(r.error)).length,
    networkErrors:rows.filter(r=>r.error==='NETWORK_ERROR').length,uncertainRequests:rows.filter(r=>r.uncertain).length,
    http429:statuses[429]||0,http5xx:Object.entries(statuses).filter(([s])=>Number(s)>=500&&Number(s)<=599).reduce((a,[,n])=>a+n,0),statusDistribution:statuses,
    latencyMs:{definition:'attempt admission to actual request close/terminal; all terminal outcomes; nearest-rank percentiles',sampleCount:times.length,avg:times.length?times.reduce((a,b)=>a+b,0)/times.length:null,min:times[0]??null,max:times.at(-1)??null,p50:rank(.50),p95:rank(.95),p99:rank(.99)},
    windowMs:endedAt-startedAt,throughputTerminalPerSecond:count('terminalAt')/((endedAt-startedAt)/1000),throughputSuccessPerSecond:success/((endedAt-startedAt)/1000),perIdentity:[...perIdentity.values()]};
}
