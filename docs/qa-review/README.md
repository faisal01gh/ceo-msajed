# QA isolation — external review handoff

Review branch: `review/qa-isolation-gate-20261009`.
Base `main`: `717375eee1e99d558af80eca91a7ea7e829edd20`.

## Current local final candidate — 2026-10-10

All required local test groups have now passed, including official final composition26, native password29/24/27/54, Edge108 plus11 SDK modes, Step1 seven, Typed22, Guard6, Durable14, current lifecycle57 terminal-zero, Accounts226 and Provenance162. Provenance includes inert ABI SELECT-mechanics tests and is not product/native Auth approval. The independent final verdict on this changed candidate is pending; commit/push remains conditional on APPROVED.

Migration200 full-file remains blocked by55000; only its exact official local section was applied for testing. The admitted official210 source supplies the exact approved owned/reference/fence composition. No production activation, provider calls, real Auth/reset/E2E/load, PR, merge or deploy is authorized.

See `../transactions/QA_LOCAL_FINAL_COMPOSED_2026-10-10.md` for source/barrier/section hashes, manifest and gate classification. Existing evidence files below are historical scoped approvals for the published49d4371 checkpoint, not approval of these new bytes. The provider-blocked executor/live-readiness review is not retried or silently cleared by the new local review.

## Historical authority and scope — 49d4371

This is a **review-only**, unapproved full-batch checkpoint. It does not authorize merging, deploying, migration activation, native login/account creation/reset, live E2E, load, provider settings, or writes. The previously blocked independent review was not repeated. The external reviewer supplies the missing verdict; local SQL/SDK approvals cannot clear it.

Current code covers account provisioning/linking, private password/session operations, isolation, actual-I/O deadline/pending custody, scoped cleanup, and preparation for native role/load work. Keep all existing roles/memberships/overrides/current aliases and protected `faisal` state. No credentials or database files are included. Source fixtures generate dummy transport material in memory; they are not real credentials or native Auth proof.

## Missing independent disposition

Review `scripts/accounts-create-originals.mjs`, `scripts/accounts-provision.mjs`, associated `tests/accounts_*`, and `scripts/qa-load-preparation/` against `docs/auth/ACCOUNTS_SPEC.md` and the final contract in `docs/transactions/LOAD_TEST_2026-10-04.md`.

The required external disposition must address official paginated Auth inventory/duplicate prevention, exact existing identity linking and current registry snapshots, synchronous durable exclusive reservations across restart, unknown write/no-repeat recovery, physical mutation/delivery settlement versus caller timeout, candidate custody/destruction/one-time delivery, protected accounts/non-target preservation, source-bound fresh inventory and independently authentic approval, and completeness of the future official adapter.

For load/E2E preparation, distinguish synthetic fixture journeys from actual product/native Auth. Check distinct UID/SID and ownership proof, final50×50, measured transport/body completion rather than queued Promises, independent ramp/drain/timeouts/metrics, provider-limit handling without evasion, exact owned cleanup and all missing native implementation. This historical checkpoint did not prove the current executable cleanup. The new local candidate now exercises its exact owned two-phase cleanup against PostgreSQL and intercepted SDK transport; that remains local evidence, not native-provider E2E or activation permission.

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

## إصلاحات المراجعة المحلية النهائية — 2026-10-10

أعادت المراجعة الأولى SQL/Lifecycle نتيجة BLOCKED بخمس ملاحظات، مع APPROVED لنطاق Harness فقط. أُصلحت الملاحظات ضمن النطاق المحلي؛ لم تصبح الحزمة APPROVED بعد، والمراجعة المستقلة المحدّثة مطلوبة قبل Commit/Push.

