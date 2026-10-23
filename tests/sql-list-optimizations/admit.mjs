import {createHash} from 'node:crypto';
export function verifySources(pins,read){return pins.map(pin=>{const b=read(pin.path);if(b.length!==pin.bytes||createHash('sha256').update(b).digest('hex')!==pin.sha256)throw Error('SOURCE_HASH '+pin.path);return pin;});}
