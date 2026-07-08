# EF3.6 — Ledger repository (CRUD, uniqueness, ongoing query)

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:M`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the **ledger repository** — the CRUD + lookup primitives over the `monthly_ledger` table, the row↔domain mapper, and the typed data-layer error — is in this file. Stack: **Supabase JS SDK** (`@supabase/supabase-js`), typed from `@nafios/db`'s generated `database.types.ts`, running through EF2.2's authed client. It lives in `@nafios/finance`'s **data layer** (`src/internal/`) — the only layer where Supabase / `@nafios/db` may appear. **No ORM / no Drizzle. No schema changes** (EF3 consumes the EF1 schema unchanged — the one EF3-owned schema item is the EF3.9 category seed).
>
> **This is the FIRST repository in the finance module.** EF2 deliberately deferred three data-layer foundations to "the first repository feature ticket": the **row↔domain mapper** pattern, the **`FinanceDataError` + SQLSTATE→typed-code** mapping, and the **integration-test harness** (EF2 Out of scope; EF2.2 Notes 3). They land **here** and are reused verbatim by EF3.8 (envelope repository) — so this ticket is a bit heavier than the pure-domain EF3.1–EF3.5 leaves.
>
> **Depends on:**
>
> - **EF3.1** (Money & Month codecs) — the mapper decodes `numeric(12,2)` money via `decodeMoney` and the first-of-month `DATE` via `decodeMonth` on **read**, and encodes them via `encodeMoney` / `encodeMonth` on **write**. It **relies on** the Month codec's first-of-month invariant and **never re-checks** it (cross-ticket decision — EF3.1 §2 / this epic).
> - **EF3.2** (`MonthlyLedger` type + `LedgerStatus`) — the repository returns `LedgerHeader = Omit<MonthlyLedger, 'envelopes'>` (§2); the DB `ledger_status` enum values map 1:1 to `LedgerStatus`. **Type-only** dependency — the metrics engine (`computeLedgerMetrics`) is **not** called here (that is EF3.10).
> - **EF2.2** (connection spine) — every method runs on a caller-supplied **authed** `FinanceClient`, so `auth.uid()` resolves and RLS's `owner_all` policy scopes all reads/writes. Inserts **never** set `user_id` (the DB default `auth.uid()` fills it — EF2.2 AC4).
> - **EF1.1** (the `monthly_ledger` table) — its columns, the `ledger_status` enum, and the six named constraints (`uq_ledger_user_month`, `uq_one_ongoing_ledger`, `ck_maxcapped_ceiling`, `ck_balances_nonneg`, `ck_settled_at`, `ck_ledger_month_first`) are the exact surface this repository reads/writes and maps errors from.
>
> **Consumed by:**
>
> - **EF3.7** (create-ledger command) — calls `insert`, `findOngoing`, and `updateStatus` to compose the **atomic** previous-`ongoing` → `reconciling` transition + new-ledger insert (the atomicity + guardrail + window checks are EF3.7's; this ticket supplies the primitives).
> - **EF3.10** (ledger read/query surface) — composes `LedgerHeader` + envelopes (EF3.8) into a full `MonthlyLedger` and runs `computeLedgerMetrics` (EF3.2); wraps `findByMonth` / `list` for the app-facing read surface and adds the broader round-trip integration suite on top of this ticket's harness.
> - **EF3.4** (creation-window resolver) — `list()` returns `LedgerHeader[]`, which structurally satisfies the resolver's `LedgerSummary[]` input directly (month + status).
> - **EF3.8** (envelope repository) — **reuses** this ticket's mapper pattern, `FinanceDataError` mapping, and integration-test harness; does not re-invent them.
>
> **Build-order & PR readiness.** The **first `src/internal/` feature** after the EF2.2 connection spine. It depends only on EF3.1 + EF3.2 (types/codecs, already in `src/domain/`) and EF2.2 (the authed client) — **not** on EF3.3/EF3.5 (no envelopes, no guardrail here). It is independently PR-able once EF3.1, EF3.2, and EF2.2 are merged. Unlike the pure-domain tickets, its tests are **integration tests against a local Supabase** (two seeded users) — `bun run check` runs them (see §9).
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, the authed/service client factories, green `bun run check`).

---

## 1. What you're building

The **ledger repository** — the typed, RLS-scoped data-access primitives for the `monthly_ledger` table, plus the two data-layer foundations every later repository sits on:

1. **`createLedgerRepository(client)`** — a factory returning a `LedgerRepository` bound to an authed `FinanceClient` (EF2.2). Its methods are the CRUD + lookup primitives: `insert`, `findById`, `findByMonth`, `findOngoing`, `list`, `updateStatus`, `delete`. Each maps DB rows to domain `LedgerHeader` values and raw SDK errors to `FinanceDataError`.
2. **The row↔domain mapper** — `monthly_ledger` row → `LedgerHeader` (decode money/month via EF3.1) and domain → insert/update payload (encode). This is the **mapper pattern** EF3.8 reuses.
3. **`FinanceDataError` + SQLSTATE→code mapping** — the typed error every finance repository throws, classifying the raw `PostgrestError` by SQLSTATE (and, for `23505`, by constraint name) so callers branch on a stable `code` instead of parsing DB strings.

Framework-thin TypeScript in `src/internal/`. **No business logic** — no guardrail, no window check, no atomic multi-write orchestration, no metrics. Those are EF3.5 / EF3.4 / EF3.7 / EF3.10. This ticket is the _data primitive_ they compose.

**Why it exists — the problem it solves:**

Every finance feature that reads or writes a month goes through this layer. If each command hand-wrote its own `.from('monthly_ledger')` query, decoded `numeric` strings ad-hoc, and pattern-matched raw `PostgrestError` messages, three things would drift: money would get parsed as floats somewhere (the exact bug EF3.1 exists to prevent), the first-of-month invariant would get re-checked (or missed) in scattered places, and the two most important write failures — **"a ledger already exists for this month"** (`uq_ledger_user_month`) and **"you'd have two ongoing ledgers"** (`uq_one_ongoing_ledger`) — would be indistinguishable, because Postgres reports both as SQLSTATE `23505`. The create command (EF3.7) and its UI (EF3.12) _must_ tell those two apart to show the right message. This ticket pins the ledger's data access in **one** place: one mapper (money/month decode/encode owned by EF3.1, called here), one error classifier (23505-by-constraint-name → `duplicate_month` vs `ongoing_exists`), and one `findOngoing` query the create command relies on to find the ledger it must park.

> **Cross-ticket decision (from the EF3 epic).** The first-of-month `DATE` handling is **owned by the Month codec (EF3.1)** and _consumed_ here — the mapper calls `decodeMonth` / `encodeMonth` and **never** re-derives the first-of-month rule. Exact money arithmetic/serialization is **owned by the Money codec (EF3.1)** — the mapper calls `decodeMoney` / `encodeMoney` and **never** touches a raw `numeric` string with `+`, `parseFloat`, or `Number()`. This is the same "the invariant lives in one place, the data layer is a caller" discipline as EF3.1 Notes 6.

---

## 2. Public API / contract

Exact TS signatures. These names are the contract EF3.7 / EF3.8 / EF3.10 import — keep them stable. `FinanceDataError`, `FinanceDataErrorCode`, and `LedgerHeader` are **barrel-exported** from `src/index.ts` (the app/UI catches the error and the query surface returns header-derived shapes); `createLedgerRepository` and the mapper are **internal** (`src/internal/`), imported within the package by EF3.7 / EF3.10 — they are _not_ re-exported (EF2's "minimal public surface" stance).

```ts
import type { Money, Month } from "../domain/money"; // EF3.1 (Month from ../domain/month)
import type { MonthlyLedger, LedgerStatus } from "../domain/monthly-ledger"; // EF3.2
import type { FinanceClient } from "./client"; // EF2.2
import type { PostgrestError } from "@supabase/supabase-js";

