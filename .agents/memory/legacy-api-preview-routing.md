---
name: Legacy API preview routing
description: The routing distinction between a legacy console server and a path-based web artifact preview.
---

Do not assume a running legacy console workflow makes its API available at the root path of a path-based artifact preview. Route preview requests through the artifact's own prefix and a development-only server-side proxy, or register the API as a routed artifact service. A static deployment needs its own rewrite to the external API.

**Why:** After a web artifact was registered, a root API request returned HTTP 404, “Backend Not Configured”, despite the original server workflow still running. The artifact-prefixed proxy request reached the intended backend.

**How to apply:** When changing browser API calls or artifact routing, verify the preview-prefixed request and the deployment rewrite separately; do not infer one from a running workflow or a successful backend health check.