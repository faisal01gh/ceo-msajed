// Review-only network prohibition; no native provider adapters.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
const denied=()=>{throw new Error('review_network_forbidden');};
globalThis.fetch=denied;
net.connect=denied;net.createConnection=denied;net.Socket.prototype.connect=denied;
tls.connect=denied;http.request=denied;http.get=denied;https.request=denied;https.get=denied;
dgram.createSocket=denied;
