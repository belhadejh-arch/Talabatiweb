---
name: Console workflow startup
description: A successful restart response may not start a stopped console workflow in this environment.
---

Check actual running state and open port after restarting a stopped console workflow. A success message alone is not proof that the process was launched.

**Why:** A restart call reported success while the workflow still had no process, no logs, and no listening port; enabling automatic startup when configuring the same workflow started it successfully.

**How to apply:** When a console workflow appears stopped after a restart, inspect its state and logs before changing server code or starting a duplicate manual process; start the existing workflow through its configuration rather than creating another service owner.