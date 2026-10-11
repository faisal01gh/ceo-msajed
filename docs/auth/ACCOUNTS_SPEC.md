# مواصفة الحسابات وكلمات المرور

## إثبات Final Composed المحلي — 2026-10-10

تم التحقق من القسم الرسمي LOCAL VERIFIABLE SECTION محليًا، بينما بقي حاجز التفعيل غير المشروط في Migration 200 فعالًا. لم تُطبق Migration 200 كاملة، ولا يمثل نجاح الاختبارات تصريحًا بالتفعيل الحي أو الإنتاجي.

- المصدر الرسمي المحلي: 100 → 150 → 180 → 185 → 190 → 195 → 200 الكاملة **blocked_by_activation_guard** → قسم 200 **applied_for_local_test** → 205 → مصدر التركيب الرسمي 210 الذي أُجيز إضافته لهذه الجولة. لا إعادة CREATE ولا إضافة Guards يدويًا.
- تحقق فعلي محلي: Exact Composition **26/26**؛ Native Password **29/24/27/54**؛ Edge **108** حالة أصلية مع **11** وضع SDK مستقل؛ Step1 **7/7**؛ Typed **22/22**؛ Guard **6/6**؛ Durable Fence **14/14**؛ دورة **57** إنشاء/اختبار/تنظيف إلى صفر؛ Accounts **226/226**. الجهات الخارجية لـAuth/Edge/F3 في هذه Fixtures مصطنعة؛ ليست Auth أو E2E أو حملًا حيًا.
- Provenance لهذه النسخة: **162/162**؛ شملت 149 حالة عليا و13 مجس Metadata/SELECT محليًا على قاعدة Mechanics مستقلة في خادم WSL نفسه دون إنشاء خادم جديد أو تفعيل المنتج. المتبقي المراجعة المستقلة النهائية. **LOCAL VERIFICATION = PENDING FINAL GATES**؛ لا Commit جديد ولا رفع قبل APPROVED.
- دورة 57: Owned/Sessions/Password operations/Frames/Pending/Fences كلها صفر، وProtected snapshot مطابق. إخراج قواعد Fixtures ذات الملكية الدقيقة منفصل عن قبول تنظيف دورة المنتج.
- الحدود والـManifest والبصمات وقرارات الإقفال: `docs/transactions/QA_LOCAL_FINAL_COMPOSED_2026-10-10.md`. الأقسام بتاريخ 2026-10-09 وما قبله سجل إثبات تاريخي وليست صلاحية تشغيل حالي.


> التفويض الحاكم — 2026-10-10: استكمال QA محليًا من القسم الرسمي فقط، مع إبقاء Migration 200 الكاملة محجوبة بالتصميم. Commit/Push إلى `review/qa-isolation-gate-20261009` مشروطان بنجاح جميع الاختبارات والمراجعة المستقلة النهائية APPROVED. لا PR أو Merge أو Deploy أو تطبيق على Supabase؛ التفعيل الحي/الإنتاجي غير مأذون حتى بعد نجاح الإثبات المحلي.

المرجع المعتمد: 2026-10-09؛ القرارات غير المعدلة من مواصفة 2026-10-05 محفوظة. هذه المواصفة تخص النظام الجديد فقط، ولا تسمح بالاتصال بالنظام السابق أو استخدامه.

## الهوية والنطاق

- المستودع `faisal01gh/ceo-msajed`، الفرع `main`.
- Supabase `msajed-ceo-erp` / `movzojtnkkmdsjhmlgtq` فقط.
- الموظفون التشغيليون المعتمدون: 57. يُجرى جرد حي قبل كل عملية إنشاء؛ لا تُستخدم الأعداد التاريخية لاختيار حسابات الكتابة.
- `login_username` الرسمي هو الاسم الأول بالإنجليزية، ثم رقم عند التكرار: الأول دون رقم، والثاني 1 والثالث 2. القيم الحالية في القاعدة هي المرجع؛ ممنوع إعادة توليدها.
- السماح بالعربية والإنجليزية مقتصر على `abdullatif / عبداللطيف`، `faisal / فيصل`، `fahad / فهد`، `haif / هايف`، `abdullah / عبدالله`.
- بقية الموظفين يدخلون بالإنجليزية فقط. يبقى `preferred_login` العربي الداخلي كما هو لاستمرارية المعاملات والسجلات.
- حساب مدير المكتب `faisal` مستثنى من إعادة التعيين، وتبقى حالته المقبولة `must_change_password=false` دون تعديل كلمة مروره.
- الحساب المالي المعطّل وغير المؤهل الموجود خارج الموظفين الـ57 محفوظ دون تعديل؛ لذلك إجمالي Auth ليس بالضرورة عدد الموظفين المؤهلين.

