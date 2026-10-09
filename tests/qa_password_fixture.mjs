// Shared ONLY by password SQL tests. Historical predecessor normalization and
// synthetic Auth remain explicit; production guards/functions are not substituted.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createTransactionFeedbackFixture} from './qa_isolation_fixture.mjs';
export async function createPasswordGuardFixture(options={}){
 const f=await createTransactionFeedbackFixture(options);const {db,dir}=f;const sql=n=>fs.readFileSync(path.join(dir,n),'utf8');
 const metadata=async()=>(await db.query("select oid::text,pronamespace::text,proname,pg_get_function_identity_arguments(oid) identity,pg_get_function_arguments(oid) args,pg_get_function_result(oid) result,proowner::text,proacl::text,proconfig,provolatile,prosecdef from pg_proc where pronamespace in ('public'::regnamespace,'app_private'::regnamespace) order by oid")).rows;
 const before=await metadata();
 await db.exec(sql('20261008010000_qa_isolation_prerequisites.sql'));await db.exec(sql('20261008015000_qa_password_transport.sql'));await db.exec(sql('20261008018000_qa_rest_provenance.sql'));
 const all=await metadata();assert.deepEqual(all.filter(r=>before.some(b=>b.oid===r.oid)),before,'password changed existing function metadata');
 const adapter=fs.readFileSync(new URL('./qa_isolation_enforcement.mjs',import.meta.url),'utf8');const setup=adapter.slice(adapter.indexOf(' // Empty dependency relations:'),adapter.indexOf(' for(const [cohort,run]'));await new (Object.getPrototypeOf(async function(){}).constructor)('db','fs',setup)(db,fs);
 const m200=sql('20261008020000_qa_isolation_enforcement.sql');await assert.rejects(db.exec(m200),e=>e.code==='55000');await db.exec('rollback');await db.exec(m200.split('-- BEGIN LOCAL VERIFIABLE SECTION\n')[1].split('-- END LOCAL VERIFIABLE SECTION')[0]);
 for(const n of ['20261008018500_qa_core_rest_admission.sql','20261008019000_qa_typed_producer_references.sql','20261008019500_qa_delete_completion.sql','20261008020500_qa_password_frame_composition.sql'])await db.exec(sql(n));
 if(options.beforeGuards)await options.beforeGuards(f);
 for(const t of ['profiles','user_roles','user_memberships','account_migration_users','audit_log','notifications','transactions','transaction_assignments','transaction_assignment_users','transaction_assignment_targets','transaction_actions','transaction_action_versions','transaction_action_notes','transaction_links','transaction_routes','transaction_requests','transaction_history','transaction_participants','transaction_periods'])await db.exec(`create trigger zz_combined_reference before insert or update or delete on public.${t} for each row execute function app_private.qa_reference_guard_before_row()`);
 for(const t of ['transactions','transaction_assignments','transaction_actions'])await db.exec(`create trigger aa_combined_capture before delete on public.${t} for each row execute function app_private.qa_delete_capture()`);
 if(!options.modulePath){await db.exec('alter table app_private.qa_sql_operation_context drop constraint qa_sql_operation_context_backend_pid_check;alter table app_private.qa_sql_operation_context add check(backend_pid>=0)');}
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role');
 f.passwordBaselineABI=before.filter(r=>['account_password_begin_internal','account_password_finish_internal','account_password_fail_internal','account_password_unknown_internal'].includes(r.proname));
 return f;
}
