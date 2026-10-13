# Live verification — 2026-10-14 (Saudi Arabia, UTC+03:00)

## Current acceptance: BLOCKED

The release merge is complete and its unchanged frontend remains the previously verified Production frontend. The correct authorized native Chrome session restored Supabase access; this is **not** the previously denied assistant CLI/browser session. One approved backend performance payload was deployed and read back. Authenticated performance and full live permission/role acceptance remain unverified; this report does not declare `RELEASE VERIFIED`.

### Immutable boundaries

- Repository: `faisal01gh/ceo-msajed`.
- Approved runtime main: `f3762ca8301650aa719f0dcb15171cc2d80f95e7`; merged candidate: `350f5c6946bf3ca12f419e858b424faec87bfb75`.
- New project only: `msajed-ceo-erp` / `movzojtnkkmdsjhmlgtq`.
- Production frontend: `https://ceo-msajed.pages.dev`; previously verified canonical deployment `ed1ced44-bc74-4583-b273-feb623a28a8e`, cache `20261013-release-closure-1`.
- No frontend edits or new frontend deployment in this continuation. Prior exact served-byte/cache acceptance is preserved, not represented as a new run. These documentation changes do not change runtime bytes.
- `review/qa-isolation-gate-20261009` remains `ARCHIVED_QA_EVIDENCE`. Restored historical task lists do not reactivate its executors, three historical review findings, Migration200, native50×50 or original-account provisioning/reset.

## Verified live Edge source and configuration

| Function | Observed provider version | Deployment in this continuation | Source result | Actual `verify_jwt` |
|---|---:|---|---|---|
| `transactions-api` | 38 → 39 | One authorized deployment, approved immutable main payload only | MATCH: fresh provider-page hard reload and complete source copy, after clipboard CRLF transport normalization | false before and after; unchanged |
| `session-logout` | 4 | No deployment | MATCH of full source body; existing provider source omits one terminal LF relative to Git | false, read from exact function settings; not changed |

Source fingerprints:

| Source | SHA-256 |
|---|---|
| `transactions-api` Git and freshly re-read live UTF-8/LF source | `6843e4b99a167aacd1b86daf29138a8285637e602db84c648cffbc9e703f48f2` |
| `session-logout` Git source | `9b8c9e5dc5de772011159dd7123353c2b56c9a6f01df1b4ebe3848586500d370` |
| `session-logout` live UTF-8/LF source without Git terminal LF | `10b474497851a5f5968a73e1fa90403c3acca67f54d4d871313a369826cd4c86` |

The live v38 transactions source matched the previously approved security revision except the provider's omitted terminal LF. Its difference from main was the already reviewed/merged performance read parallelization, not an unexplained newer live edit. The complete proposed editor payload was copied back and matched main before deployment. A subsequent hard reload, cleared clipboard, fresh native selection/copy and full hash comparison verified the persisted v39 source; a potentially stale earlier clipboard result was rejected and is not the authoritative readback.

The exact provider `updated_at` timestamps were not exposed/read; function-list relative update labels and actual versions were observed. No timestamp is fabricated. The public health response contains a hardcoded application marker `version:34` in the approved code; it is not the independently read provider deployment version39.

`SUPABASE_SESSION_BLOCKED = RESOLVED_FOR_VERIFIED_NATIVE_MRABU_BROWSER`. This does not assert that the previously denied CLI credential became authorized.

## Safe live smoke and security evidence

Fresh execution against the unchanged current main produced **150/150 focused local security tests, 0 failures**, with external network denied. These are source/fixture tests, not native role/session acceptance.

Six actual live ingress probes passed: public health200; list/details/close without a session401; logout without a session401; and a hostile-origin request without a session401 with no reflected Allow-Origin. All used verified HTTPS, no credential or real user session, and no admitted business mutation. The harmless no-session close request used a synthetic identifier and stopped at the authentication boundary before business selectors/writes. These probes do not prove authenticated IDOR, expired valid-session behavior or successful session revocation.

