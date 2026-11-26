# CleanRider-A — مساحة عمل المشروع (نسخة عامة)

موقع ويب كامل لعرض ومتابعة مشروع **CleanRider-A** (روبوت تنظيف ذاتي القيادة بالطاقة الشمسية)، مبني من ملف التصميم الأصلي.

> ⚠️ **هذه النسخة بدون تسجيل دخول.** أي شخص يملك الرابط يستطيع العرض **والتعديل والحذف**. لا تضعها على رابط عام إلا إذا كان ذلك مقصودًا.

## المزايا

- **قائمة المكونات (48 بندًا)** مع تتبّع الحالة: مطلوب / قيد التوريد / تم الاستلام / تم التركيب، والمسؤول والملاحظة.
- **إضافة مكوّن جديد** (الاسم، العدد، القسم، المواصفات) و**حذف أي مكوّن**.
- **خطة تنفيذ من 9 مراحل** مع نسب إنجاز (تصل 100% = مكتمل تلقائيًا).
- **16 اختبار قبول** مع نتيجة لكل اختبار (ناجح / راسب / لم يُنفَّذ).
- **ملاحظات الفريق** (مع اسم اختياري لكل ملاحظة).
- صفحات مرجعية: الفكرة، المواصفات، الرسومات، الطاقة والشمسية، القيادة الذاتية، التشغيل والصيانة، الأمان، تطويرات مستقبلية.
- كل التعديلات تُحفظ في قاعدة بيانات **PostgreSQL على Neon**.

## المتطلبات

- **Node.js 22 أو أحدث**
- قاعدة بيانات **Neon Postgres** ومتغير البيئة `DATABASE_URL`

## التشغيل محليًا

```bash
cp .env.example .env   # ثم ضع رابط Neon في DATABASE_URL
npm install
npm start
```

ثم افتح: `http://localhost:12000`

للتطوير مع إعادة التشغيل التلقائي:

```bash
npm run dev
```

لتغيير المنفذ:

```bash
PORT=3000 npm start
```

## النشر على Render

1. ارفع المشروع على GitHub (الخطوات بالأسفل).
2. في Render: **New → Blueprint** واختر المستودع (يقرأ `render.yaml` تلقائيًا)، أو **New → Web Service** بالإعدادات: Build `npm ci` / Start `node server.js` / Health check `/healthz`.
3. أضف متغير البيئة `DATABASE_URL` برابط Neon (يفضّل `...?sslmode=verify-full`).
4. الجداول والبيانات الأولية (48 مكوّنًا) تُنشأ تلقائيًا عند أول تشغيل.

لا تحتاج Persistent Disk: البيانات محفوظة على Neon.

## رفع المشروع على GitHub

```bash
git init
git add .
git commit -m "CleanRider-A public workspace"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
```

> GitHub يخزّن الكود فقط ولا يشغّل تطبيقات Node. لتشغيل الموقع اربط المستودع بمنصة استضافة (Render/Railway) أو شغّله على سيرفر/Docker.

## بنية المشروع

```
server.js            خادم Express وواجهات API (بدون مصادقة)
src/content.js       كل محتوى المشروع المستخرج من ملف التصميم
src/db.js            Postgres (Neon): المكونات، المراحل، الاختبارات، الملاحظات، النشاط
public/index.html    هيكل الصفحة (بدون شاشة دخول)
public/css/styles.css
public/js/app.js     التوجيه والعروض وإضافة/حذف المكونات
render.yaml          إعداد النشر على Render
```

## واجهات API

| الطريقة | المسار | الوظيفة |
|---|---|---|
| GET | `/api/project` | كل بيانات المشروع والحالات |
| POST | `/api/components` | إضافة مكوّن `{name, qty, spec, category, author}` |
| DELETE | `/api/components/:id` | حذف مكوّن |
| PATCH | `/api/components/:id` | تحديث الحالة/المسؤول/الملاحظة |
| PATCH | `/api/phases/:id` | تحديث المرحلة/التقدم |
| PATCH | `/api/tests/:id` | تحديث نتيجة اختبار |
| GET/POST | `/api/notes` | قراءة/إضافة ملاحظة |
| GET | `/api/activity` | سجل النشاط |

## إعادة ضبط البيانات

من Neon SQL Editor:

```sql
DROP TABLE components, phase_status, test_status, notes, activity;
```

ثم أعد تشغيل الخدمة وسيُعاد إنشاء الجداول والقائمة الأصلية تلقائيًا.

## ملاحظة

الأرقام والمواصفات في المشروع تقديرية (تصميم مبدئي) وتحتاج مراجعة هندسية وتقييم سلامة قبل التصنيع أو التشغيل.
