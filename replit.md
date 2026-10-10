# TALABAT — web administration, Android, and Gmail order dispatch

This checkout contains a Kotlin/Jetpack Compose Android customer, admin, and driver app (`app/`), a React/Vite customer and admin web artifact (`artifacts/talabat/`), and a Node.js/PostgreSQL API (`server/`). Do not reintroduce Telegram, OneSignal, or other notifications.

## Development

- Apply additive schema changes once to the intended database: `pnpm run server:migrate` (migrations 001–007). On Replit, `EXTERNAL_DATABASE_URL` can point to the existing external PostgreSQL database and takes precedence over Replit's managed `DATABASE_URL`; add it through Replit Secrets, not in chat or source. Confirm its target and obtain authorization before applying schema changes, since it can be shared with production. Render continues to use `DATABASE_URL`.
- Run the API: `PORT=8080 pnpm run server:dev`. Check `GET /health`.
- Run the web artifact through its managed workflow. In preview, its `/talabat/api` proxy reaches the local API workflow; the published static site has a separate API rewrite and needs the matching backend deployed before new admin routes work there.
- Run server tests: `pnpm run server:test`. The HTTP integration test needs `TEST_DATABASE_URL`, or an explicit development-database fixture opt-in.
- Android emulator defaults to `http://10.0.2.2:8080` in debug only. For a release build, supply the HTTPS backend URL via `-PAPI_BASE_URL=https://your-backend.example`.
- Required server secrets: `DATABASE_URL` on Render (or `EXTERNAL_DATABASE_URL` on Replit when using external PostgreSQL), `SESSION_SECRET` (at least 32 characters), `SMTP_USER` (central Gmail account). Required server environment: `PUBLIC_API_URL` (public HTTPS origin for action links). Gmail API on Render free additionally needs `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` configured in Render, an additive migration 003, and a one-time admin OAuth connection; connected Gmail API takes precedence. Gmail SMTP fallback requires `SMTP_PASS` (Gmail App Password) and `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true` on a host permitting SMTP. Use Gmail only, not another mail provider. `PORT` is provided by the host.
- Restaurant portal: `/restaurant-portal`. Admin provisions unique six-digit restaurant sign-in numbers when creating restaurants and the first admin overview provisions existing restaurants. The serial is encrypted in PostgreSQL with `SESSION_SECRET`; changing it invalidates all active sessions for that restaurant.
- Production setup, Render instructions, and operational recovery are in `DEPLOYMENT.md`.

## Data and behavior

- Keep existing restaurants, subscriptions, products, historical orders/attempts, and legacy notification records intact. Migrations 001, 002 and 003 add only necessary columns and tables; none is a destructive schema push. Admin delete actions archive/hide records to preserve order history.
- Only orders newly committed through `POST /api/orders` get an `order_email_dispatch_jobs` row. Historical orders have no job and are never dispatched on login, page refresh, or restart. The Android client sends a stable UUID `Idempotency-Key` per checkout attempt.
- The worker selects one eligible active driver of the same active subscribed restaurant. Rejection or five minutes after a confirmed send advances to the next eligible driver. Acceptance/response and worker updates use PostgreSQL transactions.
- The Replit development preview may share Neon data with the Render service. Its automatic email worker is disabled by default so it cannot claim live deliveries; Render must be the sole production worker. Set `DISPATCH_WORKER_ENABLED=true` in development only with an isolated test database, a valid `PUBLIC_API_URL`, and working SMTP configuration. An explicit `false` disables automatic dispatch in any environment.
- Email GET links only show confirmation; POST performs the response. Gmail API or SMTP results that may have been accepted but could not be confirmed remain `SENDING` until an admin checks Gmail Sent and reconciles explicitly. Do not retry an ambiguous send blindly.
- Driver and admin data is read from PostgreSQL. Earnings are read from recorded `driver_payout_amount` only; this checkout has no existing payout formula, so unknown payouts stay `null` rather than being invented.