Full downloaded/copied live source, including the excluded workspace engine module, passed the scoped default Gitleaks scan with zero findings. No source, role, permission, RLS, JWT, secret or business-workflow policy was changed for these tests.

## Native read-only database and existing QA evidence

Authorized SQL was copied back before execution and wrapped in `BEGIN READ ONLY` with a bounded statement timeout. Actual results:

- 19 Auth users; 8 carry `manual_test` ownership metadata.
- Public tables:37; RLS enabled:37; tables without a policy:0. This is catalog evidence, not proof of every policy's semantic correctness or a full ACL/private-schema audit.
- Existing manual QA:8 Auth confirmed,8 profile links,8 active profiles,8 registry links and8 eligible registry rows;4 still require a password change. The canonical links are `profiles.id = auth.users.id` and `account_migration_users.migrated_user_id = auth.users.id`.
- The initial profile projection incorrectly looked for `profiles.auth_user_id`; its null-link output was invalidated, not reported as a product defect. Only the corrected canonical-ID result is acceptance evidence.
- No named QA guard relations/functions were found by the scoped catalog query. This is not a claim that all possible isolation mechanisms were exhaustively ruled out, and does not authorize importing/applying the archived activation chain.
- The three proposed performance indexes were absent under their exact proposed names. Equivalent existing indexes were not exhaustively adjudicated in this continuation.
- An existing dedicated private Desktop handoff with8 temporary QA credentials was found. It was read only in memory for schema/count classification; no credentials were printed, attached, committed or copied into evidence. A file/count match alone is not complete current session/identity proof.

**Auth QA = BLOCKED.** No currently authenticated, ownership-proven usable QA browser session was obtained. The secure browser vault had no login bound to the canonical app origin; its one secure-save request was declined, so no further credential prompt or alternate secret-typing route was attempted. The current passwords of the four password-ready accounts were not verified. The four forced-change accounts were not reset/changed merely to bypass the gate. No Auth account, role, permission or QA transaction was created.

`REAL AUTH PROVISIONING = BLOCKED` under the current main boundary. Conditional permission to use an already approved mechanism does not resolve an absent provisioning/isolation decision. New identities, original47 provisioning, original9 resets and native50×50 remain excluded.

## LIVE performance

| Protected path | Result | Samples | p50/p95 |
|---|---|---:|---|
| Login → first usable protected screen | BLOCKED / NOT MEASURED | 0 | unavailable |
| List | BLOCKED / NOT MEASURED | 0 | unavailable |
| Tabs | BLOCKED / NOT MEASURED | 0 | unavailable |
| Pagination | BLOCKED / NOT MEASURED | 0 | unavailable |
| Search | BLOCKED / NOT MEASURED | 0 | unavailable |
| Filters | BLOCKED / NOT MEASURED | 0 | unavailable |
| Details | BLOCKED / NOT MEASURED | 0 | unavailable |
| «بياناتي» | BLOCKED / NOT MEASURED | 0 | unavailable |
| Role/permission variation; owned mutation | BLOCKED / NOT TESTED | 0 | unavailable |

Public-only measurements in milliseconds:

| Measurement | Samples | min | avg | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Public login screen, previous accepted run; not rerun | 30 | 560.40 | 1075.66 | 646.32 | 2706.77 | 2717.38 | 2717.38 |
| Anonymous health, previous run; v38 last known/supplied, not independently verified during sampling | 30 | 243.63 | 407.20 | 363.90 | 561.25 | 563.79 | 563.79 |
| Anonymous health, actual post-deploy v39 run | 30 | 269.38 | 395.43 | 388.67 | 445.28 | 582.11 | 582.11 |

The v39 method used30 sequential independent curl HTTPS requests with new per-process connections. Total includes DNS/TCP/TLS/network/provider response; health does not exercise authenticated DB/business work. Cumulative p95 boundaries: DNS11.125ms, TCP connect63.204ms, TLS115.805ms, pretransfer115.929ms and TTFB444.039ms. These are cumulative transport boundaries, not isolated Edge or DB latency; their independent percentiles must not be subtracted to claim layer percentiles. No controlled code-speed BEFORE/AFTER claim is made from the two historical/current health distributions.