## الربط غير الهدّام

1. مطابقة البريد `internal_email` مع جرد Auth حي ومُرقّم الصفحات.
2. إنشاء الهوية الناقصة فقط بالطريقة الرسمية في Auth؛ إذا كانت الهوية موجودة تُستخدم دون إنشاء مكرر.
3. تأكيد البريد وUUID الفعلي ثم الربط عبر `account_provision_link_internal`.
4. إنشاء/مزامنة profile وربط الدور والوحدات الموجودة وفق الأصل والإدارة/الفروع المعتمدة. التعارض أو الاسم المكرر تحت أصل خاطئ يوقف العملية؛ لا يختار البرنامج أول تطابق ولا ينشئ وحدة بديلة.
5. الحسابات المرتبطة مسبقًا لا يعاد بناء أدوارها أو عضوياتها أو overrides أو القيم الافتراضية لها.
6. الحسابات المشمولة بـCREATE/reset تحمل `must_change_password=true`؛ يبقى `faisal` مع `must_change_password=false` مستثنى. إعادة تعيين الحاليين المشمولين سابقًا لا تبدأ قبل QA reset حي ناجح وجرد جديد. حسابات `test_*` وQA/Canary لا تدخل في الموظفين الحقيقيين الـ57. مراجعة منفذ الحسابات المستقلة لازمة قبل اعتباره جاهزًا للكتابة.

## السياسة الخلفية

ثمانية Unicode code points على الأقل، وحرف ASCII كبير وصغير ورقم ورمز ASCII. التحقق الأمامي ليس حدًا أمنيًا.

إعداد Auth الأصلي المعتمد: الحد الأدنى 8، و`Lowercase, uppercase letters, digits and symbols`. تغيير Leaked Password Protection أو خطة الاشتراك أو إعدادات Auth الكبيرة الأخرى يحتاج قرارًا مستقلًا؛ ليس جزءًا من هذه المواصفة.

إنشاء الكلمات المؤقتة، إعادة تعيين مدير المكتب، والتغيير الذاتي يجب أن تستخدم المسار الخلفي الرسمي والسياسة نفسها. لا Service Role في العميل أو المستودع؛ يستخدم داخل بيئة التنفيذ الخلفية المصرح بها فقط.

## تغيير كلمة المرور وإعادة التعيين

- possession of token لا يثبت تغيير كلمة المرور. المسار القديم الذي يزيل الإلزام بعد Token فقط غير مقبول.
- Backend يتحقق من هوية Auth ومن `session_id` الفعلي قبل الاستدعاء الداخلي.
- إعادة التعيين تتطلب دور `ceo_office_manager` الفعلي النشط، وجلسة جاهزة، والصلاحية الفعالة `profiles.admin_reset_password` مع احترام deny. منح override لدور آخر لا يحوله إلى مدير مكتب.
- تحديث كلمة المرور وعلامتَي العملية/generation في `app_metadata` يتمان في طلب Auth Admin واحد. لا تحمل العلامتان كلمة المرور أو fingerprint لها.
- SQL لا يرفع الإلزام إلا بعد إثبات العلامتين المتوقعَتين. التغيير الذاتي يزيل علامتَي الإلزام معًا؛ إعادة التعيين تبقيهما true، وتنتج جلسة جديدة بعد التغيير الذاتي.
- النتائج غير المؤكدة تبقى fail-closed. لا إعادة كتابة عمياء أو انتهاء lease يسمح بالتجاوز. استعادة العملية تستخدم UUID نفسه والمرشح الأصلي فقط.
- نافذة إعادة التعيين تثبّت الكلمة الأصلية أثناء الاستعادة. Backend يرفض إعلان النجاح لمرشح مختلف أو عملية superseded، دون تكرار تحديث Auth.
- `my_profile()` يتيح للجلسة الفعلية الصالحة ذات الإلزام حالة استعادة محدودة فقط، دون الاسم/البريد أو صلاحيات العمل. المعاملات والدليل وRLS تبقى ممنوعة حتى اكتمال التغيير. الجلسة غير الصالحة تعود إلى تسجيل الدخول بدل شاشة إعادة المحاولة الدائمة.
- تسجيل Audit للعملية والفاعل/المصدر والنتيجة فقط؛ ممنوع كلمة المرور أو بديلها القابل للمقارنة في meta.

## الأسرار والتسليم

الكلمات المؤقتة مختلفة، ولا تدخل GitHub أو migrations أو كود التشغيل أو جداول التطبيق أو Logs أو Audit. تبقى في ذاكرة عملية التنفيذ أثناء الإنشاء/التحقق والتسليم الخاص فقط. قائمة التسليم ليست artifact من artifacts المشروع ولا تدخل Commit. لا محاولة استخراج كلمة المرور القديمة.

