---
name: Stale dist types after editing a lib/* package
description: Why editing lib/api-client-react (or similar) source doesn't show up in a consumer's typecheck until rebuilt
---

Packages like `lib/api-client-react` use TS project references (`composite: true`, `emitDeclarationOnly`, `outDir: dist`). Even though `package.json` `exports` points at `./src/index.ts`, `tsc -p <consumer>/tsconfig.json --noEmit` resolves cross-package types through the referenced project's **built** `dist/*.d.ts`, not live source.

**Why:** TS project references redirect type resolution to each referenced project's emitted declarations for incremental-build correctness; the `exports` field alone doesn't override that when `references` is set in the consumer's tsconfig.

**How to apply:** After editing exported source in any `lib/*` package that other packages reference, rebuild its declarations before typechecking a consumer: `npx tsc -p lib/<package>/tsconfig.json` (regenerates `dist/*.d.ts`). Otherwise the consumer's typecheck reports "has no exported member" for symbols you just added, which looks like a real error but is just a stale-dist artifact.
