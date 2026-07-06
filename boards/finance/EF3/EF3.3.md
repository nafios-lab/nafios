# EF3.3 — Envelope type + status enum + COL-contribution & `paidAt` rules

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:domain`
> - `P0`
> - `size:S`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the `Envelope` domain type, its status enum, the **COL-contribution rule** (`countsTowardCol`), and the **`paidAt` set/clear transition rule** (`applyStatusTransition`) is in this file. Stack: **plain TypeScript, pure, zero I/O.** It lives in `@nafios/finance`'s **domain layer** (`src/domain/`) — no Supabase, no `@nafios/db`, no `fetch`, no clock access. **No ORM / no Drizzle. No schema changes** (EF3 consumes the EF1 schema unchanged).
>
> **Depends on:**
> - **EF3.1** (Money & Month codecs) — `Envelope.amount` / `originalAmount` are `Money`. No float math anywhere.
>
> **Consumed by (this ticket is the seam):**
> - **EF3.2** (metrics engine) imports exactly three things from here: the `EnvelopeStatus` type, the `Envelope` type (for `MonthlyLedger.envelopes`), and the `countsTowardCol` predicate. The COL-contribution rule (only `pending`+`paid` count) is **owned here** and consumed there — never re-implemented.
> - **EF3.8** (envelope repository + commands) decodes DB rows into `Envelope`, owns the `'carried-over' ↔ carried_over` label translation (§4.1), and calls `applyStatusTransition` on every set-status command.
>
> **Build-order & PR readiness.** This ticket is the **base of the EF3.2 ↔ EF3.3 stack**: it depends only on EF3.1, so it is independently PR-able the moment EF3.1's `Money` type exists. EF3.2 stacks on or co-merges with it (see EF3.2 §9). **Do not stub or duplicate this ticket's surface inside EF3.2** — the `EnvelopeStatus` / `countsTowardCol` / `Envelope` seam is owned here.
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, green `bun run check`).

---

## 1. What you're building

The **Envelope domain type** — the in-memory shape of a single line item in a ledger — plus the two pure rules that govern how an envelope behaves: the **COL-contribution rule** (which statuses count toward Cost of Living) and the **`paidAt` set/clear rule** (how the payment timestamp tracks the status). Framework-agnostic, side-effect-free TypeScript in `src/domain/`.

**Why it exists — the problem each piece solves:**

1. **`Envelope` + `EnvelopeStatus`.** The envelope is the universal primitive of the whole product (`finance-domain-spec.md` §3) — everything the user edits is an envelope. This ticket defines the one canonical in-memory shape the repository (EF3.8) decodes rows into, the metrics engine (EF3.2) sums over, and the web layer (EF3.13/EF3.14) renders. It also pins the status vocabulary — `pending` / `paid` / `skipped` / `carried-over` — and owns the **domain literal** side of the `'carried-over' ↔ carried_over` DB-label seam (§4.1).

2. **`countsTowardCol` — the COL-contribution rule.** COL is *"the sum of all envelope amounts where status is `pending` or `paid`"* (`finance-domain-spec.md` §5, `monthly-ledger.md` §5). This one-line rule is the single most-referenced predicate in the finance engine, and getting the set wrong silently corrupts every derived metric downstream. The epic makes it a **cross-ticket decision**: the rule lives *once*, here, and every consumer calls this predicate rather than re-typing `status === 'pending' || status === 'paid'`.

3. **`applyStatusTransition` — the `paidAt` rule.** Envelope status is **free-form** (any → any while the ledger is mutable — RFC-018, `monthly-ledger.md` §4). The one side effect EF3 must model is `paidAt`: set to "now" on transition *to* `paid`, cleared to null on transition *away* from `paid`. Doing this ad-hoc in the repository or the UI is how a `paid` envelope ends up with a null `paidAt` (or vice-versa), violating the DB's `ck_env_paid_at` CHECK (EF1.6). This ticket pins the rule in one pure function so the invariant `paidAt != null ⟺ status === 'paid'` holds by construction.

> **Cross-ticket decision (from the EF3 epic).** The COL-contribution rule (only `pending`+`paid` count) lives **once**, here in the Envelope model (`countsTowardCol`), and is **consumed** by the metrics engine (EF3.2). It is never re-implemented in the metrics, data, or web layers.

---

## 2. Public API / contract

Exact TS signatures. These names are the contract every later ticket imports — keep them stable. Barrel-exported from `src/index.ts`; implementation lives in `src/domain/envelope.ts`.

```ts
import type { Money } from './money'; // EF3.1

