// Inert pure facade: no SDK, adapter, coordinator, OwnedIO or SQL mutation.
import {isCompletedReplayGate} from '../qa-runtime-provenance.mjs';
export async function replayCompletedCleanup(args){
 if(!args || Object.keys(args).length!==2 || !Object.hasOwn(args,'gate') || !Object.hasOwn(args,'request') || !isCompletedReplayGate(args.gate))throw new Error('runtime_provenance_denied');
 return await args.gate.readCompleted(args.request);
}
