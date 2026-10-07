# تصحيح تزامن الواجهة — 2026-10-07

## حالة هذا checkpoint

قبول مصدر مستقل **APPROVE** بلا findings؛ الإصدار الثابت `20261007-1` جاهز للنشر. نتائج CI وcanonical Production والبايتات والكاش يجب قراءتها بعد دفع هذا commit؛ لا تستنتج من الاختبارات المحلية.

## قبول النشر الفعلي — مصدر runtime a967045

- source publication `a967045070ae7f8823cda61cef7d656931b6d34a` دُفع إلى main والفرع fix/client-review-hardening-20261007؛ remote parity مثبتة.
- canonical Cloudflare Production `7ebd50c9-5de0-460b-9f5b-da2bfaa75c66` قُرئ من المشروع ومن deployment exact-ID؛ كل المراحل success والمصدر هو SHA أعلاه. GitHub Check باسم Cloudflare Pages completed/success للـSHA نفسه.
- لا يظهر GitHub Actions run مستقل لهذا SHA عند القراءة؛ total_count=0. لا يُدعى نجاح اختبارات CI مستقلة لم تُنفّذ.
- page public44checks ناجحة في خمس مقاسات، دون credentials أو fixture؛ الأصول الأربعة تطابق Git blobs بالبايت، cache20261007-1 activated، وصفر page/console/failed requests.
- renderer على الأصول المنشورة517checks/102surfaces ناجح مع البيانات المصطنعة وحظر backend؛ صفر page errors/طلبات خارجية. ليس signed-in E2E.
- staged14files و932addedlines قُرئت وفُحصت؛ no secret findings، الخلفية/style بلا تغيير. ملفات أدوات الحسابات غير المتتبعة بقيت خارج الدفع ولم تحذف.
- هذا توثيق لاحق فقط؛ الأصول لم تتغير منذ publication المذكور. أي canonical commit توثيقي تالٍ يُقرأ مستقلًا، ولا نعيد renderer أو ترحيل SQL لأن التوثيق تغير.

## النطاق المقبول

- ملكية ردود RPC/POST وتجديد الجلسة للحساب الحالي؛ طلب متأخر لحساب سابق لا يبدّل الواجهة أو يمس جلسة الحساب الجديد.
- ملكية BOOT/list مستقلة: فشل prerequisites الحالي لا يُخفى ببحث أحدث، والقائمة الأحدث تسلّم للجدول الجديد بعد إثبات الهوية/الدليل/الصلاحيات فقط.
- تصحيح التبويب عند اختلاف الدور أو سحب view_all من المصدر الموثق، باستخدام الفلاتر الحالية وجيل قائمة جديد.
- ملكية التجديد تشمل زوج access/refresh الملتقط. تحديث كلمة المرور في نفس session owner لا تمحوه نتيجة تجديد قديمة أو finalizer قديم.
- نسخ الحافظة الآمن المقبول سابقًا محفوظ، مع fallback وإظهار فشل النسخ بدل نجاح كاذب.
- التغيير محصور في سبع دوال مقارنة بالمصدر `f3c145e557aa01537b3161f3147409cf802d8b0d`: boot/loadList/refresh/refreshAuthSession/rpc/post/copyWhatsApp.

## أدلة التنفيذ والمراجعة

المراجع المستقل `deleg_29e5af1c` اعتمد app.js ذو SHA256 بايتات checkout `41ea40b6a29bdd96c444f9dd729a5de35ecd2abbc5ff271da0175a2db3d8670a`؛ Parent طابقه قبل إصدار الأصول. Git قد يطبّع CRLF؛ مطابقة الإنتاج تستخدم Git blobs وليس checkout.

| بوابة | الدليل |
|---|---|
| Node actual-source | 85 حالة ناجحة؛ Parent أعادها في بوابة العقود |
| Chromium bootstrap/interleavings | 15 اختبارًا ناجحًا؛ Parent أعادها |
| مجسات المراجع عبر actual handlers/DOM | 20 ناجحة مع النقل المصطنع المحكوم |
| حساسية الاختبار | أربعة مجسات تفشل سلوكيًا على snapshot قبل التصحيح |
| العقود المحمية | 25: 22 تطابق مصدر +3 اختبارات سلوك النقل؛ بوابة paths/version نجحت |
| الحافظة | 17 ناجحة؛ تنفيذها المقبول لم يتغير |
| نقل كلمة المرور | 16 ناجحة؛ تعديل fixture فقط لتمثيل my_profile.ok/UUID الصحيح |
| CSS/static | لا parse errors أو unsupported declarations؛ الأصول والكاش 20261007-1 |
| syntax/diff | Node check وgit diff --check ناجحان |

مصمم التصحيح سبق أن شغّل أيضًا feedback UI48/renderer517/regressions19/password component126. هذه أدلة سابقة على نفس app المرشح، وليست نتائج Auth أو حمل حي. إخفاق أمر static الأول بسبب إغفال dependency playwright في أمر uv؛ أعيد الأمر مع playwright/tinycss2 فنجح، دون تغيير runtime.

## ما لم يتغير وما لم يثبت

لا Backend/SQL/Auth Settings/حسابات/كلمات حقيقية/صلاحيات/هيكل/بيانات معاملات في هذا الإصدار. الترحيل التنفيذي الموجود بالمصدر25b مطبق سابقًا؛ لا تعاد كتابته.

هذه اختبارات source وDOM بنقل محكوم، لا دخول Auth حقيقي أو تثبيت كلمة مرور أو Native OS clipboard. اختبار50حسابًا مستقلًا وكل الأدوار والمسارات ما زال منفصلًا، ويتوقف على تنفيذ ومراجعة وإثبات حاجز QA الخادمي. لم تنشأ حسابات أو معاملات QA جديدة بهذا الإصدار؛ تجهيز47موظفًا و9إعادة تعيين خارج النطاق.
