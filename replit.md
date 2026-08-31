# TALABAT — منصة إدارة المطاعم

Multi-restaurant delivery SaaS: a Super Admin dashboard for managing restaurants/menus/drivers, plus slug-based public storefronts (`/{slug}`) where customers browse a menu, build a cart, and place delivery orders with GPS location. Order confirmation auto-notifies the assigned driver over WhatsApp with a Google Maps link.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (reads `PORT`, defaults to 8080 locally)
- `pnpm --filter @workspace/talabat run dev` — customer/admin web app (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Seed admin login: `admin` / `admin123`

### Required environment variables

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | api-server | Postgres connection string |
| `SESSION_SECRET` (or `AUTH_SECRET`) | api-server | Express session signing secret |
| `FRONTEND_URL` | api-server | Restricts CORS + enables cross-site cookies (`SameSite=None`) when frontend/backend are on different domains. Required when the frontend is deployed to Vercel (see `DEPLOYMENT.md`); omit for same-origin (Replit-only) deploys |
| `VITE_API_URL` | talabat (build-time) | Absolute API origin, only needed when the frontend is deployed separately from the backend (e.g. Vercel, with the backend staying on Replit — see `DEPLOYMENT.md`). Leave unset for same-origin deploys — requests default to relative `/api/...` |
| `WhatsApp_API_Secret` or `WHATSAPP_API_KEY` | api-server | Long-lived Meta WhatsApp Cloud API token. When unset, sending falls back to the Replit WhatsApp Business connector (Replit runtime only) |
| `WHATSAPP_PHONE_ID` | api-server | Fallback WhatsApp Cloud API phone number ID, used only when Settings → WhatsApp phone ID (DB) is empty |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` | api-server | Provisioned by Replit Object Storage; back the uploaded-image pipeline |
| `NODE_ENV=production` | api-server | Enables secure/cross-site session cookies and `trust proxy` |

`GET /health` (unprefixed) and `GET /api/healthz` both report liveness for platform health checks.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, session-based admin auth (`requireAuth` middleware)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) — most endpoints go through generated TanStack Query hooks in `@workspace/api-client-react`
- Object storage: Replit Object Storage (GCS-backed) when the API runs on Replit, with a PostgreSQL-backed portable fallback for external API hosts such as Render
- Image processing: `sharp` (resize + WebP re-encode server-side before storage)
- WhatsApp: Meta Cloud API, sent server-side only (`artifacts/api-server/src/lib/whatsapp.ts`)
- Build: esbuild (api-server), Vite (talabat)

## Where things live

- `artifacts/api-server` — Express API (routes per resource under `src/routes`, `src/lib` for cross-cutting logic)
- `artifacts/talabat` — customer storefront + admin dashboard (React + Vite), routed by Wouter
- `lib/db` — Drizzle schema (source of truth for tables) + `push` script
- `lib/api-zod` / `lib/api-client-react` — generated from the OpenAPI spec (`artifacts/api-server` contract); do not hand-edit `generated/`
- Image uploads: `POST /api/uploads/image` (multipart, `requireAuth`) → `src/lib/imageUpload.ts` (sharp resize/WebP + Replit Object Storage or portable PostgreSQL fallback) → served back via `GET /api/storage/public-objects/*` or `/api/storage/db-images/:id`. The fallback stores processed WebP bytes in PostgreSQL so the Render deployment remains functional without Replit sidecar auth.
- Order placement + driver notification: `artifacts/api-server/src/routes/public.ts` — computes the Google Maps link, auto-assigns the first active driver scoped to the order's `restaurantId`, fires the WhatsApp send (fire-and-forget)

## Architecture decisions

- Uploaded images are processed **server-side** (sharp resize → WebP) rather than via a client-direct-to-GCS presigned URL, because compression must happen before the file lands in permanent storage. The endpoint accepts raw multipart (`multer`, memory storage), uses Replit Object Storage when its sidecar is available, and falls back to a lazily-created PostgreSQL image table on external hosts.
- WhatsApp send prefers a directly configured token (`WhatsApp_API_Secret`/`WHATSAPP_API_KEY`) so the app also works outside Replit (e.g. deployed to Render); it falls back to the Replit WhatsApp Business connector only when running inside a Replit runtime.
- Driver assignment and reassignment are always scoped by `restaurantId` — a driver from another restaurant can never be selected, by construction of the query filters (not just app-level convention).
- The frontend never hardcodes an API origin. `VITE_API_URL`/`setBaseUrl` is only needed for split-domain deployments; asset URLs (`src/lib/asset-url.ts`) apply the same base URL to relative object-storage paths so `<img>` tags resolve correctly either way.

## Product

- **Admin dashboard**: manage restaurants, menu (categories/products/sizes/addons with image upload), drivers, orders, analytics, and platform settings (incl. WhatsApp configuration).
- **Public storefront** (`/{slug}`): mobile-first dark-themed menu browsing, cart, and checkout with mandatory GPS location capture — order confirmation is blocked until the browser reports a location.
- **Delivery dispatch**: on order confirmation, the assigned driver (restaurant-scoped) receives a WhatsApp message with order details and a clickable Google Maps link to the customer.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After editing `lib/*` package source (e.g. `api-client-react`), project-referenced consumers resolve types through that package's built `dist/*.d.ts`, not live source — run `npx tsc -p <package>/tsconfig.json` in the edited package before typechecking a consumer, or the consumer's typecheck will show stale "no exported member" errors.
- WhatsApp sending is a no-op (logged, not thrown) unless Settings → WhatsApp is enabled **and** a phone number ID is set (DB field, with an optional `WHATSAPP_PHONE_ID` env fallback) — a configured API token alone is not enough.
- Deleting/replacing a product or category image is best-effort and non-blocking — a storage failure never blocks the DB mutation.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `object-storage` skill for the Replit Object Storage API surface reused by the image upload pipeline
- See `DEPLOYMENT.md` for the split-deployment setup (frontend on Vercel, backend on Render or Replit) — image uploads use Replit Object Storage on Replit and the portable PostgreSQL fallback on Render
