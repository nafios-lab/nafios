# 0030. The session working copy: a fifth state tier (supersedes ADR-0029)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Supersedes:** [ADR-0029](0029-jotai-client-state-four-tier-model.md)
- **Source:** Review of `useLedger`'s `staleTime: Infinity` and `_ledgerInSession`
  on the `/finance/ledger/$month` sheet (EF3.14). ADR-0029 recorded a hard rule
  — *"server data never enters an atom"* — that contradicts the shape the ledger
  sheet was deliberately built to have. This ADR restates the model with that
  rule corrected.

## Context

[ADR-0029](0029-jotai-client-state-four-tier-model.md) established a four-tier
state model (Route/URL, Server state, Derived, Client state) with Jotai as the
standard client-state mechanism. Most of it holds and is carried forward here
unchanged. One rule does not.

ADR-0029 rule 3 stated, absolutely:

> Server data never enters an atom — hard rule. […] Ledger headers, envelope
> lists, categories, and summary payloads are **never** copied into, mirrored in,
> or bridged into atoms.

That rule was drawn against a real failure mode: an **unowned mirror**. Two
homes for the same row, neither authoritative, each needing to be pushed to the
other — and under optimistic writes, rollback across both. That failure mode is
real and this ADR still forbids it.

But the rule overreached. It forbade the shape by its *mechanism* ("server data
in an atom") rather than by its *defect* ("no single owner"). And in doing so it
forbade the shape the ledger sheet already has and was intended to have:

- `useLedger(month)` reads the ledger once, `staleTime: Infinity`.
- `_ledgerInSession` holds it for the sheet's lifetime.
- `LedgerSheetProvider key={month}` scopes that store, so the copy dies when the
  sheet unmounts or the month changes.
- Consumers (`LedgerHeaderBar`, and the envelope table / rail to come) read the
  atom.

That is not a mirror. It is a **working copy**: one writer, one seed, a lifetime
with unambiguous start and end. The `/finance/ledger/$month` sheet is not a
read-and-render surface that happens to cache — it is a long-lived editing
session over one aggregate. ADR-0029 assigned it to the server-state tier, which
is why its rule 7 ("optimistic writes patch exactly one cache entry") pointed
writes at the Query cache and pulled in snapshot-rollback and per-entity write
serialisation to make that safe.

The correction is not a carve-out for one route. It is a missing tier: the model
had no home for *"data that came from the server and is being edited, before it
goes back"*. Without one, that state has to be misfiled — as server state (ADR-0029's
choice, which makes the cache a scratchpad and every keystroke a rollback
liability) or as client state (which rule 3 then forbids).

## Decision

Adopt a **five-tier state model**. Rules 1, 2, 4, 5 and 6 below are carried
forward from ADR-0029, materially unchanged. Rules 3 and 7 replace their
ADR-0029 counterparts.

### 1. Five tiers; every piece of state belongs to exactly one

| Tier | Owns | Mechanism |
|------|------|-----------|
| **Route / URL** | what you are looking at; anything shareable or back-button-able | Router path params + typed search params |
| **Server state** | the persisted truth, as last read or written | TanStack Query cache (ADR-0026) |
| **Session working copy** | server-derived data under active edit, between seed and persist | **Jotai atoms**, Provider-scoped (rule 3) |
| **Derived state** | every value computable from the tiers above | pure functions + `useMemo` — **no state at all** |
| **Client state** | ephemeral UI state with no server or URL identity | **Jotai atoms** |

Assigning a piece of state to two tiers is still the defect this model exists to
prevent. The working-copy tier is not an exception to that — it is a *hand-off*:
while a working copy is live, it is the authority for the fields it holds, and
the Query cache entry it was seeded from is a historical record, not a second
truth to reconcile against.

### 2. Jotai is the standard for client state (carried from ADR-0029)

`jotai` is the mechanism for both the client-state and session-working-copy
tiers. Client state means: filter chips, search text, collapsed groups, row
selection, which `...` menu is open, transient dialogs.

This remains a **standardization** decision, not a capability one. Much of it
could be `useState`. The value is that every module wires client state the same
way, with no `useState` → Context → store escalation ladder as a feature grows.
Jotai is small, provider-optional, composes derived atoms without boilerplate,
and subscribes at atom granularity, so row-level state does not re-render a table.

### 3. No unowned mirrors — server data enters an atom only as a session working copy

*Replaces ADR-0029 rule 3.*

Server data may live in an atom **only** as a session working copy, which must
satisfy all five conditions:

1. **One writer.** Exactly one code path mutates it. No component writes it
   "also"; no effect syncs it back from the cache.
2. **An explicit seed, from exactly one query, at a defined point.** Not a
   continuous subscription and not a `useEffect` that re-fires on every cache
   change. The seed query carries `staleTime: Infinity` (rule 7).