// ───────────────────────────── Envelope status ─────────────────────────────

/**
 * One envelope's lifecycle state within a ledger (finance-domain-spec.md §4).
 *   pending      — set aside, not yet actioned         → counts toward COL
 *   paid         — the money has gone out              → counts toward COL
 *   skipped      — deliberately not funded this month  → excluded from COL
 *   carried-over — deferred to a later month           → excluded from COL
 *
 * ⚠️ DB-label seam (EF1.6 / EF1.2 D4): the Postgres enum label is `carried_over`
 * (snake_case — Postgres identifiers can't contain a hyphen). The DOMAIN literal
 * is the hyphenated `'carried-over'`. The `'carried-over' ↔ carried_over`
 * translation is owned by the data-layer mapper (EF3.8, src/internal/) — NOT here.
 * The whole domain + web surface uses only the hyphenated form.
 */
export type EnvelopeStatus = 'pending' | 'paid' | 'skipped' | 'carried-over';

/** The four statuses as a frozen, ordered tuple — the canonical set the status
 *  control (EF3.14) renders and exhaustive tests iterate. Order is the display
 *  order, not a state machine (transitions are free-form — §4.2). */
export const ENVELOPE_STATUSES: readonly EnvelopeStatus[];

// ───────────────────────────────── Envelope ────────────────────────────────

/**
 * A single line item — a pocket of cash earmarked for a purpose this month
 * (finance-domain-spec.md §4). The in-memory domain shape; the repository
 * (EF3.8) decodes DB rows into this via the EF3.1 codecs + the status seam.
 *
 * `amount` / `originalAmount` are Money (EF3.1). `paidAt` is an opaque ISO-8601
 * string (no Timestamp codec — same discipline as EF3.2's createdAt/settledAt).
 * Ids are plain `string` (uuid), matching EF3.2's MonthlyLedger.id (see Notes).
 *
 * EF3 creates MANUAL envelopes only: `templateId`, `originalAmount`,
 * `carriedFromEnvelopeId`, and `carryOverReason` are ALWAYS null in EF3. The
 * fields exist on the type now so templates + carry-over (EF4+) need no
 * re-architecture — only feature code.
 */
export interface Envelope {
  readonly id: string;                            // uuid PK
  readonly ledgerId: string;                      // owning MonthlyLedger (uuid)
  readonly category: string;                      // Category ref (uuid) — required; every envelope has exactly one
  readonly item: string;                          // line label, e.g. "Netflix", "DBS Reno Loan"
  readonly amount: Money;                          // the pocket of cash; >= 0 ($0 valid) — enforced at command/DB, not the type
  readonly originalAmount: Money | null;           // template-linked only; ALWAYS null in EF3 (manual)
  readonly status: EnvelopeStatus;
  readonly paidAt: string | null;                  // ISO-8601; non-null IFF status === 'paid' (mirrors DB ck_env_paid_at)
  readonly paymentSource: string | null;           // Account ref (uuid), optional
  readonly remark: string | null;                  // operational note, optional
  readonly linkedPerson: string | null;            // Person ref (uuid), optional
  readonly sortOrder: number;                      // display position within the ledger's list
  readonly templateId: string | null;              // source template; ALWAYS null in EF3 (manual)
  readonly carriedFromEnvelopeId: string | null;   // back-ref to a source envelope; ALWAYS null in EF3
  readonly carryOverReason: string | null;         // ALWAYS null in EF3 — no reason prompt (§4.2)
}

// ─────────────────────── COL-contribution rule (the seam) ───────────────────

/**
 * THE COL-contribution rule — owned here, consumed by the metrics engine (EF3.2).
 * Returns true for the statuses whose `amount` counts toward Cost of Living:
 * `pending` and `paid`. `skipped` and `carried-over` are excluded — the money was
 * not (and will not be) spent this month (finance-domain-spec.md §5).
 *
 * This is the ONLY place the pending+paid set is defined. EF3.2, the data layer,
 * and the web layer all call this — none re-implement it (epic cross-ticket decision).
 */
export function countsTowardCol(status: EnvelopeStatus): boolean;

