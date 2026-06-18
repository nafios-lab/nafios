# Supabase CLI Runbook — NafiOS

> **Local Docker is sunset.** All development targets the hosted **`nafios-staging`**
> Cloud project. There is no `supabase start` / local stack anymore.
>
> This is the practical "how do I run X" guide. The authoritative spec is
> [`specs/data/supabase-local-stack.md`](../specs/data/supabase-local-stack.md).

## Project

| Field | Value |
|-------|-------|
| Project | `nafios-staging` |
| Ref | `ohkyujzctlukaifigmon` |
| API URL | `https://ohkyujzctlukaifigmon.supabase.co` |
| Dashboard | <https://supabase.com/dashboard/project/ohkyujzctlukaifigmon> |

## Conventions

- **Always use `bunx supabase`** — the CLI is pinned in root `package.json`
  (`supabase@2.105.0`). Never install it globally.
- Common operations are wrapped as `bun run db:*` scripts (see the table below).
- Discover any command's flags with `bunx supabase <group> <cmd> --help` —
  never guess, the CLI changes between versions.

---

## One-time setup (per machine)

```bash
# 1. Authenticate the CLI (opens a browser to authorize).
bunx supabase login

# 2. Link this repo clone to nafios-staging. Prompts for the DB password
#    (Dashboard → Project Settings → Database → Database password).
bunx supabase link --project-ref ohkyujzctlukaifigmon

# 3. Create your local env file and fill it from the dashboard.
cp .env.example .env
#    SUPABASE_URL                → Project Settings → API → Project URL
#    SUPABASE_ANON_KEY           → Project Settings → API → publishable / anon
#    SUPABASE_SERVICE_ROLE_KEY   → Project Settings → API → secret / service_role
#    DATABASE_URL                → Project Settings → Database → Connection string (URI)
```

Verify you are connected:

```bash
bunx supabase projects list          # nafios-staging should be marked linked (●)
bun run db:migrate:status            # shows local vs. remote migration history
```

---

## Everyday tasks

### Create a new migration

```bash
bun run db:migrate:new add_widgets_table
# → creates supabase/migrations/<timestamp>_add_widgets_table.sql
```

Edit the generated SQL file. One logical change per migration; snake_case names.

> Tip: to iterate on schema *before* committing it to a migration, run SQL
> directly in the Dashboard SQL editor (or via `psql "$DATABASE_URL"`), then
> capture the final shape with `bun run db:diff` and paste it into a migration.

### Apply pending migrations to staging

```bash
bun run db:migrate        # → supabase db push  (forward-only)
```

`db push` is non-destructive: it applies migrations the remote hasn't seen yet.
It never drops data.

### Regenerate TypeScript types

Run after any schema change so `packages/database/src/database.types.ts` matches:

```bash
bun run db:types          # → supabase gen types typescript --linked > …/database.types.ts
```

### Check schema drift / history

```bash
bun run db:migrate:status # → supabase migration list --linked
bun run db:diff           # → supabase db diff --linked   (shows un-migrated drift)
```

### Pull remote changes into a migration

If someone changed the schema directly in the dashboard:

```bash
bunx supabase db pull <descriptive_name> --linked
```

---

## Script reference

| Script | Underlying command | What it does |
|--------|--------------------|--------------|
| `bun run db:migrate:new <name>` | `supabase migration new <name>` | Scaffold a migration file |
| `bun run db:migrate` | `supabase db push` | Apply pending migrations to staging |
| `bun run db:migrate:status` | `supabase migration list --linked` | Compare local vs. remote history |
| `bun run db:diff` | `supabase db diff --linked` | Show un-migrated schema drift |
| `bun run db:types` | `supabase gen types typescript --linked` | Regenerate `database.types.ts` |

---

## ⚠️ Do not

- **`supabase db reset`** — drops and recreates the database. Against shared
  staging this wipes everyone's data. It's intentionally removed from the
  scripts. (There is no local DB to reset anymore.)
- **Commit `.env`** — it holds live secrets and is gitignored. Only
  `.env.example` (placeholders) is committed.
- **Ship the service-role / `sb_secret_…` key to the browser** — server-side only.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Access token not provided` | `bunx supabase login` |
| Commands don't target staging | `bunx supabase link --project-ref ohkyujzctlukaifigmon` |
| `password authentication failed` | Re-copy the DB password (Dashboard → Database); update `DATABASE_URL` |
| `db push` says remote is ahead / history diverged | `bun run db:migrate:status`, then `bunx supabase migration repair --status applied <version>` |
| Direct DB connection times out | Use the **Session pooler** connection string in `DATABASE_URL` (IPv4-friendly) |
| Need a command's flags | `bunx supabase <group> <cmd> --help` |
