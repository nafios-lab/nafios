# EF3.8 — Envelope repository + commands (CRUD + set-status)

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:M`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the **envelope data layer** — the `envelope` repository (CRUD + lookup primitives + the row↔domain mapper, including the `carried_over ↔ carried-over` label seam), and the **envelope commands** (create / edit / delete a manual envelope + set-status with `paidAt` handling) — is in this file. Stack: **Supabase JS SDK** (`@supabase/supabase-js`) via EF2.2's authed `FinanceClient`, typed from `@nafios/db`. It lives in `@nafios/finance`'s **data layer** (`src/internal/`) — the only layer where Supabase / `@nafios/db` may appear; it imports the pure domain rules/types from `src/domain/` and composes the EF3.6 repository. **No ORM / no Drizzle. No schema changes, no migration** (EF3 consumes the EF1.6 `envelope` table unchanged — EF3's one migration is the EF3.9 category seed).
>
> **This is the SECOND repository and the envelope command surface.** It **reuses verbatim** the three data-layer foundations EF3.6 established as "the first repository": the row↔domain **mapper** pattern, the **`FinanceDataError` + SQLSTATE→code** classifier, and the **integration-test harness** (two seeded users, local Supabase). It **mirrors the command pattern EF3.7 established** (validate-in-domain → orchestrate repository writes → return a `{ ok }` result for user-input rejections, throw `FinanceDataError` for DB failures) — and is where that pattern's **mutability gate has teeth** (EF3.7 §4.2 note 4 / §8.4): every envelope write is gated on `isLedgerMutable` of the **parent ledger**.
>
> **Depends on:**
>
> - **EF3.3** (Envelope type + status enum + rules) — the repository decodes rows into `Envelope`, **owns** the `'carried-over' ↔ carried_over` DB-label translation (EF3.3 §4.1, the seam assigned here), and the set-status command calls `applyStatusTransition(current, next, now)` to compute the `(status, paidAt)` pair it writes. Uses `EnvelopeStatus` / `ENVELOPE_STATUSES`. **Never re-implements** the `paidAt` rule — it consumes EF3.3's resolver.
> - **EF3.2** (`isLedgerMutable`, `LedgerStatus`) — every envelope command gates on `isLedgerMutable(parentLedger.status)` **before writing** (this is the "edit surface" the EF3.7 gate was reserved for). Type-only for `LedgerStatus`; the metrics engine is **not** called here (that is EF3.10 on read).
> - **EF3.6** (ledger repository + data foundations) — **reuses** `FinanceDataError` / `mapPostgrestError` (extended here for `23503`, §4.3) and the mapper/harness patterns; **composes** `createLedgerRepository(client).findById(ledgerId)` to fetch the parent ledger for the mutability gate. Does not re-derive any of them.
> - **EF3.1** (Money & Month codecs) — `amount` / `originalAmount` are `Money`; the mapper decodes `numeric(12,2)` via `decodeMoney` and encodes via `encodeMoney`. Non-negativity is compared via `compareMoney` against `ZERO_MONEY`. No float math anywhere.
> - **EF2.2** (connection spine) — the repository and command factories take a caller-supplied **authed** `FinanceClient`, so every read/write runs as the request user under RLS; inserts never set `user_id` (the DB default `auth.uid()` fills it — EF2.2 AC4).
> - **EF1.6** (the `envelope` table) — its columns, the `envelope_status` enum (label `carried_over`), the four CHECKs (`ck_env_amount_nonneg`, `ck_env_paid_at`, `ck_env_original_amount`, `ck_env_co_reason_len`), the real FKs (`ledger_id` CASCADE, `category_id` RESTRICT, `payment_source_id`/`linked_person_id` SET NULL), and the two soft refs (`template_id`, `carried_from_envelope_id`, no FK) are the exact surface this layer reads/writes and maps errors from.
>
> **Consumed by:**
>
> - **EF3.10** (ledger read/query surface) — calls the repository's `listByLedger(ledgerId)` to attach envelopes to a `LedgerHeader`, forming a full `MonthlyLedger` on which it runs `computeLedgerMetrics` (EF3.2). This ticket supplies the ordered envelope read; EF3.10 owns the composition + metrics + the broader round-trip suite.
> - **EF3.14** (manual envelope CRUD + status UI) — the add/edit/delete controls call `createEnvelope` / `editEnvelope` / `deleteEnvelope`, and the status control calls `setEnvelopeStatus`; it renders the `{ ok: false }` rejections (e.g. a locked ledger). It is the **only** UI path that mutates an envelope.
> - **EF3.13** (ongoing-ledger view) — renders the envelope list (via EF3.10's read) that these commands mutate; COL and metrics recompute live off the resulting rows.
>
> **Build-order & PR readiness.** The **second `src/internal/` feature**, sitting on EF3.6 (foundations + parent-ledger lookup), EF3.3 (envelope domain), EF3.2 (mutability), EF3.1 (codecs), and EF2.2 (authed client) — PR-able once those are merged. Like EF3.6/EF3.7 its tests are **integration tests against a local Supabase** (two seeded users, extended with a seeded ledger + category fixture); `bun run check` runs them (§9). It adds **no migration** (§4.4).
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, the authed/service client factories, green `bun run check`).

---

## 1. What you're building

Two layers, both in `src/internal/`, in the same package as EF3.6/EF3.7:

1. **The envelope repository** — `createEnvelopeRepository(client)` returning an `EnvelopeRepository` bound to an authed `FinanceClient`. Its methods are the CRUD + lookup primitives: `insert`, `findById`, `listByLedger`, `update`, `updateStatus`, `delete`. Each maps rows to `Envelope` and raw SDK errors to `FinanceDataError`. It carries the **envelope mapper** — the one place the `numeric` money and the `carried_over ↔ carried-over` status label are translated between the DB and the domain.

2. **The envelope commands** — `createEnvelopeCommands(client)` returning `EnvelopeCommands`: `createEnvelope`, `editEnvelope`, `setEnvelopeStatus`, `deleteEnvelope`. Each validates against the pure domain rules (`isLedgerMutable`, amount non-negativity, `applyStatusTransition`) **before any write**, orchestrates the repository, and returns a `{ ok }` result for deterministic input rejections or throws `FinanceDataError` for DB failures — the EF3.7 command pattern, applied to the edit surface.

Framework-thin TypeScript. The repository adds **no business rule** (it is a data primitive like EF3.6). The commands add **composition + the mutability gate + the `paidAt` orchestration** — but re-derive nothing: the `paidAt` rule is EF3.3's `applyStatusTransition`, the mutability rule is EF3.2's `isLedgerMutable`, the money encode/decode is EF3.1's, the error classifier is EF3.6's.

**Why it exists — the problem it solves:**

Tracking a month is entirely envelope edits — add a line, change an amount, mark it paid, skip it, carry it over, delete it (story-map S4). Every one of those is a write to the `envelope` table, and three things must hold on **every** path or the ledger silently corrupts: (a) the `paidAt` timestamp must be set exactly when the status is `paid` and cleared otherwise — get it wrong and a `paid` line has a null `paidAt` (or a `pending` line carries a stale one), violating `ck_env_paid_at` and misrepresenting what was actually spent; (b) the `'carried-over'` domain literal must round-trip to the DB's `carried_over` enum label and back — the one place Postgres's hyphen ban leaks into the code (EF1.6 D4 seam); (c) no edit may land on a **locked** (settled) ledger — the mutability rule EF3.7 deliberately left to "the edit surface." Doing these ad-hoc across the UI and data layer is exactly how each drifts. This ticket pins the envelope's data access and mutation in **one** place: one mapper (money via EF3.1, the `carried_over` seam owned here), one set-status command that funnels every status change through EF3.3's `applyStatusTransition` so the `paidAt`↔`paid` invariant holds by construction, and one mutability gate every command shares so a settled ledger is never edited.

> **Cross-ticket decision (from the EF3 epic / EF3.3 §4.1).** The **`'carried-over' ↔ carried_over` translation** is owned **here**, in the `src/internal/` envelope mapper — the only place the snake_case DB label appears. The whole `src/domain/` + web surface uses the hyphenated `'carried-over'` form exclusively. And the **COL-contribution / `paidAt` rules** live once in EF3.3 (`countsTowardCol`, `applyStatusTransition`) and are **consumed** here — this layer re-implements neither.

---

## 2. Public API / contract

Exact TS signatures. `createEnvelopeCommands`, `EnvelopeCommands`, the command input types, and the result/reason types are the **app-facing write surface** and are **barrel-exported** from `src/index.ts` (parallel to EF3.7's ledger command surface). The `EnvelopeRepository` factory and the mapper stay **internal** (imported within the package by EF3.10 for `listByLedger`), exactly as EF3.6 keeps `createLedgerRepository` internal. `FinanceDataError` / `FinanceDataErrorCode` (EF3.6, extended here with `foreign_key_violation`) and `Envelope` (EF3.3) are already barrel-exported.

### 2.1 The envelope repository (internal)

```ts
import type { Money } from "../../domain/money"; // EF3.1
import type { Envelope, EnvelopeStatus } from "../../domain/envelope"; // EF3.3
import type { FinanceClient } from "../client"; // EF2.2
// reuses FinanceDataError from ../errors (EF3.6)

