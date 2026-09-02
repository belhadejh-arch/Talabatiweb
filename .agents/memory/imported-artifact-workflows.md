---
name: Imported artifact workflows
description: How to run imported artifact services when metadata exists but managed workflows are not registered
---

Imported projects can contain valid `.replit-artifact/artifact.toml` files while the workspace workflow registry is empty. In that case, configure only the existing API and web services manually, with explicit `PORT` values matching their artifact service ports.

**Why:** Without injected artifact environment variables, the API exits before listening and Vite falls back to port 3000, causing workflow startup failures even though the code builds.

**How to apply:** Check `listWorkflows()` before using managed workflow names. If none are registered, use the artifact commands with `PORT` (and the frontend API origin when the services run on separate local ports), then verify the API through the shared proxy.