---
name: Drizzle schema drift
description: Safe handling of additive schema changes when the development database has existing Drizzle naming conflicts
---

When the development database has pre-existing schema drift and `drizzle-kit push` requires an interactive conflict choice, prefer a reviewed, additive SQL migration for the exact required columns, tables, indexes, and data normalization rather than using a force push.

**Why:** Non-interactive workspace commands cannot answer Drizzle's conflict prompt, and a force push can rename or remove unrelated existing tables.

**How to apply:** Keep the Drizzle schema source updated, apply only the necessary DDL transactionally, verify the resulting columns/indexes/rows, and let the application's idempotent schema guard cover startup safety.