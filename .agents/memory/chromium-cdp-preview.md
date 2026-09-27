---
name: Chromium CDP preview checks
description: Environment constraints for inspecting authenticated UI without changing real accounts or app data
---

For temporary visual checks of authenticated UI, a browser-only session and intercepted API responses can verify the rendering without modifying application data. The shell's Node runtime may lack both a global WebSocket and a readily resolvable WebSocket package; a minimal standard-library CDP client is an alternative. A Chromium WebSocket handshake may use a different HTTP 101 reason phrase, so validate the status code rather than matching "Switching Protocols".

**Why:** Direct CDP inspection failed first on an unavailable Node WebSocket and then on a too-specific handshake check; accepting any HTTP 101 status allowed an isolated screenshot of the dashboard.

**How to apply:** Use this only when a static app screenshot cannot reach the view being changed. Keep test-only responses inside the inspection browser, never describe their values as live data, and stop the temporary browser afterward.