// ───────────────────────── Create / patch inputs ─────────────────────────

/**
 * Fields to insert an envelope. `user_id` (DB default auth.uid()), `id`, `created_at`,
 * `updated_at` are NEVER set here. MANUAL-ONLY: `templateId`, `originalAmount`,
 * `carriedFromEnvelopeId`, `carryOverReason` are NOT accepted — the mapper always writes
 * them null (every EF3 envelope is manual; templates/carry-over are EF4+).
 */
export interface NewEnvelope {
  readonly ledgerId: string; // -> ledger_id (FK, CASCADE)
  readonly category: string; // -> category_id (FK, RESTRICT) — required
  readonly item: string;
  readonly amount: Money; // EF3.1 — >= 0 (command + DB ck_env_amount_nonneg)
  readonly status?: EnvelopeStatus; // domain literal; mapper → carried_over on write; default 'pending'
  readonly paidAt?: string | null; // must satisfy paidAt != null ⟺ status === 'paid' (ck_env_paid_at)
  readonly paymentSource?: string | null; // -> payment_source_id (FK, SET NULL)
  readonly remark?: string | null;
  readonly linkedPerson?: string | null; // -> linked_person_id (FK, SET NULL)
  readonly sortOrder?: number; // default 0
}

/**
 * The mutable line fields an edit may change. Deliberately EXCLUDES status/paidAt —
 * those go through updateStatus (the paidAt invariant lives on that single path).
 * Only present keys are written (a partial UPDATE).
 */
export interface EnvelopePatch {
  readonly category?: string;
  readonly item?: string;
  readonly amount?: Money;
  readonly paymentSource?: string | null;
  readonly remark?: string | null;
  readonly linkedPerson?: string | null;
  readonly sortOrder?: number;
}

/** The (status, paidAt) pair a status change writes — structurally EF3.3's EnvelopeStatusState. */
export interface EnvelopeStatusWrite {
  readonly status: EnvelopeStatus; // domain literal; mapper translates 'carried-over' → carried_over
  readonly paidAt: string | null;
}

// ───────────────────────── The envelope repository ─────────────────────────

export interface EnvelopeRepository {
  /** Insert an envelope (user_id filled by DB default auth.uid()). Encodes money via
   *  encodeMoney and status via the carried_over seam. Returns the created Envelope.
   *  Throws FinanceDataError('foreign_key_violation' | 'check_violation' | …). */
  insert(input: NewEnvelope): Promise<Envelope>;

  /** Fetch by id, RLS-scoped. null when not found OR not owned. */
  findById(id: string): Promise<Envelope | null>;

  /** All envelopes in a ledger, ordered by sort_order asc then created_at asc (stable).
   *  [] when the ledger has none. THIS is what EF3.10 composes into a MonthlyLedger. */
  listByLedger(ledgerId: string): Promise<Envelope[]>;

  /** Partial field update (no status/paidAt). Encodes money; returns the updated Envelope. */
  update(id: string, patch: EnvelopePatch): Promise<Envelope>;

  /** Write the (status, paidAt) pair. Translates status via the carried_over seam; the pair
   *  MUST already satisfy ck_env_paid_at (the command computes it via applyStatusTransition). */
  updateStatus(id: string, next: EnvelopeStatusWrite): Promise<Envelope>;

  /** Delete an envelope, RLS-scoped. */
  delete(id: string): Promise<void>;
}

/** Construct an envelope repository bound to an authed FinanceClient (EF2.2). */
export function createEnvelopeRepository(client: FinanceClient): EnvelopeRepository;
```

### 2.2 The envelope commands (app-facing write surface)

```ts
import type { Money } from "../../domain/money"; // EF3.1
import type { Envelope, EnvelopeStatus } from "../../domain/envelope"; // EF3.3
import type { FinanceClient } from "../client"; // EF2.2