// ─────────────────────── paidAt set/clear transition rule ───────────────────

/** The (status, paidAt) pair — the mutable slice a status change touches. */
export interface EnvelopeStatusState {
  readonly status: EnvelopeStatus;
  readonly paidAt: string | null;
}

/**
 * Pure resolver for the `paidAt` set/clear rule (monthly-ledger.md §4, RFC-018).
 * Given the current (status, paidAt) and a target status, returns the new pair:
 *   • → 'paid' from a non-paid status : paidAt = `now`
 *   • → 'paid' while already 'paid'    : paidAt UNCHANGED (status didn't change ⇒ no re-stamp)
 *   • → any non-'paid' status          : paidAt = null
 * So the invariant `paidAt != null ⟺ status === 'paid'` ALWAYS holds on the result
 * (mirrors the DB ck_env_paid_at CHECK).
 *
 * `now` is a caller-supplied ISO-8601 string — the resolver never reads the clock
 * (keeps it pure/testable, same discipline as EF3.1's monthOf).
 *
 * Transitions are FREE-FORM (any → any) — this never throws. Ledger-mutability
 * gating (settled = locked) is the command layer's job via EF3.2's isLedgerMutable,
 * NOT this function. In EF3, → 'carried-over' sets status only: no carryOverReason
 * prompt, no template routing, no acted-on locking (all EF4+ — §4.2).
 */
export function applyStatusTransition(
  current: EnvelopeStatusState,
  next: EnvelopeStatus,
  now: string,
): EnvelopeStatusState;
```

---

## 3. Package placement, layer & exports

Pure **domain code** — lands in `@nafios/finance`'s domain layer (the layer that must never import Supabase, `@nafios/db`, or `src/internal/` — enforced by the EF2 eslint import-boundary rule).

```
packages/finance/
├── src/
│   ├── index.ts          # barrel: re-exports the §2 surface (alongside EF3.1 / EF3.2)
│   ├── domain/
│   │   ├── money.ts      # Money (EF3.1) — consumed here for amount / originalAmount
│   │   └── envelope.ts   # EnvelopeStatus, ENVELOPE_STATUSES, Envelope,
│   │                     #   countsTowardCol, EnvelopeStatusState, applyStatusTransition  ← this ticket
│   └── internal/         # (EF3.8 maps rows ↔ Envelope + carried_over ↔ carried-over — later)
└── tests/
    └── unit/
        └── envelope.test.ts  # the §6 matrix
