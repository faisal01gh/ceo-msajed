# Project State

## الحالة الحالية — 2026-10-27: نشر إصلاح اعتماد تعديل اسم المهمة

**LEGACY_RENAME_EDGE_DEPLOYED = PASS**

اكتمل نشر خدمة `ceo-task-rename` وحدها على النظام القديم `msajed-tasks` (`urgkbbconlxeagfgyjee`) بعد اعتماد فيصل الصريح. لم يعد النشر محجوبًا؛ تنبيهات عدم النشر أدناه سجل تاريخي لحالتها السابقة ولا تمثل الحالة الحالية.

### إثبات النشر والتحقق

- استجابة نشر Supabase ثم قراءة مستقلة للخدمة: **v2 / ACTIVE**، مع بقاء `verify_jwt=false` كما كان والتحقق الداخلي من الجلسة والحساب والدور والنطاق دون تغيير. وقت تحديث المزود: `1793091945702` مللي ثانية منذ Unix epoch.
- بصمة الحزمة المنشورة: `1cd7f39fe88c94db0145d06075389294da8e8f39ad92a16b41a12ab0444f9ffe`. أكدت قراءة المصدر المنشور إزالة إدراج `app_state_history` المكرر ووجود التحقق من النسخة التي يحفظها الـtrigger؛ بقي `index.ts` ومسار الخدمة وإعداداته القائمة.
- مصدر التصحيح المدمج: [PR #10](https://github.com/faisal01gh/ceo-office-tasks/pull/10)، commit `67baa62d569a5ad8cd12048f2075ede7bedf96a7`. مرجعا ملفات المصدر في Git: `index.ts` blob `06b610b90e4ac6716870fefdc5fce5321eb7a28e` و`core.mjs` blob `4a55f1f8fa1f1aacb67d77053a5db89260c351a2`.
- أُعيد تشغيل التحقق **بعد النشر** في [run 40299239172، المحاولة الثانية](https://github.com/faisal01gh/ceo-office-tasks/actions/runs/40299239172/attempts/2)، job `122102311704` بتاريخ 27 أكتوبر 2026. انتهى `LIVE_READ_ONLY_PASS` عند `09:08:41 UTC`؛ ليست هذه إعادة تسمية نتيجة 26 أكتوبر القديمة.
- اختبارات معزولة ناجحة: 153 تحقق PostgreSQL، 40 تحقق واجهة تعديل الاسم، 75 تحقق لوحة المساعد، و39 اختبار رجوع لمتابعة المكتب، إضافة إلى مسارات متصفح المكتب. بيانات الاختبارات مصطنعة فقط.
- التحقق الحي بعد النشر: ملفا الواجهة والملفات المشتركة الخمسة المفحوصة مطابقة لمصدر الاختبار؛ GET ناجح، وطلبات `request/decide/history` بجلسات مصطنعة غير صالحة أعادت 401، ورفض Origin غير مسموح اجتاز شرط 403. تهيئة صفحتي المكتب والقطاعات بلا جلسة وبلا أخطاء أو طلبات كتابة من المتصفح.

### حدود التنفيذ وحالة طلب المستخدم

- لم يُنفذ اعتماد بالنيابة عن فيصل، ولا تعديل مباشر لبيانات المهمة، ولا DDL أو تغيير Auth/RLS أو نشر على النظام الجديد. بقيت وظيفتا حماية الإجراءات وحفظ النسخة التلقائي مفعّلتين.
- القراءة اللاحقة بعد نشر الخدمة: الطلب الأصلي `6b906798-6205-43e0-9219-505fe9adf35c` ما زال `pending` بلا `decided_at` أو `decided_by`، والاسم القديم لم يتغير. قراءة `app_state` أظهرت `rev=18393`؛ تقدّم المراجعة أثناء نشاط المستخدم ليس ادعاءً بأن أداة النشر عدلت بياناته.
- **الإجراء التالي لفيصل:** إعادة فتح نافذة تحديثات القطاعات ثم الموافقة على طلب تعديل الاسم الحالي؛ لا حاجة لطلب جديد. لا يُدّعى نجاح اعتماد المهمة الفعلي قبل تسجيله لاحقًا من المستخدم.
- لا يلزم تحديث كامل للصفحة لتفعيل إصلاح الخدمة الخلفية، ولا تُحدّث صفحة تحتوي تعديلات غير محفوظة. الحظر السابق انتهى في هذه المحاولة عبر أداة النشر الأصلية المصرح بها؛ لم تُعطّل حماية لتجاوزه.
- لم يتغير ثابت `BUILD` القديم؛ إثبات v2 قائم على استجابة المزود وقراءة المصدر، لا على ثابت البناء وحده.

---

### سجل تاريخي قبل نشر v2 — 27 أكتوبر 2026: تكرر الفشل آنذاك

- صورة المستخدم بتاريخ 2026-10-27 أظهرت رسالة: «تغيرت البيانات أثناء التنفيذ: حدّث الصفحة وأعد المحاولة» عند محاولة اعتماد تعديل الاسم نفسه.
- قراءة `ceo-task-rename` من Supabase للمشروع القديم `urgkbbconlxeagfgyjee` يوم 2026-10-27 أكدت استمرار **v1 ACTIVE** وبصمة الحزمة القديمة `e0e0fb5be638b26d7e003d023ffb974d81a8e17a0f8fa5f3702754917062f9e1`، ووجود إدراج `app_state_history` المكرر. لم يحدث نشر Edge رغم دمج المصدر.
- سجل PostgreSQL يوم **2026-10-27 08:53:42.945 UTC** أثبت `SQLSTATE 23505` على `app_state_history_pkey` للنسخة `(ceo,18392)` من إدراج خدمة rename الصريح نفسه. في القراءة اللاحقة ظل `app_state.rev=18391` وأعلى نسخة history `18391`، ولم تبق نسخة فاشلة `18392`، وهو تراجع ذري متوقع وليس فقدان سجل.
- طلب التعديل الأصلي `6b906798-6205-43e0-9219-505fe9adf35c` بقي `pending` مع `decided_at=NULL` و`decided_by=NULL`، ولم يتغير اسم المهمة أو يسجل Audit اعتماد جديد.
- PR #10 دُمج في `ceo-office-tasks/main` عند `67baa62d569a5ad8cd12048f2075ede7bedf96a7` ونجحت اختبارات CI: https://github.com/faisal01gh/ceo-office-tasks/actions/runs/40299239172 ، لكنها **لا تعني تفعيل Edge**.
- لا تعاود الضغط على الموافقة قبل اكتمال نشر تصحيح الخدمة؛ إعادة تحميل الصفحة لا تعالج `23505` ما دامت الوظيفة القديمة تعمل. لا يُحذف الطلب ولا يُغيّر يدويًا؛ بعد النشر المعتمد يعاد الاعتماد بواسطة فيصل من النظام ذاته.
- **بوابة الإقفال:** نشر المصدر الصحيح لـ`ceo-task-rename` فقط من `ceo-office-tasks/main` (`supabase/functions/ceo-task-rename/index.ts` و`core.mjs`) مع المحافظة على إعدادات التحقق الحالية وبيئة الإنتاج دون أي DDL؛ ثم قراءة مستقلة لحزمة Edge لإثبات إزالة إدراج السجل المكرر، وفحص ردود رفض جلسة غير صالحة والـOrigin غير المسموح، ومراجعة حالة الطلب والاسم دون اعتماد تجريبي. لا تعتبر `GET /ceo-task-rename` أو رقم `BUILD` وحده إثباتًا لأن ثابت البناء لم يتغير.
- أداة نشر Supabase المتاحة من هذه المحادثة كانت قد حظرت محاولة النشر بفحص أمان. لا تُدّعَ عملية نشر جديدة دون إيصال مزود وتحقق قراءة لاحقة. **الحالة: HISTORICAL_SOURCE_MERGED_EDGE_PENDING / USER_APPROVAL_PENDING.**

## سجل تاريخي قبل نشر v2 — صيانة النظام القديم بتاريخ 2026-10-26

**النظام القديم `msajed-tasks`: HISTORICAL_SOURCE_MERGED_EDGE_PENDING.** اعتمد فيصل نشر إصلاح تعطل موافقة تعديل اسم المهمة. دُمج [PR #10](https://github.com/faisal01gh/ceo-office-tasks/pull/10) في المستودع القديم عند `67baa62d569a5ad8cd12048f2075ede7bedf96a7`، واجتاز [CI بعد الدمج](https://github.com/faisal01gh/ceo-office-tasks/actions/runs/40299239172). لكن أداة نشر Edge أوقفت عملية النشر بفحص أمان، وأكدت القراءة اللاحقة أن `ceo-task-rename` الحية ما زالت v1 تحمل الإدراج المكرر إلى `app_state_history`. لم تنجح محاولة اعتماد مهمة ناجي بن زارع، والطلب ما زال `pending`، ولم تتغير بيانات الإنتاج الحقيقي أو النظام الجديد.

**لا يُعلن PRODUCTION_RELEASE=PASS لهذه الصيانة.** يلزم نشر آمن مستقل ثم تحقق من مصدر Edge فعليًا؛ نتائج CI لا تثبت نشر الخدمة. التفاصيل: `docs/tasks/TASK_RENAME_APPROVAL_2026-10-13.md` وسجل التغييرات. لا يُعاد تنفيذ الموافقة بدل فيصل.

---

## الحالة الحاكمة — 2026-10-25: إقفال تجهيز الحسابات الرسمية

**ACCOUNT_PROVISIONING = PASS**

**LEGACY_MIGRATION = CLOSED**

هذه نتيجة تنفيذ وقراءة فعلية على `msajed-ceo-erp` (`movzojtnkkmdsjhmlgtq`)، وتعلو على أعداد ما قبل التنظيف وخطط التنفيذ التاريخية أدناه. بدأت الجولة 24 أكتوبر وأُغلق التحقق في 25 أكتوبر 2026 بالتوقيت السعودي. المصدر الرسمي هو `data/staff/staff-original.json` و`docs/org/STRUCTURE_DECISIONS.md` على أساس main السابق للتوثيق `7af8e3f9e93e2289036948c64bc72dc1ec4c5b48`.

### النتيجة الفعلية

| البند | النتيجة |
|---|---:|
| Auth قبل / بعد | 19 / 57 |
| Auth غير الحقيقية المحذوفة رسميًا | 9 = 8 QA + حساب مالي وهمي واحد |
| Staff Auth المنشأة / Auth الحقيقية المعاد تهيئتها | 47 / 9 |
| كلمة مرور فيصل تغيرت | NO |
| Registry / Profiles النشطة / إسنادات الأدوار | 57 / 57 / 57 |
| Memberships / Aliases المحفوظة | 62 / 225 |
| Credential-state rows | 57 |
| Forced-password-change: Profile / Registry | 56 / 56 |
| Registry بلا UID / Auth بلا Profile / Profile بلا Auth | 0 / 0 / 0 |
| Profile بلا دور أساسي / بلا Membership نشطة | 0 / 0 |
| أسماء دخول مكررة / بريد داخلي مكرر | 0 / 0 |
| Auth حقيقية محظورة / محذوفة / غير مؤكدة | 0 / 0 / 0 |
| حسابات QA المتبقية / الحساب المالي الوهمي المتبقي | 0 / 0 |
| جلسات لغير فيصل بعد التحقق / عمليات كلمات مرور معلقة | 0 / 0 |
| Transactions / Notifications | 0 / 0 |

- حُذفت الهويات التسع عبر Supabase Auth Admin، لا SQL مباشرًا على `auth.users`. بقيت UIDs الموظفين العشرة الأصليين. اسم الحساب المالي الوهمي في Auth كان `m-mali`، وهو السجل غير المعتمد المشار إليه باسم `finance_manager`؛ لا يعني ذلك حذف الإدارة المالية الحقيقية أو نطاقها المستقل.
- استُخدمت سجلات الموظفين الرسمية الـ57 وأدوارها ونطاقاتها؛ لم يُنشأ موظف خارج الملف ولم تُختصر Memberships المتعددة. بقيت الإدارة المالية مستقلة وفق القرار المعتمد.
- لم تتغير كلمة مرور فيصل أو UID أو الدور `ceo_office_manager` أو نطاقه أو صلاحياته أو aliases. لم يُستخدم حسابه في Login smoke. أُثبت ثبات بصمتي الاعتماد والجلسات دون نشر قيمهما.
- جُهزت 56 كلمة مؤقتة فعلية، عشوائية وقوية وفريدة، بطول 32 حرفًا؛ استُخدم lifecycle المعتمد للربط والتهيئة والإجبار على التغيير. لا كلمات مرور في المستودع أو الأدلة العامة.
- كانت المعاملات فارغة قبل هذه المتابعة وبقيت فارغة. فُحصت `transactions` و`notifications` والجداول التسعة التابعة الأخرى قراءة فقط وكلها 0. لم يُعَد حذف المعاملات أو تصفير ترقيمها، ولم تُنشأ معاملة Production للاختبار.

### التحقق الفعلي والتسليم الخاص

- `account-resolve`: جميع الحسابات 57/57 أعادت HTTP200 وحقولًا مطابقة للسجل الرسمي.
- Login smoke حقيقي للتسعة المعاد تهيئتهم، يغطي الأدوار الستة غير دور فيصل المحمي: Sign-in بالكلمة المؤقتة الفعلية؛ شاشة «تحديث كلمة المرور» على الواجهة الإنتاجية 9/9؛ حالة إجبارية ومنع جاهزية الأعمال 9/9؛ Global logout HTTP204 وNative revocation للجلسات 9/9. لم تُرسل عملية تغيير كلمة مرور، فبقيت كلمات التسليم المؤقتة صالحة. ليس هذا ادعاءً بتسجيل دخول الـ56 جميعًا.
- ملف XLSX النهائي محلي خاص فقط: 57 موظفًا و8 أعمدة و56 كلمة فعلية، وصف فيصل «كلمة المرور الحالية لم تتغير». طابق Excel الأصلي جميع 464 قيمة بما فيها العناوين، مع RTL واتجاه LTR للاعتماد، ودون Formulas أو روابط خارجية. حُققت صلاحيات الملف وانتهاء Excel المملوك. لم يُرفع الملف إلى GitHub أو Supabase Storage أو Cloud عام؛ مساره في التقرير الخاص لفيصل، لا في المستودع.
- Security Advisor: بقيت 5 ملاحظات baseline، دون إضافة. Performance Advisor: 16 بدل 20؛ اختفت 4 ملاحظات `unused_index`، دون Finding جديدة أو حذف أي Index. المقارنة بالاسم والمستوى وcache key وبصمة metadata canonical، لا الأعداد وحدها. لا تحسينات خارج النطاق لإخفاء baseline.
- Unified logs: HTTP200، تسعة مصادر و1476 حدثًا مرصودًا في النافذة المطلوبة `2026-10-24T20:28:51.996Z` إلى `2026-10-24T23:31:20.814Z`. صفر كلمات error/exception/fatal/panic أو HTTP5xx وفق predicates المنفصلة، وضابطا all/zero ناجحان. هذه قراءة نافذة تجميع المزود وليست ضمانًا خارجها أو قبل اكتمال وصول السجلات.

### إغلاق الاعتماد القديم — أثر محدد لا حذف مشروع

- `legacy-login` و`legacy-read` و`account-activate`: HTTP410 disabled، مع حفظ إعداداتها القائمة.
- كشف المصدر المنشور اعتمادًا قديمًا في `source-reader` و`workspace-editor`، دون استدعائهما بحالتهما القديمة. أُغلق المساران في المشروع الجديد فقط: كل منهما v1 إلى v2، باستخدام handler 410 المعتمد نفسه من `supabase/functions/legacy-login/index.ts`؛ SHA256: `937ca657de7d6b9a249b42322a4f737dc2bcff613d9cdafd3b1798e015848be2`. حُفظت الهويتان و`verify_jwt=false` وطابق المصدر الأصلي والكود المترجم handler المعتمد. هذا أثر Edge فعلي محدود، لا ادعاء بأن الجولة كلها توثيق فقط.
- بعد إثبات المصدر الخامل، نجحت GET وPOST للمسارات الخمسة على المشروع الجديد فقط: 10/10 HTTP410 `legacy_path_disabled`. بقيت metadata الدوال الاثنتي عشرة الأخرى دون تغيير؛ `transactions-api` v40 و`verify_jwt=false` ومصدره المقبول دون إعادة نشر.
- لا pg_cron مثبتًا، ولا ملفات Workflow في شجرة main الحالية. يعرض Actions API سبعة سجلات active: ستة لمسارات YAML غائبة عن main، وسجل Pages dynamic لبناء الموقع الثابت؛ لم تُشغّل هذه الجولة تلك السجلات أو تحذفها، ولا تُخلط metadata التاريخية مع ملفات Workflow الحالية. لا مرجع تشغيلي حالي في frontend أو دوال قاعدة البيانات أو Edge يعيد استخدام النظام القديم، ولا Workflow ترحيل حالي في main. لا Delta Sync أو استيراد معاملات أو إعادة تفعيل migration.
- `old system touched = NO`: لم تُرسل هذه العملية طلبًا إلى `urgkbbconlxeagfgyjee` ولم تكتب فيه أو تحذف مشروعه؛ يبقى Read-only مرجعًا فقط. لم تُعد LOAD50×50 أو API30 المقبولتين سابقًا.

**قسم المهام مؤجل ولا يبدأ بهذا الإقفال.** تحديث المستودع يقتصر على ملفات الحالة الأربعة ولا يغيّر ملفات Runtime أو migrations أو سياسات Auth/RLS/Workflow. أعمال Auth وإغلاق Edge المحدود أعلاه آثار تشغيلية منفصلة. لا تُعد تنفيذ تعليمات الحذف أو التهيئة القديمة.


---

## Historical — الحالة والقرارات قبل الإقفال، محفوظة دون إعادة تنفيذ

<details>
<summary>سجل تاريخي غير حاكم؛ الأعداد وخطط الحذف والتهيئة التالية ليست الحالة الحالية ولا إذنًا بإعادتها</summary>

# Project State

## 2026-10-24 — CLEAN CUTOVER APPROVED

الحالة الحالية: تجهيز النظام الجديد للتشغيل الحقيقي بعد نجاح إصدار المعاملات.

القرار الحاكم:
- حذف جميع بيانات المعاملات الحالية في `msajed-ceo-erp` وبدء المعاملات من صفر.
- إزالة الحسابات التجريبية/QA والسجل الوهمي غير المعتمد.
- تجهيز جميع موظفي الملف الرسمي (57) بحسابات Auth فعلية.
- كلمات مرور مؤقتة فريدة للحسابات الجديدة مع `must_change_password=true`.
- حساب فيصل الحالي يبقى دون Reset في هذه الجولة.
- إغلاق أي نقل/مزامنة/اعتماد دخول على النظام القديم؛ `msajed-tasks` يبقى Read-only فقط.
- المهام مؤجلة.

مرجع التنفيذ: `docs/CUTOVER_CLEAN_RESET_2026-10-24.md`.

---

## Historical — الحالة السابقة

# Project State — الحالة الرسمية للمشروع

## الحالة الرسمية الحاكمة — إقفال إصدار 23 أكتوبر 2026

**PRODUCTION_RELEASE = PASS**

أُغلق إصدار Production فعليًا؛ لم يعد مرشحًا نهائيًا ينتظر التفعيل ولا إصدارًا محجوبًا. هذه الحالة هي الأولى والحاكمة، وتتقدم على جميع عبارات `final candidate` و`release blocked` و`BLOCKED_PRODUCTION_RELEASE` القديمة داخل السجل التاريخي أدناه.

- **Merge/main عند إقفال الإصدار:** `8290bcbc8384db00cd02a51c42eb9d6bd1c17809` — PR #9 مدمج. هذا مرجع الإصدار التشغيلي، وليس SHA أي تحديث توثيقي لاحق لـmain.
- **Migrations الأربع: Applied** بالترتيب، مع مطابقة SQL المصدر في القراءة اللاحقة وعدم وجود migration جزئية:
  1. `20261013190200_list_requester_context.sql`
  2. `20261018182622_list_feedback_context_fusion.sql`
  3. `20261020193505_list_statement_plan_reuse.sql`
  4. `20261021194858_list_set_based_feedback_flags.sql`
- **`transactions-api`: v40 ACTIVE**؛ بقي **`verify_jwt=false`** كما كان، دون تغيير.
- **Production smoke: PASS** وفق دليل الإقفال السابق، وليس اختبارًا جديدًا في هذا التحديث.
- **Advisors:** بلا Findings جديدة مقارنة بالـbaseline المعتمد؛ الملاحظات السابقة لا تُعد أعطال إصدار جديدة.
- **LOAD50x50 المقبول: 2500/2500 على البيئة المعزولة**؛ ليست نتيجة حمل على Production ولم يُعد الاختبار.
- **لم يُستخدم حساب فيصل أو أي موظف حقيقي داخل التطبيق للاختبار.**
- دليل الإقفال التفصيلي: سجل Production النهائي في PR #9؛ لا يعيد هذا الملخص وصف نتائج سابقة بأنها فحوص جديدة.

### النطاق والحالة المستقرة

هذا تحديث توثيقي فقط: لا تعديل Runtime أو DB أو Edge أو Cloudflare، ولا إعادة اختبارات أو تفعيل أو نشر تشغيلي. يظل مرجع الإصدار التشغيلي أعلاه مستقلًا عن تقدم main بتوثيق فقط.

**قسم المهام مؤجّل رسميًا بقرار فيصل إلى وقت لاحق؛ لا يبدأ أي عمل فيه حتى توجيه جديد صريح. الحالة المستقرة: إصدار Production مغلق، ثم انتظار التوجيه التالي.**

---

## Historical — سجل تاريخي فقط، غير حاكم للحالة الحالية

كل ما داخل الحاوية التالية سجل لوقته، بما فيه عبارات المرشح النهائي والإصدار المحجوب ونقاط الاستئناف أو الخطوات التالية القديمة. لا تعيد هذه العبارات فتح الإصدار المغلق أو تفوّض بدء قسم المهام. حُفظ النص السابق كاملًا دون إسقاط تاريخه.

<details>
<summary>Historical فقط — فتح السجل السابق؛ لا يمثل حالة Production الحالية أو توجيهًا للعمل</summary>

## 2026-10-23 - final candidate from current main

Current base: `b88698c5a2073386408197afd5391e7fea704343`. Accepted runtime reference: PR #6 at `0178c717f8a58accda6ffedb61cff223b97af238`, originally based on `208ffad347a04a7bbbdcc48c5689d289f4070521`. Incoming main changes documentation only. Runtime/SQL/test bytes are compared with the accepted reference; documentation movement does not justify repeating 50x50 or 30-sample performance.

Latest legacy recovery/autosave notes and unresolved user-draft protection below are preserved verbatim. This operation does not modify the legacy system, reload its tabs or infer that an unsaved draft was recovered.

The 23 October instruction permits merge/publication only after all release gates and current target checks pass. Actual merge, backend activation and frontend publication require separate read-back receipts; this source does not predict their outcome.

Exact source/hash proof: `docs/verification/20261023-final-source-parity.json`. Final scan/review and publication receipts bind the immutable final tree externally.

### Historical accepted RC checkpoint - 22 October, not the current base

## 2026-10-22 — isolated list-optimization RC verification

- Base main: `208ffad347a04a7bbbdcc48c5689d289f4070521`; new review scope `review/rc-list-optimizations-20261022`. No Production deployment or main merge is authorized.
- **LOAD_50X50 PASS: 2500/2500 native HTTP200, 0 HTTP504/transport/unknown, peak2500, exit0/bothEOF, 50 logout204/global0.** Pool/timeouts unchanged; historical failed rounds retained.
- Native post-load Auth/scope/IDOR/RLS, owned Details/seen and 30 complete API samples passed. Four fresh current-main desktop/mobile six-gate journeys and six actual T1/T2 fault cases passed; same-pair/SID, supported logout and old-pair denial verified. Twenty-four stage geometry observations have zero missing/overflow/clipping/hit misses. Cache and CPU/RAM unavailable coverage are explicitly qualified.
- Four accepted SQL migrations, reviewed Edge parity transfer and portable25file package are included. Actual-destination128named/256executions/fourDBclosures and full-five/whole53 source/security evidence accepted; independent source SPEC/QUALITY retained. Official read-only Splinter33INFO/0WARN/0ERROR, no speculative DDL.
- Complete factual report: `docs/verification/20261022-isolated-list-optimizations.md` and its machine-readable summary. Fresh Deno remains NOT_RUN with preserved denial; historical SDK counts and old840 UI samples are not rebranded fresh.
- Full finalized-payload/staged-object secret scans, final independent review and remote Git parity are separate mandatory publication gates; this entry does not predict their results. Existing incoming documentation below is preserved unchanged.

---


---

## Incoming current-main document - preserved unchanged

# حالة المشروع الحالية

## 2026-10-15 — متابعة QA الذاتية: قيد أداة الاعتماد، لا نقص التفويض

- main عند البدء `7ecebe788a3497abaf9d1275e2ce60ab2b014ed7`؛ الفرع القائم `docs/qa-secure-session-boundary-20261014` عند `25b0474367e906c7153f5bf185928b9827377126`. لا إعادة نشر أو تحقق شامل للأجزاء المغلقة. هذه المتابعة بعد منتصف الليل السعودي، رغم اسم مرفق التفويض المؤرخ2026-10-14.
- تفويض فيصل الأحدث يسمح باستعمال الاعتماد القائم وReset أخير لـQA المحدد وحده، وإنشاء QA معزول فقط بآلية آمنة معتمدة، دون أي خطوة يدوية منه. هذا التفويض يتقدم على القيود التاريخية السابقة ولا يعمم على حسابات أخرى.
- وُجد حقل اعتماد قائم غير فارغ لـ`test_admin_employee` في ملف التسليم الخاص (تطابق واحد من8). لم تختبر صلاحيته ولم يطبع/ينسخ إلى الأدلة أوClipboard أوGit. UID المتوقع `44dfab74-53ec-4def-bdb6-fe6aad4f4d87`؛ لا هوية جلسة مثبتة.
- الخزينة الحالية لا تعرض اعتماد QA؛ أدوات الحفظ المتاحة تتطلب masked user input ولا تعرض مسار استيراد ذاتي معتمد. لا فتح prompt أو طلب يدوي جديد ولا تجاوز للأداة. الحاجز `AUTONOMOUS_SECURE_CREDENTIAL_IMPORT_UNAVAILABLE_NO_USER_PROMPT_ALLOWED`، وليس غياب صلاحية Business أو خطأ كلمة مرور مثبتًا.
- **لم ينفذ Reset**: لا يعالج حاجز الإدخال المستقل، ولا يمكن استيفاء شرط حفظ كلمته فورًا بالخزينة بالمسار المتاح دون تدخل يدوي. لا توليد/تغيير لكلمة أوUID/email/role/permission/scope/profile/registry.
- Login لم يرسل، جلسات جديدة0. المسارات المحمية كلها0 عينة وجميع الإحصاءات unavailable؛ Role/Scope/Permission/IDOR/out-of-scope/Logout invalidation NOT TESTED. لا Bottleneck جديد مثبت. أدلة الهوية السابقة قبل الدخول محفوظة ولا تعد اختبارًا حيًا جديدًا.
- `DETAILS = BLOCKED_BY_NO_ISOLATED_QA_RECORD`؛ لا فتح Details حقيقية ولا إنشاء/حذف QA. لا إدخال لسجل مصطنع في ترقيم أوWorkflow الأعمال لمجرد استكمال Checklist.
- آثار هذه المتابعة: real business writes0؛ Auth create/reset/change0؛ QA created/removed0؛ migrations/indexes0؛ Edge/Cloudflare deployments0؛ Faisal touched=no؛ Old system accessed=no. المقترحات PROPOSED_NOT_APPLIED وMigration200 BLOCKED_BY_DESIGN_NOT_PENDING؛ verify_jwt/runtime دون تغيير.
- توحيد التوثيق على الفرع نفسه؛ التفاصيل في `docs/LIVE_VERIFICATION_2026-10-14.md`. **الحكم BLOCKED**. المطلوب تقنيًا capability آمنة ذاتية لاستيراد/حقن الاعتماد، لا موافقة جديدة ولا طلب خطوة يدوية في هذا التسليم.

## Historical — earlier QA continuation


## 2026-10-14 — أحدث متابعة QA: الأهلية مثبتة، المسار الآمن للاعتماد محجوب

- تفويض فيصل الأخير يسمح باستخدام حساب QA موجود Password-ready وحفظه الآمن؛ التفويض **ليس ناقصًا**. main المقروء `7ecebe788a3497abaf9d1275e2ce60ab2b014ed7` لم يتغير، ولا إعادة تحقق أو نشر للأجزاء المنجزة.
- إثبات حي داخل `BEGIN READ ONLY`: `test_admin_employee` / UID `44dfab74-53ec-4def-bdb6-fe6aad4f4d87` / `test_admin_employee@msajed.local`؛ manual_test ومملوك للتسليم اليدوي، Auth confirmed/not-banned، profile active والروابط canonical صحيحة، registry eligible، وكلا علمي forced-change=false. الاختيار من الأربعة الجاهزين وبأقل دور `employee`، لا حساب حقيقي.
- النطاق المثبت قبل الدخول: إدارة الموارد البشرية والإدارة القانونية، ضمن مساعد الرئيس التنفيذي للشؤون الإدارية والمالية؛ العضويات member. الصلاحيات الحالية المشتقة من grants بلا overrides: `transactions.create` و`transactions.raise_manager`. **هذا ليس إثبات هوية جلسة ولا اختبار enforcement**.
- لا login محفوظ لأصل التطبيق في الخزينة. محاولة حفظ آمنة جديدة للحساب المحدد فقط أعادت `save_declined`؛ لا إعادة طلب أو إدخال بديل للأسرار، ولا إرسال login. الحاجز الدقيق `QA_SECURE_CREDENTIAL_INJECTION_UNAVAILABLE_VAULT_SAVE_DECLINED`، لا غياب تفويض أو عدم صلاحية الحساب. كلمة الملف الخاص لم تختبر ولم تطبع/تنسخ للأدلة أوClipboard.
- صفر سجلات معاملات أنشأها/يتولى مسؤوليتها QA المحدد، وصفر assignment-targets/routes له؛ لا سجل QA مملوك معزول مثبت. `DETAILS = BLOCKED_BY_NO_ISOLATED_QA_RECORD`؛ لم تفتح تفاصيل حقيقية ولم تنشأ بيانات بديلة.
- جميع مسارات الأداء المحمية0 عينة؛ min/avg/p50/p95/p99/max unavailable. Role/Scope/IDOR/invalid-session/logout invalidation المصادق عليها NOT TESTED. لا Bottleneck مثبت ولا حكم قبول أمني من150/150 المحلية المحفوظة.
- آثار هذه المتابعة: real business writes0؛ Auth create/reset/change0؛ جلسات جديدة0؛ QA data0؛ migrations/index changes0؛ Edge/Cloudflare deployments0؛ Faisal touched=no؛ Old system accessed=no. SQL المقترحان والفهارس PROPOSED_NOT_APPLIED، وMigration200 BLOCKED_BY_DESIGN_NOT_PENDING. تغير التوثيق لا يعني نشر Runtime.
- الاستئناف: توفير الاعتماد الموجود لنفس QA عبر الخزينة الآمنة، إعادة تحقق readiness ثم إثبات actual session UID قبل الاختبارات؛ بعدها30 عينة لكل مسار متاح. Details تبقى محجوبة حتى إثبات سجل QA معزول. لا إنشاء/reset أو تغيير صلاحيات.
- التفاصيل وبصمات الأدلة: `docs/LIVE_VERIFICATION_2026-10-14.md`. **الحكم الحالي BLOCKED**؛ المقاطع السابقة أدناه تاريخية لهذه المتابعة.


## 2026-10-14 — الحالة الحاكمة بعد التحقق الحي: BLOCKED

- Runtime معتمد من main `f3762ca8301650aa719f0dcb15171cc2d80f95e7`؛ الدمج ونشر Cloudflare السابقان منجزان. لا تعديل أو إعادة نشر Frontend في هذه المتابعة؛ deployment `ed1ced44-bc74-4583-b273-feb623a28a8e` وcache `20261013-release-closure-1` يبقيان دليلًا سابقًا محفوظًا، لا اختبارًا معادًا.
- `SUPABASE_SESSION_BLOCKED = RESOLVED_FOR_VERIFIED_NATIVE_MRABU_BROWSER`: الوصول من Chrome المستخدم الصحيح أثبت المشروع الجديد `movzojtnkkmdsjhmlgtq` والمصدر والإعدادات وقراءة SQL داخل `BEGIN READ ONLY`. لا ادعاء بأن صلاحية CLI المرفوضة تغيرت.
- نشر واحد فقط لـ`transactions-api`: **v38 → v39** من مصدر main المعتمد بعد فهم الفرق وربطه بتحسين القراءة المنشور في Git؛ قراءة المصدر الحي كاملًا بعد hard reload وتفريغ Clipboard أثبتت SHA-256 `6843e4b99a167aacd1b86daf29138a8285637e602db84c648cffbc9e703f48f2` مطابقًا لـGit. `verify_jwt=false` قُرئ قبل النشر وبعده وبقي دون تغيير.
- `session-logout v4`: كامل جسم المصدر مطابق لـmain، مع توثيق اختلاف LF نهائي واحد في المصدر الموجود بالمزود؛ `verify_jwt=false` قُرئ فعليًا ولم يتغير؛ **لم يُعد نشره**. `updated_at` الدقيق لم يقرأ؛ لا اختلاق تاريخ أو استنتاج إصدار المزود من حقل health الثابت34.
- 150/150 أمن محلي على main الحالي أُعيدت فعليًا دون شبكة؛ و6/6 probes حيّة آمنة أثبتت health200 ورفض List/Details/Close/Logout دون جلسة401 وCORS دون انعكاس hostile origin. ليست قبولًا حيًا للأدوار أوIDOR/session invalidation المصادق عليه.
- Native catalog: 19 Auth؛ 37/37 public tables معRLS، صفر public table بلاpolicy؛ ليست إثباتًا دلاليًا لكلRLS/ACL. QA يدوي8 مثبت بالـmetadata، وروابط8/8 وprofiles active8/8؛4 ما زالوا بحاجة لتغيير كلمة. ملف QA خاص موجود ولم تنشر كلماته أو تنسخ إلى الأدلة. لا جلسة QA usable وموثقة متاحة؛ حفظ login في خزينة المتصفح الآمنة رُفض، فلا إعادة طلب ولا إدخال بديل للأسرار.
- **Auth QA / protected LIVE performance = BLOCKED**: Startup/List/Tabs/Pagination/Search/Filters/Details/«بياناتي» غير مقاسة. health v39 العام قيس30 مرة: p50 **388.67ms**، p95 **445.28ms**؛ ليس Edge/DB isolated ولا دليل تحسن الكود. لا Bottleneck مصادق عليه مثبت ولا تحسين نظري جديد.
- `EDGE_RUNTIME_DRIFT_01 = OPEN` للتصرف فيRuntime التاريخي؛ فجوة مصدر الدالتين المدارتين أعلاه أُغلقت. `source-reader v1` / `workspace-editor v1` باقٍ تصنيفهما `LEGACY_TRANSITIONAL_RUNTIME / NOT_APPROVED_FOR_NEW_SYSTEM_RUNTIME`: مصدر حي كامل معworkspace engine قُرئ من management فقط، ونافذتاInvocations `Last hour` لم تظهرCalls؛ ليس دليل «لم تستخدم أبدًا» ولا إذنًا بحذف/تعطيل. لا invocation ولا نشر/تعديل لأي منهما.
- **APPLIED migrations=0**؛ فهارس الأداء الثلاثة وSQL المقترحان `PROPOSED_NOT_APPLIED`. `Migration200 = BLOCKED_BY_DESIGN_NOT_PENDING`. `review/qa-isolation-gate-20261009 = ARCHIVED_QA_EVIDENCE`: قوائم المهام القديمة لا تعيد تفعيل QA50/47create/9reset أو أدواتها.
- Auth operations=0؛ new QA data=0؛ real business writes=0؛ Old system accessed=no؛ Faisal application account touched=no. المراجعتان الساكنتان السابقتان انقطعتا بلاverdict؛ لا تُعدّانAPPROVED.
- نقطة الاستئناف: إتاحة جلسة حساب QA موجود وpassword-ready بطريقة آمنة، ثم إثبات هويته الحالية وملكيته وروابطه وصلاحياته ونطاق بياناته، وقياس30 عينة لكل مسار متاح. Details ليستread-only بالضرورة؛ لا فتح أوmutation في بيانات حقيقية. لا إنشاء/reset لحسابات لتجاوز الحاجز.
- التقرير الحالي وحدود الأدلة والبصمات والقياسات: `docs/LIVE_VERIFICATION_2026-10-14.md`. هذه الحالة تتقدم على المقاطع التاريخية أدناه، ولا تغيّر قراراتBusiness أو حدود الترحيل المعتمدة.

## Historical — 2026-10-13 — Release closure / Performance gate (superseded current-state claims)

- النظام الجديد وحده: `faisal01gh/ceo-msajed` / `msajed-ceo-erp` / `movzojtnkkmdsjhmlgtq`. النظام القديم منفصل تمامًا: لا اتصال ولا بيانات ولا API ولا اعتماد Runtime ولا مساهمة في readiness هذا المرشح.
- المرشح الوحيد لهذه الجولة: `review/new-system-release-closure-20261013` من main `dc4b0df3449e0ce0dec7f045e49c9e5fe956842a`، مع نقل **الدالتين واختباراتهما المباشرة فقط** من `cd6297ffca5fde98a7dbbc655b48ff6b23e5a290`. أحدث Documentation من main محفوظة، لا نقل شامل لـQA أوMigration200 أوالأدوات التاريخية.
- `review/qa-isolation-gate-20261009 = ARCHIVED_QA_EVIDENCE`: ليس Development/Release branch نشطًا؛ لا إعادة تلقائية لاختباراته. `review/runtime-authz-hardening-20261013 = SUPERSEDED_BY_RELEASE_CLOSURE_BRANCH` بعد نقل إصلاحاته. لا حذف لأي branch.
- الدليل الحي المقبول من فيصل: **SECURITY HARDENING LIVE SOURCE = PASS**؛ `transactions-api v38` و`session-logout v4`؛ SRC-01..04 VERIFIED في المصدر الحي. التصنيف `VERIFIED_LIVE_SUPPLIED_EVIDENCE` / `NOT_RECHECKED_BY_YOUR_SESSION`، وليس اختبارًا سلوكيًا حيًا. تحسينات الأداء الجديدة مصدرية محلية فقط، **NOT DEPLOYED / SQL PROPOSALS NOT APPLIED**؛ لا تنسب parity الحية إلى تغييرات الأداء غير المنشورة.
- الأداء Gate أساسي. تتبع القياسات وحدودها في `docs/PERFORMANCE_BASELINE_2026-10-13.md`. RPC/الدخول/الإجراءات الحية `LIVE_PERF_MEASUREMENT_PENDING` بسبب رفض الوصول؛ لا loops على401/403. GET health العام الآمن قيس مستقلًا 30 مرة، ولا يثبت أداء Auth أوDB أوالمعاملات.
- `EDGE_RUNTIME_DRIFT_01 = OPEN`. `source-reader` و`workspace-editor = LEGACY_TRANSITIONAL_RUNTIME / NOT_APPROVED_FOR_NEW_SYSTEM_RUNTIME`؛ الثلاث `account-bootstrap` / `auth-login` / `auth-complete = DISABLED_STUB`. لا تعديل أوتعطيل أوحذف حي؛ لا ادعاء عدم الاستخدام دون مصدر حي كامل ونافذة logs مقروءة.
- **REAL AUTH PROVISIONING = BLOCKED — needs Faisal authorization**. **FULL MIGRATION 200 APPLY = BLOCKED_BY_DESIGN — not a pending task**. E2E = NOT_STARTED؛ Load50x50 = NOT_STARTED. التجهيز والاختبارات المحلية ليست Native QA ولا تحميل50×50.
- التحقق المحلي النهائي: 150 حالة أمن و12 حالة مستقلة إضافية؛ 20 حالة أداء Backend داخلة ضمن43 حالة Loopback؛ 25 حالة واجهة و3 cache وحالتا إعادة إرسال مستقلتان؛ 42 سيناريو فهرسة ومراجعة78 سيناريو؛ 39 حالة مميزة لتحضير الحمل. لا تُجمع retries أوsteps كاختبارات مستقلة. المراجعات الأربع **APPROVED ضمن المصدر والاختبارات المحلية فقط**، لا Native acceptance.
- الأداء النهائي **PARTIAL**: Startup المحلي p50/p95 =59.50/69.30ms مقابل68.50/85.20؛ renderTableCPU p50 =2.30ms مقابل5.50. لم تتحسن جميع أزمنة المسارات. تفاصيل Backend بقيت24 طلبًا؛ انخفضت مجموعات الانتظار10→7 فقط. لا ادعاء تقليل عددqueries أوتحسن حي؛ التفاصيل والحدود في وثيقة الأداء.
- الفهارس الثلاثة **PROPOSED_NOT_APPLIED**: `idx_routes_latest_custody_read`، `idx_account_password_operations_actor_id`، `idx_transaction_read_state_user_id`. يلزم فحصcatalog حي وموافقة تطبيق مستقلة؛ Full Migration200 ليست مهمة معلقة.
- Supabase writes لهذه الجولة = none؛ لا Deploy جديد أوAuth أوحساب فيصل أوموظفين أومعاملات حقيقية أوMerge إلى main. الفهارس proposals غير مطبقة؛ لا حذف للـ18 unused indexes.

> الفصل الحاكم: الإدخالات التاريخية أدناه محفوظة من main كأرشيف فقط. إصلاحات وقياسات النظام القديم لا تدخل readiness أوخطة النظام الجديد، وأوامر QA/native التاريخية لا تتحول تلقائيًا إلى تفويض لهذه الجولة.

## 2026-10-13 — تعديل اسم المهمة وترتيب الأزرار: منشور ومتحقق

- طلب تعديل الاسم لفهد الرشيد وفيصل الزكري على المهام المسندة لهما ضمن النطاق القائم؛ لا يتغير الاسم قبل موافقة مدير المكتب. تعرض نافذة «تحديثات وطلبات القطاعات» بطاقة عربية بالاسم الحالي والمقترح وطالب التعديل وزري الموافقة والرفض.
- الاعتماد يحدث المهمة الأصلية وروابط التوجيه والطلبات والتدقيق في معاملة ذرية واحدة؛ الرفض لا يغير المهمة. التحقق من الجلسة والحساب والدور الحالي والنطاق خلفي، مع منع تعارض العناوين وتكرار القرار والتراجع الكامل عند الفشل.
- تعديل الاسم محفوظ في `task.title_history` ويعرض داخل سجل الإجراءات كتعديل إداري غير قابل للتحرير؛ لا يغير `task.actions` أو تاريخ الإسناد أو عداد آخر إجراء أو حالات الرفع والإيقاف والاستئناف.
- الأزرار أربعة في كل صف على الكمبيوتر والباقي في الصف التالي، وعمودان عند ضيق الجوال. بقيت جميع الأزرار ووظائفها وشروط صلاحياتها، بما فيها زر الموضوع الإضافي.
- الخدمة الجديدة `ceo-task-rename v1 ACTIVE`، وبناء الإضافة `20261013-task-rename-v1`. لا DDL أو migrations أو Auth/RLS أو بيانات مهام ومعاملات حقيقية تغيرت للاختبار، والخدمات الخلفية القديمة بقيت بإصداراتها السابقة.
- مصدر التشغيل `ceo-office-tasks` commit `6b4dbebd5b7341bb12dd1117131afc2ccf7cb967` وPR #3. نجح Cloudflare deployment `6c44b088-39f7-4c9e-a359-9038c743f989` والنشر الرئيسي وتطابق الملفات وتهيئة الصفحتين دون جلسة أو أخطاء. الخدمة رفضت الجلسات المصطنعة غير الصالحة بـ401 والمصدر غير المسموح بـ403.
- الاختبارات: 151 تحقق PostgreSQL محلي معزول و40 تحقق واجهة، إضافة إلى 75 تحقق لوحة المساعد و40 اختبار متابعة المكتب واختبار متصفح المسارات القائمة. لا اختبار إيجابي على مهمة حقيقية.
- المرجع المفصل والبصمات: `docs/tasks/TASK_RENAME_APPROVAL_2026-10-13.md`. حالة «معتمد وغير منفذ» السابقة استبدلت بهذا التسليم بعد التحقق الفعلي.
- الأدلة: https://github.com/faisal01gh/ceo-office-tasks/pull/3 وhttps://github.com/faisal01gh/ceo-office-tasks/actions/runs/38374768050 (job 115220275809)، واختبار المصدر قبل الدمج run 38373430080.

آخر تحديث مرجعي: 2026-10-13

## متابعة المساعد وتبسيط خانات المدة — منشور ومتحقق 2026-10-12

- الواجهة القديمة فقط: صندوق «المهام المتأخرة» وصندوق «المعاملات الواردة» في مكتبي ولوحة المساعد وسكرتيره، بعدادات مستقلة وبحث وعرض خمسة عناصر لكل صفحة وفتح مباشر للإجراءات الحالية. بقيت أقسام الفريق والاعتمادات والمهام الخاصة والتقارير وصناديق إدارات فهد دون إلغاء.
- متأخرات المتابعة خمسة أيام فأكثر من آخر تحديث أو تاريخ الإسناد عند غيابه، مع استبعاد المغلق والمرفوع للرئيس والموقوف مؤقتًا. الوارد يتبع المرحلة الحالية لدى المساعد، ولا يشمل المحال لغيره أو المؤرشف أو المنتهي أو المردود عليه. المصدر هو بيانات الحساب المصرح بها أصلًا، بلا قراءة إضافية أو تغيير للصلاحيات.
- بتوجيه فيصل أزيلت العبارات الزائدة من خانات المدة في المكتب والقطاعات وتقارير العرض: عدد الأيام فقط بدل «موقوفة مؤقتًا · لا تُصنّف متأخرة» أو «مستمرة». تبقى الحالة وأسبابها في مواضعها وسجلها، ويستمر عداد الإسناد وقواعد استثناء التأخر واعتماد الاستئناف دون تغيير.
- المرجع الأحدث لهذا العرض: `docs/tasks/ASSISTANT_DASHBOARD_2026-10-12.md`؛ لا يغير مواصفات النظام الجديد أو نموذج أدواره.
- مصدر التنفيذ: `2a2333f039bf57890113d99f9ca41da06c213337` في `ceo-office-tasks`، PR #2. إعادة النشر `d807fddacd589988ebdcac8ae0519395004495cb` لا تغير أي ملف؛ شجرة المصدر نفسها `8e43bde7b08240566d9c7b18e9f50cb6c4144825`.
- البناء الحالي: portal `20261012-assistant-dashboard-v1`، CEO `20261012-duration-clean-v5`. إضافة متابعة مكتب الرئيس بقيت `20261012-office-custody-v4` والخلفية لم تتغير في هذا التسليم.
- التحقق: 75 تحققًا ناجحًا (40 منطق/parse و35 متصفح)، في الكمبيوتر 1440×1100 والجوال 390×844، صفر أخطاء صفحة وصفر طلبات شبكة خارجية في البيانات المصطنعة. run المصدر 38248332100؛ run النشر 38248549012، المحاولة الثانية ناجحة والوظيفة 114810773693.
- تعثرت محاولة Cloudflare الأولى 668d1800-9c08-40bd-ad5f-f1ca84e8b734؛ نجحت إعادة نشر المصدر نفسه eaf1db2b-5c95-4752-9ca9-215e2837b847. قراءة الرابط الرئيسي أثبتت تطابق بايتات ملفات HTML للصفحتين وJS/CSS الإضافة مع Git، مع تهيئة الصفحتين العامة دون جلسة وبلا أخطاء أو طلبات كتابة.
- لم تتغير قاعدة البيانات أو Edge Functions أو Auth أو RLS أو أي مهمة أو معاملة حقيقية لأغراض الاختبار. اختبار الأزرار استخدم بيانات معزولة وإجراءات بديلة مرصودة، وليس تحديثًا أو ردًا حقيقيًا.
- الأدلة: https://github.com/faisal01gh/ceo-office-tasks/pull/2 وhttps://github.com/faisal01gh/ceo-office-tasks/actions/runs/38248549012/attempts/2 .

## المهام المرفوعة داخل مكتب الرئيس — منشور ومتحقق 2026-10-12

- الصندوق الأزرق باقٍ، والمهام المرفوعة تظهر أيضًا داخل قسم «مكتب الرئيس التنفيذي» في عداده وقائمته، مرتبطة بالمهمة الأصلية بواسطة `_sid` دون نسخ بيانات أو مضاعفة الإجمالي.
- «فتح وتوجيه الرئيس» يتيح كتابة توجيه إلزامي ثم «إعادة للقطاع المعني» أو «إحالة إلى قطاع آخر» مع إدارة فعلية. يحفظ توجيه الرئيس كإجراء جديد، وينهي الرفع دون إغلاق المهمة أو تغيير تاريخ إسنادها الأصلي.
- المرجع الحالي: `docs/tasks/OFFICE_TASK_CUSTODY_2026-10-12.md`، ويكمل قواعد استمرار أيام الإسناد واستثناء المرفوع/الموقوف من التأخر واعتماد استئناف الإيقاف المؤقت.
- المصدر القديم المنشور `0c8b1626c51cd1b83530cbec71c80dd26467ec4f`، PR رقم 1 في `ceo-office-tasks`. واجهة المكتب `20261012-office-custody-v4`، وصفحة القطاعات بقيت `20261012-task-aging-resume-v3`.
- أضيفت `ceo-task-office v1` بتحقق فعلي من جلسة مدير المكتب وحالة الحساب والدور الحالي، مع CAS وإعادة الطلب نفسه دون تكرار الإجراء. لم تتغير `ceoportal v35` أو `ceoapp v9` أو `ceoapprove v16` في هذا التسليم.
- اختبار المصدر: 40 حالة ناجحة وChromium بدوال الرسم الأصلية وخمس مهام مصطنعة (عداد المكتب 5 والإجمالي 5). النشر الحي: بايتات HTML والإضافة تطابق Git، التهيئة الفعلية للنافذة ناجحة، والخدمة ترفض الطلب بلا جلسة بـ401 عربي. ليس اختبار إحالة إيجابيًا على مهمة حقيقية.
- الأدلة: https://github.com/faisal01gh/ceo-office-tasks/actions/runs/38237401389 وhttps://github.com/faisal01gh/ceo-office-tasks/actions/runs/38238711674 . لا Schema/Auth/موظفين أو مهمة حقيقية تغيرت بغرض الاختبار.

## إيقاف مؤقت بموافقة مدير المكتب — 2026-10-12

- النظام القديم فقط: `task_pause` منفصل عن `ceo_hold` وعن الإغلاق.
- المصرح لهم بطلب الإيقاف: فهد الرشيد، فيصل الزكري، مدير المكتب، فهد بامقدم؛ التحقق خلفي. الطلب لا يغير المهمة حتى اعتماد مدير المكتب.
- أيام الإسناد مستمرة من تاريخ الإسناد الأصلي ولا تخصم مدد الرفع أو الإيقاف. أثناء الحالة الفعالة تُستبعد المهمة من وصف وقوائم وعدادات التأخر.
- الاستئناف ليس مباشرًا: `task_pause_resume` بسبب إلزامي واعتماد مدير المكتب؛ يسجل السبب كإجراء جديد عند الاعتماد ويبدأ منه عداد أيام آخر إجراء.
- `ceoportal v35` و`ceoapp v9` و`ceoapprove v16` هي الإصدارات الحالية لهذا المسار. لا Schema جديد أو اختبار كتابة على مهمة حقيقية.
- تحديث مكتب الرئيس في أعلى الملف لا يلغي قواعد الإيقاف والاستئناف.

## تنظيم مهام الفريق لفهد — 2026-10-12

- Portal القديم: فهد فقط يحصل على Layout جديد لمهام الفريق.
- الترتيب: 1) متأخرات ٥ أيام فأكثر مجمعة حسب الإدارة، 2) القائمة الشاملة لكل الإدارات، 3) صناديق قابلة للفتح لكل إدارة.
- المتأخرات تستخدم آخر تحديث/إجراء أو تاريخ الإسناد عند عدم وجود تحديث، وتستبعد `ceo_hold.active=true`.
- القائمة الشاملة مفتوحة افتراضيًا؛ صناديق الإدارات تفتح/تغلق في الذاكرة دون كتابة تفضيلات على قاعدة البيانات.
- لا Backend/Schema/Data changes؛ Frontend only.
- source commits: `4bde88b526fd1c64df2a2c7643a3847571335b9e`, `6cdcc6a6d80c706875b8e48d3100bc4635991def`.
- JavaScript syntax ناجح على كتلة portal الوحيدة.

