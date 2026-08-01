# 0026. Domain modules fetch data client-side; server functions are the shell's

- **Status:** Accepted
- **Date:** 2026-08-01
- **Source:** EF3.13 wiring review — whether the Finance-Home read should be a
  loader → server function (per ADR-0022) or a client-side TanStack Query read
  against a Supabase browser client. Supersedes [ADR-0022](0022-tanstack-query-for-client-server-state.md)
  for **domain-module data**.

## Context

[ADR-0022](0022-tanstack-query-for-client-server-state.md) split data-loading on
a **first-paint-vs-interactive** axis: router loaders (server-side) own SSR /
initial-navigation / route-guard reads; TanStack Query owns the client-side
envelope (caching / refetch / mutation→invalidation); and Query was deferred to
"the first real need."

Wiring EF3.13 — the first domain-module read to go end-to-end — exposed the
problem with that axis. Applying rule 1 to a *module* read pushed the
Finance-Home fetch into a loader → server function, while the very next Finance
feature (the create-ledger mutation, and any live cross-session refresh) would
be TanStack Query. That means **one module fetching some of its own data through
server functions and some through Query**, split on a subtle axis that every
module would re-litigate. As five modules mount into the shell (ADR-0018), that
divergence compounds and gets harder to maintain and scale.

Three facts make a cleaner split available:

1. **The domain packages were already built for client-side execution.**
   `@nafios/finance` exposes `createBrowserClient()` documented as *"the runtime
   client — Finance runs client-side, reads the logged-in browser session,
   auto-refreshes the token, and runs as the user (RLS applies)"*
   (`packages/finance/src/index.ts`, `packages/finance/CLAUDE.md`). The
   server-function wiring was the deviation, not the package's design.
2. **RLS is enabled and hardened on every domain table.** Owner-isolation RLS
   ([ADR-0023](0023-rls-for-owned-domain-tables.md)) plus composite-FK
   ownership hardening (EF1.11) cover all finance tables; auth-epic tables too
   ([ADR-0024](0024-rls-for-auth-epic-tables.md)). The database is ready to be
   the security boundary for direct client access.
3. **Server functions cost a serverless invocation per call in production.**
   Routing every module read through the SSR function is a recurring ops cost
   that direct browser → Supabase avoids.

## Decision

Split data access on the **shell-vs-module** axis, not first-paint-vs-interactive.

1. **The shell owns server functions — and keeps them minimal.** Session/auth,
   route guards, onboarding, and other shell-infrastructure operations run
   through TanStack Start server functions + loaders (the existing
   `apps/web/src/lib/auth-fns.ts` / `onboarding-fns.ts` pattern). These are the
   trust-boundary operations that must run server-side. Keep this surface
   **small** — every server function is a serverless invocation on prod.

2. **Domain modules own their data client-side.** Every domain module (Finance,
   Calendar, SmartTodo, …) reads **and** writes its own data **directly from the
   browser** via a Supabase **browser client**, governed by **TanStack Query** —
   `useQuery` for reads, `useMutation` + `invalidateQueries` for writes, whether
   the read is first-paint or interactive. **No server functions for
   module-domain data.**

3. **The browser client comes from the module's `@nafios/*` package, never raw
   `@supabase`.** The `apps/web` rule "no direct `@supabase/*` imports; data
   access goes through `@nafios/*`" is **unchanged**. Modules obtain their client
   from their package — `createBrowserClient()` on `@nafios/finance` (which wraps
   `@nafios/supabase-core`) — and call the package's query/command factories with
   it. Data-access *logic* stays in the package; only the **execution context**
   moves to the browser.

4. **RLS is the security boundary for module data.** With no server-side
   `getUser` gate on the request path, a module read/write is authorized solely
   by Postgres RLS keyed on `auth.uid()` from the session cookie. This is
   acceptable **only because** owner-isolation RLS + composite-FK hardening are
   already enabled on all domain tables. **RLS-enabled is now a hard precondition
   for any table a module reads client-side** — not defense-in-depth behind a
   server filter, but the filter itself.

