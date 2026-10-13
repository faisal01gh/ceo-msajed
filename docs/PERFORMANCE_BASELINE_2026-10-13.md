# Performance baseline — new system only — 2026-10-13

## Current live continuation — 2026-10-14 — BLOCKED

The accepted runtime is main `f3762ca8301650aa719f0dcb15171cc2d80f95e7`. `transactions-api v39` was actually deployed once and its complete live source matches main; JWT remainedfalse. `session-logout v4` source body matches with a declared provider terminal-LF difference and was not redeployed. The denied assistant session is not the correct authorized native Chrome session; native access is now verified. No frontend source/deployment changed, no SQL proposal was applied, and no speculative optimization was added.

Protected LIVE Startup/List/Tabs/Pagination/Search/Filters/Details/«بياناتي» remain **BLOCKED / NOT MEASURED** because no usable ownership-proven QA browser session was obtained. Existing manual QA8 are confirmed/linked/active,4 require password change; private credentials are not publication artifacts. The canonical app has no saved QA vault login and the secure-save request was declined. No Auth create/reset/change or business write was performed.

New actual public-only v39 health30: min269.38 / avg395.43 / p50388.67 / p95445.28 / p99582.11 / max582.11ms, nearest rank. Sequential curl per-process HTTPS totals include DNS/TCP/TLS/network/provider response, not Auth/DB/business latency. Do not claim controlled code-speed BEFORE/AFTER from the earlier/current public distributions. Full current report: `docs/LIVE_VERIFICATION_2026-10-14.md`.

All earlier measurements below retain their original local/public methods, dates and limits. They are not fresh authenticated native acceptance. The earlier statement that performance source is NOT DEPLOYED is superseded only for the actually verified v39 backend payload; native protected performance is still unproven.

## Historical authority and acceptance boundary


Repository `faisal01gh/ceo-msajed`; project `msajed-ceo-erp` / `movzojtnkkmdsjhmlgtq`.
Release candidate `review/new-system-release-closure-20261013`, base main `dc4b0df3449e0ce0dec7f045e49c9e5fe956842a`.
Security source transferred from `cd6297ffca5fde98a7dbbc655b48ff6b23e5a290`: two functions and three directly related test files only. Canonical QA remains separate archived evidence; no Migration200, old executor or QA-isolation migration import.

**PERFORMANCE TARGET = PARTIAL**: local controlled budgets pass; full normal-connection/native Auth/list/action latency is **LIVE_PERF_MEASUREMENT_PENDING**. This is not E2E, Native QA or Load50x50. Current security live-source PASS / versions v38 and v4 is Faisal-supplied verified source evidence, not acceptance of undeployed performance changes or a live behavioral test.

## Methods (actual execution, not fabricated data)

- Real Chromium153 and actual app.js/DOM/event handlers; generated80staff/160transactions; only external fetch boundary substituted. Each A–K path:30timed samples per phase,3separate warmups; fresh browser context per sequence. Zero external requests/page errors.
- Parent-final runs use Node26.7.0 and **identical final harness hashes** for BEFORE and AFTER. BEFORE uses immutable original source; AFTER matches current assets. Earlier Node24 owner receipts remain intact but are not substituted for the final pair. Source snapshots/hashes, raw samples and commands retained outside Git.
- Client total includes actual browser scheduling and UI completion. `postResponseToUsableMs` includes continuation/DOM/layout and two animation frames, **not isolated render CPU**. Separate native synchronous render probes exclude paint. Synthetic transport time is not Internet RTT, server time or DB time. No arbitrary sleeping or latency injection.
- B is a warm already-loaded list screen, not a cold list RPC. E includes the actual300ms debounce. J includes local response and the required list/UI continuation, not a real transaction or provider acknowledgement.
- Actual cached SDK and Edge handler with synthetic transport:30samples per path; observed zero-latency microtask response batches are not real-network dependency waves. Actual SQL runs: PGlite0.5.9 with canonical source function definitions/private ACLs and generated80staff/120transactions/2880routes. No real identity seeds, old business data, Migration200 or historical QA replay.
- All percentiles use nearest-rank `ceil(n*p)`; min/avg/p50/p95/p99/max reported in milliseconds. SQL top-level statements are counted; nested helper invocations are explicitly UNMEASURED.

