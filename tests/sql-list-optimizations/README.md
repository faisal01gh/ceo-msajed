# Portable SQL list regression tests

Place this directory at `tests/sql-list-optimizations/` in the release repository. No installation is performed. Use Node **26.7.0** and the already approved **PGlite 0.5.9 public-fs-constants** module. The repository root defaults to two levels above this package; pass `--repo-root` for staging.

From the repository root, with `NODE` pointing to the approved executable and `PGLITE_DIR` pointing to its approved `@electric-sql/pglite` directory, this PowerShell command runs the suite:

```powershell
$pkg = Join-Path $PWD 'tests/sql-list-optimizations'
$repo = "$PWD"
$out = Join-Path $PWD 'test-results/sql-list-optimizations'
& $env:NODE --permission "--allow-fs-read=$pkg" "--allow-fs-read=$repo/supabase/migrations" "--allow-fs-read=$env:PGLITE_DIR" "--allow-fs-read=$out" "--allow-fs-write=$out" --import ./tests/sql-list-optimizations/offline-guard.mjs ./tests/sql-list-optimizations/run.mjs --repo-root $repo --pglite-module "$env:PGLITE_DIR/dist/index.js" --output-dir $out
```

For staging use the package's actual location, its relative preload path, and `--repo-root` pointing to the staged repository. The exercise's exact executed executable/argv are recorded outside this publishable directory in `COMMAND.json`.

The approved dependency uses public `node:fs` constants instead of permission-denied internal bindings. It is a compatibility adaptation, not permission disabling. Ordinary upstream PGlite is not asserted compatible with this restricted Node runtime. Keep the permission flags and network-denial preload. Child processes, workers, addons and WASI remain denied by Node; network constructors and fetch are denied by the accepted preload. There is no network, installation, native connection, Auth acceptance, performance acceptance, or release activation here.

`run.mjs` admits pinned regular repository sources and package hashes before creating any database. All migration SQL is read from actual repository files. The accepted generator extracts only DDL, function dependencies, policies and ACLs from canonical source; migration seed DML is never replayed. Fixture identities and business rows are synthetic. Six frozen nonsecret function definitions are installed **before** `20261013190200_list_requester_context.sql`, followed by actual fusion, statement-plan reuse, and `20261021194858_list_set_based_feedback_flags.sql` in order. Before/after comparisons intentionally install only the first three before the final migration.

The preserved slice runs 96 list cases twice, 24 same-backend cases twice, and eight scope counterexamples twice. It compares full list payloads, all 21 fixture function metadata/definitions, ABI/owner/ACL, complete protected catalog and synthetic table data, idempotence and inverse restoration. All four databases close in awaited finally blocks. `case-inventory.json` lists every case; `execution.json` records actual argv and counts. The complete fullfive and 53-function runs remain retained provenance, not fresh execution claims from this slice.

`provenance.json` binds original source bytes to portable bytes. Exact reversible filesystem/import changes are recorded in the external transformation receipt. `retained-acceptance.json` binds original real SQL RED/GREEN, SPEC/QUALITY, fullfive and full53 receipts by hashes. No new optimization RED is invented. `admit.test.mjs` covers the new source-admission behavior; its real RED/GREEN receipts are external. `PACKAGE_MANIFEST.json` is an immutable SHA256 inventory of package contents (excluding itself); changes require a reviewed manifest update. Repository pins are byte hashes, so silent SQL edits and line-ending changes reject.

This package is SOURCE/OFFLINE only. Parent review and transfer into the release candidate remain required; this task does not stage or modify product source.
