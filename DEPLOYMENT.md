# نشر TALABAT — Vercel (الواجهة) + Render (الخادم)

هذا المشروع أحادي الريبو (monorepo) بإدارة pnpm. عند النشر خارج Replit، الواجهة
الأمامية (`artifacts/talabat`) والخادم (`artifacts/api-server`) يعملان على نطاقين
مختلفين، لذا يجب ضبط CORS وملفات تعريف الارتباط عبر النطاقات (already done in code).

## 1) الخادم على Render

أنشئ خدمة **Web Service** جديدة على Render وأشر إلى هذا الريبو.

- **Root Directory:** اتركه فارغًا (جذر المستودع) — الأوامر أدناه تُشغَّل من الجذر لأن pnpm workspace يحتاج التثبيت من الجذر.
- **Build Command:**
  ```
  corepack enable && pnpm install --frozen-lockfile=false && pnpm --filter @workspace/db run push && pnpm --filter @workspace/api-server run build
  ```
- **Start Command:**
  ```
  pnpm --filter @workspace/api-server run start
  ```
- **Environment Variables (Render → Environment):**
  | المتغير | القيمة |
  | --- | --- |
  | `DATABASE_URL` | رابط قاعدة بيانات Postgres (يمكن إنشاؤها كخدمة Render Postgres منفصلة، أو استخدام نفس قاعدة بيانات Replit) |
  | `SESSION_SECRET` | نص عشوائي طويل وسري لتوقيع الجلسات |
  | `FRONTEND_URL` | رابط الواجهة الأمامية على Vercel، مثل `https://talabat.vercel.app` (بدون شرطة مائلة في النهاية) |
  | `NODE_ENV` | `production` |
  | `WHATSAPP_API_KEY` | **مطلوب فقط على Render.** رمز وصول طويل الأمد من Meta (System User Token) بصلاحية `whatsapp_business_messaging`. داخل Replit يُستخدم موصل WhatsApp Business المتصل تلقائيًا، لكن هذا الموصل غير متاح خارج بيئة Replit، لذا خارج Replit يعتمد الخادم على هذا المتغير مباشرة. |
  | `PORT` | يضبطها Render تلقائيًا — لا تحدّدها يدويًا |

  ملاحظة: معرّف رقم الهاتف (`phone_number_id`) لا يُضبط كمتغير بيئة — يُدخله المشرف من صفحة الإعدادات داخل التطبيق (يُخزَّن في قاعدة البيانات).

## 2) الواجهة الأمامية على Vercel

أنشئ مشروع Vercel جديد يشير إلى هذا الريبو.

- **Root Directory:** `artifacts/talabat`
- **Build Command (Override):**
  ```
  cd ../.. && corepack enable && pnpm install --frozen-lockfile=false && pnpm --filter @workspace/talabat run build
  ```
- **Output Directory (Override):** `dist/public`
- **Install Command:** اتركه فارغًا/افتراضيًا (يتم التثبيت ضمن Build Command أعلاه لأن pnpm workspace يحتاج التثبيت من جذر المستودع)
- **Environment Variables:**
  | المتغير | القيمة |
  | --- | --- |
  | `VITE_API_URL` | رابط خادم Render الكامل، مثل `https://talabat-api.onrender.com` (بدون شرطة مائلة في النهاية) |
  | `PORT` | أي رقم، مثل `3000` — غير مُستخدم فعليًا في الإنتاج، لكن ملف vite.config.ts يتطلب وجوده وقت البناء |
  | `BASE_PATH` | `/` |

## 3) بعد النشر

1. افتح رابط Vercel وسجّل الدخول كمشرف — تأكد أن تسجيل الدخول يعمل (هذا يتحقق من عمل الجلسات عبر النطاقات المختلفة).
2. من صفحة الإعدادات، أدخل معرّف رقم واتساب (Phone Number ID) وفعّل الإرسال.
3. أنشئ مطعمًا تجريبيًا، أضف سائقًا، وضع طلبًا من رابط المتجر العام للتأكد من وصول رسالة واتساب للسائق.

## ملاحظات معمارية

- الخادم يقرأ `PORT` من البيئة إلزاميًا (`artifacts/api-server/src/index.ts`) — يتوافق مباشرة مع طريقة عمل Render.
- CORS مضبوط عبر `FRONTEND_URL` في `artifacts/api-server/src/app.ts`.
- ملف تعريف ارتباط الجلسة يستخدم `SameSite=None; Secure` تلقائيًا عند `NODE_ENV=production` للسماح بعمل الجلسات عبر نطاقين مختلفين (Vercel + Render).
- بديل: يمكن نشر كل من الواجهة والخادم كنشر واحد على Replit (نفس الأصل، بدون تعقيد CORS/الجلسات عبر النطاقات) إن رغبتم بتبسيط الإعداد لاحقًا.