## BEFORE / AFTER — client totals (ms)

Columns inside each cell: **min / avg / p50 / p95 / p99 / max**.

| Path | BEFORE | AFTER |
|---|---|---|
| A Login → first usable (local fixture) | 66.00 / 70.95 / 68.50 / 85.20 / 106.20 / 106.20 | 53.30 / 60.77 / 59.50 / 69.30 / 69.40 / 69.40 |
| B Warm transactions screen (already loaded) | 22.40 / 26.34 / 25.80 / 31.20 / 31.20 / 31.20 | 19.00 / 23.64 / 22.10 / 29.60 / 32.20 / 32.20 |
| C Tab | 25.30 / 31.11 / 30.90 / 34.90 / 49.20 / 49.20 | 28.30 / 31.93 / 31.20 / 37.50 / 42.10 / 42.10 |
| D Pagination | 24.50 / 29.55 / 29.20 / 32.50 / 39.70 / 39.70 | 22.80 / 29.71 / 29.40 / 35.10 / 41.30 / 41.30 |
| E Search (includes real 300ms debounce) | 322.20 / 330.74 / 330.30 / 339.60 / 346.10 / 346.10 | 319.40 / 327.56 / 326.80 / 337.30 / 350.70 / 350.70 |
| F Filter | 21.40 / 27.52 / 26.70 / 35.40 / 39.00 / 39.00 | 18.90 / 26.84 / 27.50 / 35.00 / 36.60 / 36.60 |
| G Transaction details | 28.30 / 33.55 / 32.90 / 43.00 / 43.50 / 43.50 | 29.00 / 36.50 / 33.00 / 44.10 / 44.40 / 44.40 |
| H Permissions section | 24.70 / 34.98 / 35.90 / 37.70 / 38.80 / 38.80 | 25.30 / 35.63 / 36.10 / 38.50 / 39.00 / 39.00 |
| I My profile | 29.70 / 31.54 / 31.50 / 32.60 / 32.80 / 32.80 | 28.70 / 31.43 / 31.50 / 32.60 / 33.40 / 33.40 |
| J Local write + acknowledgement/UI refresh | 26.00 / 31.73 / 32.20 / 40.90 / 43.30 / 43.30 | 26.20 / 32.68 / 32.90 / 38.80 / 40.70 / 40.70 |
| K Required list refresh | 23.70 / 28.11 / 26.80 / 31.60 / 31.80 / 31.80 | 23.70 / 27.76 / 26.70 / 31.30 / 31.70 / 31.70 |

### Separate render CPU

| Probe | BEFORE | AFTER |
|---|---|---|
| renderTable | 5.00 / 5.61 / 5.50 / 7.00 / 7.20 / 7.20 | 2.00 / 2.34 / 2.30 / 3.30 / 4.20 / 4.20 |
| renderListOnly | 5.00 / 5.42 / 5.30 / 6.80 / 6.80 / 6.80 | 1.60 / 2.04 / 1.80 / 2.80 / 3.80 / 3.80 |
| renderApp | 5.50 / 6.11 / 5.90 / 7.70 / 9.80 / 9.80 | 2.10 / 2.70 / 2.50 / 4.40 / 4.70 / 4.70 |

## Payloads and round trips

No payload or query-count reduction is claimed for unchanged paths. Body bytes are UTF-8 decoded bodies, not HTTP/TLS wire totals.

| Path | Request count BEFORE → AFTER | Response body bytes BEFORE → AFTER |
|---|---|---|
| A Login → first usable (local fixture) | 6 → 6 | 44373 → 44373 |
| B Warm transactions screen (already loaded) | 0 → 0 | 0 → 0 |
| C Tab | 1 → 1 | 21872 → 21872 |
| D Pagination | 1 → 1 | 21901 → 21901 |
| E Search (includes real 300ms debounce) | 1 → 1 | 21872 → 21872 |
| F Filter | 1 → 1 | 21883 → 21883 |
| G Transaction details | 2 → 2 | 2094 → 2094 |
| H Permissions section | 1 → 1 | 58855 → 58855 |
| I My profile | 1 → 1 | 181 → 181 |
| J Local write + acknowledgement/UI refresh | 2 → 2 | 21894 → 21894 |
| K Required list refresh | 1 → 1 | 21883 → 21883 |

