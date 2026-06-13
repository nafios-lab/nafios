# @nafios/web

The single NafiOS shell application (ADR-0018). All domain modules mount into
this TanStack Start app. Currently minimal — staging deployment target that will
grow into the main user-facing app.

## What this app does

TanStack Start SSR app. Currently renders a staging marker page showing
`NafiOS Staging — build <SHA>` and a `/health` route.

## Stack

- TanStack Start (Vite + Nitro SSR) — file-based routing in `src/routes/`
- `@netlify/vite-plugin-tanstack-start` for Netlify deployment
- Tailwind CSS v4 via `@tailwindcss/vite`
- Node >= 20.19 required (Vite 8 dependency — see root `.nvmrc`)

## Scripts

```sh
bun run dev       # local dev server on :3000
bun run build     # production build → .output/
bun run preview   # preview production build locally
bun run typecheck # tsc --noEmit
bun run test      # placeholder — no tests yet
```

## Conventions

- **File-based routing:** routes live in `src/routes/`. TanStack Router generates
  `src/routeTree.gen.ts` — never edit it by hand.
- **No direct Supabase imports.** Auth and data access go through `@nafios/*`
  packages (e.g. `@nafios/auth-core`). This app must never depend on
  `@supabase/supabase-js` or `@supabase/ssr` directly.
- **kebab-case filenames** — enforced by Biome.
- **Routes call services** — no business logic in route files.

## Build output

After `bun run build`:
- Client assets: `.output/public/` (served as static files)
- Server bundle: `.output/server/index.mjs` (Node SSR server)
- Netlify SSR function: `.netlify/v1/functions/server.mjs` (auto-emitted by plugin)
- Netlify publish dir: `.output/public`

## Local Supabase Stack

This app depends on a running local Supabase instance for auth and data.

### Prerequisites

- Docker must be running (Supabase CLI uses Docker containers)
- Supabase CLI is installed as a workspace devDependency (`supabase` in root `package.json`)

### One-command bring-up

```sh
bun run supabase:start     # starts Postgres, Auth, Inbucket, Studio, etc.
```

After start, grab the local keys:

```sh
bun run supabase:status    # prints API URL, anon key, service-role key
```

Copy the keys into your `.env` file (use `.env.example` as a template).

### Local services

| Service       | URL                          | Purpose                        |
|---------------|------------------------------|--------------------------------|
| API (PostgREST) | http://127.0.0.1:54321     | Supabase API endpoint          |
| Postgres      | postgresql://postgres:postgres@127.0.0.1:54322/postgres | Direct DB access |
| Studio        | http://localhost:54323       | Supabase dashboard             |
| Mailpit       | http://localhost:54324       | Local email testing (captures signup/reset emails) |

### Test user

After `bun run db:reset`, a seeded test user is available:

- **Email:** `test@nafios.local`
- **Password:** `password123`

### Database schema

**`public.profiles`** — one row per auth user. All domain tables FK here, never
to `auth.users` directly (ADR-0016). Columns: `id`, `avatar_url`, `created_at`,
`updated_at`, `deleted_at`, `created_by`, `updated_by`.

A Postgres trigger (`on_auth_user_created`) auto-creates a `profiles` row on
every `auth.users` INSERT — no application code needed. The trigger function
(`public.handle_new_user()`) runs as `SECURITY DEFINER`.

**`public.family_members`** — zero or more per profile. Columns: `id`,
`profile_id` (FK → profiles), `name`, `relationship` (spouse/child/parent/
sibling/other), `avatar_url`, `nric`, `mobile_no`, `date_of_birth`, plus
standard audit columns. Cascades on profile deletion.

A reusable `public.set_updated_at()` trigger auto-maintains `updated_at` on
both tables.

RLS is intentionally disabled — authorization is handled at the application
layer (ADR-0019).

Migrations:
- `supabase/migrations/20260613000000_create_profiles_table.sql`
- `supabase/migrations/20260613000001_create_family_members_table.sql`

### Useful commands

```sh
bun run db:reset            # replay all migrations + seed data
bun run db:types            # regenerate TypeScript types from local schema
bun run supabase:stop       # tear down local Supabase containers
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