## إصلاح واجهة مهام فهد — 2026-10-12

- فحص الإنتاج القديم أكد أن مهام فهد موجودة: 42 مفتوحة، 37 منشورة له، والحساب/الجلسة/Edge سليمة.
- سبب عدم الظهور كان `ReferenceError` في جدول المهام المدمج: استخدام `hold.active` بدون تعريف `hold` بعد تعديل إيقاف المدة.
- تم إصلاح `portal/index.html` فقط في commit `aa25231007b369eba73dc99e09b5f8313c9416c2`، مع توحيد حسبة `taskAssignDays` وحالة `taskHoldBadge` داخل الجدول.
- النشر الحي متحقق بعلامة `20261012-fahad-task-render-fix-v1`.
- لا تغييرات DB/Edge/صلاحيات/بيانات أعمال ضمن هذا الإصلاح.

## إصلاح بطاقات اعتماد الطلبات الخاصة — 2026-10-12

- واجهة `ceo/` الحالية تمنع إظهار JSON الخام لطلبات `task_pause/task_ceo_hold/task_move/task_close`.
- Parsers أصبحت payload-driven عبر `request` مع حماية fallback عربية إذا وصل طلب نظامي غير متوقع.
- لا تغيير DB/Backend في هذا الإصلاح؛ الطلبات المعلقة الموجودة تبقى كما هي.
- commit `c2ba5dbd8b760fc76b12e65fb28f9ebe2e948015`, live build `20261012-request-cards-json-safe-v1`.
## حالة «مرفوعة للرئيس التنفيذي» — محدث 2026-10-12