// ───────────────────────── Ledger header (row → domain) ─────────────────────────

/**
 * The PERSISTED ledger — a MonthlyLedger WITHOUT its envelopes. This is everything
 * the `monthly_ledger` table alone can produce; envelopes live in a separate table
 * (EF3.8) and are attached, with computed metrics, by the composed read surface
 * (EF3.10). A full MonthlyLedger is a LedgerHeader plus `envelopes`.
 *
 * Returning Omit<…, 'envelopes'> (not a MonthlyLedger with envelopes: []) is
 * deliberate: it makes it a TYPE ERROR to run computeLedgerMetrics on a bare header
 * read, so nothing accidentally computes COL from an unloaded envelope list — you
 * must go through EF3.10 to get a metrics-ready MonthlyLedger.
 */
export type LedgerHeader = Omit<MonthlyLedger, "envelopes">;
// { id: string; month: Month; openingBalance: Money; maxCapped: Money;
//   status: LedgerStatus; createdAt: string; settledAt: string | null }

/**
 * The header fields a caller supplies to create a ledger. No `id` (DB gen_random_uuid),
 * no `user_id` (DB default auth.uid() — NEVER set on the authed path), no `createdAt`
 * (DB default now()), no `settledAt` (EF3 never inserts a settled ledger — EF5+).
 * `status` defaults to 'ongoing'; only non-settled statuses are insertable in EF3.
 */
export interface NewLedger {
  readonly month: Month;
  readonly openingBalance: Money;
  readonly maxCapped: Money;
  readonly status?: Extract<LedgerStatus, "ongoing" | "reconciling">; // default 'ongoing'
}

// ───────────────────────── Typed data-layer error ─────────────────────────

/** Why a finance repository write/read failed, classified from the raw PostgrestError. */
export type FinanceDataErrorCode =
  | "duplicate_month" // 23505 on uq_ledger_user_month — a ledger already exists for that month
  | "ongoing_exists" // 23505 on uq_one_ongoing_ledger — would be a 2nd ongoing ledger for the user
  | "check_violation" // 23514 — a CHECK failed (ck_maxcapped_ceiling / ck_balances_nonneg / ck_settled_at / ck_ledger_month_first)
  | "not_null_violation" // 23502 — a NOT NULL failed (e.g. a service-role caller omitted user_id)
  | "unknown"; // any PostgrestError not mapped above (incl. RLS 42501, unexpected SQLSTATEs)

