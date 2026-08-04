# @nafios/finance

The whole finance module as a single `@nafios/<module>` package. EF2 shipped the
**skeleton**: the architecture (internal layer split + connection spine), not
the features. EF3.1 landed the first pure-domain code — the `Money`/`Month`
value types + codecs. Further domain types, repositories, queries, metrics, and
UI land later as incremental feature tickets — always inside the structure this
package establishes, never re-architecting it.

> **`Month` moved out (2026-08).** `Month` (the `"YYYY-MM"` value + its codec and
> month math), the `daysInMonth` calendar helper, and the month formatters were
> extracted to **[`@nafios/datetime`](../datetime/CLAUDE.md)** — they are a generic
> temporal primitive (the standard library's `Temporal.PlainYearMonth`), not a
> finance concept, and other modules need them. Finance now depends on
> `@nafios/datetime` and **re-exports `Month`** on its own barrel, so
> `import { Month } from "@nafios/finance"` still works unchanged. The `Money`
> codec and the creation-window *policy* stay here.

## Internal layer boundary (the core invariant)

One package, two **internal** layers. The pure-vs-I/O split is enforced
_inside_ the package by a **Biome import-boundary rule** (see root
[biome.json](../../biome.json)), not by the package graph:

- **`src/domain/` — the pure layer.** Framework-agnostic types, enums, and
  codecs. **Zero I/O.** It must **not** import `src/internal/`,
  `@nafios/database`, `@nafios/supabase-core`, or `@supabase/*` (importing the
  pure sibling `@nafios/datetime` for `Month` **is** allowed). Holds the `Money`
  value type + codec (EF3.1) and the creation-window resolver; `Month` itself now
  lives in `@nafios/datetime` (re-exported from the domain barrel). More domain
  types land later.
- **`src/internal/` — the data layer.** The **only** place `@nafios/database`
  and `@nafios/supabase-core` appear. It may import `src/domain/`. Holds the
  client factories + auth/session seam (the connection spine); the first
  repository (EF3.6): the typed `FinanceDataError` + SQLSTATE classifier
  (`errors.ts`), the row↔domain `ledger.mapper.ts`, and `createLedgerRepository`
  (`repositories/ledger.repo.ts`); the first command (EF3.7):
  `createLedgerCommands` (`commands/create-ledger.ts`), which composes the pure
  rules with those repository primitives to open a ledger atomically; and the
  second repository + envelope command surface (EF3.8): `createEnvelopeRepository`
  (`repositories/envelope.repo.ts`) with the `envelope.mapper.ts` that owns the
  `carried_over ↔ carried-over` DB-label seam, and `createEnvelopeCommands`
  (`commands/envelope-commands.ts`), which gates every manual-envelope write on the
  parent ledger's mutability. `errors.ts` was extended once for EF3.8 with
  `23503 → foreign_key_violation`. The **third** repository + the onboarding
  provisioning surface (EF3.9): `createCategoryRepository`
  (`repositories/category.repo.ts`) with `category.mapper.ts` (the
  explicit-`user_id` insert path), and `provisionDefaultCategories` / `listCategories`
  (`provisioning/provision-default-categories.ts`), which stock a new user's default
  categories idempotently (count-guard) from the pure `src/domain/` catalog.
  `errors.ts` was **not** extended (a category write has no user-supplied FK).
  The first **read/query** surface (EF3.13): `createLedgerQueries`
  (`queries/ledger-queries.ts`), which composes the internal `createLedgerRepository`
  (`list()`) with the pure creation-window resolver into the barrel-exported
  `getFinanceHomeState(today)` the Finance Home consumes — a read, so it adds no I/O
  of its own and needed no `errors.ts` change (the repository's `FinanceDataError`
  propagates unchanged).

Layering is one-way: `src/internal/ (data) → src/domain/ (domain) → (nothing
app-specific)`. A domain-imports-data violation **fails `bun run check`** via
the scoped Biome override.

## Dependencies

Three workspace deps:

- **`@nafios/database`** (`workspace:*`) — `asDb` + the schema-typed `Db` client
  + generated `Database` types (EF1). Used only in `src/internal/`.
- **`@nafios/supabase-core`** (`workspace:*`) — client construction + the
  `SupabaseClient` type. Used only in `src/internal/`.
- **`@nafios/datetime`** (`workspace:*`) — the pure `Month` primitive + calendar
  helpers (extracted 2026-08). Imported by the **pure** `src/domain/` layer
  (`monthly-ledger`, `creation-window`) and the `ledger.mapper`; re-exported on
  the barrel so `Month` stays part of finance's public surface.

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
  repository throws (EF3.6, extended in EF3.8). The app/UI catches it and branches
  on `code` (`duplicate_month` / `ongoing_exists` / `check_violation` /
  `foreign_key_violation` / …).
- `LedgerHeader` — the persisted ledger (a `MonthlyLedger` minus `envelopes`);
  the shape EF3.10's read surface builds on.

- `createLedgerQueries(client)` — the app-facing **read surface** (EF3.13): the
  single read the Finance Home consumes. `getFinanceHomeState(today)` runs the
  internal repository's `list()` once and feeds it into the pure creation-window
  resolver (`leadDays = 7`), returning `FinanceHomeState`
  (`{ hasActiveLedger, isWithinLeadDay, currentMonth, nextMonth, openable }` — a
  UI-ready superset of the ticket's `{ hasActiveLedger, isWithinLeadDay, openable }`).
  `hasActiveLedger` is `status === 'ongoing'` only; `today` is caller-supplied
  ("YYYY-MM-DD") so the surface reads no clock; a repository failure propagates as
  `FinanceDataError`. Types: `LedgerQueries`, `FinanceHomeState`.

- `createLedgerCommands(client)` — the app-facing **write surface** (EF3.7): the
  one command path that opens a `MonthlyLedger`. `createLedger(input)` enforces
  the pure rules (non-negativity, the EF3.5 guardrail, the EF3.4 openable-month
  window) before any write, then parks the current `ongoing` ledger and inserts
  the new one all-or-nothing. Returns `CreateLedgerResult` (a `{ ok }` union with
  `CreateLedgerRejectionReason` / `guardrail` for UI rejections), throws
  `FinanceDataError` on a DB failure. Types: `LedgerCommands`, `CreateLedgerInput`,
  `CreateLedgerResult`, `CreateLedgerRejectionReason`.

- `createEnvelopeCommands(client)` — the app-facing **write surface** for manual
  envelopes (EF3.8): `createEnvelope` / `editEnvelope` / `setEnvelopeStatus` /
  `deleteEnvelope`. Each gates on the parent ledger's mutability (EF3.2's
  `isLedgerMutable`), checks amount non-negativity, and computes `paidAt` via
  EF3.3's `applyStatusTransition` (so `paidAt != null ⟺ status === 'paid'` holds by
  construction) before any write — returning a `{ ok: false }` rejection
  (`EnvelopeRejectionReason`) the UI renders, or throwing `FinanceDataError`
  (`foreign_key_violation` for a bad/unowned category). Types: `EnvelopeCommands`,
  `CreateEnvelopeInput`, `EditEnvelopeInput`, `SetEnvelopeStatusInput`,
  `EnvelopeRejectionReason`, and the four `*Result` types.