Boot retains three concurrent RPCs (`transaction_directory_my`, `list_my_transactions`, `my_permissions`), default page_size50/cap100. Six total requests in local login-to-usable sequence include resolution/Auth/profile stages; they are not six serial boot RPCs. Directory/permission metadata already avoid per-pagination reload; no unnecessary Bootstrap RPC or second caching authority was added. Backend remains fresh mutation authorization authority.

## PostgreSQL source profiling and unapplied index comparison

The following AFTER runs applied proposals **only inside owned synthetic PGlite**. They are not deployed DB optimization results.96semantic cases match byte-for-byte across roles, scopes, permission overrides, inactive/forced accounts, filters, tied ordering, pages, read/custody state; complete actual EXPLAIN(ANALYZE,BUFFERS) retained.

| SQL path | BEFORE min/avg/p50/p95/p99/max | AFTER min/avg/p50/p95/p99/max |
|---|---|---|
| list | 57.63 / 63.42 / 61.42 / 74.03 / 80.28 / 80.28 | 54.55 / 57.73 / 56.07 / 67.30 / 70.93 / 70.93 |
| tab | 53.03 / 57.52 / 57.02 / 63.57 / 66.52 / 66.52 | 49.96 / 54.74 / 52.89 / 62.54 / 76.44 / 76.44 |
| pagination | 56.84 / 58.97 / 57.99 / 63.17 / 72.89 / 72.89 | 53.74 / 57.56 / 55.35 / 74.10 / 75.58 / 75.58 |
| search | 56.89 / 61.82 / 60.74 / 68.94 / 90.14 / 90.14 | 53.85 / 56.10 / 55.29 / 63.12 / 67.66 / 67.66 |
| filter | 56.83 / 60.27 / 59.87 / 65.87 / 68.22 / 68.22 | 54.20 / 57.34 / 56.55 / 61.18 / 65.44 / 65.44 |
| directory | 3.10 / 3.40 / 3.35 / 3.74 / 3.85 / 3.85 | 2.97 / 3.35 / 3.31 / 3.83 / 3.83 / 3.83 |
| permissions | 1.25 / 1.48 / 1.45 / 1.82 / 1.85 / 1.85 | 1.20 / 1.42 / 1.45 / 1.70 / 1.72 / 1.72 |
| profile | 0.45 / 0.56 / 0.52 / 0.79 / 0.79 / 0.79 | 0.45 / 0.55 / 0.52 / 0.83 / 0.94 / 0.94 |
| details_flags | 0.72 / 0.91 / 0.82 / 1.21 / 1.22 / 1.22 | 0.67 / 0.92 / 0.87 / 1.33 / 1.38 / 1.38 |
| latest_route | 0.48 / 0.63 / 0.61 / 0.86 / 0.89 / 0.89 | 0.48 / 0.65 / 0.54 / 1.10 / 1.84 / 1.84 |
| actor_fk | 0.31 / 0.38 / 0.34 / 0.57 / 0.61 / 0.61 | 0.27 / 0.31 / 0.30 / 0.45 / 0.51 / 0.51 |
| read_state_fk | 0.28 / 0.33 / 0.30 / 0.43 / 0.45 / 0.45 | 0.24 / 0.28 / 0.27 / 0.33 / 0.34 / 0.34 |

SQL list50projection payload80274bytes; frontend model projection21872–21901bytes is a different fixture and must not be equated to SQL/native payload. Directory19357bytes, permission70bytes, profile152bytes are actual synthetic SQL outputs. Each top-level RPC measured one SQL SELECT; nested helper counts and actual PostgREST serialization/wire sizes are not measured.

### Index proposals — not applied live