/**
 * The typed error EVERY finance repository throws. Wraps the raw PostgrestError and
 * classifies it by SQLSTATE (+ constraint name for 23505) so callers branch on a
 * stable `code` instead of parsing DB message strings. Established here (the first
 * repository) and reused unchanged by EF3.8.
 *
 * NOT thrown for "no rows": reads return null (§4.2). A malformed DB *value* is a
 * different failure — that surfaces as EF3.1's CodecError from the mapper, not this.
 */
export class FinanceDataError extends Error {
  readonly code: FinanceDataErrorCode;
  readonly constraint: string | null; // the DB constraint name when SQLSTATE carries one, else null
  readonly cause: PostgrestError; // the raw SDK error (also set as the native Error cause)
}

// ───────────────────────── The ledger repository ─────────────────────────

export interface LedgerRepository {
  /**
   * Insert a new ledger (user_id filled by the DB default auth.uid() — never set here).
   * Encodes money via encodeMoney and month via encodeMonth. Returns the created
   * LedgerHeader (read back so DB-defaulted id/createdAt/status are present).
   * Throws FinanceDataError('duplicate_month' | 'ongoing_exists' | 'check_violation' | …).
   */
  insert(input: NewLedger): Promise<LedgerHeader>;

  /** Fetch by id, RLS-scoped to the caller. null when not found OR not owned. */
  findById(id: string): Promise<LedgerHeader | null>;

  /** The caller's ledger for a given month, or null — the uniqueness/conflict probe
   *  EF3.7 uses before opening a month. Encodes `month` via encodeMonth to query. */
  findByMonth(month: Month): Promise<LedgerHeader | null>;

  /** THE "one ongoing" query: the caller's single `ongoing` ledger, or null. The
   *  uq_one_ongoing_ledger partial unique index guarantees at most one — the mapper
   *  need not defend against a second (§4.2). EF3.7 uses this to find the ledger to park. */
  findOngoing(): Promise<LedgerHeader | null>;

  /** All the caller's ledgers, chronological by month (ascending). [] when none.
   *  Satisfies EF3.4's LedgerSummary[] input directly (month + status). */
  list(): Promise<LedgerHeader[]>;

  /**
   * Transition a ledger's status. EF3 uses this ONLY for ongoing → reconciling (the
   * type restricts to non-settled). Returns the updated header. Does NOT enforce the
   * guardrail (EF3.5), the mutability rule (EF3.2 isLedgerMutable), or atomicity across
   * writes — that composition is the create-ledger command's (EF3.7). Settling (which
   * must also set settled_at, per ck_settled_at) is a later capability (EF5+).
   */
  updateStatus(
    id: string,
    status: Extract<LedgerStatus, "ongoing" | "reconciling">,
  ): Promise<LedgerHeader>;

  /** Delete a ledger, RLS-scoped. A complete-CRUD primitive; NO EF3 user story deletes
   *  a ledger — present for test teardown and repository completeness. */
  delete(id: string): Promise<void>;
}

/** Construct a ledger repository bound to an authed FinanceClient (EF2.2). Every
 *  method runs as that user under RLS. */
export function createLedgerRepository(client: FinanceClient): LedgerRepository;
```

---

## 3. Package placement, layer & exports

**Data-layer code** — lands in `@nafios/finance`'s `src/internal/` (the only layer that may import `@supabase/supabase-js` / `@nafios/db`; it may import `src/domain/`). This is the boundary the EF2 eslint rule enforces.

```
packages/finance/
├── src/
│   ├── index.ts                          # barrel: + FinanceDataError, FinanceDataErrorCode, LedgerHeader
│   ├── domain/                           # money.ts / month.ts (EF3.1), monthly-ledger.ts (EF3.2) — consumed here
│   └── internal/
│       ├── client.ts                     # createAuthedClient / FinanceClient (EF2.2)
│       ├── errors.ts                     # FinanceDataError, FinanceDataErrorCode, mapPostgrestError  ← this ticket (foundation)
│       ├── mappers/
│       │   └── ledger.mapper.ts          # row → LedgerHeader, NewLedger → insert row (EF3.1 codecs)  ← this ticket (pattern)
│       └── repositories/
│           └── ledger.repo.ts            # createLedgerRepository / LedgerRepository  ← this ticket
└── (repo-root)
    └── tests/integration/
        └── ledger.repo.test.ts           # the §6 matrix (two seeded users, local Supabase)  ← this ticket (harness)