- `provisionDefaultCategories(client, userId)` — the finance-owned **onboarding**
  API (EF3.9): idempotently stocks a new user with the default category set.
  Called by the auth/onboarding layer (EF3.12) as a **trusted backend job** on a
  **service client** (RLS bypassed; `user_id` set explicitly), it either seeds
  `DEFAULT_CATEGORIES` (zero-category user) or no-ops (already stocked) — a
  **count-guard**, not `ON CONFLICT` (EF1.2 has no `UNIQUE(user_id, name)`).
  Takes a `userId`, not free input → **no `{ ok }` rejection union**; throws
  `FinanceDataError` on a DB fault. `listCategories(client)` is the runtime
  **authed** (RLS-scoped) read the EF3.14 picker / EF3.13 grouping consume. Types:
  `ProvisionCategoriesResult`; the pure `Category` type + the `DEFAULT_CATEGORIES`
  / `DefaultCategory` catalog ship via the domain barrel.

The raw `SupabaseClient` type and the generated `@nafios/database` row types are
**never** re-exported. `createLedgerRepository`, `createEnvelopeRepository`,
`createCategoryRepository`, the mappers (including the `carried_over` seam), and
`mapPostgrestError` stay **internal** — imported within the package (e.g. by the
EF3.7 command and EF3.10's read surface), not surfaced on the barrel.

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
  matrices (connection-spine RLS, the EF3.6 ledger-repository §6 matrix
  `tests/integration/ledger.repo.test.ts`, the EF3.7 create-ledger §6 matrix
  `tests/integration/create-ledger.test.ts`, the EF3.8 envelope §6 matrices
  `tests/integration/envelope.repo.test.ts` + `tests/integration/envelope-commands.test.ts`,
  the EF3.9 category §6 matrices
  `tests/integration/category.repo.test.ts` + `tests/integration/provision-default-categories.test.ts`,
  and the EF3.13 Finance-Home read matrix `tests/integration/ledger-queries.test.ts`)
  live at repo-root `tests/integration/` and run via `bun run test:integration`
  only — never in `bun run check` (no live Supabase in CI, and the per-file
  coverage scoping in
  [ADR-0020](../../adr/0020-test-coverage-scoping-and-gate.md) is why they can't
  load the real cross-package clients inside a package run). All `skipIf` when
  the Supabase env vars are absent. The EF3.6, EF3.8-repository, EF3.9-repository,
  and EF3.13 matrices import the internal `create*Repository` (and, for EF3.8, the
  mapper's `carried_over` seam) via a relative path — a documented, test-only
  exception to the internal-import rule (see each file's header). EF3.13 reaches in
  only to **seed** rows; the READ under test is the public, barrel-exported
  `createLedgerQueries`, so it needs no exception for the assertion path — same as
  how the EF3.7, EF3.8-commands, and EF3.9-provisioning matrices drive the public
  `create*Commands` / `provisionDefaultCategories` / `listCategories`.
  The per-file coverage gate for `create-ledger.ts`, `envelope.repo.ts`,
  `envelope.mapper.ts`, `envelope-commands.ts`, `category.mapper.ts`,
  `category.repo.ts`, `provision-default-categories.ts`, and
  `queries/ledger-queries.ts` is met by their mocked unit tests under `tests/unit/`.

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
    index.ts            # domain barrel — pure types/codecs + re-exports Month from @nafios/datetime
    category.ts         # Category domain type (EF3.9)
    default-categories.ts # DefaultCategory + DEFAULT_CATEGORIES catalog (EF3.9)
    money.ts            # Money value type + codec + arithmetic (EF3.1)
    codec-error.ts      # CodecError thrown by the Money decode/construct paths (EF3.1)
    # Month + calendar helpers now live in @nafios/datetime (extracted 2026-08)
  internal/
    client.ts           # createBrowserClient, createServiceClient, FinanceClient
    errors.ts           # FinanceDataError, FinanceDataErrorCode, mapPostgrestError (EF3.6)
    mappers/
      ledger.mapper.ts    # monthly_ledger row ↔ LedgerHeader / NewLedger (EF3.6)
      envelope.mapper.ts  # envelope row ↔ Envelope + carried_over ↔ carried-over seam (EF3.8)
      category.mapper.ts  # category row ↔ Category + explicit-user_id insert (EF3.9)
    repositories/
      ledger.repo.ts      # createLedgerRepository, LedgerRepository, LedgerHeader, NewLedger (EF3.6)
      envelope.repo.ts    # createEnvelopeRepository, EnvelopeRepository, NewEnvelope/EnvelopePatch (EF3.8)
      category.repo.ts    # createCategoryRepository — count / insertMany / listForUser / listByUser (EF3.9)
    commands/
      create-ledger.ts       # createLedgerCommands — the single write path opening a ledger (EF3.7)
      envelope-commands.ts   # createEnvelopeCommands — manual envelope CRUD + set-status (EF3.8)
    queries/
      ledger-queries.ts      # createLedgerQueries — the Finance-Home read surface / getFinanceHomeState (EF3.13)
    provisioning/
      provision-default-categories.ts # provisionDefaultCategories + listCategories (EF3.9)
tests/
  unit/                 # mocked-SDK/mocked-client unit tests (in the coverage gate)
  integration/          # placeholder — the live-DB matrices live at repo-root tests/integration/
spec.md                 # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
