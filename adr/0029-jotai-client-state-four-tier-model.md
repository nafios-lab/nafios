# 0029. Jotai for client UI state; the four-tier state model

- **Status:** Accepted
- **Date:** 2026-08-18
- **Source:** `/finance/ledger/$month` dashboard (EF3.14) state-management review —
  whether the ledger's shared reads, derived metrics, and UI state should be held
  in React Context or Jotai atoms. Extends
  [ADR-0026](0026-modules-client-side-data-server-fns-shell-only.md) (which
  governs *server* state) to the client-state half of the same question.

## Context

[ADR-0022](0022-tanstack-query-for-client-server-state.md) and
[ADR-0026](0026-modules-client-side-data-server-fns-shell-only.md) settled
**server** state: modules read and write their own data client-side through
TanStack Query over a Supabase browser client. Neither ADR says anything about
**client** state — filters, search text, row selection, open menus, inline-edit
drafts — nor about where *derived* values live.

The ledger dashboard is the first surface where that gap bites. It renders a
metrics strip (Opening Balance, COL, Max Capped, Health Margin, ASM
Contribution), a grouped envelope table with per-category subtotals, a
right-hand rail (Outstanding, Carry-overs, Recent Activity), a month selector, a
filter chip row, and a search box — a deep tree in which many nested components
want the same underlying ledger. The requirements are that **every write is
optimistic** and that **the metrics update live as the user edits**.

Two conflations had to be resolved before the Context-vs-Jotai question could be
answered at all:

1. **Derived metrics are not data.** `computeLedgerMetrics` /
   `summarizeHealthMargin` are **pure** functions over
   `{ openingBalance, maxCapped, envelopes[] }`, exported from
   `@nafios/finance` via `src/domain/ledger-metrics.ts` and
   `src/domain/health-margin.ts`. `packages/finance/spec.md` states the invariant
   outright: *"derived metrics are NOT stored — recomputed live on every read."*
   Every number in the metrics strip is therefore a function of two cache
   entries, not a third thing to fetch, store, or synchronise.
2. **"Shared by nested components" does not imply "needs a store."** A route
   param is readable at any depth from the router, and TanStack Query dedupes by
   key — so N components calling the same read hook produce one fetch and one
   shared cache entry. Much of what looks like a prop-drilling problem is already
   solved by the two mechanisms in play.

The remaining force is **consistency across the suite**. This is the same
argument ADR-0022 made for server state (*"With no documented stance, five
modules will each re-invent — and diverge on — that envelope"*), and it applies
unchanged to client state. Seven apps are coming. A per-feature judgment call
between `useState`, Context, and a store guarantees seven idioms.

## Decision

Adopt a **four-tier state model** for module UIs, with **Jotai** as the standard
occupant of the client-state tier.

### 1. Four tiers; every piece of state belongs to exactly one

| Tier | Owns | Mechanism |
|------|------|-----------|
| **Route / URL** | what you are looking at; anything shareable or back-button-able | Router path params + typed search params |
| **Server state** | the single source of truth for persisted data | TanStack Query cache (ADR-0026) |
| **Derived state** | every value computable from the tiers above | pure functions + `useMemo` — **no state at all** |
| **Client state** | ephemeral UI state with no server or URL identity | **Jotai atoms** |

Assigning a piece of state to two tiers is the defect this model exists to
prevent. If it is in the URL, it is not in an atom; if it is in the Query cache,
it is not anywhere else.

### 2. Jotai is the standard for client state — adopted now

`jotai` is added to `apps/nafios-web` and the ledger dashboard is its canonical
example. Client state means: filter chips, search text, collapsed groups, row
selection, which `...` menu is open, inline-edit drafts, transient dialogs.

This is a **standardization** decision, not a capability one. Much of the above
could be `useState`. The value is that every module wires client state the same
way, so there is no recurring "does this deserve a store?" debate and no
escalation path from `useState` → Context → store as a feature grows. Jotai is
chosen because it is small, provider-optional, composes derived atoms without
boilerplate, and subscribes at atom granularity (so row-level state does not
re-render a table).

### 3. Server data never enters an atom — hard rule

The Query cache is the sole source of truth for persisted data. Ledger headers,
envelope lists, categories, and summary payloads are **never** copied into,
mirrored in, or bridged into atoms — including via `jotai-tanstack-query`-style
adapters. Two homes for the same row means owning the sync, and under optimistic
writes it means owning rollback across both.

This rule is what makes the standardization in rule 2 safe: a uniform idiom
replicated across seven modules is an asset only if the shape being replicated
is correct.

### 4. Derived values are pure functions, never a second fetch and never state

Metrics, subtotals, grouping, counts, and status verdicts are computed at render
from the Query cache by the package's pure domain functions
(`computeLedgerMetrics`, `summarizeHealthMargin`). They are not stored, not
atoms, and not their own query.

**Specifically: `get_ledger_summary` is not called on the ledger page.** That RPC
exists so *Home* can render `activeLedgerSummary` without shipping every
envelope over the wire. On a page that already holds the envelopes, calling it
would create a second cache entry holding the same numbers — which every
optimistic write would then have to patch by re-deriving COL and Health Margin
at the mutation site, duplicating domain logic into the UI layer and
reintroducing the flicker this model removes.

This rule is what satisfies "metrics update live": an optimistic patch to the
envelope cache entry recomputes every derived number **in the same render**, with
no invalidation and no refetch.

### 5. Route and URL own navigational state

`month` is the route path param (`/finance/ledger/$month`) and stays there — it
is never duplicated into an atom. Filter and search belong in **typed search
params**, not client state: they are shareable, survive reload, and participate
in history.

### 6. React Context is dependency injection, never a state store

Context may carry stable, route-scoped dependencies. It may **not** hold state,
and a "feature context" that wraps server data is not the pattern.

The preferred shape is a per-route **view hook** — e.g.
`useLedgerView(month)` — that reads the route param, calls the module's
`useQuery` hooks, and returns the data plus its pure derivations. Query's
dedup makes calling it at any depth correct and cheap, which removes the
prop-drilling motive for a provider entirely. Reach for Context only when a
route-scoped value genuinely cannot be reconstructed from router params + the
Query cache.

### 7. Optimistic writes patch exactly one cache entry

Every mutation's optimistic update targets a single Query cache entry (for the
ledger page: the envelope list). Derived values follow automatically per rule 4.