## الاختبارات وحدود الأدلة

- fixtures/PGlite واختبارات renderer تثبت السلوك المحلي فقط، ولا تعني Auth حيًا أو تطبيق ترحيل الإنتاج.
- الاختبار الحي يستخدم حسابات canary مملوكة ومحددة للاختبار الآمن فقط، على المشروع الجديد، ثم إزالة مواردها الدقيقة والتحقق من العودة إلى 57 موظفًا دون تغيير كلمات مرور الموظفين المسلّمة.
- الدور الحقيقي لمدير المكتب يُختبر بحساب canary مؤقت، لا بتغيير كلمة مرور `faisal` ولا اصطناع جلسة باسمه.
- اختبار HTTP النهائي المعتمد: 50 هوية Auth مستقلة وSID مستقل لكل منها ×50 طلبًا خلال نافذة واحدة، أي2500 إجمالي مع استهداف ذروة تقارب2500 طلب in-flight. Ramp منفصل والذروة تقاس عند النقل لا من Promises المنتظرة؛ قرائي قدر الإمكان بحسابات QA مملوكة لا كلمات الموظفين. تسجل Average/p50/p95/p99/Min/Max/throughput/status distribution/429/5xx/errors/error rate/timeouts وحدود المزود الرسمية دون تحايل.
- تحقق صلاحية service-role قبل طلب أعمال منفصل لا يثبت منعًا ذريًا لكتابة كانت قيد التنفيذ أثناء إعادة التعيين. لا ادعاء بذلك دون إدخال التحقق في المعاملة التشغيلية نفسها.
- بعد DB: Security/Performance Advisor، قراءة schema/grants/RLS، والتحقق من source/deployment/production parity كلٌ على حدة.

## سجل حالة التنفيذ السابقة — 2026-10-09

- الجديد فقط؛ الاستثناءات التشغيلية التاريخية للنظام القديم أدناه لا تنطبق على هذه الجولة.
- اعتماد مستقل محلي: SQL `G1–G5/P1–P4` كلها `CLOSED`، ومراجعة SDK/password/session `APPROVED` مع346 حالة نهائية دون فشل/تخطٍ/XFail. هذا ليس قبولًا حيًا.
- الانتقال الحي **محجوب** بسبب `content_policy_blocked` لمراجعة منفذ الحسابات/E2E/load المستقلة؛ لا حكم نهائي لها، ولا إعادة طلب أو تجاوز. حاجز `200` الكامل وجرد catalog الهدف الحي ما زالا منفصلين.
- تغييرات الحزمة محلية غير منشورة: Auth created=0 / Password resets=0 / عمليات الإنتاج=0؛ لم يتغير فيصل أو كلمة مروره. `57/57` وE2E7 و50×50 وCleanup/Advisors/النشر النهائي غير منفذة حيًا بهذه الجولة.
- التفويض الأحدث يسمح باستكمال هذه الأعمال تلقائيًا بعد إغلاق البوابات؛ المنع الحالي خارجي، وليس نقص موافقات جزئية. التفاصيل وحدود الإثبات: `docs/transactions/QA_LOCAL_GATE_2026-10-09.md`.

## سجل التنفيذ التاريخي — 2026-10-05

سياسة Auth الأصلية طُبقت وقُرئت مجددًا من صفحة المشروع؛ باقي switches وOTP لم تتغير. الجرد الحي قبل الإنشاء: 57 مؤهلًا، 10 مرتبطون، 47 غير مرتبطين، 11 Auth إجمالًا مع الحساب المالي المعطّل. اختبارات محلية: SQL 26، command 11، Edge token-only regression 1، transport 16، المكوّن 126.

core الترحيل وEdge قُبل مستقلًا، وطُبّق وقُرئ من المشروع الجديد. 8 service-only RPCs و37/37 restrictive RLS؛ protected identities وعدّادات الأعمال محفوظة. وظائف confirm v5 / reset v1 / transactions v35 ACTIVE وملفاتها مطابقة؛ ingress السلبي الحي مثبت فقط.

التفعيل الجماعي وE2E الحي وLoad وتسليم كلمات المرور ونشر مصدر التسليم النهائي لم تكتمل بهذه النتائج؛ تسجّل أدلتها النهائية في PROJECT_STATE/HANDOFF بعد التنفيذ الفعلي.

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

المراجعة المستقلة الجديدة مطلوبة وتشمل Completed Replay والمكتب17 وSQL/Composition؛ جميع Claims APPROVED السابقة تخص لقطاتها فقط. لم يُنشأ Commit/Push لهذه الجولة. Migration200 والـFence/FK/RLS/Password Guards وProduction Auth settings لم تتغير. لا Production connection أو مرحلة حية.
