---
name: TALABAT session auth setup
description: How session-based admin auth is configured in the TALABAT project
---

## Setup
- express-session with SESSION_SECRET env var (already provisioned)
- bcryptjs for password hashing (12 rounds)
- Sessions stored in memory (default); for production, use connect-pg-simple

## custom-fetch.ts
Must include `credentials: 'include'` so session cookies are sent:
```ts
const credentials = init.credentials ?? "include";
const response = await fetch(input, { ...init, method, headers, credentials });
```
**Why:** In dev, frontend (port 24738) and API (port 8080) are different origins. Even in production via Replit proxy (same origin), including credentials is required for cookies to travel.

## Seed credentials
- Username: admin, Password: admin123
- Seed script: `pnpm --filter @workspace/db exec tsx src/seed.ts`

## Routes
- POST /api/auth/login → sets session.adminId
- POST /api/auth/logout → destroys session
- GET /api/auth/me → returns current user
- PATCH /api/auth/change-password
