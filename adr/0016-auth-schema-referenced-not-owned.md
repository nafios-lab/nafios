# 0016. `auth` schema referenced, not owned

- **Status:** Accepted
- **Date:** 2026-06-09
- **Source:** datasource-be-foundation epic (C1)

## Context

Supabase manages the `auth` schema (`auth.users`, `auth.sessions`, etc.)
internally. Application tables need to reference authenticated users (e.g.
`created_by uuid references auth.users(id)`), but the auth schema itself is
not ours to migrate.

## Decision

The `auth` schema is **referenced, not owned**. Application tables may hold
foreign keys into `auth.users`, and RLS policies may call `auth.uid()`, but
we never write migrations that create, alter, or drop objects in the `auth`
schema. Supabase manages it.

## Consequences

- `auth.users(id)` is a stable reference target for ownership columns.
- `auth.uid()` is the canonical way to identify the current user in RLS
  policies and Postgres functions.
- We cannot add custom columns to `auth.users` — user profile extensions live
  in a `public.profiles` table (or similar), created by the owning product epic.
- Auth configuration (providers, JWT expiry, etc.) is managed via
  `supabase/config.toml` and the Supabase dashboard, not via SQL migrations.

## Alternatives considered

- **Custom auth tables** — full control, but reimplements what Supabase
  provides out of the box and breaks `auth.uid()` integration.
- **Extending `auth.users` with custom columns** — possible via raw SQL but
  fragile across Supabase upgrades; the recommended pattern is a separate
  profile table.