```

> **Filenames follow the `<domain>.<role>.ts` convention** (conventions.md;
> matching `@nafios/database`'s `user-profiles.repo.ts`) rather than the earlier
> `ledger-repository.ts`/`ledger-mapper.ts` draft. **The live §6 matrix lives at
> repo-root `tests/integration/`** (the non-gating `bun run test:integration`
> lane), not inside `bun run check` — see the Revision History (v0.2) and §9.

- **RLS-scoped, authed only.** Every method runs on the caller's authed `FinanceClient`; the repository adds **no** `WHERE user_id = …` and **no** ownership pre-check — it relies entirely on the `owner_all` policy + `(select auth.uid())` (EF1.1 §6, EF2.2 §4). Inserts never set `user_id`.
- **All money/month conversion goes through EF3.1.** The mapper is the _only_ place a `monthly_ledger` `numeric`/`DATE` is turned into `Money`/`Month` and back. No `parseFloat` / `Number()` / raw string `+` on a money value anywhere; no hand-rolled `"YYYY-MM"` ↔ `"YYYY-MM-01"` math.
- **`FinanceDataError` mapping is centralized.** `mapPostgrestError(error)` in `errors.ts` is the single SQLSTATE→code classifier; every repository method funnels its raw errors through it. EF3.8 imports and reuses it.
- **Barrel exports only the caller-facing surface.** `FinanceDataError` + `FinanceDataErrorCode` (the app/UI catches and branches — e.g. "this month already has a ledger") and `LedgerHeader` (the shape EF3.10's read surface builds on). `createLedgerRepository`, the mapper, and `mapPostgrestError` stay internal; the raw `SupabaseClient` and generated `@nafios/db` row types are never re-exported (EF2.2 §2).
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep this wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 The mapper (row ↔ domain)

1. **Read: row → `LedgerHeader`.** `id` passes through (`string`); `month` = `decodeMonth(row.month)`; `openingBalance` = `decodeMoney(row.opening_balance)`; `maxCapped` = `decodeMoney(row.max_capped)`; `status` = `row.status` (the DB `ledger_status` enum values `'ongoing' | 'reconciling' | 'settled'` **are** `LedgerStatus` — no translation); `createdAt` = `row.created_at` (opaque ISO string, verbatim — EF3.2 §4.2); `settledAt` = `row.settled_at` (`string | null`, verbatim). The SDK returns `numeric` as a **string** and `date`/`timestamptz` as strings — the mapper never sees a JS `number` for money.
2. **Write: `NewLedger` → insert row.** `month` = `encodeMonth(input.month)` (`"2027-01"` → `"2027-01-01"`); `opening_balance` = `encodeMoney(input.openingBalance)`; `max_capped` = `encodeMoney(input.maxCapped)`; `status` = `input.status ?? 'ongoing'`. **`user_id`, `id`, `created_at`, `settled_at` are omitted** — the DB fills id/created_at/user_id by default and leaves settled_at null (ck_settled_at holds for a non-settled row).
3. **First-of-month is EF3.1's, not re-checked here.** `decodeMonth` throws `CodecError('month_not_first_of_month')` if a stored `month` were ever not first-of-month; the mapper does not add its own day check. In practice `ck_ledger_month_first` guarantees the DB never stores a non-first date, so this path is a belt-and-suspenders integrity guard.
4. **A malformed DB value throws `CodecError`, not `FinanceDataError`.** If a `numeric`/`DATE` the SDK returns can't be decoded (a data-integrity fault, not a query failure), the EF3.1 codec throws its `CodecError` — surfaced as-is. `FinanceDataError` is strictly for _query_ failures (SQLSTATE). The two are distinct on purpose (§8.4).
5. **This mapper is the pattern EF3.8 copies.** Row→domain decode + domain→row encode, codecs owned by EF3.1, one function per direction. EF3.8's envelope mapper mirrors this shape; the discipline (never touch a raw money/date string outside the mapper) is the reusable rule.

### 4.2 Reads — null, not error; ordering; the one-ongoing guarantee

1. **"No rows" is `null`, never a throw.** The single-row reads (`findById`, `findByMonth`, `findOngoing`) use `.maybeSingle()` so an absent/unowned row yields `null` — not-found is a normal outcome, not a `FinanceDataError` (EF2.2's raw path returned `PGRST116` on `.single()`; this repository normalizes it to `null`).
2. **RLS makes "not owned" indistinguishable from "not found" — by design.** Under the `owner_all` policy a read of another user's row returns 0 rows, so `findById(someoneElsesId)` returns `null`, exactly like a non-existent id. The repository never leaks the existence of another user's ledger.
3. **`findOngoing` trusts the partial unique index.** `uq_one_ongoing_ledger` guarantees at most one `ongoing` ledger per user, so `findOngoing` selects `status = 'ongoing'` via `.maybeSingle()` and returns it or `null`. It does not defend against a second ongoing row (a broken invariant that cannot occur), matching how EF3.4 assumes "at most one ongoing."
4. **`list` is chronological.** `list()` returns **all** the caller's ledgers ordered by `month` ascending, so it feeds EF3.4's resolver and any month history in a stable order. `[]` when the user has none (the brand-new-user state — S2).

### 4.3 Writes — error classification (`FinanceDataError`)

1. **`mapPostgrestError` classifies by SQLSTATE, then constraint name.** The single classifier maps the raw `PostgrestError.code` (SQLSTATE):
   - **`23505` unique_violation** → disambiguate by the violated constraint (from the error `details`/`message`): `uq_ledger_user_month` → **`duplicate_month`**; `uq_one_ongoing_ledger` → **`ongoing_exists`**; any other unique constraint → `unknown` (constraint recorded).
   - **`23514` check_violation** → **`check_violation`** (constraint recorded: `ck_maxcapped_ceiling`, `ck_balances_nonneg`, `ck_settled_at`, or `ck_ledger_month_first`).
   - **`23502` not_null_violation** → **`not_null_violation`** (e.g. a service-role caller omitting `user_id` — the authed path never hits this).
   - **anything else** (incl. RLS `42501`, unexpected SQLSTATEs) → **`unknown`**, with the raw error preserved on `cause`.
2. **The 23505 split is the crux.** `duplicate_month` and `ongoing_exists` are _both_ `23505`; distinguishing them by constraint name is what lets EF3.7/EF3.12 say "you already have a ledger for August" vs the (should-not-happen-once-EF3.7-orders-its-writes) "you already have an ongoing ledger." Callers branch on `code`, never on the SQLSTATE or message.
3. **`constraint` and `cause` always travel.** Every `FinanceDataError` carries the DB constraint name when known and the raw `PostgrestError` on `cause`, so a caller has the exact figure/constraint to message from and full context for logs — mirroring how EF3.5's validation result always carries its `guardrail`.
4. **The repository enforces no business rule.** It does not validate maxCapped (EF3.5 / DB `ck_maxcapped_ceiling`), does not check the creation window (EF3.4), does not check mutability before an update (EF3.2 `isLedgerMutable` — EF3.7's job), and does not orchestrate the atomic prev-`ongoing`→`reconciling` flip. If a caller writes past those rules, the DB CHECKs are the backstop and this repository faithfully classifies the failure — but its own layer adds no policy. The DB constraints (EF1.1) are the source of truth it surfaces.

### 4.4 Purity of scope, RLS, and no schema changes

1. **Authed client in, RLS everywhere.** The factory takes a `FinanceClient` (EF2.2's authed client). The service-role client is **not** used by this repository at runtime — only the test harness (§6) uses it to seed rows for a second user. On a request path, only the authed client is ever passed.
2. **No metrics, no envelopes.** The repository never calls `computeLedgerMetrics` and never touches the `envelope` table — `LedgerHeader` has no envelopes and no derived fields. Composing header + envelopes + metrics into a `MonthlyLedger` is EF3.10.
3. **No migration.** EF3.6 reads/writes the EF1.1 schema unchanged. Any perceived gap (e.g. a missing index) is an **EF1** concern (EF1.11), never an EF3.6 edit — EF3 adds no schema except the EF3.9 category seed.

---

## 5. Worked example — the Jan 2027 anchor through the repository

Using EF3.1 codecs + this ticket's factory, on an authed client for user A. Money/month are the Jan 2027 anchor (opening `7152.35`, maxCapped `6415.00`).

```ts
const repo = createLedgerRepository(authedClientForUserA);

