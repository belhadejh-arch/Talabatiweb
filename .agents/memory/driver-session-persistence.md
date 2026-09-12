---
name: Driver session persistence
description: Production session requirements for the driver portal on restartable hosts
---

Driver authentication must use a PostgreSQL-backed express-session store in production; the default in-memory store loses signed-in drivers when Render restarts or moves an instance. A long rolling cookie keeps active drivers signed in while preserving an explicit logout path.

**Why:** Render processes are restartable and can scale independently, so process memory cannot be the source of truth for a driver session.

**How to apply:** Keep the session table in the same PostgreSQL database as the driver accounts, use a stable production session secret, and configure cross-site cookies when the frontend and API use different domains.