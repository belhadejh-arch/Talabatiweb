---
name: Replit connectors-sdk / Object Storage runtime constraint
description: @replit/connectors-sdk AND the Object Storage skill's GCS client both only work inside a Replit runtime — deploying outside Replit (Render, Vercel, bare VPS) needs a non-Replit fallback
---

The `@replit/connectors-sdk` proxy (used to call third-party APIs like WhatsApp Business via a Replit-managed connection) only authenticates and resolves correctly when the process is running inside a Replit runtime environment.

**Why:** A backend deployed off-platform (e.g. Render) cannot reach the connector proxy, so any integration wired through it silently fails outside Replit's own workspace/deployment.

**How to apply:** When a project's deployment target is a non-Replit host, branch the integration client: use the connector proxy when running inside Replit (detect via a Replit-only env var), and fall back to a direct API-key/bearer-token call to the provider's own API when not. Document the required raw credential (e.g. a Meta System User token) in the deployment guide, since the connector's managed credential won't carry over.

**Same constraint applies to Replit Object Storage.** The object-storage skill's `objectStorageClient` (`@google-cloud/storage` `Storage` instance) authenticates via a `REPLIT_SIDECAR_ENDPOINT` (`http://127.0.0.1:1106`) token/credential exchange, not a portable GCP service account key. Any feature built on it (e.g. an image-upload pipeline) only works when the server process itself runs on Replit (dev workspace or a Replit Deployment) — it cannot be moved to Render/Vercel/a bare VPS without swapping in a real S3/GCS/Cloudinary backend with its own credentials. When a user wants a split deployment (frontend elsewhere, backend off-Replit) and the app uses Replit Object Storage, surface this constraint before assuming a lift-and-shift will work — either keep the backend on Replit, or plan a storage-provider migration as its own decision.
