# Password-security SQL: local fixture and Edge contract

## Scope

Migration: `supabase/migrations/20261005200000_password_operations_and_safe_provisioning.sql`.
Target is **msajed-ceo-erp / refmovzojtnkkmdsjhmlgtq only**. This work performs no cloud calls, production apply, Auth writes, credential retrieval, commit, or push. The only Auth rows created by the tests are explicitly synthetic rows inside a disposable local PGlite database.

## Run locally

Requires a locally installed PGlite module and the supplied nonsecret physical snapshots. No package download is performed by the runner.

```bash
node tests/password_security_sql.mjs \
  C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/password-security-sql/node_modules/@electric-sql/pglite/dist/index.js \
  C:/Users/FAiSAL/AppData/Local/hermes/cache/scratch/msajed-account-work
node --check tests/password_security_sql.mjs
node --check tests/password_security_sql_cases.mjs
```

The module was installed in scratch with `npm install --offline --ignore-scripts --no-audit --no-fund ... @electric-sql/pglite@0.3.14`, using the existing local npm cache. No dependency files were added to the repository.

Verified result: **26 local fixture tests passed**, including the narrowly scoped forced-bootstrap regression. This executes the actual migration SQL, PL/pgSQL transitions, role privileges, and fixture RLS queries. It is **not live Supabase/Auth/RLS verification**, not a replay proof for the historical migration chain, and not a multi-connection concurrency test. Deployed physical readback is recorded separately in PROJECT_STATE.

## Pinned public service-only RPCs

All the following have execution revoked from PUBLIC, anon, and authenticated, and granted only to service_role:

- `account_password_begin_internal(p_actor uuid,p_session uuid,p_target_key text,p_kind text,p_operation_id uuid)`; kinds `change` / `reset`. NULL own target key resolves the actor's eligible canonical row. New calls require a valid actual Auth session. Reset additionally requires the actual active/password-ready `ceo_office_manager` role and effective `profiles.admin_reset_password`. Overrides cannot substitute for this role.
- `account_password_maintenance_begin_internal(p_target_key text,p_operation_id uuid)`; only already-forced, active, eligible, linked accounts. It has no user session dependency; actor is NULL, source is `authorized_maintenance`. Faisal and ineligible finance are refused.
- `account_password_finish_internal(p_operation_id uuid,p_generation bigint)`; requires both trusted `auth.users.raw_app_meta_data.msajed_password_operation` and `msajed_password_generation` to match. It updates journal/flags/cutoff/audit atomically. Change clears both forced flags; reset preserves both true.
- `account_password_unknown_internal(p_operation_id uuid)`; pending becomes uncertain; no expiry, lease, replay authorization, or release exists.
- `account_password_status_internal(p_operation_id uuid)`; returns the nonsecret operation result, or NULL for an unknown operation.
- `account_password_fail_internal(p_operation_id uuid,p_error_code text)`; accepts **only `provider_400` or `provider_422`**. Edge must map an actually definitive official-provider rejection to these constants. Raw errors are not accepted/stored. Failure leaves both flags forced. Uncertain operations cannot be failed/released. A suspicious matching operation marker requires reconciliation, not failure.
- `account_session_check_internal(p_user uuid,p_session uuid,p_allow_forced boolean default false)`; checks actual session ID/owner/creation/expiry, profile activity, eligible registry, cutoff, forced flags, and no unresolved operation. Forced bypass is only for beginning one's own change, never operational API access.
- `account_provision_link_internal(p_key text,p_auth_user uuid,p_memberships jsonb)`; memberships are `[{unit_id,membership_role,is_primary}]`. Requires exact official internal email and real parent-resolved approved units. Existing exact links return `already_linked` without mutations. New links return `linked`. Existing conflicting profile/role/membership/credential state refuses the whole transaction.

Operation results contain `operation_id,target_user_id,canonical_key,login_username,generation,status,write_allowed`. **Only a newly inserted operation returns `write_allowed:true`.** Every duplicate/status/completion/failure observation returns false. Duplicate session-based begin requires the SAME original actor/session/kind/target binding; it does not grant normal access or authorize another Auth write.

## Edge responsibilities / irreducible boundaries

1. Verify the user with official provider Auth getUser and validate signed session UUID claims before supplying actor/session to service-only RPCs. SQL cannot verify an HTTP bearer signature supplied through service_role.
2. Set password plus BOTH trusted operation/generation app-metadata markers in ONE official Auth Admin update. SQL observes trusted markers; it cannot prove provider-side atomicity/password semantics independently.
3. For duplicate begin, never replay the password write. Inspect provider proof; finalize matching proof, otherwise mark/return uncertain. Provider timeout, dropped response, or ambiguous error is not definite failure.
4. Own begin invalidates old sessions immediately; finish advances cutoff again, excluding sessions created while the write was in flight. After finish, signInWithPassword creates the fresh real session/tokens returned to the UI.
5. Every operational service-role request must separately call session-check with `p_allow_forced:false`. RLS is bypassed by service_role; do not cache readiness or assume this migration secures unchanged legacy Edge handlers. Standalone check plus a later service write is not an atomic authorization transaction; strict concurrent in-flight write exclusion requires checking inside the business write transaction. This SQL task does not rewrite those APIs.
6. Deploy matching Edge handlers with this migration. Old service-role handlers capable of direct flag updates remain trusted bypasses until replaced by the parent.
7. The restrictive readiness policy is added to every CURRENT public RLS table, preserving all existing scope/ownership policies. Future RLS tables require the same gate.

## Snapshot / non-destructive proof

The fixture loads the actual supplied registry (57 eligible, 10 linked, 47 unlinked) and 11 Auth identities, including disabled/ineligible `finance_manager`. It verifies no installation mutations to existing profiles/registry/roles/memberships/defaults; then provisions all 47 synthetic missing-Auth fixture identities, yielding 57 eligible links and 58 total fixture Auth rows. Provisioning leaves all existing links/associations unchanged. Faisal's Auth identity, profile, flags, and registry row remain exact throughout reset/provision tests. Official `login_username` and internal `preferred_login` values are never regenerated.

Memberships use source-approved root/department/branch-group hierarchy. Snapshot executive-office employees, including `staff_006`, are members of the existing office root—not invented child departments. Independent finance remains independent.

Historical-source fixture limitations are explicit in the runner: foundation executes before its index file; dumped `$function$` terminators missing semicolons are normalized ONLY in fixture input; the legacy index migration referencing absent `auth_migration_accounts` is skipped; forward function references compile with body checks disabled ONLY while building historical fixture source. **The new migration executes unchanged with function-body checking enabled.** No historical file was edited.
