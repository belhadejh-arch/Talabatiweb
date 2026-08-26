---
name: Replit connectors-sdk runtime constraint
description: @replit/connectors-sdk only works inside a Replit runtime — deploying outside Replit (Render, Vercel, bare VPS) needs a non-connector fallback
---

The `@replit/connectors-sdk` proxy (used to call third-party APIs like WhatsApp Business via a Replit-managed connection) only authenticates and resolves correctly when the process is running inside a Replit runtime environment.

**Why:** A backend deployed off-platform (e.g. Render) cannot reach the connector proxy, so any integration wired through it silently fails outside Replit's own workspace/deployment.

**How to apply:** When a project's deployment target is a non-Replit host, branch the integration client: use the connector proxy when running inside Replit (detect via a Replit-only env var), and fall back to a direct API-key/bearer-token call to the provider's own API when not. Document the required raw credential (e.g. a Meta System User token) in the deployment guide, since the connector's managed credential won't carry over.
