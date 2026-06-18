---
title: Migration conventions
status: active
version: 1.0.0
updated: 2026-06-09
owner: Hanafi
related_adrs: [0012, 0013, 0015]
---

# Migration Conventions — Specification

## Purpose

Short pointer-heavy reference for how migrations are structured, named, and
authored in NafiOS. Links to authoritative sources rather than restating them.

## Scope

**In:** migration naming, structure, and workflow pointers.
**Out:** table content, RLS policy content, seed data content.

## Entities

### Migration structure

- **Directory:** `supabase/migrations/`
- **Naming:** Supabase CLI timestamp prefix + `snake_case` description
  (e.g. `20260609120000_create_profiles.sql`)
- **Granularity:** one logical change per migration file
- **Authoring:** `bunx supabase migration new <snake_case_description>`

### Column and RLS templates

See [Table Conventions](table-conventions.md) for:
- Standard column set (PK, timestamps, audit columns)
- RLS pattern (deny-by-default, owner-scoped)
- Naming rules (plural tables, snake_case columns)

### Decisions

See the following ADRs:
- [ADR-0012](../../adr/0012-supabase-postgresql-database-engine.md) — DB engine
- [ADR-0013](../../adr/0013-sql-first-migrations-supabase-cli.md) — SQL-first migrations
- [ADR-0014](../../adr/0014-no-orm-supabase-js-data-access.md) — No ORM
- [ADR-0015](../../adr/0015-conventions-as-templates-not-applied-tables.md) — Templates, not tables
- [ADR-0016](../../adr/0016-auth-schema-referenced-not-owned.md) — Auth schema

### Workflow

See [Supabase Staging Stack](supabase-local-stack.md) for:
- CLI authentication and project linking (`login`, `link`)
- `db:migrate` (`db push`), `db:migrate:new`, `db:types` scripts
- `.env` handling against the hosted `nafios-staging` project

## Invariants

1. Migrations are SQL files — no ORM migration tool.
2. One logical change per migration file.
3. `db:migrate` (`supabase db push`) is the canonical forward-only apply command;
   migrations against shared staging are never reset/destructive.
4. Templates are documented, not applied — zero NafiOS tables in the foundation.

## Public API

N/A — this is a documentation spec.

## Error modes

N/A.

## Examples

```bash
# Create a migration for the profiles table (future product epic)
bunx supabase migration new create_profiles

# The generated file at supabase/migrations/<timestamp>_create_profiles.sql
# should follow the column and RLS templates from table-conventions.md
```

## Open questions

None — open choices are tracked in [Table Conventions](table-conventions.md).
