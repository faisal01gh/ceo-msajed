# اختبارات مراجعة الواجهة

## الحدود

كل بيانات `ui_renderer.py` مصطنعة ومعلّمة للاختبار. الاختبار يفتح ملفات الواجهة الحقيقية في Chromium، ويستبدل مسارات البيانات داخل متصفح الاختبار فقط، ويحظر كل طلب خارج أصل الأصول الثابتة. لا ينشئ حسابًا، ولا يحفظ معاملة، ولا يغيّر كلمة مرور أو صلاحية حقيقية. خيار `--url` يفحص renderer الموجود في النسخة المنشورة، وليس جلسة Backend مصادقة.

لا تفسر نجاح الاختبار كإثبات دخول حساب تشغيلي أو كتابة بيانات. PDF هنا فحص لمخرجات HTML المستخدمة للطباعة، وليس شهادة صحة PDF محفوظ من الطابعة. اختبار التباين يغطي أزواجًا محددة، وليس شهادة WCAG كاملة.

## التشغيل من جذر المستودع

أدوات الاختبار تعمل عبر uv ولا تضاف لحزمة تشغيل الواجهة:

```bash
node --check app.js
node --check service-worker.js
git diff --check
uv run --with playwright python tests/ui_regressions.py
uv run --with tree-sitter --with tree-sitter-javascript python tests/ui_contracts.py
uv run --with tinycss2 --with playwright python tests/ui_static.py
uv run --with playwright python tests/ui_renderer.py --no-screenshots --output <scratch-output-directory>
```

إذا كان Chromium غير مثبت:

```bash
uv run --with playwright python -m playwright install chromium
```

على بيئة Windows الحالية يستخدم `C:/Program Files/nodejs/node.exe` لفحص JavaScript، بدل wrapper الموجود في PATH الذي يعيد `stdin is not a tty`.

لإنتاج لقطات الفحص احذف `--no-screenshots`. المقاسات ثابتة: 1440، 1280، 1024، 768، 390. التقرير `report.json` يحتوي كل assertion والقياسات والأخطاء والطلبات المحظورة، ويخرج الاختبار برمز فشل إن لم تنجح الشروط.

## النسخة المنشورة

```bash
uv run --with playwright python tests/ui_renderer.py --url https://ceo-msajed.pages.dev --no-screenshots --output <scratch-live-output-directory>
```

هذا أيضًا يستخدم fixtures وحظر API. للاختبار العام الفعلي دون fixtures استخدم `tests/ui_public_deployment.py --output <scratch-public-output-directory>` مع أمر uv/Playwright نفسه؛ يفحص الأصول المنشورة مقابل GitHub SHA والدخول العام بلا إرسال بيانات اعتماد وCSP وConsole وService Worker. تحقق بصورة مستقلة من حالة Cloudflare الإنتاجية. لا تختبر حفظ بيانات تشغيلية دون اعتماد منفصل.

## أدلة البداية والتسليم

- baseline: `baeffc3ea3afccc35ddcbfbf7382742e7175d2d0`.
- قبل التعديل: إخفاق أهداف زر الدخول ودلالات dialog واستعادة خطأ التحميل، رغم أن JavaScript كان قابلًا للتحليل. هذا إثبات أن الاختبارات تكشف العيوب ولا تمر دائمًا.
- بعد التصحيح: نتيجة الاختبارات الفعلية مسجلة في `docs/PROJECT_STATE.md` و`docs/HANDOFF.md` وتقرير التسليم.
- بوابة العقود تقارن 33 دالة وظيفية وتعبيرات الشبكة عبر AST؛ لا تعتمد على مقارنة سلاسل whitespace.
- أي تغيير فعلي في سير العمل مستقبلًا يحتاج اختبارات وعقد قبول منفصل، وليس تحديث baseline تلقائيًا لإخفاء فرق.
