# نشر TALABAT: Backend على Replit + Frontend على Vercel

هذا التوثيق يشرح كيفية نشر الواجهة الأمامية (`artifacts/talabat`) على Vercel بينما يبقى الـ Backend (`artifacts/api-server`) وقاعدة البيانات ونظام تخزين الصور على استضافة Replit.

> **لماذا هذا التقسيم؟** رفع الصور (ضغط + تحويل WebP + تخزين) يعتمد على Replit Object Storage، والذي يتطلب الاتصال بخدمة داخلية خاصة بـ Replit (sidecar auth) — لا يعمل خارج بيئة Replit. لذلك يبقى الـ Backend على Replit، بينما الواجهة (React/Vite) يمكن نشرها في أي مكان لأنها تتحدث مع الـ API عبر HTTP فقط.

## الخطوة 1 — نشر الـ Backend على Replit

1. من لوحة Replit اضغط **Publish** لنشر المشروع (ينشر كل الـ artifacts، بما فيها `api-server`، تحت نفس النطاق).
2. بعد نجاح النشر، احصل على رابط الإنتاج (مثال: `https://your-app.replit.app`). الـ API يكون متاحاً على `https://your-app.replit.app/api/...` وفحص الصحة على `https://your-app.replit.app/health`.
3. تأكد أن قاعدة البيانات (`DATABASE_URL`) ومتغيرات تخزين الكائنات (`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`) مُهيأة بالفعل — هي كذلك في هذا المشروع.

## الخطوة 2 — إنشاء مشروع Vercel للواجهة فقط

1. في Vercel، أنشئ مشروعاً جديداً واربطه بنفس مستودع الكود (GitHub/GitLab وغيره — إن لم يكن المشروع مرتبطاً بمستودع Git بعد، فعّل ذلك من إعدادات Replit أولاً).
2. في **Project Settings → General → Root Directory** اختر: `artifacts/talabat`
3. ملف `artifacts/talabat/vercel.json` (موجود بالفعل في المشروع) يضبط أوامر البناء تلقائياً:
   - Build Command: `pnpm --filter @workspace/talabat run build`
   - Output Directory: `dist/public`
   - إعادة توجيه كل المسارات إلى `index.html` (SPA routing عبر Wouter)
4. Vercel يكتشف `pnpm-workspace.yaml` في جذر المستودع تلقائياً وينفّذ `pnpm install` من الجذر — لا حاجة لتعديل يدوي.

## الخطوة 3 — متغيرات البيئة على Vercel

في **Project Settings → Environment Variables** أضف:

| Variable | Value |
|---|---|
| `VITE_API_URL` | رابط الإنتاج من الخطوة 1، بدون `/api` في النهاية (مثال: `https://your-app.replit.app`) |
| `PORT` | `3000` (قيمة وهمية فقط — يتطلبها ملف `vite.config.ts` عند البناء، غير مستخدمة فعلياً لأن Vercel يخدم ملفات ثابتة) |
| `BASE_PATH` | `/` |

أعد النشر (Redeploy) بعد إضافة المتغيرات.

## الخطوة 4 — ربط CORS وجلسة تسجيل الدخول (نطاقان مختلفان)

بما أن الواجهة (Vercel) والـ Backend (Replit) على نطاقين مختلفين، يجب ضبط:

1. على الـ Backend (Replit)، أضف السر/المتغير `FRONTEND_URL` بقيمة نطاق Vercel الكامل (مثال: `https://talabat.vercel.app`) — هذا يفعّل CORS الصحيح وإعدادات كوكيز الجلسة (`SameSite=None; Secure`) اللازمة لتسجيل دخول الأدمن عبر النطاقين. أعد تشغيل/نشر الـ Backend بعد إضافته.
2. تحقق أن `NODE_ENV=production` مضبوط على نشر Replit (مضبوط تلقائياً عبر إعدادات النشر الحالية).

## الخطوة 5 — التحقق النهائي

- افتح `https://your-app.replit.app/health` — يجب أن يعيد `{"status":"ok"}`
- افتح موقع Vercel، سجّل دخول كأدمن (`admin` / `admin123` أو الحساب الفعلي)، وتأكد من نجاح تسجيل الدخول (الكوكيز تُحفظ عبر النطاقين)
- ارفع صورة منتج من لوحة التحكم وتأكد من ظهورها
- افتح متجر مطعم عبر الرابط العام (`/{slug}`) على نطاق Vercel وأتمم طلباً تجريبياً كاملاً (سلة → GPS → تأكيد)

## ملاحظة حول قاعدة بيانات منفصلة

إذا أردت لاحقاً فصل قاعدة البيانات عن Replit (مثلاً Postgres على Render/Neon/Supabase)، يكفي تحديث `DATABASE_URL` على نشر Replit، ثم تشغيل `pnpm --filter @workspace/db run push` لدفع المخطط، و`pnpm --filter @workspace/db run seed` لإنشاء حساب الأدمن التجريبي — لا حاجة لأي تعديل في الكود.
