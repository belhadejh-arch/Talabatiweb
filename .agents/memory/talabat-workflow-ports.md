---
name: TALABAT workflow ownership
description: Port conflicts between legacy and artifact-managed TALABAT services
---

Only one TALABAT API workflow should own port 8080 and one TALABAT web workflow should own port 24738. This workspace can expose both legacy workflow names and artifact-managed workflow names; starting both pairs creates `EADDRINUSE` failures and can leave stale failed workflow statuses while an orphaned process still serves traffic.

**Why:** Duplicate service owners made the preview appear unreliable and obscured the actual checkout behavior.

**How to apply:** Stop conflicting owners first, then start the managed `artifacts/api-server: API Server` workflow and `artifacts/talabat: web` workflow, API before web.