- النظام القديم فقط: فهد الرشيد وفيصل الزكري يملكان طلب رفع مع سبب إلزامي؛ يحفظ `task_ceo_hold / pending / ceo` دون تغيير المهمة قبل اعتماد مدير المكتب.
- موافقة مدير المكتب تفعّل `ceo_hold` مع استمرار عداد أيام الإسناد. لا تجميد ولا خصم لمدد الرفع؛ الاستثناء من التأخر فقط أثناء الحالة النشطة.
- المهمة تبقى عند المساعد والإدارة، وتظهر في صندوق المتابعة وفي قسم مكتب الرئيس وعداد المكتب. العرض مرتبط بالمعرف نفسه، وليس مهمة مكررة.
- مدير المكتب يسجل توجيه الرئيس كإجراء جديد ثم يعيدها لقطاعها أو يحيلها لقطاع وإدارة آخرين. ينتهي الرفع ولا تغلق المهمة؛ يبدأ عداد آخر إجراء من التوجيه ويبقى تاريخ الإسناد الأصلي محفوظًا.
- مسار العودة السابق للحساب المخول يتطلب أيضًا توجيه الرئيس، ولا يقبل عودة بلا توجيه. الاستئناف من الإيقاف المؤقت منفصل ويحتاج سببًا واعتماد مدير المكتب.
- المصدر الحالي والاختبارات في `docs/tasks/OFFICE_TASK_CUSTODY_2026-10-12.md`. `ceoportal v35` و`ceoapprove v16` للطلبات، و`ceo-task-office v1` لقرار المكتب.
- تصحيح بيانات «متابعة الخطة الاستراتيجية» السابق محفوظ تاريخيًا في الجرد وCHANGELOG؛ لم يُكرر أو تُعدل أي مهمة حقيقية في تسليم ربط المكتب.