```

- **Zero I/O, zero new dependencies.** No `@supabase/supabase-js`, no `@nafios/db`, no `Date.now()` / argless `new Date()` / `fetch` / env access. Timestamps arrive as strings (`now`, `paidAt`) and stay strings.
- **The data-layer seam is one-directional.** This domain file exports the status literal `'carried-over'`; the `src/internal/` mapper (EF3.8) is the *only* place that translates it to/from the DB label `carried_over`. This file never names `carried_over`.
- **Barrel is the only surface.** Everything in §2 is re-exported from `src/index.ts`; the data and web layers import from `@nafios/finance`, never a deep path.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep these wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 Envelope status + the COL-contribution rule

1. **Four statuses, hyphenated domain literals.** `EnvelopeStatus` is exactly `'pending' | 'paid' | 'skipped' | 'carried-over'` (`finance-domain-spec.md` §4). `ENVELOPE_STATUSES` exports them as a frozen tuple in display order (`pending`, `paid`, `skipped`, `carried-over`) for the status control and exhaustive tests.
2. **`countsTowardCol` is the one COL filter.** `countsTowardCol(status)` returns `true` for `pending` and `paid`, `false` for `skipped` and `carried-over`. This is the sole definition of the contributing set; EF3.2's `computeLedgerMetrics` filters envelopes through it and never inspects the literal statuses itself (EF3.2 §4.1 rule 1). `skipped` and `carried-over` both drop the envelope out of COL identically — in EF3 they differ only as *labels*, not in metric effect (see §4.2 and the epic Notes).
3. **The `'carried-over' ↔ carried_over` seam lives at the data layer.** The DB `envelope_status` enum labels it `carried_over` (EF1.6 §5 — Postgres forbids hyphens in identifiers). The hyphenated `'carried-over'` is the domain form used everywhere in `src/domain/`, the metrics engine, and the web layer. The translation is owned by the EF3.8 repository mapper in `src/internal/`. This ticket documents the seam (doc-comment on `EnvelopeStatus`) but does **not** implement the mapping.
4. **`amount` non-negativity is not a type guarantee.** `Money` allows negatives by design (EF3.1 §4.1 rule 5). The `amount >= 0` rule (`$0` valid, negatives not — `ck_env_amount_nonneg`, EF1.6) is enforced by the create/edit command (EF3.8) and the DB CHECK, not by this type. Same stance EF3.1 takes for the ledger's balance columns.

### 4.2 The `paidAt` set/clear transition rule (`applyStatusTransition`)

1. **Free-form transitions; the only side effect EF3 models is `paidAt`.** Any status may change to any other while the ledger is mutable (`monthly-ledger.md` §4, RFC-018). `applyStatusTransition` never rejects a target — it just computes the resulting `(status, paidAt)`.
2. **`paidAt` tracks `paid`, exactly.** Transition **to** `paid` from a non-paid status sets `paidAt = now`. Transition **away** from `paid` clears `paidAt = null`. So `paidAt != null ⟺ status === 'paid'` always holds on the result — mirroring the DB `ck_env_paid_at` CHECK. A `paid → pending → paid` sequence gets a **fresh** `now` on the second payment (the intermediate step cleared it).
3. **No re-stamp on a no-op.** If `current.status` is already `paid` and `next` is `paid`, `paidAt` is left **unchanged** — the status didn't change, so there's no new payment action to stamp. (Amount edits on a paid envelope don't touch `paidAt` either; they don't go through this function.)
4. **`now` is caller-supplied — the resolver reads no clock.** Callers (EF3.8's set-status command) pass an ISO-8601 string. This keeps the function pure and its tests deterministic, exactly as EF3.1's `monthOf` takes `today` as a string.
5. **Ledger-mutability gating is the caller's job.** `settled` ledgers are locked (`monthly-ledger.md` §3); the command layer checks `isLedgerMutable(ledger.status)` (EF3.2) **before** calling this function. `applyStatusTransition` is ledger-status-agnostic — it takes no ledger, models no lock.
6. **`carried-over` is an inert status label in EF3.** Transition to `carried-over` sets `status` only. There is **no** mandatory `carryOverReason` prompt, **no** template-panel routing, and **no** acted-on locking — all of that is the carry-over subsystem (EF4+ / later epic), explicitly out of EF3 scope (epic Out of scope). `carryOverReason` is untouched by this function and stays `null` for every EF3 envelope. Reverting `carried-over → pending`/`paid`/`skipped` is a plain, unrestricted transition here (it obeys the same `paidAt` rule).

### 4.3 The `Envelope` type — manual-only in EF3

1. **Full canonical shape, manual-only population.** The type carries the template-link and carry-over fields (`originalAmount`, `templateId`, `carriedFromEnvelopeId`, `carryOverReason`) so EF4+ adds behavior, not fields. In EF3 the create command (EF3.8) sets every one of them to `null` — every EF3 envelope is manual. Consumers must still handle a non-null `templateId` gracefully in principle (orphaned-template contract, EF1.2 AC9), but EF3 produces none.
2. **`category` is required.** Every envelope belongs to exactly one Category (`finance-domain-spec.md` §5 invariant; `ck`-backed FK in EF1.6). This is why EF3 must provision default categories (EF3.9) before a user can create an envelope.
3. **No `derivedMetrics`, no `obligationKind`.** Metrics are computed by EF3.2, never stored on the envelope. `obligationKind` (the DB column exists, inert) is **Phase 2** and deliberately omitted from this type (see Notes) — it is not needed in EF3 and adding it is a purely additive field/enum when Phase 2 lights it up.
4. **Timestamps are opaque ISO strings.** `paidAt` is a plain `string | null` passed through verbatim — no Timestamp codec (same rationale as EF3.2: nothing in EF3 does timestamp arithmetic).

---

## 5. Worked example — the Jan 2027 anchor + a `paidAt` sequence

The COL-contribution rule is verified against the same Jan 2027 reference the metrics engine (EF3.2) uses, proving the seam is correct *before* EF3.2 consumes it. Uses only EF3.1 codecs + this ticket's functions.

```ts
// The four Jan 2027 envelopes — two count toward COL, two do not.
const envelopes = [
  { amount: decodeMoney('1200.00'), status: 'pending'      as EnvelopeStatus }, // counts
  { amount: decodeMoney('3107.28'), status: 'paid'         as EnvelopeStatus }, // counts
  { amount: decodeMoney('500.00'),  status: 'skipped'      as EnvelopeStatus }, // excluded
  { amount: decodeMoney('250.00'),  status: 'carried-over' as EnvelopeStatus }, // excluded
];

