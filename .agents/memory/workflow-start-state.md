---
name: Console workflow lifecycle
description: Successful workflow operations may not launch a stopped console process or refresh a running one.
---

Check actual running state, process start time, and open port after workflow operations. A success message alone is not proof that a stopped process launched or a running backend picked up merged code.

**Why:** A restart call reported success while the workflow still had no process, logs, or listening port. Separately, post-merge setup and reconciliation reported success while an unchanged console backend continued running pre-merge code; its newly added image route worked only after an explicit restart.

**How to apply:** When a console workflow appears stopped after restart, inspect state and logs before changing server code or creating a duplicate process. After merging backend changes, check the live route and process age; if it still serves old code, restart the existing backend workflow explicitly.