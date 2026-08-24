---
name: TanStack Query v5 hook patterns
description: Correct usage patterns for Orval-generated hooks with TanStack Query v5
---

## The rules

### 1. queryKey is required
In TanStack Query v5, `UseQueryOptions` requires `queryKey`. Always pass it from the generated getter:
```ts
// CORRECT
useGetRestaurant(id, { query: { queryKey: getGetRestaurantQueryKey(id), enabled: !!id } });
useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });

// WRONG — TS error: queryKey missing
useGetRestaurant(id, { query: { enabled: !!id } });
```

### 2. keepPreviousData is gone
In v5, use `placeholderData`:
```ts
// CORRECT
{ query: { queryKey: [...], placeholderData: (prev: any) => prev } }

// WRONG — TS error
{ query: { keepPreviousData: true } }
```

### 3. Hook argument order: params first, then options
Orval-generated hooks always: `useXxx(params?, options?)` or `useXxx(id, options?)`. Never pass `{ query: {} }` as the first (params) argument.
```ts
// CORRECT
useGetAnalyticsSummary(undefined, { query: { queryKey: getGetAnalyticsSummaryQueryKey() } });

// WRONG — passes options object as params
useGetAnalyticsSummary({ query: { queryKey: [...] } });
```
