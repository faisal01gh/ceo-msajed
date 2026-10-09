import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { passwordRequest } from '../_shared/password-command.ts';
import { passwordPort } from '../_shared/password-port.ts';
Deno.serve((req:Request)=>passwordRequest(req,passwordPort('change'),'change'));