## صلاحيات مهام قديمة إضافية — 2026-10-11

- النظام القديم فقط: فيصل الزكري أضيف لمسار طلب نقل المهمة داخل قطاع المشاريع والشؤون الفنية.
- فهد الرشيد + فيصل الزكري يستطيعان طلب إغلاق مهمة؛ الطلب لا يغير `app_state` حتى يقرر مدير المكتب.
- Backend الحالي: `ceoportal` v31 و`ceoapprove` v12، كلاهما ACTIVE.
- طلب الإغلاق يخزن كـ`portal_task_updates.kind=task_close`, `status=pending`, `stage=ceo` مع `_sid` داخل payload؛ لا Schema جديد.
- عند موافقة مدير المكتب: `done=true` على نفس المهمة، `portal_routes.stage=done`، القرار في Audit، ثم الطلب `approved_date`. عند الرفض تبقى المهمة مفتوحة ويغلق الطلب `rejected`.
- واجهة القطاعات source commit `a31c6ce5d870165a00714400096c3e6a42dc8468`، وواجهة مدير المكتب source commit `b0b96d96cca80d6412aa930a7eea6105ed9a4ddc`.
- JavaScript source اجتاز فحص Syntax: portal كتلة واحدة، CEO ست كتل.
- لم تُستخدم بيانات أعمال كاختبار كتابة.