- التحقق من شاهد ABI الأصلي195 يسبق أي Refresh في المصدر الرسمي210؛ اجتازت15 حالة Native محلية، منها رفض الانحراف بـ55000 مع Catalog/Data/Witness مطابقين بعد Rollback.
- أُضيفت13 نقطة تحقق Native لتغطية Password في حالات delete_prepared/auth_delete_unknown/db_finalize_pending. أثبتت المنتج المسموح قبل Fence، واستبعاد العملية القائمة/SID الحي من Prepare، واستحالة Admission بعده مع رفض إنشاء SID جديد بالـFence الحقيقي. لا يُنسب رفض Missing SID إلى تنفيذ Password Fence مباشر.
- Signed Plan يستخدم تسعة حقول مع بصمتي SQL؛ Full Primary Metadata وController Identity لهما مجالا Hash منفصلان. تتطابق Cleanup مع Run/Source/UID/Operation/Generation قبل Logout أو حذف، حتى عند Replay لإيصال مكتمل.
- اجتازت الشجرة الحالية Composition26، own-reset29، Frames24، Integration27، Transport54، Step1=7، Typed22، Guard6، SDK11، Native Edge13 وLogout2، Durable14، دورة57 إلى الصفر، Accounts226 وProvenance162. نتائج Edge95 غير المتأثرة محفوظة على المصادر نفسها، ليبقى الإجمالي108. اجتازت اختبارات Lifecycle Offline82؛ تتضمن30 Regression جديدة.
- Provenance162 يشمل149 حالة/مدخلًا أعلى و13 اختبار SELECT ميكانيكيًا بواجهات ABI خاملة؛ ليس تصريحًا لـAuth أو Product Guard حي.
- بقيت Genuine F3 رافضة لإعادة تفويض Run مكتمل بعد إزالة الحجوزات المؤقتة؛ نجاح Durable Mapping Replay المحلي لا يمثل قبولًا حيًا لهذا المسار ولا يُخفف سياسة Inventory.
- انقطاع Wrapper أثناء دورة57 حُفظ كدليل HARNESS TIMEOUT، لا نجاحًا ولا فشل Product. أُغلقت العمليات المملوكة، وصُرفت Fixture بإيصال دقيق؛ دورة57 الجديدة اكتملت في استدعاء واحد ذي مهلة مناسبة دون تغيير Production Timeouts أو إعادة DELETE غامض.

تم التحقق من القسم الرسمي LOCAL VERIFIABLE SECTION محليًا، بينما بقي حاجز التفعيل غير المشروط في Migration 200 فعالًا. لم تُطبق Migration 200 كاملة، ولا يمثل نجاح الاختبارات تصريحًا بالتفعيل الحي أو الإنتاجي.

FULL MIGRATION 200 APPLY = BLOCKED BY DESIGN (55000: qa_enforcement_not_ready). PRODUCTION ACTIVATION = NOT AUTHORIZED. لا Merge/Deploy/Auth حقيقي/Reset حقيقي/E2E حي/Load حي/اتصال إنتاجي.

## توقف الإقفال النهائي — يلزم قرار Completed Replay

المراجعة المستقلة المحدّثة أعادت Harness=APPROVED وSQL/Lifecycle=BLOCKED. أُغلقت SQL-FINAL-02 وLQR01/LQR02، وأُصلح قبول UID/Source غير مطابق في LQR03. بعد المراجعة أُضيفت تغطية المكتب المستقل:17/17 Native، مع SID للمكتب يبقى حيًا وReset مسموح قبل Fence ثم رفض بالـFence الحقيقي في delete_prepared/auth_delete_unknown، ورفض الهدف الغائب في db_finalize_pending. هذه الإضافة ناجحة محليًا ولم تحصل بعد على Re-review مستقل؛ لا يُحوّل ذلك verdict SQL السابق إلى APPROVED.

بقي Exact Completed Replay عبر Genuine F3 محجوبًا: المصدر يشترط57 حجزًا مؤقتًا عند وجود Run Receipt؛ Complete الرسمي يحذف تلك الحجوزات ويحتفظ بالإيصالات. الضبط الحالي يرفض بـruntime_provenance_denied قبل أي أثر. لم يُخفف ownedBinding، ولم يُضف Bypass أو تصريح Mutation جديد. يتطلب الإقفال اعتمادًا صريحًا لتصميم مسار Replay قراءة فقط بإثبات الإيصال المكتمل، مع إبقاء كل صلاحيات الكتابة وشروطها الحالية، أو تضييقًا صريحًا لمعيار القبول.

LOCAL VERIFICATION = BLOCKED (NOT APPROVED). FULL MIGRATION 200 APPLY = BLOCKED BY DESIGN. PRODUCTION ACTIVATION = NOT AUTHORIZED. لا Commit/Push جديد، ولا عمل مستمر في الخلفية أو مرحلة حية. جميع التغييرات والأدلة محفوظة؛ لا Reset/Clean/Restore.

## Completed Cleanup Replay — التفويض المحلي 2026-10-11

اعتمد المستخدم الفصل بين Incomplete Writes وCompleted Read-only. أُضيف createCompletedReplayGate مع Facade مستقل يعيد already_completed، دون Mutation brand أو SDK/Adapter/OwnedIO/Coordinator. ownedBinding والـWrite Gate وDurable Inventory validators الأصلية بقيت مطابقة بايتًا؛ غياب حجز/Fence/Operation مطلوب أثناء Incomplete يظل مرفوضًا.