- `idx_routes_latest_custody_read`: `(transaction_id, created_at DESC, id DESC)` filtered to non-`ceo_view` completed/accepted routes. Actual local EXPLAIN confirms elimination of extra latest-route sort; existing `(transaction_id, created_at DESC)` does not fully satisfy tied ordering/predicate. No routine/policy/permissions changed.
- `idx_account_password_operations_actor_id`: leading `actor_id` FK-support index.
- `idx_transaction_read_state_user_id`: leading `user_id` FK-support index.
- Formal Git proposals: `supabase/migrations/20261013190000_read_performance.sql`, `supabase/migrations/20261013190100_fk_indexes.sql`.
- **APPLIED = none** in Supabase. Local/source equivalence is not a fresh native catalog read: recheck native covering/equivalent indexes and online build/locking strategy before any separately authorized application. No unused index removed.

## Backend followup — actual paired SDK + owned loopback TCP

This second comparison is **pre-followup intermediate source** (permission reads already grouped) versus final candidate; it is not falsely presented as the original live v38 baseline. Initial serial-permission baseline/first optimization receipts remain under `backend/before/final` / `after/final`. Final followup alternates AB/BA on the identical real SDK/localhost harness,30samples each of9paths, no injected delay/sleep. Both phases contain the complete actualHTTP body lifecycle, equivalent responses/byte counts and retained traces.

**Measured dependency depth improves; local elapsed latency does NOT improve.** Socket/JS scheduling tails and regressions are retained below. This is not evidence of a native provider speedup. No query reduction is claimed: directory10, list11, details24, local mutation16 physicalHTTPrequests remain unchanged.

| Path | BEFORE min/avg/p50/p95/p99/max ms | AFTER min/avg/p50/p95/p99/max ms | Critical completion groups BEFORE → AFTER | Physical requests | Output body bytes |
|---|---|---|---|---|---|
| directory | 7.29 / 7.93 / 7.71 / 9.65 / 9.67 / 9.67 | 7.55 / 8.59 / 7.74 / 10.11 / 24.40 / 24.40 | 7 → 5 | 10 | 25189 |
| list | 7.71 / 9.14 / 8.39 / 16.49 / 16.73 / 16.73 | 7.99 / 10.09 / 8.52 / 21.90 / 22.93 / 22.93 | 7 → 6 | 11 | 1043 |
| tab | 7.35 / 8.61 / 7.91 / 13.49 / 14.13 / 14.13 | 7.78 / 9.47 / 8.23 / 15.86 / 30.21 / 30.21 | 7 → 6 | 11 | 1043 |
| pagination | 7.41 / 7.96 / 7.79 / 9.58 / 9.99 / 9.99 | 7.75 / 11.47 / 8.19 / 25.47 / 27.29 / 27.29 | 7 → 6 | 11 | 1044 |
| search | 7.44 / 8.57 / 7.95 / 11.98 / 19.14 / 19.14 | 7.67 / 10.59 / 8.40 / 21.40 / 33.19 / 33.19 | 7 → 6 | 11 | 1043 |
| filter | 7.51 / 8.98 / 8.23 / 11.38 / 20.48 / 20.48 | 8.01 / 9.96 / 8.52 / 18.28 / 26.21 / 26.21 | 7 → 6 | 11 | 1043 |
| details | 12.93 / 16.03 / 14.16 / 22.80 / 37.95 / 37.95 | 12.98 / 17.03 / 15.03 / 31.25 / 33.01 / 33.01 | 10 → 7 | 24 | 5312 |
| mutation_local | 9.24 / 11.79 / 9.82 / 23.69 / 25.00 / 25.00 | 9.66 / 12.40 / 10.19 / 24.39 / 34.83 / 34.83 | 13 → 11 | 16 | 571 |
| refresh | 7.43 / 8.18 / 7.71 / 9.25 / 16.57 / 16.57 | 7.56 / 8.93 / 8.17 / 10.27 / 25.40 / 25.40 | 7 → 6 | 11 | 1043 |

The actual native-Auth verification seam remains first in production source; the local SDK benchmark substitutes its transport response and does not claim native authentication. Session and context READ RPCs overlap only afterward; session-result then context/readiness check precedence retained. All permission lookups remain fresh with fail-closed errors before mutations. Directory and transaction access/flags overlap; error/visibility scope remains checked before data return. Opened-transaction child selects overlap; versions/notes still depend on actual returned actionIDs, never unscoped queries. Membership/units overlap before create writes, which remain sequential. No authorization cache or permission/Workflow change.