Concurrent in-flight writes must not be handled by naive
snapshot-and-rollback — with two mutations in flight, `onError` restores a
snapshot predating the other's patch and silently drops an edit. Use either:

- **`scope: { id }` on the mutation**, serialising writes per entity so
  per-entity snapshot patching is safe (the default; sufficient for most
  surfaces); or
- **a pending-variables overlay** (`useMutationState` → layer in-flight
  variables over the server list at render), where rollback is automatic and
  concurrency composes — for rapid-fire interaction such as status toggles.

Per ADR-0022 rule 3 (retained), the write *logic* stays in the module package's
command factories (`createEnvelopeCommands`); the hook owns only the envelope and
the cache patch.

## Consequences

**Enables**

- **Live metrics for free.** One optimistic patch to one cache entry recomputes
  the whole metrics strip, subtotals, and rail synchronously. This is a
  consequence of the model, not a feature anyone builds.
- **One client-state idiom across seven apps.** No per-feature deliberation, no
  `useState` → Context → store escalation ladder, no divergence as modules land.
- **A single write target.** Optimistic patching, rollback, and a future Supabase
  Realtime `postgres_changes` → `setQueryData` subscription (the live
  cross-session path ADR-0026 anticipated) all aim at one cache entry.
- **Domain logic stays in the domain package.** Because no surface re-derives
  metrics, thresholds and money math live only in `@nafios/finance`.
- **Shareable, reloadable UI state.** Filters and search survive refresh and
  copy-paste because they are in the URL.

**Costs / constraints**

- **A new dependency and a new tier to teach.** `jotai` in
  `apps/nafios-web` (small, but real), plus a four-tier model reviewers must
  hold in their heads. Mitigated by the tier table being the whole rule.
- **Standardization means occasional over-machinery.** Some client state that
  `useState` would have covered becomes an atom. Accepted deliberately: the
  consistency is the point.
- **The derived-state rule must be enforced in review.** "Just add a query for
  the totals" and "cache the metrics in an atom" are the two natural wrong turns,
  and both look reasonable in isolation. Rules 3 and 4 exist to be cited.
- **Per-consumer recomputation.** A view hook's `useMemo` runs once per consumer.
  Negligible at ledger scale (tens of envelopes); if it ever shows in a profile,
  the fix is Query's `select`, not a cache.
- **Concurrency handling is now a required design step** for any surface with
  rapid successive writes — rule 7 is the checklist, not an optimization.

## Alternatives considered

- **React Context as the shared store for ledger data + metrics.** Rejected.
  It works, but it is a bespoke per-feature shape that every module would
  re-invent slightly differently, it invites server data into a second home, and
  the prop-drilling problem it solves is largely already solved by route params
  plus Query's dedup. Retained in a strictly narrower role by rule 6.
- **`useState` locally, escalate to Context when shared (status quo).** Rejected:
  it is a judgment call re-litigated per feature, and the escalation is a
  refactor each time. This is precisely the divergence ADR-0022 was written to
  prevent for server state.
- **Zustand, or Redux Toolkit.** Rejected: a store-shaped model (single store,
  slices, selectors) is heavier than the ephemeral UI state actually being held,
  and neither offers atom-granular subscription without selector discipline.
- **`jotai-tanstack-query` atoms as the unified access path.** Rejected —
  superficially the most "consistent" option, and the most dangerous. It puts
  server data behind the atom API, blurring the source-of-truth line rule 3
  draws, and complicates optimistic patching and rollback for no gain.
- **A dedicated metrics query (`get_ledger_summary`) on the ledger page.**
  Rejected: a second cache entry holding numbers already derivable from the
  first, which every optimistic write must patch by hand — the failure mode rule
  4 names explicitly. The RPC stays Home's.
- **Store computed metrics on `monthly_ledger`.** Rejected: contradicts
  `packages/finance/spec.md` (metrics are never persisted) and would make every
  envelope write a two-table transaction with a staleness window.
