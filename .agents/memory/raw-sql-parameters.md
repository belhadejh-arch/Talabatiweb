---
name: Raw SQL parameter discipline
description: Prevents runtime PostgreSQL failures in hand-written driver-dispatch queries.
---

Every positional placeholder in hand-written PostgreSQL must be used by the query and supplied by the parameter array in the same order.

**Why:** PostgreSQL rejects an unused placeholder because it cannot infer that parameter's data type; this is a runtime failure that TypeScript cannot catch.

**How to apply:** When changing raw SQL in dispatch or other transactional flows, compare every `$N` in the SQL string with the parameter array before testing the endpoint.