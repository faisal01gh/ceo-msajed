import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dgram from 'node:dgram';import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw Error('OFFLINE_ONLY_NETWORK_FORBIDDEN');};
globalThis.fetch=deny;globalThis.WebSocket=class{constructor(){deny();}};
for(const [obj,names]of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dgram,['createSocket']]])for(const name of names)obj[name]=deny;
syncBuiltinESMExports();
