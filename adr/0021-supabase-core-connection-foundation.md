# 0021. Supabase connection foundation split into `supabase-core` + feature packages

- **Status:** Accepted
- **Date:** 2026-06-18
- **Source:** Onboarding/auth work — question of where generated DB types and the
  Supabase client should live.

## Context

`@nafios/auth-core` was the first package to use Supabase, so it became the de
facto owner of the `@supabase/*` dependency and the client construction logic.
Its invariant stated `@supabase/*` was its dependency "only".

But Supabase is the monorepo's BaaS, not just an auth provider: ADR-0014 makes
`supabase-js` the application-wide **data-access** layer (with generated schema
types), and storage, realtime, and edge functions are all on the roadmap. Two
problems followed:

1. **Misplaced ownership.** Generated database types and the client factory sat
   inside `auth-core`, forcing every future data/storage/realtime consumer to
   reach into the auth package — exactly the cross-package coupling the hard
   rules forbid. auth-core should be a *consumer* of Supabase, not the owner.
2. **Generic incompatibility.** `@supabase/ssr@0.6.x` emits an older
   `SupabaseClient<Database, SchemaName, Schema>` generic shape than the
   installed `@supabase/supabase-js` (2.10x), so passing `<Database>` to the ssr
   factory produces a type the current SDK rejects.

## Decision

Split the Supabase concern into a **connection foundation** plus **feature
packages that consume it**:

- **`@nafios/supabase-core`** — the *only* package that depends on `@supabase/*`.
  Owns client construction (`createServerClient` / `createBrowserClient`),
  env/config, the `CookieAdapter` contract, and re-exports provider types
  (`SupabaseClient`, `AuthError`, `User`). Returns the **untyped** client.
- **`@nafios/database`** — owns Postgres concerns: the generated schema types
  (`bun run db:types` writes here) and a schema-typed client (`createServerDb` /
  `createBrowserDb`, `asDb`, `Db = SupabaseClient<Database>`). Consumes
  supabase-core.
- **`@nafios/auth-core`** — keeps its auth API unchanged but now gets its
  connection from supabase-core. No longer depends on `@supabase/*`.
- Future **storage / realtime / edge-function** packages each sit on
  supabase-core the same way.

The `<Database>` schema generic is applied **only** in `@nafios/database`'s
`asDb`, via a cast at the data-access boundary — never at the `@supabase/ssr`
factory. This sidesteps the generic incompatibility; at runtime it is the same
client, and the typing is a compile-time overlay derived from the live schema.

This **supersedes** auth-core's prior "sole owner of `@supabase/*`" invariant.

## Consequences

- One package depends on `@supabase/*`; everything else goes through `@nafios/*`.
  The "no direct `@supabase` imports" rule for `apps/web` is unchanged.
- DB types are shared infrastructure, available to every domain without
  importing the auth package.
- auth-core shrinks to pure auth logic + mapping; connection/env lives in
  supabase-core (and so do the env-var tests).
- New Supabase features get a clear home: a feature package on supabase-core.
- Cost: more packages and one extra indirection for connection construction.
  Accepted — the boundaries are worth it.

## Alternatives considered

- **Keep types/client in auth-core** — rejected: couples all data access to the
  auth package and misrepresents ownership.
- **A single `@nafios/supabase` mega-package** (connection + auth + data +
  storage) — rejected: recreates a god-package and defeats the per-feature
  boundaries the monorepo favors.
- **Pass `<Database>` to the ssr factory directly** — rejected: type-incompatible
  with the installed `@supabase/supabase-js`. Typing at the `asDb` boundary is
  the working approach.
- **Pin `@supabase/supabase-js` down to ssr 0.6.x's era** — rejected as a
  separate concern; revisit aligning the versions independently.