// ── Open the first ledger (S2) ───────────────────────────────────────────────
const jan = decodeMonth("2027-01-01"); // "2027-01"  (EF3.1)
const created = await repo.insert({
  month: jan,
  openingBalance: decodeMoney("7152.35"),
  maxCapped: decodeMoney("6415.00"),
  // status omitted → 'ongoing'; user_id filled by DB default auth.uid()
});
encodeMonth(created.month); // => "2027-01-01"   (round-trips exactly)
encodeMoney(created.openingBalance); // => "7152.35"
created.status; // => "ongoing"
created.settledAt; // => null

// ── The "one ongoing" query (EF3.7 uses this to find the ledger to park) ─────
const ongoing = await repo.findOngoing();
ongoing?.id === created.id; // => true

// ── Uniqueness — same month again → duplicate_month (NOT a raw 23505) ────────
try {
  await repo.insert({
    month: jan,
    openingBalance: decodeMoney("8000.00"),
    maxCapped: decodeMoney("8000.00"),
  });
} catch (e) {
  (e as FinanceDataError).code; // => "duplicate_month"
  (e as FinanceDataError).constraint; // => "uq_ledger_user_month"
}

// ── A second ongoing (different month) before parking the first → ongoing_exists ─
try {
  await repo.insert({
    month: decodeMonth("2027-02-01"),
    openingBalance: decodeMoney("7000.00"),
    maxCapped: decodeMoney("6000.00"),
  });
} catch (e) {
  (e as FinanceDataError).code; // => "ongoing_exists"   (uq_one_ongoing_ledger — both are 23505, told apart by name)
}

// ── Park the first, THEN open the next (this is what EF3.7 composes atomically) ─
await repo.updateStatus(created.id, "reconciling"); // ongoing → reconciling
const feb = await repo.insert({
  month: decodeMonth("2027-02-01"),
  openingBalance: decodeMoney("7000.00"),
  maxCapped: decodeMoney("6000.00"),
}); // ✅ now succeeds — the partial index is free again
(await repo.findOngoing())?.id === feb.id; // => true

// ── Reads: null (not owned / not found), and RLS isolation ────────────────────
await repo.findByMonth(decodeMonth("2027-09-01")); // => null (no such month)
await repo.findById(someIdOwnedByUserB); // => null (RLS: user B's row is invisible to A)