اجتازت Genuine F3 Source Protocol54 (45 سلوكًا +9 Mechanical)، Lifecycle Offline82، Provenance Offline148 وAccounts226. فحص Imports الحقيقي وإغلاق GET/POST read-only وSELECT-only سجّل صفر Mutation primitives. Native Regression الحالي: Composition26، own-reset29، Frames24، Integration27، Transport54، Step1=7، Typed22، Guard6، SDK11/Native Edge13/Logout2، Durable14، Provenance162، والمكتب المستقل17/17. دورة Current57 الجديدة أنشأت/اختبرت/نظّفت57 إلى الصفر مع Protected مطابق.

لم يُثبت Positive Completed Replay على بيانات PostgreSQL المحمّلة: Probe إضافي رُفض قبل Replay لأن Inventory قرئ كـpostgres بينما Genuine F3 يشترط supabase_read_only_user. لم تُزوّر خانة readRole ولم تُمنح صلاحيات أو Memberships لتجاوز ذلك. هذا قصور Harness في دليل Native الإضافي؛ لا يُسجّل كنجاح ولا يعادل Native F3 activation. Genuine source protocol PASS لا يغطي هذا Positive غير المثبت.

شمل Completed Replay والمكتب17 وSQL/Composition؛ جميع Claims APPROVED السابقة تخص لقطاتها فقط. لم يُنشأ Commit/Push لهذه الجولة. Migration200 والـFence/FK/RLS/Password Guards وProduction Auth settings لم تتغير. لا Production connection أو مرحلة حية.

## واجهة القراءة العامة الرسمية — الحالة الحالية 2026-10-11

هذا القسم يُحدّث حالة الجولة السابقة أعلاه ولا يحذف إخفاقاتها التاريخية. أُضيفت Migration211 لأن رقم210 مستخدم بالفعل ومصدره محفوظ؛ لم تتغير Migration200 أو حاجز55000. الدالة العامة ثابتة SELECT فقط، SQL/STABLE/SECURITY DEFINER، مملوكة لـpostgres وبـsearch_path فارغ وACL على الدالة وحدها. لا Grants على app_private/auth أو جداولها، ولا ALTER ROLE أو Memberships.

أثبت Genuine F3 المركب فعليًا الدور supabase_read_only_user داخل Transaction READ ONLY، مع session_user=postgres. الإيصال المكتمل الصحيح والقراءة الثانية أعادا already_completed بعد حذف الحجوزات المؤقتة. نجحت13 حالة رفض Digest متوقع،13 حالة طلب غير مطابق،18 حالة Drift/بقايا في PostgreSQL و15 محاولة Mutation مرفوضة. جميع18 عدادًا صفر، لا Provider mutation، وFull snapshot قبل/بعد مطابق. هذه بيانات QA اصطناعية محلية؛ HTTPauthority/Provider/Edge/Deployment تبقى Protocol models وليست تشغيلًا حيًا.

Source Genuine61 يتضمن54 الأصلية؛ Lifecycle82، مكتب مستقل17، Durable14، Accounts226، Provenance162، ودورة57/57/57 بلا failed/skipped/xfail. استُكملت جولة Native regression الواحدة بالمجموعات الأصلية26/29/24/27/54/7/22/6، مع SDK11 وEdge native13 و45 حالة نقل منفصلة. لم تُعد المجموعات المقبولة عند تصحيح نقص جدول Auth في Fixture أو تحديث Oracle لقائمة المigrations إلى11؛ الإخفاقان محفوظان. صُرفت232 قاعدة Fixture بإيصالات ملكية دقيقة، والقاعدة الأساسية تملك صفر Owned/Sessions/Operations/Frames/Fences/Clients مع Roles/Memberships/ACL ثابتة.

LOCAL VERIFICATION = BLOCKED PENDING FINAL SECRET SCAN / INDEPENDENT REVIEW. لم تُعتمد التصنيفات غير المحسومة كأسرار مثبتة ولا كاستثناءات. لا Commit/Push قبل APPROVED مستقل؛ لا إعادة للمراجعة التي رفضها Provider تاريخيًا. FULL MIGRATION200 APPLY = BLOCKED BY DESIGN؛ PRODUCTION ACTIVATION = NOT AUTHORIZED.