## تصحيح نقل مهام فهد بالموافقة — 2026-10-08

- كشف التحقق الحي أن التنفيذ الأول كان ينقل المهمة لحظة طلب فهد ثم يرسل لمدير المكتب تحديثًا للاعتماد؛ لذلك لم تكن الموافقة هي التي تنفذ النقل.
- التنفيذ المصحح: `ceoportal` v30 = طلب نقل فقط، و`ceoapprove` v11 = تنفيذ النقل عند موافقة مدير المكتب فقط.
- طلب النقل يحمل `kind=task_move` وسياق `_sid`/الإدارة المصدر/الإدارة المستهدفة داخل `body` المنظم دون إضافة أعمدة أو تغيير schema القديم.
- موافقة النقل تنقل نفس كائن المهمة مع كامل سجلها، CAS على `app_state.rev`، وتحدث Route/Audit؛ الرفض لا يغير المهمة.
- «منتدى للمساجد» متحققة حاليًا في إدارة العلاقات العامة فقط، `_sid=scddslrgc1k`، وبها إجراءان أصليان بعد إزالة أثر الاعتماد المصطنع. `app_state.rev=13577` بعد الإصلاح.
- لا توجد طلبات `task_move` معلقة قديمة بعد الإصلاح.
- الواجهتان منشورتان ومتحققتان بعلامتي build الجديدتين، JavaScript صالح، ولم يُنشأ اختبار نقل جديد على مهمة حقيقية.

## تعديل تشغيلي في النظام القديم — 2026-10-08

- بتوجيه فيصل تم توسيع استثناء النظام القديم ليشمل **مدير المكتب** في نقل المهام كاملة بين الإدارات الفعلية داخل القطاع نفسه.
- `ceoapp` القديم Version **7** ACTIVE: العملية `ptask_move_dept_office` مقيدة خلفيًا بحساب `فيصل` ودور `ceo`، وتعتمد `_sid` وتنقل نفس المهمة مع سجل إجراءاتها وتحمي الحفظ بـ`app_state.rev`، ثم تحدث Route وتسجل Audit.
- واجهة `ceo/index.html` أضيف إليها زر `↔` لمدير المكتب في أدوات المهمة فقط.
- صفحة المعاملات القديمة أضيف إليها مؤشر مستقل **للمفاهمة** أسفل عاجل/عادي. الحالة غير المختارة تظهر كخانة فارغة، والمختارة تعرض «للمفاهمة».
- Excel للمعاملات يحتوي الآن عمودين منفصلين: `الأهمية` و`للمفاهمة`؛ لا تختلط علامة المفاهمة بقيمة عاجل/عادي.
- Commit الواجهة القديمة: `b06a3faac3b0117c29f75549611b64c53ee5c903`. جميع كتل JavaScript الست اجتازت فحص Syntax.
- Cloudflare القديم متحقق حيًا على `ceo-office-tasks.pages.dev/ceo/` بعلامة `20261008-office-task-move-mufahama-v1`.
- لم تُستخدم مهمة أو معاملة حقيقية كاختبار كتابة؛ عند التحقق كان عدد معاملات `mufahama=true` يساوي صفرًا.

## النشر الفعلي لتصحيح الواجهة

- runtime source a967045070ae7f8823cda61cef7d656931b6d34a وcanonicalProduction7ebd50c9-5de0-460b-9f5b-da2bfaa75c66 مقروءان ومطابقان؛ GitHubCloudflareChecksuccess وليس دعوى Actions tests مستقلة.
- HTTP fourassets=Gitblobs؛ cache20261007-1activated؛ public44/deployed renderer517 ناجحان. لم تسلّم credentials أو ينفذ Auth/QA50 في هذا النشر.
- تقرير الإثبات CLIENT_REVIEW_2026-10-07.md؛ الأقسام التالية تحفظ checkpoint قبل النشر. تجهيز عزل QA والاختبارات الحقيقية مستمر دون مساس بالحقيقيين.

## تصحيح الواجهة والحيازة — checkpoint المصدر

- تصحيح الحيازة التنفيذي25b3359 مطبق ومقروء أصلًا؛ Native READ للمعاملتين778/764 أثبت incoming=false لمدير المكتب مع visible/ceo=true، دون تعديل الصفوف.
- تصحيح BOOT/list/credential-version والنسخ معتمد مستقلًا APPROVE بلا findings؛ Parent طابق SHA الملف وشغّل Node85/Chromium15/clipboard17/transport16 والعقود25/static. مجسات المراجع20 نجحت وأربعة controls فشلت على المصدر السابق كما ينبغي.
- الأصول/cache20261007-1 جاهزة للدفع؛ CI/Production/البايتات/تفعيل الكاش ليست مقبولة بعد في هذا checkpoint. التقرير docs/transactions/CLIENT_REVIEW_2026-10-07.md.
- اختبار50مستخدمًا حقيقيًا متعدد الأدوار معتمد، لكن QA isolation شرط قبل أي إنشاء/معاملات. ثمانية مسارات تجهيز مستقلة تعمل بالتوازي مع مراجعة التصميم. لا تغييرات حقيقية للحسابات/الهيكل/الصلاحيات/الكلمات، ولا أعمال النظام القديم أو تجهيز47/9 في هذا النطاق.


## الواجهة منشورة ومقروءة فعليًا

- canonical Cloudflare Production للـpublication e473949a04ae27e6af901e81f16291fec6304b2c ناجح، وكذلك GitHub run37532478878. الأصول index/app/styles/service-worker مطابقة لملفات Git والكاش20261006-1 active.
- public login44 وdeployed renderer517checks/102surfaces ناجحان. فحص Native READ للأدوار والحيازة حافظ على بيانات المعاملة الحالية دون تحويلها.
- تفاصيل الإثبات والـAuth/E2E المتبقي docs/transactions/DELIVERY_2026-10-06.md. النشر لا يقفل تجهيز الموظفين الحقيقيين أو اختبار رفع/رد signed-in جديد.


## قراءة التطبيق الحي المثبتة

- schema التصحيح طبقت على الجديد: دفتر الترحيلين 20261006201402 و20261006201405. أصل source=e51fc516a65282f4a7ab0ba7ea481ecbbc4087d1، وtransactions-api v36 ACTIVE ومطابق لمصدر Git بالقراءة.
- ACL/RLS ومجموعة تغييرات Role Defaults قُرئت بعد التطبيق؛ حسابات/Profiles/هويات Auth/الموظفون/الهيكل/Overrides و788 معاملة بقيت مطابقة لبصمات قبل التنفيذ، دون إعادة كلمات أو تعديل بيانات معاملات.
- نشر الواجهة ومطابقة canonical Pages/الأصول والكاش والدخول الحي لا تستنتج من نجاح الخلفية؛ أدلتها ستسجل منفصلة. لا حاجة لتكرار DDL الموجود.


## الأولوية الحالية — تصحيحات تجربة المعاملات