// ── list is chronological and RLS-scoped ─────────────────────────────────────
(await repo.list()).map((l) => encodeMonth(l.month)); // => ["2027-01-01", "2027-02-01"]  (A's only)
```

---

## 6. Verification matrix (integration tests)

Encode as **SDK-driven integration tests** in `tests/integration/ledger-repository.test.ts`, run against a local Supabase (`supabase db reset`) with **two seeded users A and B** (reuse EF1.1's `seed.sql`). This ticket **establishes the harness** (authed clients for A and B via EF2.2; the service-role client only to seed B's rows; per-test cleanup or a fresh reset so the matrix is idempotent — EF2.2 §5). Money/Month assertions compare via `encodeMoney` / `encodeMonth`.

**Round-trip mapping & CRUD**

| #   | Action                                                                     | Expected                                                                                  |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | `insert` valid Jan 2027 (opening `7152.35`, max `6415.00`), status omitted | ✅ returns `LedgerHeader`; `status='ongoing'`, `settledAt=null`, `id`/`createdAt` present |
| 2   | Read row 1 back and re-encode `month` / `openingBalance` / `maxCapped`     | `"2027-01-01"` / `"7152.35"` / `"6415.00"` — exact round-trip (money never floated)       |
| 3   | `findOngoing()` after row 1                                                | the row-1 header (id matches)                                                             |
| 4   | `findByMonth(2027-01)` / `findByMonth(2027-09)`                            | row-1 header / `null`                                                                     |
| 5   | `findById(row1.id)` / `findById(random uuid)`                              | row-1 header / `null`                                                                     |
| 6   | `list()` after inserting 2027-01 then 2027-03 (2027-01 parked first)       | both, ordered `["2027-01","2027-03"]` (chronological)                                     |
| 7   | `delete(row1.id)` then `findById(row1.id)`                                 | resolves; subsequent find → `null`                                                        |

**Uniqueness & the 23505 split**

| #   | Action                                                                      | Expected                                                                            |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 8   | `insert` a second ledger for the **same** `(user, 2027-01)`                 | ❌ `FinanceDataError` `code='duplicate_month'`, `constraint='uq_ledger_user_month'` |
| 9   | With an `ongoing` row present, `insert` another `ongoing` (different month) | ❌ `FinanceDataError` `code='ongoing_exists'`, `constraint='uq_one_ongoing_ledger'` |
| 10  | `updateStatus(row1.id,'reconciling')` then `insert` a new `ongoing` month   | ✅ both succeed — parking the first frees the partial index                         |
| 11  | `insert` with `maxCapped` > 2× `openingBalance` (bypassing EF3.5)           | ❌ `FinanceDataError` `code='check_violation'`, `constraint='ck_maxcapped_ceiling'` |
| 12  | `insert` with `openingBalance` `-1` (bypassing validation)                  | ❌ `FinanceDataError` `code='check_violation'`, `constraint='ck_balances_nonneg'`   |

**RLS isolation**

| #   | Action                                                                                 | Expected                                                                          |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 13  | Seed a ledger for user B (service client, explicit `user_id`); user A `findById(B.id)` | `null` (RLS hides B's row from A)                                                 |
| 14  | User A `list()` while B also has ledgers                                               | only A's rows (B's excluded)                                                      |
| 15  | User A `insert` (no `user_id` set); read back the stored `user_id`                     | ✅ inserts; `user_id` = A (DB default `auth.uid()`), proving inserts never set it |

**Mapper edge / not-error paths**

| #   | Action                                                                                    | Expected                                                                                         |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 16  | Seed a `settled` ledger (service client: `status='settled'`, `settled_at=now()`); read it | maps to `LedgerHeader` with `status='settled'`, `settledAt` non-null (read handles all statuses) |
| 17  | Any `find*` that matches no row                                                           | `null` — **never** a thrown `FinanceDataError` (not-found ≠ query failure)                       |
| 18  | `mapPostgrestError` on an unmapped SQLSTATE                                               | `FinanceDataError` `code='unknown'`, raw error on `.cause`                                       |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/internal/errors.ts`, `src/internal/mappers/ledger-mapper.ts`, and `src/internal/repositories/ledger-repository.ts` exist in `@nafios/finance`; `FinanceDataError`, `FinanceDataErrorCode`, and `LedgerHeader` are re-exported from `src/index.ts` (the repository factory and mapper stay internal); wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — The mapper decodes `numeric` money via `decodeMoney` and the first-of-month `DATE` via `decodeMonth`, and encodes via `encodeMoney` / `encodeMonth`; **no** `parseFloat`/`Number()`/raw-string money math and **no** hand-rolled month math anywhere; round-trip is exact (rows 1–2).
- [ ] **AC3** — `insert` never sets `user_id` (DB default `auth.uid()` fills it — row 15), omits `id`/`created_at`/`settled_at`, and returns the created `LedgerHeader` with DB-defaulted fields present.
- [ ] **AC4** — `findById` / `findByMonth` / `findOngoing` return `null` (not an error) when no row matches or the row is not owned; `findOngoing` returns the single `ongoing` ledger (or `null`); `list` returns all the caller's ledgers ordered by month ascending (rows 3–7, 17).
- [ ] **AC5** — `updateStatus` transitions `ongoing → reconciling` and returns the updated header; parking the current ongoing frees `uq_one_ongoing_ledger` so a new `ongoing` can be inserted (row 10). It performs no guardrail/mutability/atomicity logic (that is EF3.5/EF3.2/EF3.7).
- [ ] **AC6** — `FinanceDataError` classifies `23505` **by constraint name**: `uq_ledger_user_month` → `duplicate_month`, `uq_one_ongoing_ledger` → `ongoing_exists`; `23514` → `check_violation` (constraint recorded); `23502` → `not_null_violation`; anything else → `unknown`. Each carries `constraint` (when known) and the raw `PostgrestError` on `cause` (rows 8–12, 18).
- [ ] **AC7** — RLS isolation holds: a user cannot `findById`/`list` another user's ledgers (rows 13–14); a malformed stored value surfaces EF3.1's `CodecError` (not `FinanceDataError`); the `settled` read path maps `settledAt` correctly (row 16).
- [ ] **AC8** — Every row of the §6 matrix passes as an integration test against a local Supabase with two seeded users; the harness is idempotent across runs; `bun run check` is green across the workspace.
- [ ] **AC9** — **Boundary stays clean:** the repository imports EF3.1 codecs, EF3.2 types, and EF2.2's `FinanceClient` only; `@supabase/supabase-js` / `@nafios/db` appear **only** in `src/internal/`; no `src/domain/` file imports this ticket; the eslint import-boundary rule stays green; **no migration** is added.

