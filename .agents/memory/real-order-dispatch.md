---
name: Real-order driver dispatch
description: Production driver pushes must originate from public-menu orders and be claimed once in PostgreSQL
---

Only orders created by the public restaurant menu are eligible for driver push dispatch. Assignment rows must persist both driver sequencing and a one-time notification claim/result; every notification operation must carry the exact order_id, assignment_id, and driver_id triple. Push payloads must be built from the committed order/items rows, with delivery GPS/maps only for DELIVERY orders and the exact order URL. Startup scans must not redispatch arbitrary pending orders. Driver-facing realtime notifications must be queued by order key, and stale SENDING claims may be resumed only for the still-current active attempt.

**Why:** Process memory and broad startup scans caused stale, duplicate, and cross-restaurant driver alerts.

**How to apply:** Preserve the public-order source marker, current-order/driver validation, exact assignment identity, and database notification status whenever changing assignment, retry, timeout, manual-dispatch, or driver-notification UI code. Never replace a pending notification with a single global latest value. Do not reset `SENDING` claims after restart; an external push may already have been accepted.