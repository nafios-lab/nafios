# 0013. SQL-first migrations owned by the Supabase CLI

- **Status:** Accepted
- **Date:** 2026-06-09
- **Source:** datasource-be-foundation epic (C1)

## Context

With Supabase chosen as the database engine (ADR-0012), we need a migration
strategy. Options range from ORM-managed migrations to raw SQL files to the
Supabase CLI's built-in migration system.

## Decision

Migrations are **SQL-first** and **owned by the Supabase CLI**. Migration files
live in `supabase/migrations/`, follow the CLI's timestamped naming convention,
and the database is rebuilt via `supabase db reset` + `seed.sql`. No other tool
competes for migration ownership.

## Consequences

- One canonical way to evolve the schema: hand-written SQL in `supabase/migrations/`.
- `supabase db reset` is the single "rebuild the database" command — idempotent
  against a clean state.
- Developers and agents author migrations with `supabase migration new <name>`.
- Type generation via `supabase gen types typescript --local` produces a
  TypeScript representation of the current schema.
- We lose ORM-style "up/down" rollback; the CLI replays migrations forward from
  scratch. This is acceptable for local dev; production migrations are append-only.

## Alternatives considered

- **Drizzle Kit migrations** — ties migration ownership to an ORM we chose not
  to adopt (see ADR-0014).
- **Prisma Migrate** — heavy runtime, introspection-based, not a natural fit
  with Supabase's auth schema.
- **Manual `psql` scripts** — no convention, no tooling, error-prone at scale.