countsTowardCol('pending');       // => true
countsTowardCol('paid');          // => true
countsTowardCol('skipped');       // => false
countsTowardCol('carried-over');  // => false

// COL is EF3.2's job, but the contributing set this rule selects is:
sumMoney(envelopes.filter(e => countsTowardCol(e.status)).map(e => e.amount)); // => "4307.28"

// ── paidAt set/clear rule ──────────────────────────────────────────────────
applyStatusTransition({ status: 'pending', paidAt: null }, 'paid', '2027-01-06T09:00:00Z');
//   => { status: 'paid', paidAt: '2027-01-06T09:00:00Z' }      (set on → paid)

applyStatusTransition({ status: 'paid', paidAt: '2027-01-06T09:00:00Z' }, 'pending', '2027-01-07T00:00:00Z');
//   => { status: 'pending', paidAt: null }                      (cleared on ← paid; `now` ignored)

applyStatusTransition({ status: 'paid', paidAt: '2027-01-06T09:00:00Z' }, 'paid', '2027-01-08T00:00:00Z');
//   => { status: 'paid', paidAt: '2027-01-06T09:00:00Z' }       (no status change ⇒ no re-stamp)

applyStatusTransition({ status: 'carried-over', paidAt: null }, 'paid', '2027-01-09T12:00:00Z');
//   => { status: 'paid', paidAt: '2027-01-09T12:00:00Z' }       (carried-over → paid allowed; paidAt set)