3. **A Provider-scoped lifetime.** The copy lives in a store owned by a
   `<Provider>` inside the surface that edits it, keyed so that switching subject
   discards it (`LedgerSheetProvider key={month}`). No cleanup effect, and no
   ambiguity about when the copy stops being authoritative.
4. **A named persistence boundary.** The point at which the copy goes back to the
   server is a stated design decision, not an emergent one. (For the ledger
   sheet, that decision is **still open** — see Open questions.)
5. **No split readership.** Consumers within the subtree read the working copy,
   not the seed query. A component reading `useLedger(month)` for a field the
   atom also holds re-creates exactly the two-truths problem this rule exists to
   prevent.

Everything else stays banned, for ADR-0029's original reasons: convenience
mirrors, atoms that shadow a list "so it's easier to read", and
`jotai-tanstack-query`-style adapters that put server data behind the atom API
and blur the source-of-truth line wholesale rather than at one controlled seam.

A surface that only reads server data has **no** working copy and reads the Query
cache directly. The tier is earned by editing, not by depth of tree — "many
nested components want this data" is answered by Query's dedup, as ADR-0029
correctly argued.

### 4. Derived values are pure functions, never a second fetch and never state (carried)

Metrics, subtotals, grouping, counts, and status verdicts are computed at render
by the package's pure domain functions (`computeLedgerMetrics`,
`summarizeHealthMargin`) — over the working copy where one exists, over the Query
cache where one does not. They are not stored, not atoms, and not their own query.

**Specifically: `get_ledger_summary` is not called on the ledger page.** That RPC
exists so *Home* can render `activeLedgerSummary` without shipping every envelope
over the wire. On a page that already holds the envelopes, calling it creates a
second entry holding the same numbers, which every edit would then have to patch
by re-deriving COL and Health Margin at the mutation site — duplicating domain
logic into the UI layer.

This rule is what satisfies *"metrics update live"*, and the working-copy tier
serves it more directly than ADR-0029's cache patch did: an atom write recomputes
every derived number in the same render, with no cache write at all.

### 5. Route and URL own navigational state (carried)

`month` is the route path param (`/finance/ledger/$month`) and stays there — never
duplicated into an atom. Filter and search belong in **typed search params**: they
are shareable, survive reload, and participate in history.

### 6. React Context is dependency injection, never a state store (carried, narrowed)

Context may carry stable, route-scoped dependencies. It may not hold state. A
Jotai `<Provider>` does not violate this — it carries a store handle, not state.

ADR-0029 preferred a per-route **view hook** (`useLedgerView(month)`) called at any
depth, relying on Query's dedup. That preference is **narrowed**: it is right for
read-only surfaces, but on a working-copy surface it collides with rule 3.5. There,
the seed query has exactly **one** observer — the component that seeds — and
everything below reads atoms.

### 7. The working copy is the single write target while the surface is mounted

*Replaces ADR-0029 rule 7.*

Edits target the working copy. The Query cache entry the copy was seeded from is
**not** patched per-edit.

Three consequences follow, and the third is the load-bearing one:

- **`staleTime: Infinity` on the seed query is required, not incidental.** A
  refetch that resolved while the sheet is open would re-seed over live edits.
  Note the mechanism precisely: `staleTime` suppresses *refetching*; `gcTime`
  (default 5 min) governs *eviction*. A remount inside `gcTime` re-seeds from the
  cache without a network call; after it, from the network. Either way the seed is
  taken once, into a store that did not previously exist — so neither path can
  overwrite a live copy.
- **ADR-0029's write-concurrency machinery does not apply.** Snapshot-and-rollback,
  `scope: { id }` mutation serialisation, and pending-variables overlays existed to
  make concurrent optimistic *cache* patches safe. Within a session, concurrent
  edits are ordinary atom writes against a single owner. That machinery returns
  only at the persistence boundary, and how it applies there depends on what that
  boundary is.
- **Per ADR-0022 rule 3 (retained), write logic stays in the module package's
  command factories** (`createEnvelopeCommands`). The hook owns the envelope and
  the atom; the package owns the semantics.

## Open questions

Deliberately not decided here. Both must be settled — in a follow-up ADR — before
the first ledger write ships, because rule 3.4 requires a *named* boundary and
these three answers are one answer:

- **The persistence boundary.** Per-edit background persist, an explicit
  commit/settle action, or debounced autosave. This choice sets the failure and
  rollback story for the working copy, and determines whether the sheet can hold
  unsaved work at all.
- **Dirty-state handling.** If the boundary permits unsaved work, the Provider's
  `key={month}` currently discards it **silently** — correct as a lifetime
  mechanism, wrong as a data-loss policy. A guard on navigate and unmount is then
  required.
- **Reconciliation with inbound Realtime.** ADR-0026 anticipates a Supabase
  `postgres_changes` → `setQueryData` subscription for cross-session liveness.
  Under a single truth that was free. With a live working copy, an inbound push
  lands in the Query cache *behind* the user's uncommitted edits, and the policy —
  ignore until persist, warn, or merge — is undefined.