// ───────────────────────── Command inputs ─────────────────────────

/** Create a MANUAL envelope in a ledger. status is always 'pending' / paidAt null on create
 *  (you add a line, then mark it paid via setEnvelopeStatus). Manual-only fields are never
 *  accepted (always null). amount must be >= 0. */
export interface CreateEnvelopeInput {
  readonly ledgerId: string;
  readonly category: string; // a category the user owns (provisioned by EF3.9)
  readonly item: string;
  readonly amount: Money; // >= 0
  readonly paymentSource?: string | null;
  readonly remark?: string | null;
  readonly linkedPerson?: string | null;
  readonly sortOrder?: number; // default 0
}

/** Edit an existing envelope's line fields. Does NOT change status/paidAt (that is
 *  setEnvelopeStatus). Only present keys change; amount (if present) must be >= 0. */
export interface EditEnvelopeInput {
  readonly envelopeId: string;
  readonly category?: string;
  readonly item?: string;
  readonly amount?: Money;
  readonly paymentSource?: string | null;
  readonly remark?: string | null;
  readonly linkedPerson?: string | null;
  readonly sortOrder?: number;
}

/** Change an envelope's status. Computes the resulting paidAt via EF3.3's applyStatusTransition
 *  (set on → paid, cleared on → anything else). `now` is caller-supplied ISO-8601 (no clock in
 *  the command — same discipline as EF3.7's `today`). Free-form: any status → any status. */
export interface SetEnvelopeStatusInput {
  readonly envelopeId: string;
  readonly status: EnvelopeStatus; // target (domain literal, incl. 'carried-over')
  readonly now: string;
}

// ───────────────────────── Rejection (deterministic, no write) ─────────────────────────

/** Why a command refused BEFORE any write — a deterministic input/context failure the UI
 *  renders, not a DB error. (DB failures throw FinanceDataError instead — §4.3.) */
export type EnvelopeRejectionReason =
  | "ledger_not_found" // parent ledger absent / not owned (create)
  | "envelope_not_found" // target envelope absent / not owned (edit / set-status / delete)
  | "ledger_not_mutable" // parent ledger is settled (isLedgerMutable === false) — locked
  | "negative_amount"; // amount < 0 (create / edit)

// ───────────────────────── Results ─────────────────────────

export type CreateEnvelopeResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | {
      readonly ok: false;
      readonly reason: "ledger_not_found" | "ledger_not_mutable" | "negative_amount";
    };

export type EditEnvelopeResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | {
      readonly ok: false;
      readonly reason: "envelope_not_found" | "ledger_not_mutable" | "negative_amount";
    };

export type SetEnvelopeStatusResult =
  | { readonly ok: true; readonly envelope: Envelope }
  | { readonly ok: false; readonly reason: "envelope_not_found" | "ledger_not_mutable" };

export type DeleteEnvelopeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "envelope_not_found" | "ledger_not_mutable" };

// ───────────────────────── The commands ─────────────────────────

export interface EnvelopeCommands {
  /** Add a manual pending envelope to a ledger. Rejects `ledger_not_found` (RLS null),
   *  `ledger_not_mutable` (settled), or `negative_amount`; on success returns the created
   *  Envelope. Throws FinanceDataError('foreign_key_violation') for a bad/unowned category. */
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;

  /** Edit an envelope's line fields (not status). Rejects `envelope_not_found`,
   *  `ledger_not_mutable`, or `negative_amount`. */
  editEnvelope(input: EditEnvelopeInput): Promise<EditEnvelopeResult>;

  /** Change status; applies the paidAt set/clear rule (EF3.3). Rejects `envelope_not_found`
   *  or `ledger_not_mutable`. Never rejects a target status — transitions are free-form. */
  setEnvelopeStatus(input: SetEnvelopeStatusInput): Promise<SetEnvelopeStatusResult>;

  /** Delete an envelope. Rejects `envelope_not_found` or `ledger_not_mutable`. */
  deleteEnvelope(input: { readonly envelopeId: string }): Promise<DeleteEnvelopeResult>;
}

/** Construct the envelope command surface bound to an authed FinanceClient (EF2.2). It builds
 *  the envelope repository and (for the mutability gate) the EF3.6 ledger repository over the
 *  same client; every read/write runs as that user under RLS. */
export function createEnvelopeCommands(client: FinanceClient): EnvelopeCommands;
```

---

## 3. Package placement, layer & exports

**Data-layer code** — lands in `@nafios/finance`'s `src/internal/` (the only layer that may import `@supabase/supabase-js` / `@nafios/db` and the repositories; it may import `src/domain/`). This is the boundary the EF2 eslint rule enforces.

```
packages/finance/
├── src/
│   ├── index.ts                                   # barrel: + createEnvelopeCommands, EnvelopeCommands,
│   │                                              #   CreateEnvelopeInput, EditEnvelopeInput,
│   │                                              #   SetEnvelopeStatusInput, EnvelopeRejectionReason,
│   │                                              #   the four *Result types (app-facing write surface)
│   ├── domain/
│   │   ├── money.ts                               # Money, decodeMoney/encodeMoney, compareMoney, ZERO_MONEY (EF3.1)
│   │   ├── envelope.ts                            # Envelope, EnvelopeStatus, applyStatusTransition (EF3.3) — consumed here
│   │   └── monthly-ledger.ts                      # isLedgerMutable, LedgerStatus (EF3.2) — mutability gate
│   └── internal/
│       ├── client.ts                              # FinanceClient (EF2.2)
│       ├── errors.ts                              # FinanceDataError + mapPostgrestError (EF3.6) — EXTENDED: 23503 → foreign_key_violation
│       ├── mappers/
│       │   ├── ledger-mapper.ts                   # (EF3.6)
│       │   └── envelope-mapper.ts                 # row ↔ Envelope + carried_over ↔ carried-over seam  ← this ticket
│       ├── repositories/
│       │   ├── ledger-repository.ts               # createLedgerRepository (EF3.6) — composed for findById
│       │   └── envelope-repository.ts             # createEnvelopeRepository / EnvelopeRepository  ← this ticket
│       └── commands/
│           ├── create-ledger.ts                   # (EF3.7)
│           └── envelope-commands.ts               # createEnvelopeCommands / EnvelopeCommands  ← this ticket
└── tests/
    └── integration/
        ├── envelope-repository.test.ts            # §6.1 matrix (extends EF3.6's harness)  ← this ticket
        └── envelope-commands.test.ts              # §6.2 matrix  ← this ticket