applyStatusTransition({ status: 'pending', paidAt: null }, 'carried-over', '2027-01-10T00:00:00Z');
//   => { status: 'carried-over', paidAt: null }                 (inert label; no reason, no re-stamp)
```

---

## 6. Verification matrix (unit tests)

Encode as unit tests in `tests/unit/envelope.test.ts` so `bun run check` enforces them. Pure functions — no DB, no fixtures beyond the EF3.1 codecs. Money assertions compare via `encodeMoney`.

**`countsTowardCol` & the status set**

| #  | Action | Expected |
|----|--------|----------|
| 1  | `countsTowardCol('pending')`, `countsTowardCol('paid')` | both `true` |
| 2  | `countsTowardCol('skipped')`, `countsTowardCol('carried-over')` | both `false` |
| 3  | `ENVELOPE_STATUSES` | `['pending','paid','skipped','carried-over']` (exact members, no extras) |
| 4  | `sumMoney(jan2027.filter(e => countsTowardCol(e.status)).map(e => e.amount))` then `encodeMoney` | `"4307.28"` (the COL contributing set — feeds EF3.2) |

**`applyStatusTransition` — the `paidAt` rule**

| #  | `current` (status / paidAt) → `next`, `now` | Expected result |
|----|---------------------------------------------|-----------------|
| 5  | `pending`/`null` → `paid`, `"T1"` | `{ paid, "T1" }` (set on → paid) |
| 6  | `paid`/`"T1"` → `pending`, `"T2"` | `{ pending, null }` (cleared; `now` ignored) |
| 7  | `paid`/`"T1"` → `skipped`, `"T2"` | `{ skipped, null }` |
| 8  | `paid`/`"T1"` → `carried-over`, `"T2"` | `{ carried-over, null }` |
| 9  | `skipped`/`null` → `paid`, `"T3"` | `{ paid, "T3" }` (re-enters; paidAt set) |
| 10 | `carried-over`/`null` → `paid`, `"T4"` | `{ paid, "T4" }` (allowed; paidAt set) |
| 11 | `paid`/`"T1"` → `paid`, `"T5"` | `{ paid, "T1" }` (no status change ⇒ no re-stamp) |
| 12 | `pending`/`null` → `skipped`, `"T6"` | `{ skipped, null }` (paidAt stays null) |
| 13 | `pending`/`null` → `carried-over`, `"T7"` | `{ carried-over, null }` (inert label) |
| 14 | `paid` → `pending` → `paid` (`"T1"` then `"T8"`) | final `paidAt` is `"T8"` (fresh stamp on re-pay) |
| 15 | **Invariant** — for every row above, `result.paidAt != null` ⟺ `result.status === 'paid'` | holds |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/domain/envelope.ts` exists in `@nafios/finance`; the full public surface in §2 (`EnvelopeStatus`, `ENVELOPE_STATUSES`, `Envelope`, `countsTowardCol`, `EnvelopeStatusState`, `applyStatusTransition`) is re-exported from `src/index.ts`; wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `EnvelopeStatus` is exactly `'pending' | 'paid' | 'skipped' | 'carried-over'` with the hyphenated domain literal; a doc-comment records the `'carried-over' ↔ carried_over` DB-label seam and that the translation lives in the EF3.8 data-layer mapper, not here. `ENVELOPE_STATUSES` lists the four members in display order.
- [ ] **AC3** — `Envelope` matches §2 / EF1.2 §5.2: `amount`/`originalAmount: Money`, `paidAt`/`paymentSource`/`remark`/`linkedPerson`/`templateId`/`carriedFromEnvelopeId`/`carryOverReason` nullable, plain-`string` ids, `category` required; **no `derivedMetrics`, no `obligationKind`** field (§4.3, Notes).
- [ ] **AC4** — `countsTowardCol` returns `true` for `pending`/`paid`, `false` for `skipped`/`carried-over`, and is the **only** definition of the COL-contributing set (EF3.2 consumes it — never re-implements).
- [ ] **AC5** — `applyStatusTransition` implements the `paidAt` rule: set to `now` on → `paid` (from a non-paid status), cleared to `null` on → any non-`paid` status, unchanged on a `paid → paid` no-op; `paid → pending → paid` yields a fresh `now`. It reads no clock and never throws.
- [ ] **AC6** — On every result of `applyStatusTransition`, the invariant `paidAt != null ⟺ status === 'paid'` holds (mirrors DB `ck_env_paid_at`).
- [ ] **AC7** — In EF3, → `carried-over` sets status only: no `carryOverReason`, no routing, no locking; `carryOverReason` is untouched and stays `null`. Reverting from `carried-over` is unrestricted.
- [ ] **AC8** — Every row of the §6 matrix passes as a unit test; the Jan 2027 contributing set sums to `"4307.28"`; `bun run check` is green across the workspace.
- [ ] **AC9** — **Boundary stays pure:** `src/domain/envelope.ts` imports only EF3.1's `Money`; no `@supabase/supabase-js`, no `@nafios/db`, no `src/internal/`, no clock/env/`fetch`; the eslint import-boundary rule stays green.

---

## 8. Notes / decisions

