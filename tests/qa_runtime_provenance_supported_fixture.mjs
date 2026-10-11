// TEST ONLY: exact supported predecessor DDL, never controller execution.
import {readFileSync} from 'node:fs';
export const supportedRelations=Object.freeze(['app_private.qa_core_provision_context','public.legacy_archive','public.migration_gate','public.migration_receipts','public.workspace_edits','public.workspace_versions']);
export function prerequisiteDDL(){
 const core=readFileSync(new URL('../supabase/migrations/20261008020000_qa_isolation_enforcement.sql',import.meta.url),'utf8');
 const statement=/CREATE TABLE IF NOT EXISTS app_private\.qa_core_provision_context\([\s\S]*?REVOKE ALL ON app_private\.qa_core_provision_context FROM PUBLIC,anon,authenticated,service_role;/.exec(core)?.[0];
 if(!statement)throw Error('canonical Core context missing');
 const predecessor=readFileSync(new URL('./qa_isolation_enforcement.mjs',import.meta.url),'utf8');
 const workspace=/await db\.exec\(`(CREATE TABLE public\.workspace_versions[\s\S]*?GRANT USAGE ON SEQUENCE public\.migration_receipts_id_seq TO service_role;)/.exec(predecessor)?.[1];
 if(!workspace)throw Error('canonical workspace/import prerequisites missing');
 return `${statement}${workspace}`;
}