---

## 8. Notes / decisions

1. **`LedgerHeader = Omit<MonthlyLedger, 'envelopes'>`, not a `MonthlyLedger` with `envelopes: []`.** EF3.2 says the repository "decodes DB rows into `MonthlyLedger`"; this ticket refines that: the `monthly_ledger` table alone yields the **header** subset, and EF3.10 completes the `MonthlyLedger` by attaching envelopes (EF3.8) and computing metrics. Returning `Omit<…>` makes it a _type error_ to run `computeLedgerMetrics` on a bare read — so no surface accidentally computes COL from an unloaded envelope list. No new domain type is invented (it's a derivation of EF3.2's); no EF3.2 edit is required.
2. **The 23505 split is the whole reason `FinanceDataError` exists now.** `duplicate_month` and `ongoing_exists` share SQLSTATE `23505`; without constraint-name disambiguation the create flow (EF3.7/EF3.12) can't tell "month taken" from "already ongoing." Centralizing it here (not in each caller) is why EF2 deferred error mapping to "the first repository." Constraint-name matching reads the `PostgrestError` `details`/`message`; the exact field is an implementation detail, but the two codes are the stable contract.
3. **Atomicity is EF3.7's, not the repository's.** Opening the next month while one is `ongoing` requires parking the old one first (the partial index forbids two `ongoing`). Ordering those two writes so they're all-or-nothing — whether via ordered writes with compensation or a DB RPC — is the create-ledger command's design (EF3.7), **without** a new migration (EF3 adds none but EF3.9's seed). This ticket supplies `findOngoing` + `updateStatus` + `insert` and classifies `ongoing_exists` if the ordering is ever violated; it takes no position on the transaction mechanism.
4. **`FinanceDataError` (query failure) vs `CodecError` (data-integrity fault) vs a rejection result (user input).** Three distinct failure channels, on purpose: a _query_ fails → `FinanceDataError` (this ticket); a stored _value_ can't be decoded → `CodecError` (EF3.1, surfaced by the mapper); _user_ input is out of range → a returned `{ ok: false }` result (EF3.5's `validateMaxCapped`, never a throw). Keeping them separate means callers catch the right thing — the same reasoning EF3.5 §4.2 used for "returns a result, never throws."
5. **Reads return `null`; not-found is not an error.** `.maybeSingle()` normalizes EF2.2's raw `PGRST116`-on-`.single()` to a clean `null`. This keeps the common "does this month have a ledger yet?" probe (EF3.7) branchless and error-free — a `null` means "free," an error means "something actually went wrong."
6. **Update is status-only in EF3; balance editing is a later capability.** No EF3 story edits an existing ledger's `openingBalance`/`maxCapped` (creation sets them once — S2). When ledger-balance editing lands, it reuses EF3.5's guardrail gate ("same gate covers creation and future edit" — EF3.5 §4.2) and adds an `updateBalances` primitive here; EF3.6 deliberately omits it to stay scoped. `delete` exists for CRUD completeness and test teardown only — no EF3 story removes a ledger.
7. **The mapper + error-mapping + harness are the reusable foundation.** EF3.8 (envelope repository) imports `FinanceDataError` / `mapPostgrestError`, copies the one-function-per-direction mapper shape, and extends the integration harness — it does not re-derive any of them. Getting these three right here is why this ticket is `size:M` while the pure-domain leaves are `size:S`.

