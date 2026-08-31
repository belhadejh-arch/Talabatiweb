---
name: Portable image storage
description: Product image uploads must work on external hosts that cannot access Replit's Object Storage sidecar.
---

Use Replit Object Storage when its sidecar is available; otherwise persist processed WebP images in PostgreSQL and serve them through an API route.

**Why:** The public TALABAT API runs on Render, where Replit Object Storage authentication is unavailable; relying on the sidecar makes uploads fail with a generic 500.

**How to apply:** Keep the fallback persistent and authenticated for writes, expose only public image reads, and delete fallback blobs when products or categories are replaced or removed.