- هذا التنفيذ على msajed-ceo-erp فقط؛ النظام القديم ممنوع، ولا يوسع استثناء جلسة أخرى نطاقه. لا استخدام حساب فيصل أو تغيير كلمات المرور/الموظفين/الهيكل/معاملته للاختبار.
- المصدر feature/transaction-feedback-20261006 من a44167a764b4ab3ccff47cf3ea34618153ebb663، والأصول 20261006-1. مراجعات SQL/Edge/UI معتمدة؛ تطبيق الهدف والنشر والتحقق الحي لم يعلنا هنا بعد.
- زر «الرد» وسجل «رد المساعد» يعيدان إلى صاحب الرفع نفسه دون تغيير المسؤول العام أو سلطة الإغلاق. حيازة حالية، queue سكرتير قطاعه للقراءة، سجل موحد، وقراءة/تنبيه مملوكان محميان من السباقات؛ BOOT يثبت UUID من my_profile الموثق.
- المرجع التفصيلي: docs/transactions/FEEDBACK_2026-10-06.md والمواصفة الحالية. الدليل المحلي: SQL21، رد8+10، UI48، renderer517، regression19 و25 وظيفة محمية، وجسور طبقات فعلية. لا يعني ذلك Auth أصليًا أو نشرًا أو كامل سلسلة الترحيل.
- حسابات التجربة8 أنشئت وربطت وتحقق دخولها وسلمت سابقًا في مجلد سطح مكتب محمي خارج Git. تجهيز الموظفين الحقيقيين وكلماتهم المتبقية غير منفذ؛ الأرقام القديمة أدناه تاريخية.
- preflight قراءة فقط قبل النشر: 57 أصليًا +8 تجربة، 19 Auth/19 Profile، 788 معاملة؛ وظائف التصحيح/حالة القراءة لم تكن مطبقة. لا تعِد DDL دون قراءة الدفتر والأجسام الفعلية.


## استثناء تشغيلي صريح للنظام القديم — 2026-10-06

- اعتمد فيصل تعديلًا محدودًا على إنتاج النظام القديم `msajed-tasks` لإتاحة نقل المهمة كاملة لحساب **فهد الرشيد** داخل قطاعه فقط. هذا الاستثناء يعلو على عبارات «عدم استخدام/تعديل النظام القديم» السابقة **لهذا النطاق وحده**؛ بقية الإنتاج القديم يبقى مرجعًا محميًا ولا يُعدّل دون اعتماد جديد.
- حساب فهد القديم متحقق: `فهد الرشيد`، الدور `sec`، القطاع `مساعد الرئيس التنفيذي للشؤون الإدارية والمالية`.
- نُشر `ceoportal` Version **29** بحماية خلفية خاصة بفهد: نقل نفس المهمة بحسب `_sid` بين الإدارات الفعلية في القطاع، مع حفظ جميع الحقول وسجل الإجراءات، وفحص `app_state.rev` ضد التعارض.
- بعد النقل يُحدَّث مسار المهمة للإدارة الجديدة، ويسجل Audit، ويُنشأ `portal_task_updates` بمرحلة `ceo` وحالة `pending` ليظهر النقل لمدير المكتب في «تحديثات القطاعات».
- واجهة النظام القديم: منطق النقل في commit `a6a652a4e0a6f6ed8fd792552f88ce364dad46d0`، وآخر build commit `4708f37b961c4adcb1a669ca6da58555c1899057`. فحص JavaScript syntax ناجح، وتم التحقق حيًا من `https://ceo-office-tasks.pages.dev/portal/` بظهور meta build `20261006-fahad-task-move-v1`. النطاق القديم `sectors-portal.pages.dev` ما زال يقدم نسخة أقدم ولا يحمل علامة الإصدار الجديدة.
- لم تُنقل أي مهمة حقيقية خلال التحقق؛ بيانات الأعمال لم تستخدم كحالة اختبار.
- هذا لا يغيّر دور فهد في النظام الجديد: يبقى `assistant_secretary` ولا يرث صلاحيات المساعد. ولا يعتبر قرارًا نهائيًا لتصميم قسم المهام الجديد.

## الحالة ذات الأولوية — استكمال الحسابات / 2026-10-05

- المواصفة الحالية: `docs/auth/ACCOUNTS_SPEC.md`. هذا النطاق يستبدل قيود تسليم الواجهة السابق فقط؛ لا يجيز استخدام النظام القديم إلا الاستثناء التشغيلي الصريح المؤرخ 2026-10-06 أعلاه.
- المصدر الذي بدأ عليه التنفيذ: `main` عند `b1dcc08091a7f4a482e2be10dc442bb6bc0b46ec`؛ إصدار الأصول المنشور الأساسي `20261005-6`، والإصدار المحلي الجديد المخطط `20261005-7`.
- جرد حي للمشروع الجديد: **57 سجلًا مؤهلًا / 10 مرتبطين / 47 غير مرتبطين / 11 Auth إجمالًا**. الحساب الحادي عشر مالي معطّل وغير مؤهل، محفوظ دون تغيير. `faisal` مرتبط وحالتا الإلزام false؛ كلمة مروره غير مستخدمة أو معدلة.
- `login_username` الـ57 قُرئت من النظام الحي: فريدة، إنجليزية، توافق القيم المعتمدة ونمط الاسم الأول + رقم عند التكرار. لم تُولّد أسماء جديدة. اختبارات resolver الـ14 ناجحة؛ هذه ليست دخولًا بكلمة مرور.
- سياسة Supabase Auth الأصلية طُبقت بالفعل وقُرئت بعد إعادة فتح الصفحة: حد 8 وكبير/صغير/رقم/رمز. باقي مفاتيح Email Auth وOTP وLeaked Password Protection بقيت كما كانت.
- مراجعة مستقلة أولى رفضت عيبَي replay/forced-bootstrap؛ regression RED→GREEN أصلحتهما، ثم قبلت المتابعة المستقلة الترحيل وEdge/UI. هذا قبول core محدود وليس E2E أو provisioning حيًا.
- الأدلة المحلية الحالية: **SQL/PGlite 26، command 11، Edge regression 1، نقل UI 16، مكوّن 126**؛ ليست إثبات Auth أو RLS في الإنتاج.
- طُبّق ترحيل الحماية على المشروع الجديد وقُرئت آثاره: الجدولان private مع RLS، و8 RPCs لا ينفذها anon/authenticated، و37/37 جدول RLS عام عليه gate restrictive إضافي. هويتا فيصل والمالية وحالاتهما محفوظة تمامًا، وعدّادات المعاملات/الوحدات/القيم الافتراضية/overrides لم تتغير.
- اسم الترحيل `password_operations_and_safe_provisioning`؛ نسخة المصدر `20261005200000`، ورقم دفتر Supabase الذي أنشأته أداة التطبيق `20261005181350`. المطابقة مثبتة بالاسم ومصدر SQL وقراءة schema؛ لا تعِد تطبيق DDL لمجرد اختلاف رقم دفتر الأداة عن اسم الملف، ولا تستخدم db push عميانيًا دون reconciliation للدفتر.
- نُشرت وظائف المشروع الجديد مع قراءة ملفاتها ومقارنتها بمصدرها: `account-confirm-password` v5، `account-admin-reset-password` v1، `transactions-api` v35، كلها ACTIVE. ملفات entrypoints وrelative shared closure مطابقة؛ لم يُضعف التحقق اليدوي من Auth/session مع بقاء إعداد gateway السابق.
- فحوص ingress حية سلبية: token-only 400، تأكيد/إعادة تعيين/معاملات دون جلسة 401، وOrigin مرفوض 403. ليست هذه دخولًا إيجابيًا.
- إنشاء الحسابات وإعادة التعيين الجماعي وE2E/HTTP Load ونشر أصول الواجهة الجديدة لم تكتمل بعد. هذا إصدار core يمهّد لاختبارات الإنتاج؛ لا يُعتبر تقرير إنجاز للحسابات الـ57.

## تحديث 2026-10-05 — تسليم مكوّن كلمة المرور مستقلًا

- النطاق المعتمد: الواجهة واختباراتها والأصول الثابتة فقط؛ لا تغيير Auth أو Backend أو قاعدة البيانات أو الصلاحيات أو بيانات الموظفين/المعاملات، ولا استخدام للنظام القديم.
- شاشة التحديث الإلزامي و«بياناتي → تغيير كلمة المرور» تستخدمان نفس المكوّن: كلمة المرور الجديدة ثم التأكيد، ثم قائمة صغيرة رأسية للشروط والتطابق. المؤشرات غير المتحققة رمادية دون أخطاء حمراء أثناء الكتابة؛ المتحققة خضراء، والحفظ لا يتاح قبل اكتمالها.
- شرط الرقم ضمن التحقق الأمامي معتمد من فيصل؛ سياسة الواجهة: كبير/صغير/رمز ASCII/رقم/ثمانية Unicode code points على الأقل. إعدادات Supabase Auth وفرض السياسة الخلفي لم يتغيرا ولم يُختبرا حيًا.
- إصلاح الإعلان لقارئ الشاشة: live region ثابت، مهذب وذري، يبدأ فارغًا وتُحدَّث رسالته عند تغير حالة التطابق فقط. هذا إصلاح DOM/ARIA مثبت؛ نطق قارئ شاشة فعلي غير مختبر.
- النتيجة المحلية النهائية: `tests/password_component.py` — **126 تحققًا ناجحًا**، صفر page/console errors أو طلبات API؛ الشاشتان عند 1440px و390px. لا جلسات أو كلمات مرور حقيقية ولا حفظ بيانات.
- Cache/asset version لهذا التسليم: **`20261005-2`**؛ نتائج GitHub/Cloudflare ومطابقة ملفات الإنتاج تُقرأ للـCommit المنشور، ولا تُستنتج من الاختبار المحلي.
- ظهور شاشة الإلزام لفيصل وفهد الرشيد متحقق يدويًا سابقًا؛ لم يُعد اختباره على حسابيهما.

### الأعمال المحجوبة — ليست ضمن هذا التسليم

1. إنشاء Supabase Auth للحسابات المتبقية بعد جرد حي؛ أرقام 10/47 أعلاه لقطة 2026-10-04 وليست إعادة تحقق حالية.
2. إعادة تعيين كلمة مرور المستخدم من مدير مكتب الرئيس التنفيذي.
3. تغييرات Backend الخاصة بكلمات المرور، إثبات التغيير قبل رفع الإلزام وفرض السياسة الخلفية.
4. E2E الحي الذي يحتاج حسابات فعلية واختبارات Backend/RLS المرتبطة به.
5. HTTP Load Test الذي يحتاج التفويض المناسب.

هذه الأعمال غير منفذة بسبب التفويض، ولا يُعتبر نجاح نشر الواجهة إقفالًا لها. لا محاولات تجاوز للتفويض ولا تشغيل SQL أو نشر Edge أو تغيير DB ضمن هذا التسليم.

## المسار المعتمد

لا Figma.

المسار:
**المواصفة → الكود → Supabase → اختبار → اعتماد**

GitHub هو مصدر الكود والمواصفات والمigrations.

## التشغيل الحالي

### الواجهة
Cloudflare Pages:
`https://ceo-msajed.pages.dev/`

اسم المشروع:
`ceo-msajed`

المصدر:
`faisal01gh/ceo-msajed` — فرع `main`.

### حالة GitHub
آخر تحقق 2026-10-04:
- Visibility: **Public**
- فيصل يريد تحويل المستودع إلى **Private**.
- لم يتم التحقق من التحويل بعد؛ لا تعتبره Private حتى يظهر ذلك في GitHub.

### Supabase
القديم — Read-only/مرجع:
- `msajed-tasks`
- `urgkbbconlxeagfgyjee`

الجديد — النظام الجديد:
- `msajed-ceo-erp`
- `movzojtnkkmdsjhmlgtq`

## المعاملات

المواصفة:
`docs/transactions/SPEC.md`

المتطلبات الوظيفية الأساسية مقفلة، وتم تنفيذ قسم معاملات حقيقي.

المزايا المنفذة تشمل:
- الدخول.
- الصلاحيات والتبويبات.
- البحث والفلاتر وPagination.
- الإنشاء.
- الإجراء والاعتماد والرفض والإصدارات.
- الإحالات والرفع.
- التحويل بين المساعدين.
- الإدارة المسؤولة والإدارات المساندة.
- تعدد الموظفين.
- الإسناد المباشر.
- الإغلاق/طلبات الإغلاق.
- الاسترجاع/طلبات الاسترجاع.
- الإلغاء.
- التمديد.
- تغيير المسؤول.
- إطلاع الرئيس.
- التنبيهات.
- Excel/PDF/واتساب.
- Audit.

### البيانات القديمة

آخر تحقق 2026-10-04:
- إجمالي المستورد القديم: 787
- مغلق: 728
- مفتوح: 59
- مفتوح `ready`: 57
- مفتوح `needs_review`: 2
- مفتوح على مستوى الرئيس: 3

الحالات التي تحتاج مراجعة:
- 779 — تصميم المبنى الرئيسي
- 787 — معاملة

المعاملات المؤكدة سابقًا عند الرئيس بقيت عنده، والمحولة بقيت عند آخر مسؤول يمكن إثباته من المصدر القديم.

## الحسابات

القرار المعتمد:
- الحسابات التشغيلية فقط.
- لا حسابات اختبار.
- النظام القديم يبقى كما هو.
- كلمة مرور النظام القديم لا تتغير.
- النظام الجديد يفرض كلمة مرور جديدة عند أول استخدام.

