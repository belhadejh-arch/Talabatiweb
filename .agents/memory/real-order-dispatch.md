---
name: Real-order driver dispatch
description: Production driver pushes must originate from public-menu orders and be claimed once in PostgreSQL
---

Only orders created by the public customer flow (`ANDROID_CUSTOMER`) are eligible for driver email dispatch. Assignment rows must persist driver sequencing and a one-time notification claim/result; each operation carries the exact order_id, assignment_id, and driver_id triple. Messages use committed order/items, including delivery GPS/maps only for DELIVERY orders. Startup scans must not redispatch arbitrary historical orders. An untouched PENDING delivery with no send attempt may be delivered after Gmail is connected, but old FAILED or ambiguous SENDING deliveries require human review. If no external request began because credentials or subscription eligibility are missing, preserve a safe retry; never reset SENDING after a request begins.

**Why:** Broad scans and replaying failed/ambiguous mail can produce duplicate or stale notifications; conversely, genuinely queued orders with no send attempt should not be stranded solely because Gmail was connected later.

**How to apply:** Preserve the public-order source marker, current-order/driver validation, exact assignment identity, and database notification status whenever changing assignment, retry, timeout, manual-dispatch, or driver-notification code. Do not replay legacy orders or retry an old FAILED/ambiguous send blindly. Imported databases must create foundational restaurant/driver tables before additive runtime-schema checks.