_Provenance (not required reading): the `monthly_ledger` columns, the `ledger_status` enum, the six named constraints (`uq_ledger_user_month`, `uq_one_ongoing_ledger`, `ck_maxcapped_ceiling`, `ck_balances_nonneg`, `ck_settled_at`, `ck_ledger_month_first`), the RLS `owner_all` policy, and the "numeric arrives as a string / never float money" note are from EF1.1 (§4–§6, §11); the authed/service client factories, the `user_id` default `auth.uid()` insert path, the `NOT NULL` on service-role omission, and the deferral of base repository/mapper/error-mapping/test-suite to "the first repository" are from EF2.2 (§2, §4, Notes 3) and the EF2 epic (Out of scope); the `Money`/`Month` codecs and the "repositories are the caller, codecs are the seam" placement are from EF3.1 (§2, Notes 6); the `MonthlyLedger` type, `LedgerStatus`, and "metrics computed on read, never stored" are from EF3.2 (§2, §4.2); the `LedgerSummary` structural-fit for `list()` is from EF3.4 (§2); the atomic prev-`ongoing`→`reconciling` transition ownership is from EF3.7 (the epic Scope) and `monthly-ledger.md` §3; the Jan 2027 anchor is from the EF3 epic and `monthly-ledger.md` §5._

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.6. It is the first `src/internal/` repository, depending on EF3.1 + EF3.2 (domain) and EF2.2 (client). Mergeable when all of the following hold — no follow-up, no stubs, no TODOs:

- [ ] `src/internal/errors.ts`, `src/internal/mappers/ledger-mapper.ts`, `src/internal/repositories/ledger-repository.ts`, and `tests/integration/ledger-repository.test.ts` are present; the §2 barrel surface (`FinanceDataError`, `FinanceDataErrorCode`, `LedgerHeader`) is re-exported from `src/index.ts`.
- [ ] **All §7 acceptance criteria (AC1–AC9) pass**, including the exact money/month round-trip, the `duplicate_month` vs `ongoing_exists` 23505 split, the park-then-insert unblock, and RLS isolation between two users.
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all §6 integration tests against a local Supabase with two seeded users, and the eslint domain/data import-boundary rule (AC9). This is the merge gate.
- [ ] No surface beyond §2 — in particular **no** `computeLedgerMetrics` call, **no** envelope access, **no** guardrail/window/mutability/atomicity logic, **no** `updateBalances`, and **no migration**. Those are EF3.10 / EF3.8 / EF3.5 / EF3.4 / EF3.7 / EF1.
- [ ] The mapper never touches a raw money/date string outside EF3.1's codecs; `mapPostgrestError` is the single error classifier (ready for EF3.8 to reuse).
- [ ] This ticket's Revision History is updated; the EF3.6 checkbox in `EF3.md` is ticked when merged.

---

## Revision History

| Version | Date       | Author            | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2     | 2026-07-08 | Hanafi Yakub      | **Implemented.** `src/internal/errors.ts` (`FinanceDataError` + `mapPostgrestError`, 23505 split by constraint name), `src/internal/mappers/ledger-mapper.ts` (row↔domain via EF3.1 codecs; `LedgerHeader`/`NewLedger`), `src/internal/repositories/ledger-repository.ts` (`createLedgerRepository` — insert / findById / findByMonth / findOngoing / list / updateStatus / delete). Barrel re-exports `FinanceDataError`, `FinanceDataErrorCode`, `LedgerHeader`; the factory, mapper, and classifier stay internal. `PostgrestError` is re-exported from `@nafios/supabase-core` (finance never imports `@supabase/*` directly). **Deviation from §9 (deliberate):** per [ADR-0020](../../../adr/0020-test-coverage-scoping-and-gate.md), the EF2.2 precedent, and the package CLAUDE.md, the §6 live matrix lives at repo-root `tests/integration/ledger-repository.test.ts` in the **non-gating** `bun run test:integration` lane (`skipIf` no DB) — NOT inside `bun run check`, because CI has no live Supabase and loading live cross-package clients into the finance coverage run would trip the per-file 90% gate. The per-file gate is instead met by mocked unit tests (errors/mapper/repository, 100% lines). `typecheck` + `test:coverage` + `lint` + `format` + `verify` all green; the live matrix awaits an operator `supabase db reset` + `bun run test:integration`. |
| 0.1     | 2026-07-03 | NafiOS Foundation | Initial standalone task for the **ledger repository** in `@nafios/finance`'s data layer (`src/internal/`) — the FIRST finance repository, so it also lands the two foundations EF2 deferred to "the first repository": the row↔domain **mapper** pattern (money/month via EF3.1 codecs, `LedgerHeader = Omit<MonthlyLedger,'envelopes'>`) and the typed **`FinanceDataError` + SQLSTATE→code** classifier, plus the integration-test **harness** (two seeded users). `createLedgerRepository(client)` → `insert` / `findById` / `findByMonth` / `findOngoing` (the "one ongoing" query) / `list` (chronological, feeds EF3.4) / `updateStatus` (ongoing→reconciling only) / `delete`. Pins the **23505-by-constraint-name** split (`duplicate_month` vs `ongoing_exists`) EF3.7/EF3.12 need; reads return `null` on not-found; authed-only, RLS-scoped, inserts never set `user_id`. Scopes OUT metrics/envelopes (EF3.10), atomic prev→reconciling + guardrail (EF3.7/EF3.5), mutability (EF3.2), balance edits, and any migration. Verification matrix (round-trip mapping, uniqueness/23505 split, RLS isolation, mapper edges) + AC1–AC9 + §9 Definition of Done (green `bun run check` incl. local-Supabase integration tests as the merge gate); PR-able on EF3.1 + EF3.2 + EF2.2. |