آخر تحقق 2026-10-04:
- الموظفون المسجلون في دليل النظام الجديد: **57**.
- المرتبطون فعليًا بـSupabase Auth الجديد: **10**.
- المسجلون في الدليل وينتظرون إنشاء Auth: **47**.
- جميع الموظفين الـ57 معلّمون بـ `must_change_password=true`؛ ويطبق الإلزام فعليًا فور وجود Auth للحساب.
- فيصل مدير المكتب وفهد الرشيد ضمن الحسابات المرتبطة الحالية وإجبار تغيير كلمة المرور مفعّل لهما.
- الحساب الوظيفي غير المسمّى «المدير المالي» عُطّل كحساب تشغيلي لأنه لا يمثل موظفًا مسمى في `staff-original.json`.

## الأداء

تم نقل قراءة قائمة المعاملات إلى RPC مباشر authenticated/PostgREST.

تم قياس استعلام القائمة داخل PostgreSQL بنحو **26 ms** في اختبار نطاق مدير المكتب.

تحسينات الواجهة:
- Partial rerender.
- Event Delegation.
- Network timeout.
- Preconnect.
- Service Worker.
- Cloudflare Pages للاستضافة.

Cloudflare يحسن تسليم ملفات الواجهة، لكنه لا يستبدل تحسين قاعدة البيانات.

## الأمان

- لا Service Role أو Secrets في الواجهة/GitHub.
- مفاتيح الواجهة Publishable.
- RLS على الجداول المعرضة.
- Audit للعمليات المؤثرة.
- CSP مضافة.
- روابط المرفقات الجديدة HTTP/HTTPS فقط.
- Security Advisor تمت مراجعته.

متبقٍ:
- Leaked Password Protection غير مفعلة.
- Tokens ما زالت في `sessionStorage`.
- خيار أمان لاحق: Cloudflare Worker/BFF + HttpOnly Secure Cookies.

## قسم المهام — المرحلة الحالية

تم بدء القسم بالجرد فقط، ولم يعتمد التصميم الوظيفي النهائي.

المرجعان:
- `docs/tasks/LEGACY_INVENTORY.md`
- `docs/tasks/SPEC.md`

المصادر القديمة التي تم التحقق منها:
- 37 مهمة في `app_state.tasks`.
- 92 مهمة في `public.items` من النوع `task`.
- 267 سجلًا في `portal_task_updates`.
- `portal_team_tasks` فارغ حاليًا.

## الخطوة التالية

**إقفال مواصفة المهام مع فيصل ثم تنفيذها مباشرة.**

لا يتم إنشاء schema نهائي للمهام قبل حسم القرارات المفتوحة في `docs/tasks/SPEC.md`.

## قبل الإنتاج النهائي

ما زال مطلوبًا:
- اختبار End-to-End فعلي لكل دور.
- معالجة حالتي المعاملات القديمة `needs_review`.
- إكمال تفعيل/تغيير كلمة المرور للحسابات التشغيلية أثناء الاستخدام.
- تم اختبار حمل طبقة PostgreSQL/RPC على **5300 قراءة** عبر عدة جولات وخمسة أدوار؛ أسوأ متوسط في الجولة الإضافية 10.359 ms لمدير المكتب. النتائج موثقة في `docs/transactions/LOAD_TEST_2026-10-04.md`. ما يزال اختبار HTTP متزامن من عدة متصفحات مطلوبًا قبل الإطلاق واسع النطاق.
- حسم Leaked Password Protection.
- حسم ما إذا كان سيتم نقل الجلسة إلى HttpOnly Cookie عبر Cloudflare Worker/BFF.


## تحديث 2026-10-04 — قسم الصلاحيات

تم إنشاء قسم حقيقي باسم **الصلاحيات** في الواجهة والبنية الخلفية.

الحالة الحالية:
- قسم «الصلاحيات» يظهر فقط لمدير مكتب الرئيس التنفيذي.
- أول تبويب داخله: **المعاملات**.
- يعرض المستخدمين التشغيليين ودور كل مستخدم وصلاحيات المعاملات.
- يعرض جميع صلاحيات المعاملات المسجلة لكل مستخدم، وجميعها قابلة للتعديل من مدير مكتب الرئيس التنفيذي.
- يمكن ضبط صلاحيات الحساب التشغيلي قبل اكتمال ربطه بـSupabase Auth؛ تحفظ الـOverride على مفتاح الحساب التشغيلي ثم تطبق عند الاستخدام.
- يدعم Override سماح/منع فوق صلاحيات الدور.
- التعديلات محمية في PostgreSQL وتسجل في Audit.
- البنية قابلة لإضافة تبويبات مستقبلية مثل المهام دون إعادة بناء النظام.
- تم اعتماد تفصيل صلاحيات الإحالة والإسناد إلى مفاتيح مستقلة: داخل الإدارة، داخل القطاع، قطاع آخر، إدارة مساندة، للمساعد، تحويل مساعد، رفع للرئيس، ورفع للمدير.
- تصميم أقسام النظام المعتمد: عمود جانبي زجاجي أنيق على يمين الصفحة بدل الشريط الأفقي.
- العدد التنفيذي الحالي لصلاحيات المعاملات: **21 صلاحية مستقلة**؛ أزيل المفتاح العام القديم `transactions.assign`.
- صلاحيات العرض العام والتصرف العام والحذف النهائي أصبحت تعتمد على الصلاحية الفعالة لا على المسمى وحده.
- نُشرت `transactions-api` بالإصدار التشغيلي Version 25 بعد تحويل الإحالات إلى مفاتيح تفصيلية.
- تم اختبار تعديل صلاحية «الحذف النهائي» لحساب تشغيلي غير مرتبط بـAuth داخل Transaction مع Rollback؛ انعكس التغيير في Snapshot وAudit ثم تأكد رجوعه دون أثر.
- الدوال الداخلية التي تقبل actor صريح لم تعد قابلة للاستدعاء من `authenticated`؛ الـRPC العامة تعمل `SECURITY INVOKER` وتدخل عبر دوال داخلية آمنة تستمد المنفذ من `auth.uid()` ولا تسمح بتزوير هوية مدير المكتب.
- Security Advisor وPerformance Advisor أعيدت مراجعتهما بعد التغييرات؛ أزيل تحذير `SECURITY DEFINER` من RPC العامة، ولا توجد ملاحظة Foreign Key غير مفهرس ناتجة عن جدول Overrides الجديد. المتبقي أمنيًا هو Leaked Password Protection المعروف سابقًا ومعلومات RLS للجداول المقفلة عمدًا.

تم تصحيح فهد وليد الرشيد:
- الدور الجديد: `assistant_secretary`.
- المسمى التشغيلي: سكرتير مساعد الرئيس التنفيذي للشؤون الإدارية والمالية.
- مرتبط تنظيميًا بمكتب/قطاع هايف الدويش.
- لا يحمل صلاحيات المساعد افتراضيًا.
- الصلاحيات الفعلية الحالية بعد التصحيح: لا توجد صلاحيات معاملات موروثة.


## تحديث 2026-10-04 — قرارات إقفال المعاملات والحسابات

- المعاملات الدورية مؤجلة من الإصدار الحالي، وتنفذ مستقبلًا مع قسم التقارير، ولا يغلقها حينها إلا الرئيس التنفيذي.
- إجراء العمل لا يحتاج اعتمادًا؛ الأعلى سلطة يستطيع إضافة ملاحظة محفوظة على الإجراء.
- قاعدة الإغلاق: خيار الواجهة دائمًا «إغلاق المعاملة». الموظف يرفع الإغلاق للمدير، والمدير للمساعد، والمساعد لمستوى الرئيس، والمعاملة المشتركة بين قطاعات مختلفة ترتفع سلطة إغلاقها النهائية إلى مستوى الرئيس. مدير مكتب الرئيس التنفيذي من مستوى الرئيس ويملك الإغلاق المباشر عند فعالية `transactions.close`.
- نافذة «فتح المعاملة» هي المدخل الرئيسي للإجراءات، مع نقل المسؤول/الاستحقاق/الأولوية إلى حقول قابلة للنقر حسب الصلاحية، وأيقونات واتساب/Excel/PDF في شريط أعلى الصندوق.
- النظام القديم خارج نطاق التعديلات بالكامل؛ الحسابات الجديدة والإدارة الجديدة تعتمد على `msajed-ceo-erp` فقط.


## تحديث 2026-10-04 — إقفال واجهة المعاملات والحسابات

- واجهة «فتح» أصبحت مركز إجراءات المعاملة؛ صف القائمة يعرض زر «فتح» فقط.
- المسؤول وتاريخ الاستحقاق والأولوية أصبحت حقولًا قابلة للنقر عند توفر الصلاحية.
- واتساب وExcel وPDF في شريط أدوات أعلى نافذة المعاملة.
- الإحالة ورفع الرئيس وإطلاع الرئيس والإلغاء والإغلاق/الاسترجاع داخل نافذة «فتح».
- إجراء العمل لا يحتاج اعتمادًا، ومسار `decide_action` أوقف في الخلفية؛ الأعلى سلطة يستطيع إضافة ملاحظة محفوظة على الإجراء.
- 779 و787 هما المعاملتان المفتوحتان اللتان تحتاجان تهيئة؛ فيصل يملك صلاحيات التهيئة ويستطيع اختيار الإدارة والمسؤول وتصحيح العنوان/الموضوع.
- السجل 695 مغلق ويحمل علامة تاريخية `needs_review` لكنه غير قابل لتهيئة السياق لأن المسار مقصور على المعاملات المفتوحة.
- تم تنفيذ عمود جانبي زجاجي للأقسام، وإضافة «بياناتي».
- «بياناتي» لا يعرض المسمى الوظيفي؛ الاسم ثابت للمستخدم، البريد مغلق افتراضيًا، وتغييره يعمل فقط عند منح `profiles.edit_email`.
- دليل المستخدم الخارج للواجهة لا يتضمن مفتاح `job_title`.
- الواجهة و`transactions-api` تعملان على النظام الجديد فقط، ومسارات Legacy داخل المشروع الجديد عطلت لمنع أي اتصال تشغيلي بالنظام القديم.
- `transactions-api` المنشورة وصلت إلى Version 34 في آخر تحقق، مع تطبيق قاعدة الإغلاق حسب أعلى مستوى وصلت إليه المعاملة دون تجاوزها بصلاحية `act_all`.
- إنشاء Auth لـ47 حسابًا جديدًا وإعادة تعيين كلمة مرور مؤقتة بواسطة مدير المكتب لم يكتمل بسبب عدم توفر مسار Auth Admin مسموح في أدوات التنفيذ الحالية؛ لا تحفظ كلمات مرور صريحة في GitHub أو قاعدة التطبيق.
- تعديل اسم المستخدم من شاشة مدير المكتب أصبح منفذًا ومختبرًا فعليًا مع Audit ورفض المدير العادي.
- سياسة كلمة المرور (8+، حرف كبير، حرف صغير، رمز) ظاهرة ومطبقة في الواجهة؛ فرض هذه السياسة المخصصة من Backend لم يكتمل لأن أداة النشر منعت مسار تحديث كلمات مرور Auth server-side.

- أزيلت كل مراجع الاتصال التشغيلي بقاعدة النظام القديم من `index.html` وCSP/Preconnect؛ الواجهة تشير إلى `msajed-ceo-erp` فقط.

## تحديث بصري شامل للنظام — 2026-10-05

- تم تحديث الهوية البصرية لكل النظام بدون تغيير البيانات أو سير العمل.
- اعتماد خط عربي/نظامي حديث موحد عبر كامل الواجهة مع تحسين وزن النصوص والمسافات.
- تحديث شاشة الدخول وتحديث كلمة المرور بتصميم Premium حديث، وشروط كلمة المرور أصبحت مختصرة أسفل الحقول بدل بطاقات كبيرة.
- تحديث الهيدر، العمود الجانبي، البطاقات، التبويبات، الفلاتر، الجداول، النوافذ، الأزرار، الحالات، صفحة الصلاحيات و«بياناتي» ضمن Design System واحد.
- أدوات واتساب وExcel وPDF داخل نافذة المعاملة أصبحت أيقونات حديثة مضغوطة.
- إضافة حركات Hover/Focus خفيفة ودعم أفضل للشاشات الصغيرة مع احترام prefers-reduced-motion.
- لا يوجد اعتماد على خطوط أو مكتبات تصميم خارجية؛ الواجهة تستخدم خطًا نظاميًا حديثًا للحفاظ على الأداء وCSP.
- نسخة الأصول المنشورة لهذا التحديث: `20261004-7`.

## تسليم مراجعة الواجهة — 2026-10-05

مرجع التدقيق قبل التعديل: `docs/UI_UX_AUDIT_2026-10-05.md`، على baseline `baeffc3ea3afccc35ddcbfbf7382742e7175d2d0` المطابق لنشر Cloudflare الإنتاجي المتحقق قبل التعديل.

