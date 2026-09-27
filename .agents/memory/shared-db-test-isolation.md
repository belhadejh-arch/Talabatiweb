---
name: Shared database test isolation
description: Prevent false preservation failures when integration suites share one temporary PostgreSQL database.
---

Run database-backed integration files serially if any suite snapshots global table counts to verify cleanup, or give each file its own isolated database.

**Why:** Parallel suites can create and remove their own fixtures between another suite's before/after snapshots, making safe cleanup appear to have changed unrelated data.

**How to apply:** When adding database-backed tests or changing the test runner, check whether suites share a database and use whole-table snapshots before enabling cross-file concurrency.