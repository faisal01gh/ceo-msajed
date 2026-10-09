# QA isolation — external review handoff

Review branch: `review/qa-isolation-gate-20261009`.
Base `main`: `717375eee1e99d558af80eca91a7ea7e829edd20`.

## Authority and scope

This is a **review-only**, unapproved full-batch checkpoint. It does not authorize merging, deploying, migration activation, native login/account creation/reset, live E2E, load, provider settings, or writes. The previously blocked independent review was not repeated. The external reviewer supplies the missing verdict; local SQL/SDK approvals cannot clear it.

Current code covers account provisioning/linking, private password/session operations, isolation, actual-I/O deadline/pending custody, scoped cleanup, and preparation for native role/load work. Keep all existing roles/memberships/overrides/current aliases and protected `faisal` state. No credentials or database files are included. Source fixtures generate dummy transport material in memory; they are not real credentials or native Auth proof.

## Missing independent disposition

Review `scripts/accounts-create-originals.mjs`, `scripts/accounts-provision.mjs`, associated `tests/accounts_*`, and `scripts/qa-load-preparation/` against `docs/auth/ACCOUNTS_SPEC.md` and the final contract in `docs/transactions/LOAD_TEST_2026-10-04.md`.

The required external disposition must address official paginated Auth inventory/duplicate prevention, exact existing identity linking and current registry snapshots, synchronous durable exclusive reservations across restart, unknown write/no-repeat recovery, physical mutation/delivery settlement versus caller timeout, candidate custody/destruction/one-time delivery, protected accounts/non-target preservation, source-bound fresh inventory and independently authentic approval, and completeness of the future official adapter.

For load/E2E preparation, distinguish synthetic fixture journeys from actual product/native Auth. Check distinct UID/SID and ownership proof, final50×50, measured transport/body completion rather than queued Promises, independent ramp/drain/timeouts/metrics, provider-limit handling without evasion, exact owned cleanup and all missing native implementation. `cleanup.mjs` is a planner, not a provider mutation executor; do not infer complete native E2E or cleanup from the local fixture.

Return explicit scoped `APPROVED` or concrete minimal remaining findings with file/line, source hashes and reproducible owned-local evidence. No live/provider operation is needed or authorized by this handoff.

## Executed local evidence

- Current offline account suite:161passed/0failed/0skipped/0todo with networking denied. Set `TMPDIR` to an explicitly owned scratch directory before running the suite; absentTMPDIR gives setup TypeErrors, not a product assertion.
- Current complete password/session/SDK Edge suite:108passed/0failed/0skipped/0XFail, using cached pinned SDK and only guarded loopback PostgreSQL.
- Current five Edge entrypoints typechecked. All ten packaged load-source JS files pass syntax checks. **No local or native50×50 workload was rerun for this push request.**
- Prior independent local SQL:all nineG/Pfindings closed. Prior independent local SDK:346finalcases;22catalogassertions;fiveentrypoints. These remain scoped local evidence, not native/executor approval.

Reproducible offline account command (Node26.7.0 used):

```sh
node --import ./tests/accounts_executor_deny_network.mjs --test --test-reporter=tap tests/accounts_create_originals.mjs tests/accounts_provision.mjs tests/accounts_executor_safety.mjs
```

Native SQL/SDK fixture cases require an explicitly owned, identity-guarded loopback adapter through `QA_TRANSPORT_ADAPTER`/`QA_LOCAL_PG_MODULE`, or the documented test fixture dependencies. No local databases, adapters tied to the owner's machine, connection strings, raw captures or Hermes cache are supplied. Do not connect to the production project to make a missing fixture pass.

## Evidence and packaging

`evidence/*.sanitized.json` are field-allowlisted derivatives, not raw reviewer output or substitute verdicts. They preserve original reviewer report hashes, exact input source hashes, counts and limitations; full originals and failures remain local. `evidence/source-manifest.sanitized.json` lists the intended changed paths and hashes of LF-normalized Git blobs, separately from original reviewer exact-byte hashes.

Existing load preparation source was packaged from the local working artifacts. Only five verifier input paths were changed from machine-specific paths to repository-relative URLs; README adds the review-only boundary and generated files are ignored. No preparation algorithm/limit was redesigned.

Commit prefix `[CF-Pages-Skip]` prevents the configured automatic Pages preview build; GitHub Pages and Cloudflare Production remain on `main`. No configuration mutation, PR or merge is part of this task.