- أعيد تنظيم الواجهة بنمط تشغيلي عربي: كحلي/أزرق ثابت، ذهب محدود، هيدر أبيض وعمود جانبي أكثر هدوءًا، دون blur أو تدرجات زخرفية متنافسة.
- Font stack نظامي: Segoe UI Variable / Segoe UI / Tahoma / Arial / sans-serif؛ لا تحميل خطوط. وزن ومسافات وحجم قراءة موحد، دون letter-spacing سالب للعربية.
- إصلاح زر الدخول وإضافة إظهار/إخفاء كلمة المرور؛ مؤشرات الشروط الأربع صغيرة أسفل الحقل. نص التأكيد محفوظ، دون بطاقات كبيرة.
- القائمة تحتفظ بالأعمدة الـ11؛ على الجوال تتحول الصفوف لبطاقات تعرض جميع الحقول. فلاتر مسماة وقابلة للطي، ومسح للفلاتر دون تغيير مسارات البحث الخلفية.
- نافذة المعاملة Workspace واسع: الموضوع والبيانات، أدوات واتساب/Excel/PDF مسماة، تبويبات نظرة عامة/إجراءات العمل/الإحالات/الطلبات/السجل، والمدة والإسناد داخل نظرة عامة. جميع المحتويات والأفعال محفوظة، والافتراضي لا يفتح إجراءات العمل تلقائيًا.
- المسؤول والأولوية والاستحقاق أزرار قابلة للوصول بلوحة المفاتيح، تحت شروط الصلاحية القديمة نفسها.
- الصلاحيات مجمعة بصريًا حسب الرموز الحالية، مع switches وإبقاء المستخدم في الأعلى. لا مسميات وظيفية. «بياناتي» يقتصر على الاسم والبريد وتغيير كلمة المرور وبنفس قيود التعديل.
- النوافذ تدعم Tab/Shift+Tab وEscape واستعادة التركيز وinert للنوافذ المتداخلة والخلفية؛ أهداف التفاعل 44px على الأقل. حالات تحميل/فراغ/خطأ واستعادة نتائج بعد فشل الشبكة.
- نسخة الأصول الجديدة: `20261005-1` في HTML وService Worker.

### أدلة الاختبار المحلي

- `node --check` لكل من app.js وservice-worker.js، و`git diff --check`: ناجحة.
- `tests/ui_contracts.py`: 33 دالة محمية لم تتغير؛ جميع تعبيرات post/rpc/baseBody/fetchJson مطابقة عبر AST. لا تعديل Supabase/Backend/migrations أو بيانات أو صلاحيات.
- `tests/ui_static.py`: 1300 تصريح CSS متوافق مع Chromium، بلا أخطاء parse؛ 10 أزواج تباين ناجحة، وأقل نسبة في هذه العينة 4.856:1. هذه عينة محددة وليست شهادة WCAG شاملة.
- `tests/ui_renderer.py`: 517 تحققًا ناجحًا عبر 102 حالة عرض/مقاس عند 1440/1280/1024/768/390، تشمل الشاشات الأساسية والنماذج الفرعية للإحالة، التركيز والنوافذ المتداخلة والتبويبات والأدوار ومسار الخطأ والتحميل. صفر page errors أو console errors وصفر طلبات API خارجية أثناء هذه الاختبارات.
- تنزيل Excel فعلي ببيانات اختبار معزولة وفحص XML؛ فحص ملخص واتساب ومخرجات HTML المستخدمة للطباعة. لا ادعاء بفحص PDF محفوظ من طابعة أو حساب حقيقي.
- لا مكتبات أو framework أو polling في الواجهة. زيادات الأصول مضغوطة gzip مقاسة في اختبار الأصول؛ اعتمادات أدوات الاختبار فقط وتعمل خارج حزمة الواجهة عبر uv.

### حدود التحقق وإقفال النشر

اختبارات الشاشات المحمية تستخدم بيانات مصطنعة مع حظر كل اتصال API؛ ليست إثبات دخول حساب حقيقي أو نجاح كتابة Backend. شاشة الدخول الأصلية فحصت على رابط الإنتاج قبل التعديل. اختبار حفظ المعاملات أو تغيير كلمة مرور حقيقية أو صلاحيات حقيقية غير منفذ عمدًا، حفاظًا على شرط عدم تغيير البيانات. مشاكل Auth السابقة لم تُحل ولم يُدّع إقفالها.

Security/Performance Advisor: غير منطبق على هذا التسليم لعدم وجود أي تغيير DB. النظام القديم خارج النطاق: لم يقرأ أو يعدل أو يستخدم تشغيليًا.

### مراجعة مستقلة وتصحيح الحالات الطرفية

وجدت المراجعة المستقلة أربع حالات في الواجهة فقط: فقدان إعادة المحاولة عند مسح الفلاتر، التركيز بعد الانتقال إلى بياناتي أثناء طلب قائم، التركيز داخل فلاتر الجوال بعد المسح، والتقاط المستدعي بعد تأخر فتح المعاملة. ثبّت `tests/ui_regressions.py` حالات فشل فعلية، ثم نجحت بعد تصحيح محدود دون تغيير عقود الشبكة أو قواعد الصلاحيات. كذلك صُحّحت رسالة كلمة المرور غير الصالحة، وفُصل إخفاق تحديث شاشة الصلاحيات بعد إقرار الحفظ عن إخفاق الحفظ نفسه.

أعيد تشغيل اختبار renderer كاملًا بعد هذا التصحيح: 517 تحققًا ناجحًا، وصفر أخطاء Console/page أو طلبات API خارجية. فحص AST ناجح أيضًا. لا تغير بصري إضافي خارج مراجعة التأكيد.

أقرت المراجعة المستقلة اللاحقة تصحيح الحالات الأربع ورسائل التحقق، مع اجتياز اختبار regressions والعقود وفحص JavaScript، ودون أي ملاحظة أمنية أو خطأ منطقي متبقٍ ضمن نطاق المتابعة.

### النشر الفعلي والتحقق من الإنتاج

نُشر كود الواجهة بالـCommit `ed4c63309bfb693da035996420ef11a78da966b5` إلى main. نجح GitHub run `37244119057` وكل Check runs، ونشر Cloudflare الإنتاجي `d41bc881-2909-497f-b52e-a1f01e2ecb08` بحالتي build/deploy = success. تطابقت الأصول الأربعة المنشورة بالبايتات مع الـCommit. اجتاز الدخول العام الحقيقي 44 تحققًا بلا Console/page/CSP errors، وService Worker الجديد activated. اجتاز renderer المنشور 517 تحققًا معزولًا إضافيًا بلا طلبات API.

الدليل التفصيلي وحدود التحقق: `docs/UI_UX_DELIVERY_2026-10-05.md`. التحقق بحساب تشغيلي وكتابة البيانات ليسا ضمن هذه الأدلة؛ لا تدّع اكتمالهما. commit توثيق الدليل اللاحق لا يغير ملفات الواجهة، ويُتحقق من نشره النهائي بصورة مستقلة قبل تقرير التسليم.


## تحديث معاملات 2026-10-05 — الإغلاق والتفاصيل والتصدير

- نشر `transactions-api` Version **34** على `msajed-ceo-erp` فقط.
- تصحيح الإغلاق لمستوى الرئيس: الرئيس التنفيذي ومدير مكتبه وسكرتير الرئيس التنفيذي يستطيعون الإغلاق المباشر عند فعالية `transactions.close` وظهور المعاملة لهم، مع سبب إلزامي.
- خيار الواجهة موحد باسم **«إغلاق المعاملة»**؛ إذا لم يكن المستخدم صاحب السلطة النهائية ينشأ طلب إغلاق ويرتفع للمستوى التالي.
- مسار طلب الإغلاق: موظف → مدير → مساعد → مستوى الرئيس؛ والمعاملة المشتركة بين قطاعات مختلفة ترتفع لمستوى الرئيس.
- أضيفت صلاحيتان مستقلتان: `transactions.edit_subject` و`transactions.change_responsible_unit`. أصبح العدد **21 صلاحية معاملات**.
- نافذة المعاملة تعرض اسم الإدارة المسؤولة الحقيقي، وتسمح بتحرير الموضوع والإدارة عند وجود الصلاحية.
- تغيير الأولوية يتطلب سببًا إلزاميًا ويسجل القديم والجديد والسبب في History/Audit.
- دورات العمل تعرض عدد الأيام، والدورة المفتوحة تحسب حتى وقت العرض.
- قسم «الطلبات» أصبح «الطلبات والاعتمادات» ويعرض النوع والطالب والمستوى الموجه إليه والسبب والحالة.
- سجل المعاملة يعرض أوصافًا عربية مفهومة، مع دعم تحويل الأحداث التاريخية القديمة المخزنة بصيغ مختصرة.
- PDF المعاملة يتضمن الإدارة المسؤولة، المسؤول، دورات العمل، الإحالات و«المطلوب»، وسجل المعاملة.
- Excel القائمة يتضمن عمود «م» للترتيب مستقلًا عن رقم المعاملة، وExcel المعاملة منظم إلى أقسام.
- ملخص واتساب: عنوان المعاملة، عدد الأيام، المطلوب، الإدارة المسؤولة، المسؤول.
- التنبيهات أصبحت جرسًا مع نقطة حمراء لغير المقروء؛ الضغط على التنبيه يعلمه كمقروء ويفتح المعاملة المرتبطة.
- Cache assets لهذه الحزمة: `20261005-5`.
- النظام القديم لم يستخدم ولم يعدل.

### آخر تحقق بعد حزمة معاملات 2026-10-05

- Security Advisor: لا توجد ملاحظة جديدة ناتجة عن الصلاحيتين الجديدتين أو Migration هذه الحزمة. المتبقي المعروف:
  - `Leaked Password Protection` غير مفعلة.
  - `pg_net` مثبتة في schema `public`.
  - INFO لجداول RLS المقفلة عمدًا بلا policies مباشرة.
- Performance Advisor: لا توجد ملاحظة جديدة حرجة؛ الظاهر حاليًا معلومات `unused_index` فقط.
- تحقق قراءة للمعاملة 778 من `msajed-ceo-erp` فقط:
  - الإدارة المسؤولة: **مكتب الرئيس التنفيذي**.
  - المسؤول الحالي: **فهد عمر أحمد بامقدم**.
  - `current_level=ceo` و`close_level=ceo`.
  - دورة العمل الأولى مفتوحة ويحسب عرضها المدة حتى الوقت الحالي.
  - سجلها القديم يحتوي صيغًا مختصرة (سهم مسؤول/أولوية وتاريخ خام)؛ الواجهة الجديدة تطبعها كجمل عربية واضحة دون تغيير السجل التاريخي.
## قرار أسماء الدخول الإنجليزية — 2026-10-05

- اسم الدخول الأساسي لكل موظف أصبح إنجليزيًا/ASCII فقط عبر `login_username`، ويشمل الحسابات الحالية والجديدة.
- المعرف الداخلي `preferred_login` لم يُستبدل في السجلات القديمة حتى لا تنكسر المعاملات والإحالات التاريخية.
- أسماء الدخول العربية القديمة تبقى Alias انتقاليًا فقط للتوافق، بينما اسم الدخول المعتمد للتسليم للمستخدم هو `login_username`.
- تم التحقق من 57 اسم دخول فريدًا وكلها تطابق `^[a-z0-9._-]{3,40}$`.
- `account-resolve` Version 5 و`account-confirm-password` Version 4 نشرتا على النظام الجديد، واختبار فعلي أثبت أن `faisal` والاسم العربي القديم يحلان إلى نفس الحساب.
- الحسابات غير المرتبطة بـAuth ما زالت 47 حتى يتم إنشاؤها فعليًا؛ لا توجد كلمات مرور مؤقتة صالحة لها قبل إنشاء Auth.
- Cache الواجهة: `20261005-6`.
## قاعدة أسماء الدخول النهائية — 2026-10-05

- اسم المستخدم الرسمي لجميع الموظفين: **الاسم الأول بالإنجليزي**.
- إذا تكرر الاسم الأول، يكون الأول بدون رقم ثم `1` ثم `2` وهكذا؛ وعند وجود حساب مرتبط مسبقًا يحتفظ بالحساب القائم بالاسم الأساسي لتقليل أثر النقل.
- الاستثناء الثنائي اللغة فقط: الرئيس التنفيذي، مدير مكتب الرئيس التنفيذي، سكرتير الرئيس التنفيذي، والمساعدون؛ هؤلاء يمكنهم الدخول بالاسم الأول بالعربي أو الإنجليزي.
- بقية المستخدمين: **الدخول بالإنجليزي فقط**. الأسماء العربية القديمة أوقفت كـLogin Alias لهم.
- لا يتغير `preferred_login` العربي الداخلي المستخدم في السجلات والمعاملات التاريخية؛ الفصل بين `login_username` ومعرف السجل يمنع كسر الإحالات القديمة.
- أمثلة متحققة حيًا: `faisal` و`فيصل` → حساب فيصل؛ `abdullah` و`عبدالله` → حساب المساعد عبدالله البازعي؛ `ahmad` → حساب أحمد الغامدي، بينما `أحمد` لا يقبل للدخول.

## قرار اختبار الحمل النهائي — 2026-10-07

- الاختبار الحي النهائي المطلوب من فيصل: **50 مستخدمًا مستقلًا متزامنًا × 50 طلبًا لكل مستخدم = 2500 طلب في الجولة**.
- المقصود هو الوصول إلى ذروة تقارب **2500 طلب in-flight** داخل نافذة الضغط، وليس 50 طلبًا فقط.
- ينفذ الاختبار بحسابات QA مملوكة للنظام الجديد وبقراءات آمنة قدر الإمكان، مع قياس Average/p50/p95/p99/throughput/errors/timeouts/limits.

</details>

</details>