Until these are answered, the ledger sheet is read-and-seed only. Shipping a write
path without them is the defect this section exists to prevent.

## Consequences

**Enables**

- **A home for edit-in-progress data.** The model no longer forces a choice
  between misfiling a working copy as server state and having it forbidden
  outright. This is the whole point.
- **Live metrics, more directly than before.** An atom write recomputes the metrics
  strip, subtotals, and rail synchronously, with no cache write and no
  invalidation.
- **A clean cache.** The Query cache holds what the server last confirmed, not
  a scratchpad of in-flight UI state. That keeps `staleTime: Infinity` honest and
  leaves the Realtime path a well-defined place to land.
- **One client-state idiom across seven apps** (carried from ADR-0029). No
  per-feature deliberation, no escalation ladder.
- **Domain logic stays in the domain package** (carried). No surface re-derives
  metrics, so thresholds and money math live only in `@nafios/finance`.
- **Shareable, reloadable UI state** (carried). Filters and search survive refresh
  and copy-paste because they are in the URL.

**Costs / constraints**

- **The new tier is the one reviewers will over-reach for.** "This screen edits
  things, so it gets a working copy" is wrong when the edit is a single field with
  an immediate write — that is a plain optimistic mutation on the cache. Rule 3's
  five conditions are the test, and they are *conjunctive*; cite them.
- **The persistence boundary is now a required design step** for any working-copy
  surface, and it is unanswered for the ledger sheet. Rule 3.4 makes that
  omission visible rather than latent, which is the intent, but it is a real
  blocker on the write path.
- **Realtime liveness got harder.** ADR-0029's single write target made
  cross-session push trivial; this model owes it a reconciliation policy.
- **Two ADRs to read on one subject.** 0029 is superseded, not deleted — its
  Decision section is immutable per `adr/README.md`, and its
  `Alternatives considered` reasoning is still the best record of why Context,
  Zustand, and `jotai-tanstack-query` were rejected.
- **A new dependency and now five tiers to teach** (carried). Mitigated by the
  tier table being the whole rule.
- **Per-consumer recomputation** (carried). A `useMemo` per consumer is negligible
  at ledger scale; if it ever shows in a profile, the fix is a derived atom, not a
  cache.

## Alternatives considered

- **Keep ADR-0029 as written; delete `_ledgerInSession` and read
  `useLedger(month)` in every consumer.** This is what the review that produced
  this ADR initially proposed, and it is correct for a read-only sheet: Query
  dedupes, so it is one fetch and one truth, and it removes a `useEffect` copy.
  Rejected because it solves the sheet's *current* state (nothing is editable yet)
  at the cost of its intended one — it would be reversed by the first edit
  feature, and reversed back into an atom under a rule that forbids atoms.
- **A named exception scoped to `/finance/ledger/$month`.** Rejected: the same
  shape will recur in Budgeting, Document, and SmartTodo, and a route-scoped
  exception gets copy-pasted into a de facto tier without conditions attached. If
  it is going to be replicated, it gets defined once with entry criteria.
- **Delete ADR-0029 outright.** Rejected: `adr/README.md` makes Accepted ADRs
  immutable and their numbers non-reusable, and 0029 was already pushed. Five of
  its seven rules stand unchanged; deleting it would discard the tier model, the
  Jotai standardization, the derived-state rule, and its alternatives analysis
  along with the two rules that were wrong.
- **Amend 0029 in place, or via a narrow amending ADR** (the 0022 → 0026
  precedent). Rejected: rules 3 and 7 are the load-bearing ones — where truth
  lives and where writes go — and rule 3's language ("hard rule", "never",
  "including via adapters") is emphatic enough that a patch note against it reads
  as a contradiction rather than a correction. Superseding leaves one coherent
  document.
- **React Context as the shared store for ledger data + metrics.** Rejected, as in
  ADR-0029: a bespoke per-feature shape every module would re-invent slightly
  differently. Retained in the narrower role of rule 6.
- **Zustand, or Redux Toolkit.** Rejected, as in ADR-0029: a store-shaped model
  (single store, slices, selectors) is heavier than what is held, and neither
  offers atom-granular subscription without selector discipline.
- **`jotai-tanstack-query` atoms as the unified access path.** Rejected, as in
  ADR-0029 — and the working-copy tier does *not* reopen it. That adapter blurs
  the source-of-truth line for every read; rule 3 blurs it at one audited seam
  with five conditions attached.
- **A dedicated metrics query (`get_ledger_summary`) on the ledger page.**
  Rejected, as in ADR-0029: a second entry holding numbers derivable from the
  first. The RPC stays Home's.
- **Store computed metrics on `monthly_ledger`.** Rejected, as in ADR-0029:
  contradicts `packages/finance/spec.md` (metrics are never persisted) and makes
  every envelope write a two-table transaction with a staleness window.