Final followup actual receipts: `backend/followup/final/paired-loopback-metrics.json`, final source SHA256 `6843e4b99a167aacd1b86daf29138a8285637e602db84c648cffbc9e703f48f2`. Parsed actual testcase leaves: focused security150/0failed; performance20/0failed; loopback43/0failed (do not use the handoff's erroneous root-tests=0 field when testcase leaves are present). Original REDs and all overwritten-harness/tooling attempts preserved separately.

No obvious independent read grouping remains under this unchanged API/permission/Workflow boundary. Further physical round-trip reduction would require a newly approved deployed RPC/target prerequisite and native measurement; this round does not silently introduce an unavailable RPC into active Edge code. Provider/database/network performance and larger synthetic scale are not inferred from these local cases.

## Live anonymous health baseline — separate evidence

Thirty sequential GET requests to the new project's public `transactions-api` health contract returned200/53bytes. No credentials, Auth, DB/business RPC or mutations. Nearest-rank results:

| min | avg | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| 348.04 | 556.62 | 425.93 | 1391.71 | 2865.62 | 2865.62 |

First/cold sample2865.62ms; observed edge response regions `ap-south-1` and `eu-central-2`. This measures **total external RTT including network/gateway/Edge**, not isolated provider latency, DB region overhead, source parity or cold user login. No useful server-timing split was available. Neither native BEFORE/AFTER action speedup nor a provider bottleneck diagnosis can be inferred from health alone.

## Bottlenecks, changes, and limits

1. Repeated Intl.DateTimeFormat allocation per row → reusable formatters, no record/permission caching and identical formatted output. Native render CPU reduction measured; whole-path tails did not improve uniformly and regressions remain visible above.
2. Modal action could look frozen → disable/status/aria-busy only for the selected button until actual request settlement; failure restores controls, no optimistic sensitive success or page freeze.
3. Fresh independent effective-permission reads grouped in Promise.all; precedence and fail-closed errors retained, no cross-request authorization cache. Physical query counts remain unchanged; zero-latency fake transport batches are not an Internet speedup claim.
4. Static cache URLs/service-worker namespace advanced to `20261013-release-closure-1` so the eventual separately authorized publication will not silently reuse old scripts. Asset cache tests assert no capture of external Auth/business or write traffic. No live cache mutation or publication in this round.
5. Latest route read still sorted despite an existing shorter index → additional measured partial/index proposal; FK proposals guarded by equivalence preflight. Live application is excluded.

### Remaining controlled/external work

- List security/custody helpers still evaluate eligible rows to preserve exact counts/scope semantics. Nested SQL cost not separately attributed; do not remove authorization logic to improve a synthetic result.
- Provider/network/gateway/real-DB latency and normal device/connection startup tails remain pending. No hidden animation substitutes for acknowledgement.
- Backend details retain24physicalHTTPrequests and no new read API; only dependency depth was reduced. Security/source/SQL/preparation independent review verdicts must pass on exact final files before commit/push; source verification remains separate from native readiness.

## Targets (not measured native promises)

| Path | p50 target | p95 target | Current acceptance |
|---|---|---|---|
| Initial usable |1500ms|2500ms|Local pass; native pending|
| Tab/pagination/search |500ms|1200ms|Local pass; native pending|
| Details |700ms|1500ms|Local pass; native pending|
| Final operational acknowledgement |800ms|2000ms|Fixture pass; native pending|

## Preparation, tests and barriers

Pagination, slim projection/no full-data loading, lazy transaction-scoped details, bounded query counts, no polling, no boot per mutation, no directory per page, fresh server authorization, stale-owner/credential generation protections have dedicated local regression tests. Current focused150security cases and new performance/local SQL/UI/cache/load-preparation modules are separate from historical QA; independent reviews bind exact current source before commit/push. No accepted historicalQA was automatically rerun.

Load harness `scripts/performance_load_harness.mjs` defaults PREPARE_ONLY; fixed new target,50distinct owned nativeUIDs/SIDs×50requests=2500future total, bounded pages/deadlines/body sizes and actual transport/body/status/percentile accounting. Preparation and small denied-network metric tests are not native load. Future execution still requires new Faisal authorization and fresh independent owned identity/session/profile/source/read-only RPC proof. No Auth creation/reset or live50×50 here.

`EDGE_RUNTIME_DRIFT_01 = OPEN`: exact full live source/log window/consumer proof for `source-reader` and `workspace-editor` remains missing. Source-only absence of literal calls (13runtime AST files,45dynamic boundaries unresolved) is not evidence of nonuse. Existing three-phase retirement design is preparation only; no live deletion/disable or workspace-table cleanup.

QA branch = ARCHIVED_QA_EVIDENCE; hardening branch = SUPERSEDED_BY_RELEASE_CLOSURE_BRANCH; no branch deleted. REAL AUTH PROVISIONING = BLOCKED (needs Faisal authorization). FULL MIGRATION200 APPLY = BLOCKED_BY_DESIGN (not pending). E2E = NOT_STARTED. Load50x50 = NOT_STARTED. Supabase writes = none in this source/performance round. Old system accessed = no. No main merge/deployment.

### Final local verification closure — review candidate only

- Independent frontend approval binds7files:25Chromium regressions,3asset-cache cases,2independent resubmission cases;30samples each A–K BEFORE/AFTER on the final identical harness. Existing85session-owner checks retained separately; no historicalQA replay.
- Independent Edge approval binds8files:150focused cases,43loopback cases (include the20backend cases),12additional cases =205distinct named cases.93current negative snapshots unchanged/zero mutation intents. Original150/23 and93+19 acceptance retained as historical source evidence, not repeated Native tests.
- SQL index equivalence corrections independently approved:42frozen scenarios and78independent scenarios, original24included;2parent tests/125steps/127JUnitentries are not127distinct business tests.3physical index definitions and accepted96semantic SQL cases per phase/49independentrole proofs unchanged. Formal proposals not applied live.
- Load preparation corrections independently approved:39unique cases;56executions per runtime include17repeated original cases, not112unique tests. Fixed-code input boundary, fresh owned proof admission, finite verifier/drain/cleanup deadlines and explicit unsettled IO (not false completion) validated only through bounded local fixtures. Captured fetch provenance and future external trust/gates still required before native activation.
- DefaultGitleaks raw code scan: exit1/one exact unchanged publicpublishable client literal; AST/sourcehash/pinned-main equality and provider documentation establish nonsecret semantics, no rules/path/detector suppression. Unresolved real secrets =0. Final complete/staged scans bind the containing docs and source snapshot before commit.
- Source/runtimereadiness separation: newperformance source **NOT_DEPLOYED**; indexes **NOT_APPLIED**; suppliedsecurity v38/v4source parity remainsaccepted as supplied only. Sourcecandidateapproval is not permission to deploy, change DB/Auth orstartnativeE2E/load.

## Evidence custody and reproduction

External root: `C:/Users/FAiSAL/ceo-msajed-qa-checkpoints/release-closure-performance-20261013/` (receipts only, no credential files committed).
Final frontend pair `frontend-parent-final/BEFORE/benchmark.json` / `AFTER/benchmark.json`; SQL pair `backend/before/canonical/sql-metrics.json` / `backend/after/canonical/sql-metrics.json`; original raw failures preserved separately. Current assets/harness hashes recorded; unchanged baseline manifests preserved.

Frontend repro: install/use Playwright+Acorn and a matching isolated Chromium; set `FRONTEND_PLAYWRIGHT`, `FRONTEND_ACORN`, `FRONTEND_CHROMIUM`, and **explicit external** `FRONTEND_PERF_ARTIFACT_ROOT` before `node tests/performance_frontend_benchmark.mjs BEFORE` / `AFTER`. Before may select immutable assets via `FRONTEND_PERF_SOURCE_ROOT`; existing results refuse overwrite. `node tests/performance_frontend_regressions.mjs GREEN`; `node --test tests/performance_asset_cache_test.mjs`. Do not run on real cookie profiles or native credentials.

Backend commands and original source/execution/library hashes are bound in backend/backend-result.json and followup receipts; execute cached-only and deny external network, except explicit owned127.0.0.1 loopback benchmark. No provider SQL or live EXPLAIN performed. Git review commits use `[CF-Pages-Skip]` first token; Cloudflare preview-all is configured, so exact skip and canonical Production readback required after push.
