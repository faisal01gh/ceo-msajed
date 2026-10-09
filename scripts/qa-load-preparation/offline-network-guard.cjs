'use strict';
const http=require('node:http'),https=require('node:https'),net=require('node:net'),dns=require('node:dns');
const denied=()=>{throw new Error('OFFLINE_NETWORK_DENIED');};
function allowHTTP(args){const x=args[0];if(typeof x==='string'||x instanceof URL){const u=new URL(x);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')denied();}else if(!x||x.protocol&&x.protocol!=='http:'||(x.hostname||x.host)!=='127.0.0.1')denied();}
for(const name of ['request','get']){const orig=http[name];http[name]=function(...args){allowHTTP(args);return orig.apply(this,args);};https[name]=denied;}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let x=args[0];if(Array.isArray(x))x=x[0];const host=typeof x==='object'?x.host:(typeof x==='number'?args[1]:null);if(host!=='127.0.0.1')denied();return connect.apply(this,args);};
const lookup=dns.lookup;dns.lookup=function(host,...args){if(host!=='127.0.0.1')denied();return lookup.call(this,host,...args);};
globalThis.fetch=denied;if(globalThis.WebSocket)globalThis.WebSocket=class{constructor(){denied();}};
module.exports={stage:'LocalHTTPFixture',externalNetworkDenied:true};
