# Composed real-PostgreSQL shard: BLOCKED, not acceptance

Executed final diagnostic command:
`node --experimental-vm-modules scripts/qa-load-preparation/lifecycle.fence-integrated.test.mjs`
Exit 1, PostgreSQL 17.2, own loopback port 62909, own database qa_fence_integrated.

Current migration order: 100/150/180/185/190/195/bounded200/205/control/fence.
Full200 activation remains SQLSTATE 55000. Native FK constraints were not removed.
The inherited historical predecessor normalization is fixture setup, NOT replay of the production migration chain.

Product blocker: `owned-control.sql:84-93` rejects the actual bounded200 table
`app_private.qa_core_provision_context` (`20261008020000...sql:776`) and the prerequisite
fixture tables `public.legacy_archive`, `public.migration_gate`, `public.migration_receipts`,
`public.workspace_edits`, `public.workspace_versions`. Actual SQL captured these six
unsupported relations. Do not remove these sources/relations or broaden the closed
catalog to manufacture a pass. Product-owner review and metadata attestation are needed.

All14 mandatory cases and the57-resource lifecycle remain UNEXECUTED. The cases and child
files are unexercised fixture scaffolding, not working acceptance evidence. They also
still need the requested concurrent native CAS and genuine PW/Core producer/reentrant
coverage. The foreign-reference fixture path is unverified; never disable product guards
to admit it. Unknown-journal settlement and full dependent-resource receipt coverage are
not proven. Do not infer SDK/provider acceptance from this blocked SQL installation.

Final gateway source hash equals the parent's baf87ca9... pin. Trusted TEST-only installer
sets gateway_metadata from actual safe role fields/membership edges and recomputes the
catalog digest. It does not create platform roles or change Auth-provider settings.
SDK network is replaced at the isolated VM fetch boundary, with synthetic F3 authority;
this is expressly not native-provider or activation authority.

A fixture diagnostic ROLLBACK patch occurred after final import; REPORT records loaded
and final on-disk hashes separately. Shared product inputs did not change during that
final diagnostic run. All13 accepted normalized input hashes match CONTRACT.json.

Own databases were dropped with count-zero readback, own servers stopped with pg_ctl
status exit3. The initial timeout-interrupted cluster was independently recovered solely
for exact own-database disposal; see INTERRUPTED_CLUSTER_DISPOSAL.json. Never touch
shared ports51771/52512. No live requests, Auth/reset, deployment, Git commit/push/merge.

Before any future authorized run choose a NEW disposable directory; the runner refuses
an existing cluster rather than resetting it. Its hardcoded pgdata-run4 has already been
used. Change only fixture configuration after the product-owner repair, then freeze all
sources before execution. Do not treat this stop as the parent's final regression gate.


## Single low-memory native attempt: INFRA RED retained

The TEST-only integrated wire adapter now rejects unexpected end/close and native
FATAL/startup errors once, bounds startup/query by10s/15s (SQL remains12s/lock3s),
destroys its socket on uncertainty, and never awaits startup in close(). Owned
sockets are tracked for final disposal; no SQL completion/cancellation is invented.
Seven owned fake-TCP seam regressions were RED7/7 then GREEN7/7 with zero skips.
The fake endpoint is not PostgreSQL/provider acceptance. Mandatory deferred
admission waits also race the actual coordinator result rather than hanging.

Exactly one fresh local PostgreSQL17.2 attempt used port63143 and
`integrated-native-final/pgdata-lowmemory-one`, with shared_buffers16MB,
max_connections12, max_worker_processes0, autovacuumoff and jitoff. No Windows,
system, original FK, product SQL, adapter/coordinator or accepted-source edits.
The terminal tool interrupted execution at420s before a final runner result.
A single bounded owned identity/diagnostic read subsequently failed with server
connection closure; server.log captured backend9636 and startup15956 failures
0xC0000142 at2026-10-09 18:39:34GMT and startup abort. Root cause of the earlier
execution stall is unestablished; neither transport regression passes nor the
subsequent native failure proves physical SQL settlement or a product defect.

No retry, no unverified DROP. The new server is stopped (pg_ctl status3); its
database is retained. The older stopped third cluster was untouched. Unowned
roots28324/23116 on51771/52512 remain running and untouched.
All14 mandatory cases and the57-resource terminal-zero result remain unverified.
Exact evidence: `integrated-native-final/REPORT.json`, server.log,
OWNED_FINAL_DISPOSAL.json, transport-RED.log/transport-GREEN.log and source-boundary
receipts. Prior integrated-final INFRA RED receipt remains unchanged.
