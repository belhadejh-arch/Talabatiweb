---
name: PostgreSQL fixture cleanup
description: How to avoid leaving temporary HTTP-test data after a committed request fails an assertion.
---

Register the uniquely named test parent immediately, then discover and remove its child records during cleanup. Do not rely only on child IDs appended after HTTP-response assertions.

**Why:** An order can commit before a response assertion fails, so the cleanup list may never receive that order ID. One such failure left a temporary order until it was identified and removed separately.

**How to apply:** For database-backed integration tests on a shared development database, scope cleanup to the unique test-owned parent, refuse to delete unexpected child records, and verify original counts/state afterward.