1. **COL-contribution rule owned here — the epic's cross-ticket decision.** `countsTowardCol` is the single home for the `pending`+`paid` set. EF3.2 filters through it; the data and web layers call it too. If the contributing set ever changes, it changes here and every consumer follows. This is the counterpart to EF3.2's stance that it names `'pending'` directly only for the *Outstanding* subset (a narrower, different question the metrics engine owns).
2. **`paidAt` transition is a pure resolver, not a mutator.** `applyStatusTransition` returns a new `(status, paidAt)` pair; it does not mutate an `Envelope` or touch a DB. The EF3.8 set-status command reads the current pair off the row, calls this, and writes the result — after gating on `isLedgerMutable` (EF3.2). Keeping the rule pure is what lets the whole `paidAt`↔`paid` invariant be unit-tested without a clock or a database.
3. **`carried-over` is a status label in EF3, not a mechanism.** The mandatory `carryOverReason` prompt, template-panel routing, `carriedFromEnvelopeId` back-references, and acted-on locking (RFC-018, `monthly-ledger.md` §4) are the carry-over subsystem — **deferred** (epic Out of scope). In EF3, `carried-over` behaves exactly like `skipped` for metrics (both drop out of COL) and is fully revertible. Flagged so none of the carry-over machinery is "helpfully" pulled in here.
4. **`obligationKind` is deliberately omitted.** The DB column exists but is Phase-2 reserved and always null (EF1.6, `finance-domain-spec.md` §6.1), and the epic lists obligation-kind as out of scope. Following EF3.2's precedent of not carrying deferred surface (it refused an `amendments` field), this type omits it. Adding it in Phase 2 is a purely additive field (+ the `ObligationKind` enum) — no re-architecture, and the repository simply ignores the inert column until then.
5. **Plain-`string` ids, matching EF3.2.** EF1.2's planning draft proposed branded id types (`EnvelopeId`, `LedgerId`, …); the actual EF3 domain layer (EF3.2's `MonthlyLedger.id: string`) uses plain `string`. This ticket matches EF3.2 for consistency. `Money` and `Month` stay branded (they guard *arithmetic*, which ids don't have). Revisit brand-all-ids as one cross-cutting change if ever wanted — not piecemeal here.
6. **Timestamps stay opaque ISO strings — no Timestamp codec.** `paidAt` and `now` are plain strings; nothing in EF3 compares or arithmetics timestamps. Same decision as EF3.2 §8.4 — define a Timestamp codec alongside the first feature that needs timestamp math (e.g. settlement ordering, EF5+), not here.
7. **The type is the full canonical Envelope; EF3 just populates a subset.** Carrying `templateId`/`originalAmount`/`carriedFromEnvelopeId`/`carryOverReason` now (all null in EF3) is what makes the epic's promise real: "adding templates (EF4+) requires only writing the feature — never re-architecting the envelope model."

*Provenance (not required reading): the Envelope entity, its status enum, and the COL `pending`+`paid` rule are from `finance-domain-spec.md` §3–§5 and `monthly-ledger.md` §5–§6; the free-form transitions + `paidAt` set/clear behavior are from RFC-018 and `monthly-ledger.md` §4; the `carried-over`-as-inert-label scoping is from the EF3 epic (Scope item 3, Out of scope, Notes); the `envelope_status` enum, the `carried_over` label seam, and the `ck_env_paid_at` / `ck_env_amount_nonneg` CHECKs are from EF1.6 §4–§5 and EF1.2 §4/§5.2; the `Money` type and its helpers are from EF3.1; the `Envelope`/`EnvelopeStatus`/`countsTowardCol` seam contract and the COL-rule ownership are from EF3.2 (§2, §3, §4.1) and the EF3 epic cross-ticket decisions.*

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.3. It is the base of the EF3.2 ↔ EF3.3 stack (EF3.2 depends on it; it depends only on EF3.1). Mergeable when all of the following hold — no follow-up, no stubs, no TODOs:

- [ ] `src/domain/envelope.ts` and `tests/unit/envelope.test.ts` are present; the §2 surface is re-exported from `src/index.ts`.
- [ ] **All §7 acceptance criteria (AC1–AC9) pass**, including the Jan 2027 contributing-set sum (`"4307.28"`) and the `paidAt`↔`paid` invariant on every §6 row.
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all §6 unit tests, and the eslint domain/data import-boundary rule (AC9). This is the merge gate.
- [ ] No surface beyond §2 — in particular **no `obligationKind`**, no `carryOverReason` prompt/routing/locking, no `isOutstanding` (that subset is EF3.2's), no `Date`/clock, no row↔domain mapping (that's EF3.8).
- [ ] This ticket's Revision History is updated; the EF3.3 checkbox in `EF3.md` is ticked when merged.

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 0.1     | 2026-07-03 | NafiOS Foundation | Initial standalone task for the `Envelope` domain type + `EnvelopeStatus` enum (`ENVELOPE_STATUSES`), the COL-contribution rule (`countsTowardCol` — owned here, consumed by EF3.2), and the `paidAt` set/clear transition rule (`applyStatusTransition`, pure, caller-supplied `now`) in `@nafios/finance`'s domain layer. Full canonical Envelope shape with EF3-manual-only fields documented (`templateId`/`originalAmount`/`carriedFromEnvelopeId`/`carryOverReason` always null); `carried-over` scoped as an inert status label (no reason prompt / routing / locking — all EF4+); `paidAt`↔`paid` invariant pinned to mirror DB `ck_env_paid_at`; documents the `'carried-over' ↔ carried_over` data-layer seam (owned by EF3.8, not here). Scopes out `obligationKind` (Phase 2), branded ids (matches EF3.2's plain-`string`), Timestamp codec, the Outstanding subset (EF3.2), and row↔domain mapping (EF3.8). Verification matrix + AC1–AC9 + §9 Definition of Done (green `bun run check` as the merge gate); PR-able standalone as the base of the EF3.2 ↔ EF3.3 stack. |
</content>
</invoke>