```

- **Reuses EF3.6's foundations; extends the classifier once.** The mapper copies EF3.6's one-function-per-direction shape; `FinanceDataError` / `mapPostgrestError` are imported, not re-declared. The **one** shared-foundation edit: `mapPostgrestError` gains a `23503` (foreign_key_violation) branch and `FinanceDataErrorCode` gains that member (§4.3) — the envelope is the first table whose FKs a user write can violate (a bad/unowned `category_id`).
- **Authed, RLS-scoped.** Every read/write runs on the caller's authed `FinanceClient`; inserts never set `user_id`. The layer adds no `WHERE user_id = …` — it relies on the `owner_all` policy exactly as EF3.6 does.
- **The `carried_over` seam is contained in the mapper.** `src/internal/mappers/envelope-mapper.ts` is the ONLY file in the package that names the string `carried_over`. Everything else — domain, commands, web — uses `'carried-over'`.
- **Barrel exports the command write surface only.** The repository, the mapper, and the status-seam helpers stay internal (EF3.10 imports the repository within the package); the raw `SupabaseClient` and `@nafios/db` row types are never re-exported.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep this wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 The mapper (row ↔ domain) + the `carried_over` seam

1. **Read: row → `Envelope`.** `id`/`ledger_id`→`ledgerId`/`category_id`→`category`/`item` pass through; `amount` = `decodeMoney(row.amount)`; `originalAmount` = `row.original_amount == null ? null : decodeMoney(row.original_amount)` (always null in EF3, but mapped faithfully); `status` = **`statusFromDb(row.status)`** (`carried_over` → `'carried-over'`, all others 1:1); `paidAt` = `row.paid_at` (opaque ISO string, verbatim — no Timestamp codec, EF3.3 §4.4); `paymentSource` = `row.payment_source_id`; `remark`; `linkedPerson` = `row.linked_person_id`; `sortOrder` = `row.sort_order`; `templateId`/`carriedFromEnvelopeId`/`carryOverReason` pass through (always null in EF3). **`created_at`, `updated_at`, and `obligation_kind` are NOT surfaced** — they are not on EF3.3's `Envelope` type (unlike the ledger mapper, which surfaces `createdAt`/`settledAt`). The SDK returns `numeric` as a **string** — money is never a JS `number`.
2. **Write: `NewEnvelope` → insert row.** `ledger_id`/`category_id`/`item` set; `amount` = `encodeMoney(input.amount)`; `status` = **`statusToDb(input.status ?? 'pending')`** (`'carried-over'` → `carried_over`); `paid_at` = `input.paidAt ?? null`; `payment_source_id`/`remark`/`linked_person_id` set from optionals; `sort_order` = `input.sortOrder ?? 0`. **`user_id`, `id`, `created_at`, `updated_at` are omitted** (DB defaults). **`template_id`, `original_amount`, `carried_from_envelope_id`, `carry_over_reason` are omitted (null)** — manual-only; this trivially satisfies `ck_env_original_amount` (`original_amount` null) and `ck_env_co_reason_len` (`carry_over_reason` null).
3. **Write: `EnvelopePatch` → update row.** Only present keys are included; `amount` → `encodeMoney`; `category` → `category_id`; `paymentSource` → `payment_source_id`; `linkedPerson` → `linked_person_id`. Never touches `status`/`paid_at`.
4. **Write: `EnvelopeStatusWrite` → update row.** `status` = `statusToDb(next.status)`; `paid_at` = `next.paidAt`. This is the only write path that touches those two columns together.
5. **`statusFromDb` / `statusToDb` are the seam — the only `carried_over` in the package.** Both are total over the four members (`ENVELOPE_STATUSES` for the domain side; the four `envelope_status` labels for the DB side). Round-trip is exact: `statusFromDb(statusToDb(s)) === s` for every `s`. This is the EF3.3 §4.1 seam, owned here per the epic cross-ticket decision.
6. **A malformed DB value throws `CodecError`, not `FinanceDataError`.** If a stored `numeric` can't be decoded (a data-integrity fault), EF3.1's `decodeMoney` throws its `CodecError`, surfaced as-is — the same three-channel discipline as EF3.6 §8.4. `FinanceDataError` is strictly for query failures (SQLSTATE).

### 4.2 The commands — mutability gate, then orchestrate

Every command follows the EF3.7 shape: validate against the pure domain rules **before any write**, return `{ ok: false }` on the first failure (no write), then orchestrate the repository. The shared gate is **parent-ledger mutability**.

1. **`createEnvelope`.** (a) Fetch the parent ledger: `ledgerRepo.findById(input.ledgerId)`. `null` → reject `ledger_not_found` (RLS null = absent or not owned). (b) `isLedgerMutable(ledger.status) === false` → reject `ledger_not_mutable`. (c) `compareMoney(input.amount, ZERO_MONEY) < 0` → reject `negative_amount`. (d) Otherwise `envelopeRepo.insert({ ...input, status: 'pending', paidAt: null })` — a manual, pending line with all manual-only fields null — and return `{ ok: true, envelope }`.
2. **`editEnvelope`.** (a) Fetch the envelope: `envelopeRepo.findById(input.envelopeId)`. `null` → reject `envelope_not_found`. (b) Fetch its parent ledger (`ledgerRepo.findById(envelope.ledgerId)`); `isLedgerMutable === false` → reject `ledger_not_mutable`. (c) If `amount` is present and `< 0` → reject `negative_amount`. (d) Otherwise `envelopeRepo.update(input.envelopeId, patch)` (the present line fields) and return the updated envelope. Never changes status/paidAt.
3. **`setEnvelopeStatus`.** (a) Fetch the envelope; `null` → `envelope_not_found`. (b) Parent-ledger mutability gate → `ledger_not_mutable`. (c) Compute `next = applyStatusTransition({ status: envelope.status, paidAt: envelope.paidAt }, input.status, input.now)` (EF3.3) — **the command never re-derives the `paidAt` rule**. (d) `envelopeRepo.updateStatus(input.envelopeId, next)` and return the updated envelope. Transitions are free-form (any → any) — this command never rejects on the target status. → `'carried-over'` sets status only: no `carryOverReason`, no routing, no locking (EF3.3 §4.2 rule 6).
4. **`deleteEnvelope`.** (a) Fetch the envelope; `null` → `envelope_not_found`. (b) Parent-ledger mutability gate → `ledger_not_mutable`. (c) Otherwise `envelopeRepo.delete(input.envelopeId)` and return `{ ok: true }`.

The mutability gate is a **command-layer** rule (EF1.6 §2 explicitly makes lifecycle gating the domain engine's job — there is no DB trigger). It is best-effort: in EF3 the check-to-write window is inconsequential because **nothing settles a ledger** (settlement is EF5+), so a mutable ledger cannot become immutable underneath a command. When settlement lands, the same gate holds and the DB remains authoritative on the data it does constrain.

### 4.3 Three failure channels — result vs throw vs codec

Consistent with EF3.6 §8.4 / EF3.7 §4.3:

1. **Deterministic input/context failure → `{ ok: false }` result.** `ledger_not_found`, `envelope_not_found`, `ledger_not_mutable`, `negative_amount`. These are state the UI renders (a locked month, a line that no longer exists, a bad amount) — no exception, no write. (`*_not_found` is a `null` read under RLS; treating it as a result — not a throw — lets EF3.14 re-fetch and re-render cleanly, the same way EF3.7 returns `month_not_openable`.)
2. **DB/query failure → thrown `FinanceDataError` (EF3.6).** The notable case is a **bad or unowned `category`** on create/edit: the `category_id` FK (`RESTRICT`) rejects it as SQLSTATE **`23503`**, which this ticket adds to the classifier → **`foreign_key_violation`** (constraint recorded, e.g. `envelope_category_id_fkey`). It is thrown, not a result, because the category picker (EF3.13/EF3.9) only offers owned categories — a bad one is a race/programming error the UI catches, exactly as EF3.7 throws the lost-race `duplicate_month`. `ck_env_amount_nonneg` (`23514` → `check_violation`) is a pure backstop — the command already rejected `negative_amount`; likewise `ck_env_paid_at` can never fire because `applyStatusTransition` guarantees the invariant by construction (§4.4).
3. **Malformed value → `CodecError` (EF3.1).** A stored `numeric` money that can't be decoded surfaces the mapper's `CodecError`. (`now` for set-status is an opaque string — EF3.3 §4.4, no codec; the app supplies a valid ISO value as it does `today` in EF3.7. A malformed `now` would surface as a thrown `FinanceDataError` from the DB `timestamptz` type, not a `CodecError`.)

### 4.4 Purity of scope, RLS, and no schema changes

1. **No metrics.** The layer never calls `computeLedgerMetrics` (EF3.10 does, on read). COL / Health Margin / ASM recompute live from the rows these commands write — but the recompute is EF3.10's, not here.
2. **Manual-only, always.** `createEnvelope` writes `templateId`/`originalAmount`/`carriedFromEnvelopeId`/`carryOverReason` all null. **No template generation, no adhoc-library pull, no carry-over routing** — those are EF4+. `carried-over` is an inert status label (EF3.3 §4.2 rule 6): setting it changes `status` only.
3. **The `paidAt`↔`paid` invariant holds by construction.** Because set-status writes exactly the `(status, paidAt)` pair `applyStatusTransition` returns, `paidAt != null ⟺ status === 'paid'` on every write — the DB `ck_env_paid_at` is only ever a backstop, never the user-facing error (mirrors EF3.7's stance on `ck_balances_nonneg`).
4. **No migration.** The layer reads/writes the EF1.6 schema unchanged and adds **no** Postgres object or migration. EF3's only schema-adjacent item is the EF3.9 category seed.

---

## 5. Worked example — track a month through the commands

Using EF3.1/EF3.3 helpers + this ticket's factories, on an authed client for user A whose ledger `L` (Jan 2027) is `ongoing` and who owns category `C` (a provisioned default — EF3.9).

```ts
const cmd = createEnvelopeCommands(authedClientForUserA);

