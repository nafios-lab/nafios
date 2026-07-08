# @nafios/finance

The whole finance module as a single `@nafios/<module>` package. EF2 shipped the
**skeleton**: the architecture (internal layer split + connection spine), not
the features. EF3.1 landed the first pure-domain code — the `Money`/`Month`
value types + codecs. Further domain types, repositories, queries, metrics, and
UI land later as incremental feature tickets — always inside the structure this
package establishes, never re-architecting it.

## Internal layer boundary (the core invariant)

One package, two **internal** layers. The pure-vs-I/O split is enforced
_inside_ the package by a **Biome import-boundary rule** (see root
[biome.json](../../biome.json)), not by the package graph:

- **`src/domain/` — the pure layer.** Framework-agnostic types, enums, and
  codecs. **Zero I/O.** It must **not** import `src/internal/`,
  `@nafios/database`, `@nafios/supabase-core`, or `@supabase/*`. Holds the
  `Money`/`Month` value types + codecs (EF3.1); more domain types land later.
- **`src/internal/` — the data layer.** The **only** place `@nafios/database`
  and `@nafios/supabase-core` appear. It may import `src/domain/`. Holds the
  client factories + auth/session seam (the connection spine), and — since EF3.6
  — the first repository: the typed `FinanceDataError` + SQLSTATE classifier
  (`errors.ts`), the row↔domain `ledger-mapper.ts`, and `createLedgerRepository`
  (`repositories/ledger-repository.ts`).

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

- `FinanceDataError` + `FinanceDataErrorCode` — the typed error every finance
  repository throws (EF3.6). The app/UI catches it and branches on `code`
  (`duplicate_month` / `ongoing_exists` / `check_violation` / …).
- `LedgerHeader` — the persisted ledger (a `MonthlyLedger` minus `envelopes`);
  the shape EF3.10's read surface builds on.

The raw `SupabaseClient` type and the generated `@nafios/database` row types are
**never** re-exported. `createLedgerRepository`, the mapper, and
`mapPostgrestError` stay **internal** — imported within the package by later
tickets (EF3.7 / EF3.10), not surfaced on the barrel.

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
- **The live-DB proof is a separate lane.** The mocked-SDK/mocked-client unit
  tests here run in `bun run check` and satisfy the coverage gate; the live-DB
  matrices (connection-spine RLS + the EF3.6 ledger-repository §6 matrix,
  `tests/integration/ledger.repo.test.ts`) live at repo-root `tests/integration/`
  and run via `bun run test:integration` only — never in `bun run check` (no live
  Supabase in CI, and the per-file coverage scoping in
  [ADR-0020](../../adr/0020-test-coverage-scoping-and-gate.md) is why they can't
  load the real cross-package clients inside a package run). Both `skipIf` when
  the Supabase env vars are absent. The EF3.6 matrix imports the internal
  `createLedgerRepository` via a relative path — a documented, test-only
  exception to the internal-import rule (see the header of that file).

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
    index.ts            # domain barrel — re-exports the pure types/codecs below
    money.ts            # Money value type + codec + arithmetic (EF3.1)
    month.ts            # Month value type + codec + monthOf/addMonths/compareMonths (EF3.1)
    codec-error.ts      # CodecError thrown by the decode/construct paths (EF3.1)
  internal/
    client.ts           # createBrowserClient, createServiceClient, FinanceClient
    errors.ts           # FinanceDataError, FinanceDataErrorCode, mapPostgrestError (EF3.6)
    mappers/
      ledger.mapper.ts  # monthly_ledger row ↔ LedgerHeader / NewLedger (EF3.6)
    repositories/
      ledger.repo.ts    # createLedgerRepository, LedgerRepository, LedgerHeader, NewLedger (EF3.6)
tests/
  unit/                 # mocked-SDK/mocked-client unit tests (in the coverage gate)
  integration/          # placeholder — the live-DB matrices live at repo-root tests/integration/
spec.md                 # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
