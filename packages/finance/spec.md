---
title: "@nafios/finance"
status: active
version: 0.3.0
updated: 2026-07-08
owner: Hanafi
related_adrs: [0005, 0006, 0014, 0019, 0020, 0021]
---

# @nafios/finance — Specification

## Purpose

The NafiOS finance module as a single `@nafios/<module>` package. EF2 shipped
the **skeleton**: the architecture — the internal pure/data layer split and the
client/auth **connection spine** — with no functional code. EF3.1 then landed
the first pure-domain code: the `Money`/`Month` value types + codecs. Adding
each subsequent entity type, codec, or repository requires only writing it in
the correct layer, never re-architecting the package.

Scope and boundary are defined by the EF2 epic and its two sub-tickets:

- [EF2 — Finance package foundation](../../issues/EF2.md)
- [EF2.1 — Scaffold the `@nafios/finance` package](../../issues/EF2.1.md)
- [EF2.2 — Finance client factories & auth/session context](../../issues/EF2.2.md)

## Scope

**In (EF2):**

- The single public barrel (`src/index.ts`) as the only export surface.
- The internal `src/domain/` (pure) + `src/internal/` (data) layer split,
  enforced by a Biome import-boundary rule
  ([ADR-0005](../../adr/0005-biome-over-eslint-prettier.md)).
- The connection spine in `src/internal/`: `createBrowserClient` (the runtime
  client — browser session, auto-refresh, RLS applies) and `createServiceClient`
  (RLS bypassed; seeds/tests only) — thin wrappers over `@nafios/database`
  (`asDb`, `Db`) and `@nafios/supabase-core` (client construction), per
  [ADR-0021](../../adr/0021-supabase-core-connection-foundation.md).

**In (EF3.1):** the first pure-domain value types + codecs — `Money` (branded
integer-cents) and `Month` (branded `"YYYY-MM"`), their DB read/write codecs,
the sanctioned money-arithmetic helpers, and the `CodecError` they throw. Zero
I/O, zero dependencies; lives in `src/domain/`. Full contract, behavior rules,
and verification matrix: [EF3.1](../../issues/EF3.1.md).

**In (EF3.2 / EF3.3):** the first domain **entity** shapes + the derived-metrics
engine — the `Envelope` and `MonthlyLedger` in-memory shapes, their status
vocabularies (`EnvelopeStatus` / `LedgerStatus`) and the frozen
`ENVELOPE_STATUSES` set, the `countsTowardCol` COL-contribution rule, the pure
`applyStatusTransition` `paidAt` resolver, `isLedgerMutable`, and the
`computeLedgerMetrics` engine (COL, Health Margin, ASM Contribution, Outstanding,
plus the negative-ASM signal). Pure — zero I/O, no clock; lives in `src/domain/`.
Behavior is governed by the cross-cutting domain specs
[`finance-domain-spec.md`](../../specs/domain/finance/finance-domain-spec.md) and
[`monthly-ledger.md`](../../specs/domain/finance/monthly-ledger.md).

**In (EF3.6):** the first `src/internal/` **data-layer feature** — the ledger
repository (`createLedgerRepository` → `insert` / `findById` / `findByMonth` /
`findOngoing` / `list` / `updateStatus` / `delete`) plus the two foundations
every later repository reuses: the typed `FinanceDataError` + the single
SQLSTATE→code classifier (`mapPostgrestError`, with the 23505-by-constraint-name
split), and the row↔domain mapper (money/month via the EF3.1 codecs). Barrel
surface: `FinanceDataError`, `FinanceDataErrorCode`, `LedgerHeader`; the factory,
mapper, and classifier stay **internal**. Full contract, verification matrix, and
the test-lane decision: [EF3.6](../../boards/finance/EF3/EF3.6.md).

**In (EF3.7):** the first `src/internal/` **command** — the create-ledger
command (`createLedgerCommands` → `createLedger`), the single write path that
opens a `MonthlyLedger`. It composes the pure rules (EF3.5 guardrail, EF3.4
openable-month window, input non-negativity) enforced server-side before any
write, then the EF3.6 repository primitives to perform the previous-`ongoing` →
`reconciling` park and the new-ledger insert as one all-or-nothing operation
(ordered writes + compensation, backstopped by EF1.1's `uq_one_ongoing_ledger`;
no RPC, no migration). Adds **no** business rule. Barrel surface:
`createLedgerCommands`, `LedgerCommands`, `CreateLedgerInput`,
`CreateLedgerResult`, `CreateLedgerRejectionReason`; the repository stays
**internal**. Full contract, verification matrix, and the test-lane decision:
[EF3.7](../../boards/finance/EF3/EF3.7.md).