// ── S4 · Add a manual line — pending, paidAt null, all manual fields null ──────
const r1 = await cmd.createEnvelope({
  ledgerId: L,
  category: C,
  item: "Netflix",
  amount: decodeMoney("19.90"),
});
// => { ok: true, envelope: { status: "pending", paidAt: null, templateId: null,
//                            originalAmount: null, carryOverReason: null, ... } }
const netflix = r1.ok && r1.envelope.id;

// ── Mark it paid — paidAt set to `now` (EF3.3 applyStatusTransition) ──────────
const r2 = await cmd.setEnvelopeStatus({
  envelopeId: netflix,
  status: "paid",
  now: "2027-01-06T09:00:00Z",
});
// => { ok: true, envelope: { status: "paid", paidAt: "2027-01-06T09:00:00Z" } }

// ── Revert to pending — paidAt cleared ────────────────────────────────────────
await cmd.setEnvelopeStatus({ envelopeId: netflix, status: "pending", now: "2027-01-07T00:00:00Z" });
// => { ok: true, envelope: { status: "pending", paidAt: null } }   (`now` ignored on clear)

// ── Carry it over — inert label; status only, no reason, paidAt null ──────────
const r4 = await cmd.setEnvelopeStatus({ envelopeId: netflix, status: "carried-over", now: "2027-01-31T00:00:00Z" });
// => { ok: true, envelope: { status: "carried-over", paidAt: null, carryOverReason: null } }
//    stored in the DB as envelope_status 'carried_over' (mapper seam); read back as 'carried-over'

// ── Edit the amount — line field only, status/paidAt untouched ────────────────
await cmd.editEnvelope({ envelopeId: netflix, amount: decodeMoney("22.90") });
// => { ok: true, envelope: { amount: "22.90", status: "carried-over" } }

// ── Reject: negative amount — NO write ────────────────────────────────────────
const r6 = await cmd.createEnvelope({ ledgerId: L, category: C, item: "Bad", amount: decodeMoney("-5.00") });
// => { ok: false, reason: "negative_amount" }

// ── Reject: settled ledger is locked — NO write ───────────────────────────────
const r7 = await cmd.createEnvelope({ ledgerId: settledLedgerId, category: C, item: "X", amount: decodeMoney("10.00") });
// => { ok: false, reason: "ledger_not_mutable" }   (isLedgerMutable('settled') === false)

// ── Reject: bad/unowned category → throws (not a result) ──────────────────────
try {
  await cmd.createEnvelope({ ledgerId: L, category: someUuidNotOwned, item: "Y", amount: decodeMoney("10.00") });
} catch (e) {
  (e as FinanceDataError).code; // => "foreign_key_violation"   (23503, envelope_category_id_fkey)
}

