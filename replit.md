# TALABAT — Android + Gmail order dispatch

This checkout contains a Kotlin/Jetpack Compose Android customer, admin, and driver app (`app/`) and a Node.js/PostgreSQL API (`server/`). It does **not** contain the old React/Vite or Express artifact packages. Do not reintroduce Telegram, OneSignal, or other notifications.

## Development

- Apply additive schema changes once to the intended database: `pnpm run server:migrate`.
- Run the API: `PORT=8080 pnpm run server:dev`. Check `GET /health`.
- Run server tests: `pnpm run server:test`. The HTTP integration test needs `TEST_DATABASE_URL`, or an explicit development-database fixture opt-in.
- Android emulator defaults to `http://10.0.2.2:8080` in debug only. For a release build, supply the HTTPS backend URL via `-PAPI_BASE_URL=https://your-backend.example`.
- Required server secrets: `DATABASE_URL`, `SESSION_SECRET` (at least 32 characters), `SMTP_USER` (central Gmail account), and `SMTP_PASS` (Gmail App Password). Required server environment: `PUBLIC_API_URL` (public HTTPS origin for action links); Gmail settings are `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`. `PORT` is provided by the host.
- Production setup, Render instructions, and operational recovery are in `DEPLOYMENT.md`.

## Data and behavior

- Keep existing restaurants, subscriptions, products, historical orders/attempts, and legacy notification records intact. Migration `server/migrations/001_driver_email_dispatch.sql` adds only necessary columns and tables; it is not a destructive schema push.
- Only orders newly committed through `POST /api/orders` get an `order_email_dispatch_jobs` row. Historical orders have no job and are never dispatched on login, page refresh, or restart. The Android client sends a stable UUID `Idempotency-Key` per checkout attempt.
- The worker selects one eligible active driver of the same active subscribed restaurant. Rejection or five minutes after a confirmed send advances to the next eligible driver. Acceptance/response and worker updates use PostgreSQL transactions.
- Email GET links only show confirmation; POST performs the response. SMTP results that may have been accepted but could not be confirmed remain `SENDING` until an admin checks Gmail Sent and reconciles explicitly. Do not retry an ambiguous send blindly.
- Driver and admin data is read from PostgreSQL. Earnings are read from recorded `driver_payout_amount` only; this checkout has no existing payout formula, so unknown payouts stay `null` rather than being invented.