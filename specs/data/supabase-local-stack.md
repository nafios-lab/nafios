---
title: Supabase staging stack and migration workflow
status: active
version: 2.0.0
updated: 2026-06-18
owner: Hanafi
related_adrs: [0012, 0013]
---

# Supabase Staging Stack — Specification

## Purpose

Documents how the team connects to, configures, and maintains the Supabase
backend. As of 2026-06-18 the **local Docker stack is sunset**: all development
targets the hosted `nafios-staging` Cloud project. This spec covers CLI
authentication, project linking, secrets handling, the migration workflow, and
type generation against the remote database.

> Migration note: prior to v2.0.0 this spec described a local Docker stack
> (`supabase start`, pinned ports 54321–54327, deterministic demo keys). That
> workflow is retired. See `supabase/README.md` for the practical CLI runbook.

## Scope

**In:** CLI authentication, cloud project linking, `.env` handling, migration
commands (`db push`), type generation against the linked project, connection
strings.
**Out:** production deployment, auth flows, storage bucket configuration,
app-level Supabase client setup.

## Entities

### Prerequisites

- **No container runtime is required.** Docker Desktop / Colima / Podman are no
  longer needed — there is no local stack to run.
- The Supabase CLI is pinned as a workspace dev dependency (`supabase@2.105.0`
  in root `package.json`). Use `bunx supabase` — do not install globally.
- A Supabase account with access to the `nafios-staging` project, and a
  Personal Access Token (or an interactive `supabase login` session).

### Target project

| Field | Value |
|-------|-------|
| Project name | `nafios-staging` |
| Project ref | `ohkyujzctlukaifigmon` |
| API URL | `https://ohkyujzctlukaifigmon.supabase.co` |
| Dashboard | `https://supabase.com/dashboard/project/ohkyujzctlukaifigmon` |

### Authentication & linking (one-time per machine)

```bash
# 1. Authenticate the CLI (opens a browser OAuth flow).
bunx supabase login

# 2. Link this repo to the staging project (prompts for the DB password).
bunx supabase link --project-ref ohkyujzctlukaifigmon
```

Linking writes the project ref to `supabase/.temp/` (gitignored). After linking,
all `--linked` commands act on `nafios-staging`.

### Environment variables

Copy `.env.example` to `.env` and fill values from the Supabase dashboard
(Project Settings → API and → Database):

```bash
cp .env.example .env
# Fill SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
```

All cloud keys **are secrets**. `.env` is gitignored; `.env.example` is committed
and contains placeholders only. The project uses the new API key format
(`sb_publishable_…` as the anon key, `sb_secret_…` as the service-role key).

### Migration workflow

Migrations are SQL-first and owned by the Supabase CLI
([ADR-0013](../../adr/0013-sql-first-migrations-supabase-cli.md)).

```bash
# Create a new migration (snake_case, one logical change per file)
bunx supabase migration new <snake_case_description>

# Apply pending migrations to the linked staging database (forward-only)
bun run db:migrate          # → supabase db push

# Inspect local vs. remote migration history
bun run db:migrate:status   # → supabase migration list --linked

# Generate TypeScript types from the live staging schema
bun run db:types            # → supabase gen types typescript --linked
```

**Naming convention:** migration files use the CLI's timestamp prefix +
`snake_case` description. One logical change per migration.

> **No `db reset` against staging.** `supabase db reset` drops and recreates the
> database; against a shared cloud project this destroys everyone's data. It has
> been removed from the workspace scripts. Seed data is applied manually when
> needed (see `supabase/README.md`).

## Invariants

1. All commands target the hosted `nafios-staging` project — there is no local
   stack.
2. No secrets are committed — `.env` is gitignored, `.env.example` holds
   placeholders only.
3. `bunx supabase` is the only way to run CLI commands (no global install).
4. Migrations are forward-only against staging (`db push`); destructive resets
   are not part of the workflow.

## Public API

Workspace scripts exposed in root `package.json`:

| Script | Command | Purpose |
|--------|---------|---------|
| `db:migrate:new` | `supabase migration new` | Scaffold a new migration file |
| `db:migrate` | `supabase db push` | Apply pending migrations to staging |
| `db:migrate:status` | `supabase migration list --linked` | Compare local/remote history |
| `db:diff` | `supabase db diff --linked` | Show schema drift vs. staging |
| `db:types` | `supabase gen types typescript --linked` | Generate TS types from schema |

## Error modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Access token not provided` | CLI not authenticated | `bunx supabase login` |
| `Cannot find project ref` / commands ignore staging | Repo not linked | `bunx supabase link --project-ref ohkyujzctlukaifigmon` |
| `password authentication failed` | Wrong DB password in link/`DATABASE_URL` | Reset/copy the DB password from Dashboard → Database |
| `db push` reports remote ahead | Migration history diverged | `bunx supabase migration list --linked`, then `supabase migration repair` |
| Direct connection times out | IPv4 add-on not enabled | Use the Session pooler connection string in `DATABASE_URL` |

## Examples

```bash
# Fresh clone workflow
git clone <repo>
cd nafios
bun install
bunx supabase login
bunx supabase link --project-ref ohkyujzctlukaifigmon
cp .env.example .env          # fill from dashboard
bun run db:migrate            # apply any pending migrations
bun run db:types              # regenerate types
```

## Open questions

- **Seeding staging:** define a repeatable, non-destructive seed strategy for the
  shared staging DB (idempotent upserts vs. a dedicated seed script).
- **Per-developer isolation:** evaluate Supabase branching (preview branches) if
  concurrent schema work on shared staging becomes contentious.
