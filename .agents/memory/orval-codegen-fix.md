---
name: Orval codegen collision fix
description: How to fix the ListProductsParams name collision between Zod value and TypeScript interface exports in the api-zod package
---

## The rule
In `lib/api-spec/orval.config.ts`, do NOT include the `schemas` option in the Zod output config. Remove:
```ts
// schemas: { path: "generated/types", type: "typescript" }, // REMOVED — causes collision
```

**Why:** Orval exports `const ListProductsParams = zod.object({})` from api.ts, and also `interface ListProductsParams` from the types dir. When both are re-exported from index.ts, TypeScript 2308 collision occurs even with `export type *`.

**How to apply:** After removing schemas, Orval still appends barrel exports to index.ts. Override it by adding this to the codegen script in package.json:
```
orval --config ./orval.config.ts && printf '...' > ../../lib/api-zod/src/index.ts && pnpm -w run typecheck:libs
```
The printf resets index.ts to only `export * from "./generated/api"` after each Orval run.

## Avoid `format: email` with pinned zod v3
Do not use `format: email` on a `type: string` OpenAPI schema. Orval emits `zod.email()` for it, which does not exist on the pinned zod v3 (that API is zod v4+), breaking the generated Zod schemas.

**Why:** Silent version-mismatch — the generated code looks correct but fails to compile/import because `zod.email()` isn't a v3 method.

**How to apply:** Use `type: string, minLength: n` (optionally with a regex `pattern`) for email-like fields instead of `format: email`.
