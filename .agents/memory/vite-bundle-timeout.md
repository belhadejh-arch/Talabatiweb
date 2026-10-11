---
name: Vite production bundle timeouts
description: Notes the difference between a healthy dev preview and unusually slow production bundling in this artifact.
---

The web artifact's Vite production build exceeded five minutes during dependency transformation, including with minification disabled, while TypeScript typechecking passed and the development preview started.

**Why:** Repeating the same full bundle command did not complete or expose a source error; the delay was in transforming the large dependency graph.

**How to apply:** Before treating this as a code failure, use typechecking and the live dev preview to validate source changes; if the production build still stalls, profile the dependency graph rather than retrying unchanged commands.
