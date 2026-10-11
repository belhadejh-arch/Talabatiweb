---
name: Legacy API preview routing
description: The routing distinction between a legacy console server and a path-based web artifact preview.
---

Do not assume a running legacy console workflow makes its API available at the root path of a path-based artifact preview. Route preview requests through the artifact's own prefix and a development-only server-side proxy, or register the API as a routed artifact service. Also verify that the preview proxy targets the *current local* backend, not a separately deployed older version. A static deployment needs its own rewrite to the external API, and that rewrite must be present in the active deployment.

**Why:** After a web artifact was registered, a root API request returned HTTP 404, “Backend Not Configured”, despite the original server workflow still running. Later, existing catalog routes returned 200 while newly added admin routes returned 404 because the preview proxy still pointed to an older deployed backend. In production, Vercel can still forward to an obsolete Render hostname after the repository config is corrected; the proxied 404 may retain Render's `x-render-routing: no-server` header even though the response's `server` header says Vercel.

**How to apply:** When changing browser API calls or artifact routing, verify a *new* protected route through the preview prefix (unauthenticated 401 rather than remote 404) and check the deployment rewrite separately; do not infer its target from catalog or health success. For a Vercel production 404, compare the public `/api` response with both the old and current Render origins, then redeploy the commit containing the rewrite change and confirm protected API routes return 401 when called without a token.