// ── Delete ────────────────────────────────────────────────────────────────────
await cmd.deleteEnvelope({ envelopeId: netflix }); // => { ok: true }
```

---

## 6. Verification matrix (integration tests)

Encode as **SDK-driven integration tests** against a local Supabase (`supabase db reset`) with **two seeded users A and B** — **reusing EF3.6's harness**, extended with a per-user fixture: an `ongoing` `monthly_ledger` and a `category` (inserted via the authed client — EF3.9 provisioning is a separate ticket; tests seed the category directly), plus a **`settled`** ledger for A forced via the service-role client (settlement is EF5+; the create command never produces one). Money assertions compare via `encodeMoney`. "No write" rows assert the row count / fields are unchanged.

### 6.1 Repository (`envelope-repository.test.ts`)

**Round-trip mapping & the `carried_over` seam**

| #   | Action                                                                                       | Expected                                                                                     |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `insert` manual (`ledgerId=L, category=C, item='Groceries', amount 120.00`, status omitted)  | ✅ `Envelope`; `status='pending'`, `paidAt=null`, `templateId`/`originalAmount`/`carryOverReason` null |
| 2   | Read row 1 back; re-encode `amount`                                                           | `"120.00"` — exact round-trip (money never floated)                                          |
| 3   | `insert` with `status='carried-over'`, then read back                                        | domain `status='carried-over'`; the stored DB label is `carried_over` (verify via service client) |
| 4   | `statusFromDb(statusToDb(s))` for every `s ∈ ENVELOPE_STATUSES`                              | equals `s` (seam round-trips for all four)                                                   |
| 5   | `updateStatus(id, { status:'paid', paidAt:'…Z' })` then `updateStatus(id, { status:'skipped', paidAt:null })` | reads back `paid`/non-null then `skipped`/null                              |
| 6   | `update(id, { amount: 99.99, item:'X' })`                                                    | `amount='99.99'`, `item='X'`; `status`/`paidAt` unchanged                                    |
| 7   | `listByLedger(L)` after inserting three lines with `sortOrder` 2,0,1                          | three envelopes ordered `[0,1,2]` by `sortOrder`                                             |
| 8   | `findById(id)` / `findById(random uuid)`                                                      | the envelope / `null`                                                                        |
| 9   | `delete(id)` then `findById(id)`                                                              | resolves; subsequent find → `null`                                                           |

**Error classification (`FinanceDataError`)**

| #   | Action                                                                | Expected                                                                                    |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 10  | `insert` with `category=<random uuid, not owned>`                     | ❌ `FinanceDataError` `code='foreign_key_violation'`, `constraint='envelope_category_id_fkey'` |
| 11  | `insert` with `ledgerId=<random uuid>`                                | ❌ `FinanceDataError` `code='foreign_key_violation'` (`envelope_ledger_id_fkey`)            |
| 12  | `insert` with `amount -1.00` (bypassing the command)                  | ❌ `FinanceDataError` `code='check_violation'`, `constraint='ck_env_amount_nonneg'`         |
| 13  | `updateStatus(id, { status:'paid', paidAt:null })` (bypassing applyStatusTransition) | ❌ `FinanceDataError` `code='check_violation'`, `constraint='ck_env_paid_at'`  |
| 14  | `mapPostgrestError` on an unmapped SQLSTATE                            | `FinanceDataError` `code='unknown'`, raw error on `.cause`                                   |

**RLS isolation**

| #   | Action                                                                                   | Expected                                                       |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 15  | Seed an envelope for user B (service client); user A `findById(B.env)` / `listByLedger(B.ledger)` | `null` / `[]` (RLS hides B's rows)                     |
| 16  | User A `insert` (no `user_id` set); read back the stored `user_id`                       | `user_id` = A (DB default `auth.uid()`) — inserts never set it |

### 6.2 Commands (`envelope-commands.test.ts`)

**Happy paths**

| #   | Action                                                                             | Expected                                                                     |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 17  | `createEnvelope(L, C, 'Netflix', 19.90)`                                           | `{ ok:true }`; `status='pending'`, `paidAt=null`, all manual-only fields null |
| 18  | `setEnvelopeStatus(env, 'paid', 'T1')`                                             | `{ ok:true }`; `status='paid'`, `paidAt='T1'`                                |
| 19  | `setEnvelopeStatus(env,'paid','T1')` → `(env,'pending','T2')` → `(env,'paid','T3')` | final `paidAt='T3'` (fresh stamp; the intermediate cleared it)              |
| 20  | `setEnvelopeStatus(env, 'carried-over', 'T4')`                                     | `{ ok:true }`; `status='carried-over'`, `paidAt=null`, `carryOverReason=null` (inert) |
| 21  | `editEnvelope(env, { amount: 22.90 })` on a `paid` envelope                        | `{ ok:true }`; `amount='22.90'`; `status='paid'`/`paidAt` unchanged          |
| 22  | `deleteEnvelope(env)`                                                              | `{ ok:true }`; `findById` → `null`                                           |

**Rejections — result union, no write**

| #   | Action                                                                        | Expected                                                          |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 23  | `createEnvelope(L, C, 'Bad', -5.00)`                                          | `{ ok:false, reason:'negative_amount' }`; **no envelope created** |
| 24  | `createEnvelope(settledLedgerId, C, 'X', 10.00)`                             | `{ ok:false, reason:'ledger_not_mutable' }`; no write            |
| 25  | `createEnvelope(<random ledger uuid>, C, 'X', 10.00)`                         | `{ ok:false, reason:'ledger_not_found' }`; no write             |
| 26  | `editEnvelope(<random env uuid>, { item:'X' })`                              | `{ ok:false, reason:'envelope_not_found' }`; no write           |
| 27  | `editEnvelope(env, { amount: -1.00 })`                                       | `{ ok:false, reason:'negative_amount' }`; amount unchanged      |
| 28  | On a `settled` ledger's envelope (seeded): `setEnvelopeStatus(env,'paid','T')` | `{ ok:false, reason:'ledger_not_mutable' }`; status unchanged  |
| 29  | `deleteEnvelope(<random env uuid>)`                                          | `{ ok:false, reason:'envelope_not_found' }`                      |

**Throw / invariant / isolation**

| #   | Action                                                                                | Expected                                                                        |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 30  | `createEnvelope(L, <uuid not owned>, 'Y', 10.00)`                                      | throws `FinanceDataError('foreign_key_violation')` — not a result rejection     |
| 31  | For every status transition in rows 18–20, assert `paidAt != null ⟺ status==='paid'`  | holds on every result (the `ck_env_paid_at` invariant, by construction)         |
| 32  | User A `editEnvelope`/`setEnvelopeStatus`/`deleteEnvelope` on **user B's** envelope id | `{ ok:false, reason:'envelope_not_found' }` (RLS null); B's row untouched       |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/internal/mappers/envelope-mapper.ts`, `src/internal/repositories/envelope-repository.ts`, and `src/internal/commands/envelope-commands.ts` exist in `@nafios/finance`; `createEnvelopeCommands`, `EnvelopeCommands`, the three command input types, `EnvelopeRejectionReason`, and the four `*Result` types are re-exported from `src/index.ts` (the repository + mapper stay internal); wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — The mapper decodes/encodes money via EF3.1 (`decodeMoney`/`encodeMoney`, no `parseFloat`/`Number()`/raw-string math) and **owns the `carried_over ↔ carried-over` seam**: `statusToDb`/`statusFromDb` are total over the four statuses and round-trip exactly (rows 3–4); `carried_over` appears **nowhere else** in the package. `created_at`/`updated_at`/`obligation_kind` are not surfaced on `Envelope`.
- [ ] **AC3** — The repository’s `insert` never sets `user_id` (row 16), omits `id`/`created_at`/`updated_at` and all manual-only columns (`template_id`/`original_amount`/`carried_from_envelope_id`/`carry_over_reason` null); `findById` returns `null` on not-found/not-owned; `listByLedger` returns the ledger’s envelopes ordered by `sort_order` then `created_at` (rows 1–2, 7–9).
- [ ] **AC4** — `mapPostgrestError` is **extended** to classify `23503` → `foreign_key_violation` (constraint recorded); `23514` still → `check_violation`; `FinanceDataErrorCode` gains the new member; each error carries `constraint` (when known) and the raw `PostgrestError` on `cause` (rows 10–14).
- [ ] **AC5** — Every command gates on **parent-ledger mutability** (`isLedgerMutable`, EF3.2) before any write and returns `{ ok:false }` with **no mutation** for `ledger_not_found` / `envelope_not_found` / `ledger_not_mutable` / `negative_amount` (rows 23–29, 32). Amount non-negativity is checked via `compareMoney` against `ZERO_MONEY` (no raw-number math).
- [ ] **AC6** — `setEnvelopeStatus` computes the `(status, paidAt)` pair **via EF3.3’s `applyStatusTransition`** (it does not re-derive the rule): set on → `paid`, cleared on → any non-`paid`, fresh stamp on `paid → pending → paid`; the `paidAt != null ⟺ status === 'paid'` invariant holds on every result (rows 18–20, 31). Transitions are free-form (never rejected on target); → `carried-over` sets status only, `carryOverReason` stays null (row 20).
- [ ] **AC7** — `createEnvelope` writes a **manual, pending** line (status `'pending'`, `paidAt` null, manual-only fields null); `editEnvelope` changes only present line fields and never touches `status`/`paidAt`; a bad/unowned `category` throws `FinanceDataError('foreign_key_violation')` rather than returning a result (row 30). No metrics, no template generation, no carry-over routing (§4.4).
- [ ] **AC8** — Every row of the §6 matrix passes as an integration test against a local Supabase with two seeded users (harness extended with a ledger + category fixture and a service-seeded `settled` ledger); the harness is idempotent across runs; `bun run check` is green across the workspace.
- [ ] **AC9** — **Boundary stays clean:** the layer imports EF3.3/EF3.2 domain functions+types, EF3.1 codecs, EF3.6’s repository + `FinanceDataError`, and EF2.2’s `FinanceClient` only; `@supabase/supabase-js` / `@nafios/db` appear **only** in `src/internal/`; no `src/domain/` file imports this layer; the eslint import-boundary rule stays green; **no migration** is added.

