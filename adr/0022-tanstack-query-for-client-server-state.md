# 0022. TanStack Query for client-side server-state; loaders for SSR

- **Status:** Accepted
- **Date:** 2026-06-18
- **Source:** Onboarding/auth work — question of whether to wrap server-function
  calls (loading / error / retry / onSuccess / onError) in a shared helper, and
  whether that helper should be TanStack Query.

## Context

The signup flow hand-rolls the state envelope around a server function: see
`apps/web/src/features/auth/hooks/use-account-creation.ts`, which manages
`isLoading`, `error`, `onSuccess`/`onError`, and a bespoke `withRetry`. Reads
(`getSessionFn`, `getOnboardingStatusFn`) are consumed by TanStack Router
**loaders / route guards** — SSR-first, fetched on navigation.

As domain modules (Finance, Calendar, SmartTodo, …) mount into the shell
(ADR-0018), they will each need the same plumbing: client-side reads with
caching and background refetch, and writes that must invalidate a list so the UI
updates without a manual refetch. With no documented stance, five modules will
each re-invent (and diverge on) that envelope. ADR-0002 already anticipated
"tighter integration with TanStack Query" as part of choosing TanStack Start;
this ADR makes that explicit and bounds it.

The decision has two halves the team kept conflating: *who owns the state
envelope* (loading/data/error/retry/cache) versus *who owns the operation logic*
(orchestration, retry policy, error classification). Query is excellent at the
first and must not absorb the second.

## Decision

Adopt **`@tanstack/react-query`** as the standard for **client-side
server-state** — but with a sharp boundary, and not retroactively.

1. **Router loaders own SSR / initial-navigation data.** First paint and
   route-guard reads stay in loaders. Query does not replace them; loaders may
   prime the Query cache where a component then reads live from it.
2. **Query owns the client-side envelope.** Client reads that need
   caching / dedup / background refetch use `useQuery`; writes that need
   loading/error state and **cache invalidation** use `useMutation` +
   `queryClient.invalidateQueries`. This invalidation-across-components behavior
   is the capability we currently have no substitute for.
3. **Business logic stays out of Query config.** Multi-step orchestration,
   *selective* retry (e.g. retry only the idempotent step), resume-safety, and
   error **classification** (`AccountCreationError`'s `user` vs `system` kind)
   live in our own code — inside the `mutationFn` / hook, never expressed as
   Query's blunt per-call `retry` option.
4. **Introduce it at the first real need, not now.** The first domain module
   that needs client-side caching or mutation→invalidation pulls in the
   dependency and the `QueryClientProvider`, establishing the canonical example.
5. **`use-account-creation` is not migrated.** Its value from Query is ~10 lines
   of `useState`, against a poor fit for its selective retry and error
   classification. It stays bespoke as the reference for "operation logic the
   hook owns, Query would only wrap."

## Consequences

- One mental model for client server-state across every module; the envelope is
  not re-invented per feature.
- Mutations can invalidate queries, closing the cache-coherence gap loaders
  leave open.
- A clear test for "does this belong in Query?": is it the *envelope* (yes) or
  the *operation's logic* (no — keep it in our code).
- Cost: a new dependency and a provider in the app shell, plus a second
  data-loading mechanism alongside loaders — mitigated by rule 1 drawing the
  SSR-vs-client line explicitly.
- The "no direct `@supabase` imports in `apps/web`" rule is unchanged; Query sits
  above the server-fn boundary and never touches the provider SDK.

## Alternatives considered

- **Hand-rolled hooks everywhere (status quo).** Fine for one bespoke flow; does
  not scale — no shared cache, no cross-component invalidation, guaranteed
  divergence across modules. Rejected as the general pattern.
- **Loaders for everything, no Query.** Loaders are weak at live client cache,
  optimistic updates, and post-mutation invalidation. Rejected as insufficient
  for interactive module UIs.
- **Adopt Query now and migrate `use-account-creation`.** Rejected: net-negative
  for that hook (poor fit, low gain) and premature before a module forces the
  shape. We set the boundary now (this ADR) and land the code at first need.
- **A different client-state lib (SWR, Redux Toolkit Query, Zustand).** Rejected:
  Query is the idiomatic TanStack companion already implied by ADR-0002, with
  first-class Router integration; the others add a foreign model.