No authenticated bottleneck was proved. Therefore no new speculative performance optimization, index or query/schema change was made. The deployed optimization is the already approved main read-parallelization payload; native improvement is still **NOT PROVEN**. Prior local browser/loopback timings remain local evidence only.

## `EDGE_RUNTIME_DRIFT_01 = OPEN`

The two named managed function source gaps are resolved as above. Broader historical runtime disposition is separate:

- `source-reader v1` and `workspace-editor v1` remain excluded `LEGACY_TRANSITIONAL_RUNTIME / NOT_APPROVED_FOR_NEW_SYSTEM_RUNTIME`.
- Their actual complete entrypoints were read from the new project's management UI; the workspace `change-engine.mjs` import was also read. Source contains legacy upstream references; no handler was invoked and no request was sent to the old system.
- Read-only provider invocation views reported: **No observed calls in inspected log window**. Each UI filter was `Last hour`: source-reader observed at `2026-10-13T22:17:53.9141552Z`; workspace-editor at `2026-10-13T22:19:24.8697516Z`. Exact query start/end values were not exposed by that relative UI filter. The source-reader execution-log view also reported no results.
- This limited window is not proof of never-use, retirement safety or permission to delete/disable functions or workspace tables. No excluded function was deployed, modified or deleted. The three earlier disabled-stub classifications were not independently re-read here.

## Static review and remaining hypotheses

Interrupted original frontend/backend review workers exited with code-15, no final verdict; their partial observations are retained and are **not APPROVED**. Source review observations are `STATIC_REVIEW_FINDING`, not measured native bottlenecks:

- Auth identity, fresh session/context and effective permissions precede business selectors; failed permission calculation does not yield an admitted partial identity.
- Search debounce remains300ms and transaction list requests are paginated; previous workers identified50-row pages and stale-response protection. No browser polling interval was found in the current `app.js` `setInterval` scan; that scan alone does not rule out every kind of recurring request.
- Opening Details can write read-state metadata. It must not be exercised on a real transaction under a nominal read-only QA label; owned isolated records and before/after effects are prerequisites.
- Reduced source wait groups do not establish fewer physical queries or native latency improvement. Full timing/trace collection needs the valid QA session.
- Historical workspace-table references in QA/catalog preparation are not current frontend consumption of the old Edge bridge and do not permit dropping those tables.

## Side effects and precise resume point

- New runtime/source edits in Git:0; one deployment of already approved `transactions-api` source; `session-logout` deployments:0; other function deployments:0; frontend deployments:0.
- Auth create/reset/change/session creation by this continuation:0. New QA data:0. Real business writes:0. Faisal's application account touched:no. Old system accessed:no.
- Performance migrations `20261013190000_read_performance.sql` and `20261013190100_fk_indexes.sql`: **PROPOSED_NOT_APPLIED**. Applied migrations:0; index deletions:0. Security/Performance Advisors were not rerun because no DB change was made.
- `Migration200 = BLOCKED_BY_DESIGN_NOT_PENDING`; do not reopen/apply the archived pipeline from a restored task list.

Resume by securely making one already-owned, password-ready QA account/session available through the canonical app's credential vault, then prove its current provider UID, canonical profile/registry links, ownership, role and permitted dataset before authentication or measurement. Do not use Faisal/a real employee, reuse a personal session, ask for credentials in chat, reset accounts or create replacement identities. Establish safe owned records before Details/mutations. Measure each available protected path with30 comparable samples, then diagnose bottlenecks from actual traces. Review retirement/disposition of the excluded legacy bridges separately; the empty one-hour views do not close that decision.

Do not repeat accepted merge/frontend publication or unchanged source tests solely to resume. Preserve original receipts and rejected projections/clipboard observations separately from final accepted evidence.
