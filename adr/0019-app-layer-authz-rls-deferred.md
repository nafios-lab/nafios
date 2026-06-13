# 0019. App-layer authorization; Postgres RLS deferred

- **Status:** Accepted
- **Date:** 2026-06-13
- **Source:** nafios-auth epic (A1)

## Context

NafiOS needs an authorization strategy for its first product epic. Two main
approaches exist:

1. **Application-layer authorization** — server functions and service code
   check permissions before executing queries.
2. **Row-Level Security (RLS)** — Postgres policies filter data at the
   database level, using `auth.uid()` from the Supabase JWT.

Supabase provides first-class RLS support (ADR-0012), and `auth.uid()` is
available in policy expressions (ADR-0016). However, the auth epic is the
first product epic — there are no app-owned tables yet (ADR-0015), the
ownership/tenancy model is undefined, and the query patterns that RLS would
protect are unknown.

Key forces:

- **RLS requires stable schema and clear ownership semantics.** Writing
  policies before the data model exists is speculative.
- **App-layer checks are easier to reason about, test, and debug** during
  early development when the data model is still evolving.
- **RLS is defense-in-depth, not a replacement** for application logic.
  Even with RLS, the app layer needs to know who the user is and what they
  can do (e.g. to show/hide UI, validate actions, audit).
- **`supabase-js` queries go through PostgREST**, which respects RLS
  policies automatically — so RLS can be layered in later without changing
  application query code.

## Decision

**Authorization is enforced at the application layer** (server functions,
server middleware, and service code). Server functions validate the session
via `@nafios/auth-core`, extract the user identity, and scope queries
accordingly.

**Postgres RLS is deferred**, not rejected. It will be adopted when:

1. The data model has stabilized with real tables and ownership columns.
2. Multi-tenancy or cross-user data access patterns emerge.
3. A dedicated data-security epic (e.g. `nafios-data`) designs and tests
   RLS policies alongside the application layer.

Until then, the single-user auth model (each user sees only their own data)
is enforced by filtering queries on `user_id` in server functions.

## Consequences

- Server functions are the authorization boundary — every data-mutating or
  data-reading server function must verify the session and scope its query.
- No RLS policies are written in the auth epic's migrations. Tables created
  by this epic (e.g. `profiles`) do not enable RLS.
- When RLS is adopted later, it layers on top of existing app-layer checks
  as defense-in-depth — application code does not need to be rewritten.
- Risk: if a server function forgets to scope its query, data leaks to the
  wrong user. Mitigation: code review discipline and, eventually, RLS as a
  safety net.
- Related: ADR-0012 (Supabase), ADR-0014 (supabase-js data access),
  ADR-0016 (auth schema referenced not owned).

## Alternatives considered

- **RLS from day one** — maximum security, but requires writing policies
  against a schema that doesn't exist yet. Speculative RLS policies become
  maintenance burden when the data model changes. Deferred, not rejected.
- **Hybrid (RLS + app-layer) from day one** — ideal end state, but doubles
  the authorization surface to maintain during early rapid iteration.
  Premature given the current single-user model.
- **No authorization (trust the client)** — unacceptable for any
  multi-user system, even in development.
