# @nafios/finance

The whole finance module as a single `@nafios/<module>` package. At M0 it is a
**skeleton**: the architecture (internal layer split + connection spine), not
the features. Domain types, the Money/Month codecs, repositories, queries,
metrics, and UI land later as incremental feature tickets — always inside the
structure this package establishes, never re-architecting it.

## Internal layer boundary (the core invariant)

One package, two **internal** layers. The pure-vs-I/O split is enforced
_inside_ the package by a **Biome import-boundary rule** (see root
[biome.json](../../biome.json)), not by the package graph:

- **`src/domain/` — the pure layer.** Reserved for framework-agnostic types,
  enums, and the Money/Month codecs. **Zero I/O.** It must **not** import
  `src/internal/`, `@nafios/database`, `@nafios/supabase-core`, or
  `@supabase/*`. Empty (placeholder barrel only) at EF2.
- **`src/internal/` — the data layer.** The **only** place `@nafios/database`
  and `@nafios/supabase-core` appear. It may import `src/domain/`. At EF2 it
  holds the client factories + auth/session seam (the connection spine) and
  nothing else.

Layering is one-way: `src/internal/ (data) → src/domain/ (domain) → (nothing
app-specific)`. A domain-imports-data violation **fails `bun run check`** via
the scoped Biome override.

## Dependencies

Exactly two workspace deps, both used only in `src/internal/`:

- **`@nafios/database`** (`workspace:*`) — `asDb` + the schema-typed `Db` client
  + generated `Database` types (EF1).
- **`@nafios/supabase-core`** (`workspace:*`) — client construction + the
  `SupabaseClient` type.

Finance **never** depends on `@supabase/*` directly. Per
[ADR-0021](../../adr/0021-supabase-core-connection-foundation.md),
`@nafios/supabase-core` is the sole owner of the Supabase SDK.

## Public API surface

All public exports live in `src/index.ts` (the barrel). Consumers import
`@nafios/finance`, never deep paths into `src/internal/`.

- `createBrowserClient()` — the **runtime** client. Finance runs client-side;
  this reads the logged-in browser session, auto-refreshes the token, and runs
  **as the user** (RLS applies). Takes no arguments.
- `createServiceClient()` — `service_role` client that **bypasses RLS**. Seeds
  and tests only.
- Types: `FinanceClient` (an alias of the schema-typed `Db`).

The raw `SupabaseClient` type and the generated `@nafios/database` row types are
**never** re-exported.

## Environment variables

Read by the **supabase-core** factories that finance wraps (documented here for
operator context):

| Var                         | Read by                     | Notes                                                                                     |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | both factories              | Project URL. Needs bundler-level exposure for the browser client.                         |
| `SUPABASE_ANON_KEY`         | `createBrowserClient`       | Anon/publishable key; the browser session's JWT is layered on top (the key alone grants no access). |
| `SUPABASE_SERVICE_ROLE_KEY` | `createServiceClient`       | **Secret.** Bypasses RLS. Never ship to a client bundle; seeds/tests/trusted jobs only.   |

## Non-obvious gotchas

- **`createServiceClient` is a footgun by design.** It bypasses RLS and has no
  auth context, so `auth.uid()` is NULL. A service insert that omits `user_id`
  is **correctly** rejected by `NOT NULL` (SQLSTATE `23502`). Service-role
  callers **must** set `user_id` explicitly. **Never use it on a request
  path** — seeds and the test harness only.
- **RLS is the DB's job.** The factories add no `WHERE user_id = …` and no
  ownership pre-checks; they rely entirely on the owner RLS policy +
  `(select auth.uid())`, active on all finance tables since the EF1
  constraint-hardening migration.
- **No build step.** Consumed as TypeScript source via workspace resolution
  ([ADR-0006](../../adr/0006-no-build-internal-packages.md)).
- **The RLS proof is a separate lane.** The mocked-SDK unit tests here run in
  `bun run check`; the live-DB RLS matrix lives at repo-root
  `tests/integration/` and runs via `bun run test:integration` only — never in
  `bun run check` (there is no live Supabase in CI).

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts              # barrel — the only public export surface
  domain/
    index.ts            # placeholder barrel — pure types/enums/codecs land later
  internal/
    client.ts           # createBrowserClient, createServiceClient, FinanceClient
tests/
  unit/                 # mocked-SDK unit tests (in the coverage gate)
  integration/          # placeholder — the live-DB RLS matrix lives at repo-root tests/integration/
spec.md                 # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
