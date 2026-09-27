---
name: Vercel project roots and build output
description: Why a successful Vite build can still fail when Vercel's Root Directory points at a workspace package.
---

Treat Vercel's configured Root Directory as the base for both its `vercel.json` and `outputDirectory`. A monorepo build that writes to the repository root is not sufficient if Vercel packages from a nested project root. Keep the deployable output and configuration valid relative to the actual project root.

**Why:** A deployment showed Vite successfully finishing, then Vercel failed with “No Output Directory named public found”. The repository-root configuration specified a different output directory but was not being applied to the nested-root project. Earlier sourcemap messages were nonfatal and distracted from the actual failure.

**How to apply:** When diagnosing a Vercel build, read beyond `✓ built` to the deployment packaging result. Compare the project's Root Directory, the location of its configuration file, and the path containing the actual generated `index.html`; test each supported root choice before changing application code.