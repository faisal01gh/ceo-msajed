import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { passwordRequest } from '../_shared/password-command.ts';
import { passwordPort } from '../_shared/password-port.ts';
const port=passwordPort();
Deno.serve((req:Request)=>passwordRequest(req,port,'reset'));