---

## 8. Notes / decisions

1. **The `carried_over ↔ carried-over` seam lives here — the epic/EF3.3 cross-ticket decision.** EF3.3 defines the hyphenated domain literal and explicitly assigns the DB-label translation to "the EF3.8 data-layer mapper." This ticket implements it as `statusToDb`/`statusFromDb`, the sole place the snake_case `carried_over` string appears. Everything upstream — the metrics engine, the commands, the web layer — sees only `'carried-over'`. Row 4 is the regression guard.
2. **`applyStatusTransition` is consumed, never re-derived — the `paidAt` invariant is free.** The set-status command reads the current `(status, paidAt)` off the row, calls EF3.3's pure resolver, and writes the result. Because the resolver guarantees `paidAt != null ⟺ status === 'paid'`, `ck_env_paid_at` is a pure backstop — it can only fire if a caller bypasses the command and writes the pair by hand (row 13). This is why the rule lives in the domain (testable without a clock/DB) and the command is a thin orchestrator.
3. **The mutability gate has teeth here — the EF3.7 forward-reference resolved.** EF3.7 §4.2 note 4 said mutability "matters for the edit surfaces (EF3.8), not creation." This ticket is that surface: every command fetches the parent ledger and gates on `isLedgerMutable`. It is a command-layer rule (EF1.6 §2 keeps lifecycle gating out of the DB — no trigger), and in EF3 the check-to-write window is inert because nothing settles a ledger (EF5+). In EF3 the gate only ever rejects a **service-seeded** `settled` ledger in tests; at runtime every operated ledger is `ongoing`.
4. **`23503 → foreign_key_violation` is the one shared-foundation extension.** The envelope is the first table whose FKs a user write can violate (a bad/unowned `category_id`; a bad `ledger_id`). EF3.6's classifier didn't need `23503` (a ledger insert has no user-facing FK). Extending `mapPostgrestError` + `FinanceDataErrorCode` here — rather than swallowing it as `unknown` — gives EF3.14 a stable code to message from, and keeps the classifier the single SQLSTATE authority.
5. **Not-found is a result, not a throw; a bad category is a throw, not a result.** A `null` read (envelope/ledger absent or not owned under RLS) is deterministic from the caller's view — the UI re-fetches and re-renders, so it returns `{ ok:false, *_not_found }` (parallel to EF3.7's `month_not_openable`). A bad `category` FK is a race/programming error (the picker only offers owned categories), so it throws `FinanceDataError` — parallel to EF3.7 throwing the lost-race `duplicate_month`. The split keeps result-rejections purely deterministic-input and throws for genuine integrity faults (§4.3).
6. **`createEnvelope` always creates a pending line — status is a separate action.** Adding an envelope and marking it paid are two user actions (EF3.14: add, then the status control), so `createEnvelope` fixes `status:'pending'`/`paidAt:null` and does not accept a status. The repository's `insert` stays a general primitive (accepts a status) so EF4+ template generation can insert non-pending lines without re-architecture — but no EF3 command does.
7. **Edit and set-status are separate paths on purpose.** `editEnvelope` (line fields) and `setEnvelopeStatus` (status + `paidAt`) are distinct so the `paidAt` invariant is owned by exactly one write path (`updateStatus`), and an amount edit on a `paid` envelope never disturbs `paidAt` (EF3.3 §4.2 rule 3). `sortOrder` is settable on both (create/edit) so EF3.14 can reorder; a dedicated bulk-reorder primitive is a later refinement, not needed here.
8. **`listByLedger` is EF3.10's input, not a metrics call.** This ticket returns the ordered envelope list; EF3.10 attaches it to a `LedgerHeader` and runs `computeLedgerMetrics`. The repository never computes COL — keeping the "metrics computed on read, in one place" discipline (EF3.2 / EF3.10).