**In (EF3.8):** the second `src/internal/` **data-layer feature** — the envelope
repository (`createEnvelopeRepository` → `insert` / `findById` / `listByLedger` /
`update` / `updateStatus` / `delete`) and the app-facing envelope **command**
surface (`createEnvelopeCommands` → `createEnvelope` / `editEnvelope` /
`setEnvelopeStatus` / `deleteEnvelope`). The repository carries the envelope
mapper, which **owns the `carried_over ↔ carried-over` DB-label seam** (the only
place the snake_case label appears). The commands mirror the EF3.7 pattern
(validate-in-domain → orchestrate → result/throw) and add the **parent-ledger
mutability gate** (EF3.2's `isLedgerMutable`) shared by all four, computing
`paidAt` via EF3.3's `applyStatusTransition` so `paidAt != null ⟺ status ===
'paid'` holds by construction. Reuses EF3.6's `FinanceDataError` classifier,
**extended once** with `23503 → foreign_key_violation` (a bad/unowned category).
Barrel surface: `createEnvelopeCommands`, `EnvelopeCommands`, the three command
input types, `EnvelopeRejectionReason`, and the four `*Result` types; the
repository + mapper stay **internal** (EF3.10 imports the repository for
`listByLedger`). Full contract, verification matrix, and the test-lane decision:
[EF3.8](../../boards/finance/EF3/EF3.8.md).

**Out (deferred to later finance feature tickets):** the composed read surface +
metrics attachment (EF3.10), the default-category provisioning API (EF3.9), any
service/API endpoints, any UI, and any schema/migration change (EF3 consumes the
EF1 schema unchanged).

## Architecture

One package, two internal layers with a one-way, lint-enforced dependency
direction:

```
src/internal/ (data) → src/domain/ (domain) → (nothing app-specific)
```

- **`src/domain/`** — pure types, enums, and codecs. Zero I/O. Must not import
  `src/internal/`, `@nafios/database`, `@nafios/supabase-core`, or
  `@supabase/*`. Empty (placeholder barrel) at EF2.
- **`src/internal/`** — the data layer; the only place `@nafios/database` and
  `@nafios/supabase-core` appear. May import `src/domain/`.

## Public API

### Connection spine (EF2.2)

```ts
/** A finance data-layer client — the schema-typed Db (SupabaseClient<Database>). */
export type FinanceClient = Db;

/** Runtime client — browser session, auto-refresh; auth.uid() resolves and RLS applies. */
export function createBrowserClient(): FinanceClient;

/** service_role key — BYPASSES RLS. Seeds/tests only; must set user_id explicitly. */
export function createServiceClient(): FinanceClient;
```

The raw `SupabaseClient` type and the generated `@nafios/database` row types are
**never** re-exported — `FinanceClient` (an alias of `Db`) is what callers see.

### Domain value types & codecs (EF3.1)

Pure `src/domain/` surface — branded value types plus the codecs that convert
them to/from the raw DB shapes. Signatures only; see
[EF3.1](../../issues/EF3.1.md) for behavior rules and the verification matrix.

```ts
// Money — exact money held as branded integer CENTS (numeric(12,2) is read as a string).
export type Money = number & { readonly __brand: "Money" };
export const ZERO_MONEY: Money;
export function decodeMoney(dbValue: string): Money; // numeric(12,2) string -> Money
export function encodeMoney(value: Money): string; // Money -> canonical numeric(12,2) string
export function moneyFromCents(cents: number): Money;
export function toCents(value: Money): number;
export function addMoney(a: Money, b: Money): Money;
export function subtractMoney(a: Money, b: Money): Money; // result MAY be negative
export function sumMoney(values: readonly Money[]): Money; // [] -> ZERO_MONEY
export function compareMoney(a: Money, b: Money): -1 | 0 | 1;
export function isNegativeMoney(value: Money): boolean;

// Month — calendar month as branded "YYYY-MM" (lexicographic order == chronological).
export type Month = string & { readonly __brand: "Month" };
export function decodeMonth(dbValue: string): Month; // first-of-month DATE -> Month
export function encodeMonth(value: Month): string; // Month -> first-of-month DATE
export function monthOf(isoDate: string): Month; // month containing a caller-supplied date
export function addMonths(value: Month, n: number): Month; // rolls the year in both directions
export function compareMonths(a: Month, b: Month): -1 | 0 | 1;

// The single error type thrown by the decode/construct paths on malformed input.
export type CodecErrorCode =
  | "money_not_numeric"
  | "money_too_many_decimals"
  | "money_out_of_range"
  | "money_not_integer_cents"
  | "month_not_a_date"
  | "month_not_first_of_month";
export class CodecError extends Error {
  readonly code: CodecErrorCode;
}
```

### Domain entities & metrics (EF3.2 / EF3.3)

Pure `src/domain/` surface — the in-memory entity shapes, their status models,
and the derived-metrics engine. Metrics are **computed on read, never stored**.
Signatures only; full behavior + verification matrix live in the cross-cutting
domain specs
[`finance-domain-spec.md`](../../specs/domain/finance/finance-domain-spec.md) and
[`monthly-ledger.md`](../../specs/domain/finance/monthly-ledger.md).

```ts
// Envelope — a single line item (a pocket of cash) within a ledger.
export type EnvelopeStatus = "pending" | "paid" | "skipped" | "carried-over";
export const ENVELOPE_STATUSES: readonly EnvelopeStatus[]; // frozen, display order
export interface Envelope {
  /* id, ledgerId, category, item, amount, status, paidAt, … — see envelope.ts */
}
export function countsTowardCol(status: EnvelopeStatus): boolean; // pending | paid

// Pure paidAt set/clear resolver — never reads the clock (`now` is caller-supplied).
export interface EnvelopeStatusState {
  status: EnvelopeStatus;
  paidAt: string | null;
}
export function applyStatusTransition(
  current: EnvelopeStatusState,
  next: EnvelopeStatus,
  now: string,
): EnvelopeStatusState; // invariant on result: paidAt != null ⟺ status === 'paid'

// MonthlyLedger — one calendar month of cashflow; derived metrics are NOT stored.
export type LedgerStatus = "ongoing" | "reconciling" | "settled";
export interface MonthlyLedger {
  /* id, month, openingBalance, maxCapped, status, envelopes, … — see monthly-ledger.ts */
}
export function isLedgerMutable(status: LedgerStatus): boolean; // false once settled

// Derived-metrics engine — recomputed live on every read (never stored).
export interface Outstanding {
  count: number;
  total: Money;
}
export interface LedgerMetrics {
  col: Money; // Σ(amount) where status is pending or paid
  healthMargin: Money; // MaxCapped − COL   (may be negative)
  asmContribution: Money; // Opening − COL     (may be negative)
  outstanding: Outstanding;
  isAsmNegative: boolean;
}
export function computeLedgerMetrics(ledger: {
  openingBalance: Money;
  maxCapped: Money;
  envelopes: readonly { amount: Money; status: EnvelopeStatus }[];
}): LedgerMetrics;
```

### Data layer — ledger repository (EF3.6)

Barrel-exported: the typed data-layer error (caught and branched on by the
app/UI) and the persisted-ledger shape the read surface (EF3.10) builds on.
`createLedgerRepository`, the mapper, and `mapPostgrestError` stay **internal** —
consumed within the package by EF3.7 / EF3.10, never re-exported. `PostgrestError`
comes from `@nafios/supabase-core` (finance never imports `@supabase/*` directly).

```ts
export type FinanceDataErrorCode =
  | "duplicate_month" // 23505 uq_ledger_user_month
  | "ongoing_exists" // 23505 uq_one_ongoing_ledger
  | "check_violation" // 23514
  | "foreign_key_violation" // 23503 — EF3.8 (bad/unowned category or ledger on an envelope write)
  | "not_null_violation" // 23502
  | "unknown"; // incl. RLS 42501, unexpected SQLSTATEs

export class FinanceDataError extends Error {
  readonly code: FinanceDataErrorCode;
  readonly constraint: string | null; // DB constraint name when the SQLSTATE carries one
  readonly cause: PostgrestError; // the raw SDK error
}

// A MonthlyLedger WITHOUT its envelopes — everything the monthly_ledger table
// alone yields; EF3.10 completes it with envelopes + computed metrics.
export type LedgerHeader = Omit<MonthlyLedger, "envelopes">;
```

### Data layer — create-ledger command (EF3.7)

Barrel-exported: the app-facing **write surface** — the single command path that
opens a `MonthlyLedger`, consumed by the EF3.12 creation flow. `createLedger`
enforces input non-negativity, the EF3.5 maxCapped guardrail, and the EF3.4
openable-month window **before any write** (returning a `{ ok: false }` rejection
the UI renders), then parks the current `ongoing` ledger and inserts the new one
as an all-or-nothing operation, throwing `FinanceDataError` (EF3.6) on a DB
failure / `CodecError` (EF3.1) on a malformed `today`. `createLedgerRepository`
stays **internal** — the command is the public write API, the repository its
private primitive. Full contract + verification matrix:
[EF3.7](../../boards/finance/EF3/EF3.7.md).

```ts
export function createLedgerCommands(client: FinanceClient): LedgerCommands;

export interface LedgerCommands {
  createLedger(input: CreateLedgerInput): Promise<CreateLedgerResult>;
}

// Manual creation inputs (no config prefill in EF3; leadDays is fixed at 7).
export interface CreateLedgerInput {
  readonly month: Month; // one of EF3.4's openable months
  readonly openingBalance: Money; // ≥ 0
  readonly maxCapped: Money; // ≥ 0 and passes the EF3.5 guardrail
  readonly confirmed: boolean; // explicit amber-zone acknowledgement (EF3.5)
  readonly today: string; // caller-supplied "YYYY-MM-DD"; no clock read
}

// Why createLedger refused BEFORE any write — a deterministic input/context
// failure the UI renders (DB failures throw FinanceDataError instead).
export type CreateLedgerRejectionReason =
  | "month_not_openable" // month ∉ EF3.4 openable set
  | "negative_amount" // openingBalance or maxCapped < 0
  | "requires_confirmation" // EF3.5 amber zone, not confirmed
  | "exceeds_hard_cap"; // EF3.5 blocked zone (> 2× opening) — no override

export type CreateLedgerResult =
  | { readonly ok: true; readonly ledger: LedgerHeader; readonly parkedLedgerId: string | null }
  | {
      readonly ok: false;
      readonly reason: CreateLedgerRejectionReason;
      readonly guardrail: MaxCappedGuardrail | null; // EF3.5 max-capped guardrail; present iff a guardrail reason
    };
```

### Data layer — envelope repository + commands (EF3.8)

Barrel-exported: the app-facing **write surface** for manual envelopes, consumed
by the EF3.14 envelope UI. Each command validates against the pure domain rules
(the parent-ledger mutability gate via EF3.2's `isLedgerMutable`, amount
non-negativity, EF3.3's `applyStatusTransition`) **before any write**, returning a
`{ ok: false }` rejection the UI renders, and throws `FinanceDataError` on a DB
failure — notably `foreign_key_violation` for a bad/unowned category. The
`createEnvelopeRepository` factory and the envelope mapper (which **owns the
`carried_over ↔ carried-over` DB-label seam** — the only place the snake_case
label appears) stay **internal**; EF3.10 imports the repository within the package
for `listByLedger`. Full contract + verification matrix:
[EF3.8](../../boards/finance/EF3/EF3.8.md).

```ts
export function createEnvelopeCommands(client: FinanceClient): EnvelopeCommands;

export interface EnvelopeCommands {
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;
  editEnvelope(input: EditEnvelopeInput): Promise<EditEnvelopeResult>;
  setEnvelopeStatus(input: SetEnvelopeStatusInput): Promise<SetEnvelopeStatusResult>;
  deleteEnvelope(input: { readonly envelopeId: string }): Promise<DeleteEnvelopeResult>;
}

// createEnvelope writes a MANUAL, pending line (paidAt null, manual-only fields
// null); editEnvelope changes only present line fields (never status/paidAt);
// setEnvelopeStatus funnels every status change through applyStatusTransition so
// paidAt != null ⟺ status === 'paid' holds by construction (transitions are
// free-form). Manual-only fields (templateId/originalAmount/…) are never accepted.
export interface CreateEnvelopeInput {
  readonly ledgerId: string;
  readonly category: string; // a category the user owns (EF3.9)
  readonly item: string;
  readonly amount: Money; // ≥ 0
  readonly paymentSource?: string | null;
  readonly remark?: string | null;
  readonly linkedPerson?: string | null;
  readonly sortOrder?: number;
}

// Why a command refused BEFORE any write — a deterministic input/context failure
// the UI renders (DB failures throw FinanceDataError instead).
export type EnvelopeRejectionReason =
  | "ledger_not_found" // parent ledger absent / not owned (create)
  | "envelope_not_found" // target envelope absent / not owned (edit / set-status / delete)
  | "ledger_not_mutable" // parent ledger is settled (isLedgerMutable === false)
  | "negative_amount"; // amount < 0 (create / edit)
```

## Behavior & rules

1. **Browser client runs as the user.** Finance executes client-side; supabase-core's
   `createBrowserClient` reads the logged-in session from browser storage,
   auto-refreshes the access token as it expires, and attaches it to every
   request. `auth.uid()` resolves and the owner RLS policy applies for the life
   of the session. It takes no arguments — the browser owns the session, so no
   token is plumbed through finance.
2. **Service client bypasses RLS — by design, and a footgun.** No auth context,
   so `auth.uid()` is NULL; a service insert that omits `user_id` is correctly
   rejected by `NOT NULL` (`23502`). Callers must set `user_id` explicitly.
   Never on a request path.
3. **The connection spine has no domain rules.** The `src/internal/` spine only
   constructs correctly-scoped clients — no lifecycle/status/metric/guardrail/
   cursor logic and no SQLSTATE error mapping. The Money/Month value types +
   codecs now live in the pure `src/domain/` layer (EF3.1); repositories,
   row↔domain mappers, and metrics remain later feature tickets.
4. **`@supabase/*` stays in supabase-core.** Finance imports only
   `@nafios/database` + `@nafios/supabase-core`.

## Environment variables

| Var                         | Read by                | Notes                                                                  |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `SUPABASE_URL`              | both factories         | Project URL. Needs bundler-level exposure for the browser client.      |
| `SUPABASE_ANON_KEY`         | `createBrowserClient`  | Anon key; the browser session's JWT is layered on top.                 |
| `SUPABASE_SERVICE_ROLE_KEY` | `createServiceClient`  | Secret; bypasses RLS. Seeds/tests/trusted jobs only — never a bundle.  |

## Verification

- **Gated (in `bun run check`):** mocked-SDK unit tests for the finance
  factories, satisfying the per-file 90% coverage gate
  ([ADR-0020](../../adr/0020-test-coverage-scoping-and-gate.md)).
- **Non-gating (`bun run test:integration`):** a live-DB RLS matrix at
  repo-root `tests/integration/` against a local Supabase with two seeded
  users. It proves RLS isolation, the `auth.uid()` insert path, and the
  service-role `NOT NULL` behavior. Because finance's runtime client is
  browser-only, this headless suite builds its two per-user clients from
  supabase-core's raw-token `createAuthedClient` + `asDb` directly. It never
  runs inside `bun run check` (no live Supabase in CI).

## Invariants

1. The barrel (`src/index.ts`) is the only public export surface.
2. `src/domain/` is pure — the Biome override fails any data-layer import.
3. Exactly two workspace deps (`@nafios/database`, `@nafios/supabase-core`);
   no direct `@supabase/*` dependency.
4. No build step — consumed as TypeScript source
   ([ADR-0006](../../adr/0006-no-build-internal-packages.md)).

## Open questions

- **Browser bundle safety of the service-role path** — finance now runs
  client-side, so `createBrowserClient` and `createServiceClient` ship from the
  same barrel. `createServiceClient` reads `SUPABASE_SERVICE_ROLE_KEY` and
  bypasses RLS; it must be tree-shaken out of any browser bundle (it is only
  reachable from seeds/tests, so a bundler with dead-code elimination should
  drop it, but this is unverified). A future `@nafios/finance/data` vs
  server-only subpath split may be needed to guarantee the secret path can never
  reach a client bundle.
- **Codec home** — the Money/Month codecs now live in `src/domain/` (EF3.1);
  extracting to a shared `@nafios/math` / `@nafios/temporal` package stays
  deferred until a second module needs them.
