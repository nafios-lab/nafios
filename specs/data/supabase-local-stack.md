---
title: Supabase local stack and migration workflow
status: active
version: 1.0.0
updated: 2026-06-09
owner: Hanafi
related_adrs: [0012, 0013]
---

# Supabase Local Stack — Specification

## Purpose

Documents how to run, configure, and maintain the local Supabase development
stack. Covers the container lifecycle, port assignments, secrets handling,
migration workflow, and cloud-link pattern.

## Scope

**In:** local stack lifecycle, port pinning, `.env` handling, migration commands,
type generation, cloud project linking.
**Out:** production deployment, auth flows, storage bucket configuration, app-level
Supabase client setup.

## Entities

### Prerequisites

A **container runtime** is required to run the local Supabase stack:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS, Windows, Linux)
- [Colima](https://github.com/abiosoft/colima) (macOS/Linux alternative)
- [Podman](https://podman.io/) (Linux alternative)

The Supabase CLI is pinned as a workspace dev dependency (`supabase@2.105.0` in
root `package.json`). Use `bunx supabase` — do not install globally.

### Pinned ports

| Service | Port | URL |
|---------|------|-----|
| API (PostgREST) | 54321 | `http://127.0.0.1:54321` |
| Database (Postgres) | 54322 | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | 54323 | `http://127.0.0.1:54323` |
| Inbucket (email) | 54324 | `http://127.0.0.1:54324` |
| Analytics | 54327 | — |

### Lifecycle commands

```bash
# Start the local stack (first run pulls Docker images)
bunx supabase start

# Check health and print local keys
bunx supabase status

# Stop containers (preserves data)
bunx supabase stop

# Stop and destroy all data (full teardown)
bunx supabase stop --no-backup
```

### Environment variables

Copy `.env.example` to `.env` and fill values from `bunx supabase status`:

```bash
cp .env.example .env
bunx supabase status   # copy anon key and service_role key into .env
```

Local demo keys are **deterministic and not secrets**. Cloud keys **are secrets**
and must never be committed. `.env` is gitignored; `.env.example` is committed.

### Migration workflow

Migrations are SQL-first and owned by the Supabase CLI
([ADR-0013](../../adr/0013-sql-first-migrations-supabase-cli.md)).

```bash
# Create a new migration (snake_case, one logical change per file)
bunx supabase migration new <snake_case_description>

# Rebuild the database from scratch (replays all migrations + seed.sql)
bun run db:reset

# Generate TypeScript types from the current local schema
bun run db:types
```

**Naming convention:** migration files use the CLI's timestamp prefix +
`snake_case` description. One logical change per migration.

`seed.sql` runs automatically after `db:reset`. Keep seeds idempotent.

### Cloud project linking

To connect the local CLI to a Supabase Cloud project:

```bash
bunx supabase link --project-ref <project-ref>
```

After linking, `bunx supabase db push` applies local migrations to the remote
database. See [Supabase CLI docs](https://supabase.com/docs/guides/local-development/cli/config)
for details.

## Invariants

1. The local stack boots on the pinned ports documented above.
2. No secrets are committed — `.env` is gitignored, `.env.example` is committed.
3. `bunx supabase` is the only way to run CLI commands (no global install).
4. `db:reset` is idempotent: two consecutive runs produce identical schema.

## Public API

Workspace scripts exposed in root `package.json`:

| Script | Command | Purpose |
|--------|---------|---------|
| `db:reset` | `supabase db reset` | Rebuild DB from migrations + seed |
| `db:seed` | `supabase db reset` | Alias (reset includes seeding) |
| `db:types` | `supabase gen types typescript --local` | Generate TS types from schema |

## Error modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot connect to the Docker daemon` | Container runtime not running | Start Docker/Colima/Podman |
| `Port 54321 already in use` | Another Supabase instance or service | `bunx supabase stop` or free the port |
| `db:reset` fails | Corrupt local state | `bunx supabase stop --no-backup && bunx supabase start` |

## Examples

```bash
# Fresh clone workflow
git clone <repo>
cd nafios
bun install
cp .env.example .env
bunx supabase start
bunx supabase status       # copy keys into .env
bun run db:reset           # idempotent — safe to run anytime
```

## Open questions

- **Supabase new API key format** (publishable/secret) vs legacy JWT anon/service_role
  keys — monitor CLI updates and adapt `.env.example` keys if the format changes.
