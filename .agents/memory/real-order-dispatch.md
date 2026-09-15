---
name: Real-order driver dispatch
description: Production driver pushes must originate from public-menu orders and be claimed once in PostgreSQL
---

Only orders created by the public restaurant menu are eligible for driver push dispatch. Assignment rows must persist both driver sequencing and a one-time notification claim/result; startup scans must not redispatch arbitrary pending orders.

**Why:** Process memory and broad startup scans caused stale, duplicate, and cross-restaurant driver alerts.

**How to apply:** Preserve the public-order source marker, current-order/driver validation, and database notification status whenever changing assignment, retry, timeout, or manual-dispatch code.