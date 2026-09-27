# Talabat Android App

Native Kotlin/Jetpack Compose customer, admin, and driver application backed by PostgreSQL and the Node.js API in `server/`.

Customers browse the real restaurant catalog and submit delivery or reservation orders. The server saves each order, emails only the eligible restaurant driver through Gmail SMTP, and advances to the next eligible driver after rejection or a five-minute response timeout. Drivers accept or reject from secure email confirmation links; the app displays their persisted orders, history, and statistics without push notifications.

Apply the additive migration with `pnpm run server:migrate`, then run the API with `PORT=8080 pnpm run server:dev`. Server tests: `pnpm run server:test` (the HTTP integration test additionally requires a test database, or an explicit opt-in for temporary fixtures on the development database). See [DEPLOYMENT.md](DEPLOYMENT.md) for Render, Android release configuration, SMTP variables, and production verification.