_Provenance (not required reading): the `envelope` columns, the `envelope_status` enum with the `carried_over` label, the four CHECKs (`ck_env_amount_nonneg`/`ck_env_paid_at`/`ck_env_original_amount`/`ck_env_co_reason_len`), the five real FKs + two soft refs (D9), the RLS `owner_all` policy, and the `user_id` default `auth.uid()` insert path are from EF1.6 (§2–§6, §8); the `Envelope` type, `EnvelopeStatus`, `ENVELOPE_STATUSES`, the `'carried-over' ↔ carried_over` seam assignment, `applyStatusTransition` (the `paidAt` set/clear rule, caller-supplied `now`), and `carried-over`-as-inert-label are from EF3.3 (§2, §4.1–§4.2); `isLedgerMutable` (true for `ongoing`/`reconciling`, false for `settled`) and the "edit surface gates on it" note are from EF3.2 (§4.2 rule 4) and EF3.7 (§4.2 note 4); the `FinanceDataError` + `mapPostgrestError` classifier, the mapper pattern, and the two-user integration harness are from EF3.6 (§2–§4, §8); the command pattern (validate-in-domain → orchestrate → result/throw) is from EF3.7 (§1, §4.3, §8 note 7); the `Money` codecs and no-float discipline are from EF3.1; manual-only envelopes, `carried-over` scoping, and metrics-on-read are from the EF3 epic (Scope items 3/8/10, Out of scope) and `monthly-ledger.md` §4–§6._

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.8. It is the second `src/internal/` feature, depending on EF3.6 (foundations + ledger repo), EF3.3 (envelope domain), EF3.2 (mutability), EF3.1 (codecs), and EF2.2 (client). Mergeable when all of the following hold — no follow-up, no stubs, no TODOs:

- [ ] `src/internal/mappers/envelope-mapper.ts`, `src/internal/repositories/envelope-repository.ts`, `src/internal/commands/envelope-commands.ts`, `tests/integration/envelope-repository.test.ts`, and `tests/integration/envelope-commands.test.ts` are present; the §2.2 command write surface is re-exported from `src/index.ts`; the repository + mapper stay internal.
- [ ] **All §7 acceptance criteria (AC1–AC9) pass**, including the `carried_over` seam round-trip, the `paidAt`↔`paid` invariant on every set-status result, the mutability gate on all four commands, the `foreign_key_violation` throw for a bad category, and RLS isolation between two users.
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all §6 integration tests against a local Supabase with two seeded users (harness extended with a ledger + category fixture and a service-seeded `settled` ledger), and the eslint domain/data import-boundary rule (AC9). This is the merge gate.
- [ ] No surface beyond §2 — in particular **no** `computeLedgerMetrics` call, **no** template/adhoc/carry-over routing, **no** `carryOverReason` prompt, **no** re-implementation of the `paidAt` or COL-contribution rules, and **no migration**. Those are EF3.10 / EF4+ / EF3.3 / EF1.6.
- [ ] The layer never touches a raw money string outside EF3.1's codecs or the `carried_over` label outside the mapper; it enforces mutability + non-negativity server-side and funnels DB errors through EF3.6's `FinanceDataError`.
- [ ] This ticket's Revision History is updated; the EF3.8 checkbox in `EF3.md` is ticked when merged.

---

## Revision History

| Version | Date       | Author            | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-07-03 | NafiOS Foundation | Initial standalone task for the **envelope data layer** in `@nafios/finance`'s `src/internal/` — the SECOND repository (reuses EF3.6's mapper / `FinanceDataError` / harness foundations) and the envelope command surface (mirrors EF3.7's command pattern). Repository: `createEnvelopeRepository(client)` → `insert` / `findById` / `listByLedger` (ordered, feeds EF3.10) / `update` / `updateStatus` / `delete`, with the envelope mapper owning the **`carried_over ↔ carried-over`** DB-label seam (EF3.3 §4.1, the only `carried_over` in the package). Commands: `createEnvelopeCommands(client)` → `createEnvelope` / `editEnvelope` / `setEnvelopeStatus` / `deleteEnvelope`, each gating on **`isLedgerMutable`** of the parent ledger (the "edit surface" EF3.7 reserved), validating amount non-negativity, and computing `paidAt` via EF3.3's **`applyStatusTransition`** (invariant `paidAt != null ⟺ status==='paid'` by construction) — returns `{ ok }` results for deterministic rejections (`ledger_not_found`/`envelope_not_found`/`ledger_not_mutable`/`negative_amount`) and throws `FinanceDataError` for DB faults. Extends `mapPostgrestError` with **`23503 → foreign_key_violation`** (bad/unowned category). Manual-only (`templateId`/`originalAmount`/`carriedFromEnvelopeId`/`carryOverReason` always null); `carried-over` inert (status only). Scopes OUT metrics (EF3.10), templates/adhoc/carry-over routing (EF4+), and any migration. Verification matrix (repository round-trip + seam + classification + RLS; command happy paths + rejections + paidAt transitions + throw/isolation) + AC1–AC9 + §9 Definition of Done (green `bun run check` incl. local-Supabase integration tests as the merge gate); PR-able on EF3.6 + EF3.3 + EF3.2 + EF3.1 + EF2.2.                                                                                                            |