5. **TanStack Query is adopted now.** ADR-0022 rule 4 ("introduce at the first
   real need, not now") is resolved: the need is here. Finance (EF3.13) mounts
   the single `QueryClientProvider` in the shell and stands up the canonical
   `useQuery` example. One query client, one envelope model.

6. **One data model per module.** A module never mixes server-function reads
   with Query reads for its own domain data. This single-model property is the
   maintainability guarantee the split exists to protect.

### Retained from ADR-0022

- **Query owns the client-side envelope** (caching / dedup / refetch /
  invalidation) — now applied to *all* module data, not just interactive reads.
- **Business logic stays out of Query config** — orchestration, selective retry,
  resume-safety, and error **classification** live in our code / the package's
  command factories, never in Query's blunt per-call options.
- **`use-account-creation` stays bespoke** — it is shell auth (server-function
  territory), the reference for "operation logic the hook owns."

### Superseded from ADR-0022

- **Rule 1 no longer governs domain-module reads.** A module's first-paint read
  is client-side Query, not a loader. Loaders / server functions remain correct
  for **shell** first-paint and route-guard reads (session gating still loads
  server-side). ADR-0022 is superseded **for module data only**; it stands for
  the shell.

## Consequences

**Enables**

- **One data model per module** — no server-fn/Query split inside a module;
  predictable as five modules land.
- **Lower prod ops cost** — module reads hit Supabase/PostgREST directly, not an
  SSR function invocation each.
- **Matches the packages as built** — finance's client-side `createBrowserClient`
  is used as intended, not bypassed.
- **A realtime substrate for free** — a browser client + Query cache is exactly
  what a future Supabase Realtime subscription → `invalidateQueries` needs for
  live cross-session sync (a spouse/other device creating a ledger refreshes an
  open tab). This is why the concern that "another session makes the data stale"
  points here, not at loaders.

**Costs / constraints**

- **No SSR first paint for module routes.** Module content renders after
  hydration + a client round-trip, so **loading states are mandatory** on module
  routes. Acceptable: these are authed, non-SEO app surfaces; the shell (nav /
  layout / session gate) still server-renders.
- **Security rests entirely on RLS for module data.** A missing or wrong policy
  leaks directly — there is no server-side filter behind it. Mitigation: RLS is a
  hard precondition (above), and the two-user (A/B) live-DB RLS matrices already
  guard every finance table.
- **The anon key + Supabase URL ship in the client bundle.** Public by design
  (the browser session's JWT is layered on top; the key alone grants nothing).
  Requires bundler-level env exposure (a `VITE_`-prefixed pair or a Vite
  `define`). The **service-role** key never ships — `createServiceClient` stays
  seeds/tests/trusted-jobs only.
- **The session cookie must be readable by the `@supabase/ssr` browser client.**
  If auth wrote the session cookies `httpOnly`, the browser client cannot read
  them and every module request is anonymous (RLS returns nothing). This must be
  verified when wiring the first module (EF3.13) and is the primary integration
  risk of this ADR.
- One `QueryClientProvider` in the shell + the env-exposure plumbing are new
  shell infrastructure.

## Alternatives considered

- **Keep ADR-0022 as-is (first-paint → loader, interactive → Query).** Rejected:
  forces two data mechanisms inside one module on a subtle axis, diverges as
  modules grow, carries a per-read serverless cost, and contradicts the
  client-side design the domain packages already ship.
- **All data via server functions (no browser client).** Rejected: every module
  read becomes a serverless invocation (prod cost), forgoes the Query cache and
  the realtime substrate, and ignores the browser client the packages expose.
- **Relax "no direct `@supabase` in `apps/web`" and build clients in feature
  code.** Rejected: keeps the package boundary meaningful — the browser client
  and the data logic stay inside `@nafios/<module>`; the shell imports the
  package, not the SDK.
- **Adopt Supabase Realtime now.** Deferred, not rejected: this ADR makes it a
  clean later addition (subscription → `invalidateQueries`) once a module needs
  live cross-session sync. Not required for the read/write baseline.
