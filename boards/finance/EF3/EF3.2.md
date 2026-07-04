# EF3.2 — MonthlyLedger type + derived-metrics engine (verified to the cent)

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:domain`
> - `P0`
> - `size:S`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the `MonthlyLedger` domain type, its status model, and the **derived-metrics engine** (COL, Health Margin, ASM Contribution, Outstanding, and the negative-ASM signal) is in this file. Stack: **plain TypeScript, pure, zero I/O.** It lives in `@nafios/finance`'s **domain layer** (`src/domain/`) — no Supabase, no `@nafios/db`, no `fetch`, no clock access. **No ORM / no Drizzle. No schema changes** (EF3 consumes the EF1 schema unchanged).
>
> **Depends on:**
> - **EF3.1** (Money & Month codecs) — the engine does all money math through `Money` (`subtractMoney`, `sumMoney`, `ZERO_MONEY`, `isNegativeMoney`) and identifies the month with `Month`. No float math anywhere.
> - **EF3.3** (Envelope type) for the **seam only**: the `EnvelopeStatus` enum, the `countsTowardCol` predicate, and the `Envelope` type. The COL-contribution rule (only `pending`+`paid` count) is **owned by EF3.3** and consumed here — it is never re-implemented in this engine.
>
> **Build-order & PR readiness (read this).** The epic lists EF3.2 before EF3.3 because it groups by concept (ledger before its line item), but the *compile/test* dependency runs **EF3.2 → EF3.3**: this engine imports `EnvelopeStatus`, `countsTowardCol`, and `Envelope`. So this ticket is **PR-able the moment EF3.3's status seam exists** — merge it one of two clean ways, both of which leave `bun run check` green (see §9):
> 1. **Stacked PR (preferred):** EF3.3 merges first; EF3.2's PR branches off it. When "completed," EF3.2 is a green, self-contained PR closing this issue.
> 2. **Co-merged PR:** EF3.2 + EF3.3 ship in one PR (both are small, pure `src/domain/` tickets in the same layer).
>
> Either way, **do not stub or duplicate the EF3.3 seam inside EF3.2.** If you pick this up before EF3.3 is written, implement EF3.3's `EnvelopeStatus` + `countsTowardCol` + `Envelope` *as EF3.3* first — they stay owned there.
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, green `bun run check`).

---

## 1. What you're building

The **MonthlyLedger domain type** — the in-memory shape the whole finance app works with for a month — plus the **pure derived-metrics engine** that turns a ledger into the numbers the user sees: COL, Health Margin, ASM Contribution, Outstanding, and the negative-ASM signal. Framework-agnostic, side-effect-free TypeScript in `src/domain/`.

**Why it exists — the problem it solves:**

The four headline numbers on every ledger surface (`monthly-ledger.md` §5) are **derived, never stored** — recomputed live on every read. They are the single most correctness-sensitive thing in the product: the spec states outright that *"any implementation that produces different numbers for the same inputs is wrong by definition."* Two of them — **Health Margin** (`MaxCapped − COL`, a discipline gauge) and **ASM Contribution** (`Opening − COL`, real money) — look almost identical and were the *most consequential error in the v0.1 drafting process* (their meanings were once swapped). This ticket pins both formulas down in **one** pure function, verified to the cent against the Jan 2027 reference, so nothing downstream (the ledger view EF3.13, the repository's computed-metrics read EF3.10) ever re-derives them by hand and re-introduces the drift.

It also defines the **`MonthlyLedger` domain type + status model** — the canonical shape the repository (EF3.6/EF3.10) decodes DB rows into, the create command (EF3.7) produces, and the web layer (EF3.11–EF3.14) renders.

> **Cross-ticket decision (from the EF3 epic).** The COL-contribution rule (only `pending`+`paid` envelopes count) lives **once**, in the Envelope domain model (EF3.3), and is **consumed** by this metrics engine. This engine filters via EF3.3's `countsTowardCol` — it does **not** hardcode the `pending`/`paid` set. The rule is never re-implemented in the data or web layers.

---

## 2. Public API / contract

Exact TS signatures. These names are the contract every later ticket imports — keep them stable. Barrel-exported from `src/index.ts`; implementations live in `src/domain/`.

```ts
import type { Money, Month } from './money'; // + Month codec (EF3.1)
import type { Envelope, EnvelopeStatus } from './envelope'; // EF3.3 (the seam — see §3)

// ─────────────────────────── MonthlyLedger ───────────────────────────

/** A ledger's lifecycle state. `ongoing` (active working month) → `reconciling`
 *  (parked for finalization) → `settled` (locked, immutable). Mirrors the
 *  `ledger_status` DB enum (EF1.1). */
export type LedgerStatus = 'ongoing' | 'reconciling' | 'settled';

/**
 * One calendar month of cashflow — the primary unit of work in finance
 * (monthly-ledger.md §1). The in-memory domain shape; repositories (EF3.6/EF3.10)
 * decode DB rows into this via the EF3.1 codecs.
 *
 * `openingBalance` / `maxCapped` are Money (EF3.1); `month` is Month (EF3.1).
 * `createdAt` / `settledAt` are opaque ISO-8601 timestamp strings as the SDK
 * returns them — the domain does no timestamp arithmetic in EF3, so no Timestamp
 * codec ships (see Notes). `derivedMetrics` is NOT a field: it is computed on read
 * by computeLedgerMetrics, never stored (monthly-ledger.md §2, §5).
 */
export interface MonthlyLedger {
  readonly id: string;                       // uuid PK
  readonly month: Month;                     // the calendar month this ledger covers
  readonly openingBalance: Money;            // income to allocate this month
  readonly maxCapped: Money;                 // self-imposed spending ceiling
  readonly status: LedgerStatus;
  readonly envelopes: readonly Envelope[];   // all line items (EF3.3)
  readonly createdAt: string;                // ISO-8601 timestamptz, opaque
  readonly settledAt: string | null;         // set iff status === 'settled'
}

/** True while the ledger's envelopes/amounts may still change (`ongoing` or
 *  `reconciling`); false once `settled` (locked, immutable — monthly-ledger.md §3).
 *  Part of the status model. Does NOT perform transitions — see Notes. */
export function isLedgerMutable(status: LedgerStatus): boolean;

// ─────────────────────────── Derived metrics ─────────────────────────

/** "What's left to handle this month" — the count and summed amount of the
 *  `pending` envelopes only (monthly-ledger.md §5). `paid` is done, so it is
 *  NOT outstanding even though it counts toward COL. */
export interface Outstanding {
  readonly count: number;   // number of pending envelopes
  readonly total: Money;    // Σ(amount) over pending envelopes; ZERO_MONEY if none
}

/** The live derived metrics for one ledger. All money values are exact Money.
 *  Computed on read, never stored. */
export interface LedgerMetrics {
  readonly col: Money;             // Σ(amount) where status is pending or paid
  readonly healthMargin: Money;    // MaxCapped − COL  (may be negative = over ceiling)
  readonly asmContribution: Money; // Opening − COL    (may be negative = overspend)
  readonly outstanding: Outstanding;
  readonly isAsmNegative: boolean; // asmContribution < 0 → drives the persistent banner (EF3.13)
}

/**
 * THE metrics engine. Pure: same inputs → same outputs, no I/O, no clock.
 * Status-agnostic — it reads only balances + envelopes, so it computes the same
 * numbers whether the ledger is ongoing, reconciling, or settled.
 *
 * COL is summed via EF3.1's sumMoney over the envelopes EF3.3's countsTowardCol
 * accepts (pending + paid). Health Margin / ASM Contribution via subtractMoney
 * (both MAY be negative). Outstanding counts the `pending` subset only.
 *
 * Accepts any object with the metrics-relevant fields, so a full MonthlyLedger
 * satisfies it and test fixtures can be minimal.
 */
export function computeLedgerMetrics(ledger: {
  readonly openingBalance: Money;
  readonly maxCapped: Money;
  readonly envelopes: readonly { readonly amount: Money; readonly status: EnvelopeStatus }[];
}): LedgerMetrics;
```

---

## 3. Package placement, layer & exports

Pure **domain code** — lands in `@nafios/finance`'s domain layer (the layer that must never import Supabase, `@nafios/db`, or `src/internal/` — enforced by the EF2 eslint import-boundary rule).

```
packages/finance/
├── src/
│   ├── index.ts              # barrel: re-exports the §2 surface (alongside EF3.1 / EF3.3)
│   ├── domain/
│   │   ├── money.ts          # Money + Month codecs (EF3.1) — consumed here
│   │   ├── envelope.ts       # Envelope, EnvelopeStatus, countsTowardCol (EF3.3) — the seam
│   │   ├── monthly-ledger.ts # MonthlyLedger, LedgerStatus, isLedgerMutable  ← this ticket
│   │   └── ledger-metrics.ts # Outstanding, LedgerMetrics, computeLedgerMetrics  ← this ticket
│   └── internal/             # (EF3.6/EF3.10 repositories call computeLedgerMetrics on read — later tickets)
└── tests/
    └── unit/
        ├── ledger-metrics.test.ts # the §6 metrics matrix (incl. Jan 2027 anchor)
        └── monthly-ledger.test.ts # isLedgerMutable + status-model assertions
```

- **The EF3.3 seam.** This engine imports exactly three things from the envelope model: the `EnvelopeStatus` type, the `Envelope` type (for `MonthlyLedger.envelopes`), and the `countsTowardCol(status)` predicate. It imports **nothing else** from EF3.3 and re-implements **no** envelope rule. Because of this, EF3.3's status contract must exist for this ticket to compile and be tested — land it stacked on or co-merged with EF3.3 (the epic's 3.2-before-3.3 order is conceptual, not a build order — see the metadata build-order note and §9).
- **Zero I/O, zero new dependencies.** No `@supabase/supabase-js`, no `@nafios/db`, no `Date.now()` / argless `new Date()` / `fetch` / env access. Timestamps arrive as strings from the caller and stay strings.
- **Barrel is the only surface.** Everything in §2 is re-exported from `src/index.ts`; the data and web layers import from `@nafios/finance`, never a deep path.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep these wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 The metrics engine (`computeLedgerMetrics`)

1. **COL — the one true formula.** `COL = Σ(envelope.amount)` over every envelope where **`countsTowardCol(status)` is true** (EF3.3 owns that predicate → `pending` + `paid`). Summed with `sumMoney` (exact, integer cents). `sumMoney([])` is `ZERO_MONEY`, so a ledger with **no COL-contributing envelopes computes COL 0** (`monthly-ledger.md` §6). The engine never inspects the literal status set itself — it delegates the "which count" decision entirely to `countsTowardCol`.
2. **Health Margin = `MaxCapped − COL`** via `subtractMoney`. A **discipline gauge** — room under the self-imposed ceiling. **May be negative** (over the ceiling); that is allowed and surfaced as a red number by the UI (EF3.13), *not* by a banner.
3. **ASM Contribution = `Opening Balance − COL`** via `subtractMoney`. **Real money** — the residual that flows to savings. **May be negative** (COL exceeds income — legitimate overspend from savings). These two formulas are distinct and must not be conflated (`monthly-ledger.md` §5 "Why two metrics").
4. **Outstanding = the `pending` subset only.** `count` = number of `pending` envelopes; `total` = `sumMoney` of their amounts (`ZERO_MONEY` if none). This filter is **`status === 'pending'`**, *narrower* than the COL filter — `paid` envelopes count toward COL but are **not** outstanding (they're done).
5. **`isAsmNegative = isNegativeMoney(asmContribution)`** — strictly `< 0`. Exactly-zero ASM is **not** negative (`isNegativeMoney(0) === false`), so a ledger where COL exactly equals Opening shows **no** banner. This boolean is the single signal that drives the persistent, non-dismissible negative-ASM banner (EF3.13). The negative-Health-Margin case gets **no** dedicated flag — it's just `isNegativeMoney(metrics.healthMargin)` at the UI (see Notes).
6. **Pure and status-agnostic.** The engine reads only `openingBalance`, `maxCapped`, and `envelopes`. It does **not** branch on `ledger.status` — an `ongoing`, `reconciling`, or `settled` ledger with the same balances and envelopes yields the identical metrics. (Settlement in EF5+ will *snapshot* a computed `LedgerMetrics`; it does not change how they're computed.)
7. **No float math, ever.** Every arithmetic step is a `Money` helper from EF3.1. `0.10 + 0.20` through the engine's COL sum is exactly `"0.30"`.

### 4.2 The `MonthlyLedger` type & status model

1. **`derivedMetrics` is not a field.** COL / Health Margin / ASM / Outstanding are computed on read by `computeLedgerMetrics` and never stored on the type (`monthly-ledger.md` §2, §5). The type carries only the persisted state.
2. **`settledAt` tracks `status`.** `settledAt` is a non-null ISO string **iff** `status === 'settled'`, mirroring the EF1.1 `ck_settled_at` DB CHECK. This ticket documents the invariant on the type; the repository (EF3.6) and create/settle commands are what enforce it on write. `createdAt` is always present and immutable.
3. **Timestamps are opaque ISO strings.** `createdAt` / `settledAt` are `string` (or `null`), not `Date` — the SDK returns `timestamptz` as an ISO-8601 string and nothing in EF3 does timestamp arithmetic, so no Timestamp codec ships (see Notes). They round-trip verbatim.
4. **`isLedgerMutable` — the status model's one rule.** Returns `true` for `ongoing` and `reconciling`, `false` for `settled` (settled is locked/immutable — `monthly-ledger.md` §3). Envelope CRUD (EF3.8/EF3.14) uses it to gate edits. In EF3 only `ongoing` ledgers are actually operated (reconciling is placeholder-only per the epic), but the rule is modeled correctly here.
5. **This ticket models status; it does not transition it.** The `ongoing → reconciling` transition is performed by the create-ledger command (EF3.7); `reconciling → settled` by the settlement gate (EF5+). Neither is built here. This ticket only defines the `LedgerStatus` type and `isLedgerMutable`.

---

## 5. Worked example — the Jan 2027 metrics anchor

The reference the whole engine is verified against (`monthly-ledger.md` §5, EF3 epic Success Criteria). It must reproduce **to the cent**, using only EF3.1 codecs + EF3.3's `countsTowardCol`.

```ts
// Four envelopes — two count toward COL (pending + paid), two do not (skipped + carried-over).
const ledger = {
  openingBalance: decodeMoney('7152.35'),
  maxCapped:      decodeMoney('6415.00'),
  envelopes: [
    { amount: decodeMoney('1200.00'), status: 'pending'      }, // counts → COL; also Outstanding
    { amount: decodeMoney('3107.28'), status: 'paid'         }, // counts → COL; NOT outstanding
    { amount: decodeMoney('500.00'),  status: 'skipped'      }, // excluded from COL
    { amount: decodeMoney('250.00'),  status: 'carried-over' }, // excluded from COL
  ],
};

const m = computeLedgerMetrics(ledger);

encodeMoney(m.col);                 // => "4307.28"   (1200.00 + 3107.28 only)
encodeMoney(m.healthMargin);        // => "2107.72"   ✅ MaxCapped − COL
encodeMoney(m.asmContribution);     // => "2845.07"   ✅ Opening − COL
m.outstanding.count;                // => 1           (the single pending envelope)
encodeMoney(m.outstanding.total);   // => "1200.00"
m.isAsmNegative;                    // => false

// Empty ledger — the other acceptance anchor (monthly-ledger.md §6):
const empty = computeLedgerMetrics({ ...ledger, envelopes: [] });
encodeMoney(empty.col);             // => "0.00"      (sumMoney([]) === ZERO_MONEY)
encodeMoney(empty.asmContribution); // => "7152.35"   (ASM == Opening when COL is 0)
encodeMoney(empty.healthMargin);    // => "6415.00"   (Health Margin == MaxCapped when COL is 0)

// Structural savings floor (monthly-ledger.md §5, Case 1: MaxCapped < Opening):
// ASM − Health Margin == Opening − MaxCapped, independent of COL.
encodeMoney(subtractMoney(m.asmContribution, m.healthMargin)); // => "737.35"  (7152.35 − 6415.00)
```

> **Note — spec arithmetic slip flagged.** `monthly-ledger.md` §5 states this structural gap as **$737.07**. The anchored inputs force **$737.35** (`2845.07 − 2107.72 = 7152.35 − 6415.00 = 737.35`). `737.07` is a transposition in the prose; the engine must produce **737.35**. Recommend correcting `monthly-ledger.md` §5 in a separate spec edit — it does not change any of the four headline numbers, which are internally consistent.

---

## 6. Verification matrix (unit tests)

Encode as unit tests in `tests/unit/ledger-metrics.test.ts` and `tests/unit/monthly-ledger.test.ts` so `bun run check` enforces them. Pure functions — no DB, no fixtures needed beyond the EF3.1 codecs + EF3.3 status literals. Money assertions compare via `encodeMoney`.

**Metrics engine** (`col`/`hm`/`asm`/`out`/`neg` = the five outputs)

| #  | Ledger (opening / maxCapped / envelopes as `amount:status`) | Expected |
|----|-------------------------------------------------------------|----------|
| 1  | **Jan 2027 anchor** — 7152.35 / 6415.00 / `1200.00:pending, 3107.28:paid, 500.00:skipped, 250.00:carried-over` | col `"4307.28"`, hm `"2107.72"`, asm `"2845.07"`, out `{1, "1200.00"}`, neg `false` |
| 2  | **Empty** — 7152.35 / 6415.00 / `[]` | col `"0.00"`, hm `"6415.00"`, asm `"7152.35"`, out `{0, "0.00"}`, neg `false` |
| 3  | **Only excluded statuses** — 1000.00 / 1000.00 / `500.00:skipped, 250.00:carried-over` | col `"0.00"` (COL delegates to `countsTowardCol`) |
| 4  | **COL = pending + paid only** — 1000.00 / 1000.00 / `100.00:pending, 200.00:paid, 400.00:skipped, 800.00:carried-over` | col `"300.00"` |
| 5  | **Outstanding is `pending`-only, not `paid`** — 1000.00 / 1000.00 / `100.00:pending, 200.00:pending, 300.00:paid` | col `"600.00"`, out `{2, "300.00"}` |
| 6  | **Negative ASM** — 1000.00 / 1000.00 / `800.00:pending, 700.00:paid` (COL 1500.00) | asm `"-500.00"`, neg `true` |
| 7  | **ASM exactly zero** — 1000.00 / 1000.00 / `1000.00:paid` | asm `"0.00"`, neg `false` (0 is not negative) |
| 8  | **Negative Health Margin, positive ASM** — 2000.00 / 1000.00 / `1200.00:pending` | hm `"-200.00"`, asm `"800.00"`, neg `false` |
| 9  | **Structural gap** — Jan 2027 anchor (row 1) | `subtractMoney(asm, hm)` → `"737.35"` (== Opening − MaxCapped) |
| 10 | **Exact sum (float trap)** — 100.00 / 100.00 / `0.10:pending, 0.20:paid` | col `"0.30"` (never `"0.30000000000000004"`) |
| 11 | **Status-agnostic** — row 1 envelopes/balances, computed with `status` ∈ {`ongoing`,`reconciling`,`settled`} | identical metrics in all three |

**Status model** (`monthly-ledger.test.ts`)

| #  | Action | Expected |
|----|--------|----------|
| 12 | `isLedgerMutable('ongoing')`, `isLedgerMutable('reconciling')` | both `true` |
| 13 | `isLedgerMutable('settled')` | `false` |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/domain/monthly-ledger.ts` and `src/domain/ledger-metrics.ts` exist in `@nafios/finance`; the full public surface in §2 (`LedgerStatus`, `MonthlyLedger`, `isLedgerMutable`, `Outstanding`, `LedgerMetrics`, `computeLedgerMetrics`) is re-exported from `src/index.ts`; wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `MonthlyLedger` matches §2 / `monthly-ledger.md` §2: `month: Month`, `openingBalance`/`maxCapped: Money`, `status: LedgerStatus`, `envelopes: readonly Envelope[]`, opaque ISO-string `createdAt`/`settledAt`; **no `derivedMetrics` field** (metrics are computed, never stored).
- [ ] **AC3** — `computeLedgerMetrics` derives **COL** as `sumMoney` over envelopes accepted by EF3.3's `countsTowardCol` — it does **not** re-implement the `pending`/`paid` set; empty / no-contributing-envelope ledgers give COL `"0.00"`.
- [ ] **AC4** — `healthMargin = MaxCapped − COL` and `asmContribution = Opening − COL` via `subtractMoney`; both may be negative (rows 6, 8).
- [ ] **AC5** — `outstanding` counts and sums the **`pending`** subset only (narrower than COL — `paid` excluded); `ZERO_MONEY`/`0` when none.
- [ ] **AC6** — `isAsmNegative === isNegativeMoney(asmContribution)`: strictly `< 0`, so exactly-zero ASM is `false` (row 7).
- [ ] **AC7** — The **Jan 2027 anchor reproduces to the cent** — col `"4307.28"`, Health Margin `"2107.72"`, ASM `"2845.07"` — **and** the empty ledger gives COL `"0.00"` / ASM `"7152.35"` (= Opening) / Health Margin `"6415.00"` (= MaxCapped).
- [ ] **AC8** — `isLedgerMutable` returns `true` for `ongoing`/`reconciling`, `false` for `settled`; the engine is **status-agnostic** (row 11) — it never branches on `ledger.status`.
- [ ] **AC9** — Every row of both §6 matrices passes as a unit test; `bun run check` is green across the workspace.
- [ ] **AC10** — **Boundary stays pure:** `monthly-ledger.ts` / `ledger-metrics.ts` import only EF3.1 codecs and the EF3.3 envelope seam (`Envelope`, `EnvelopeStatus`, `countsTowardCol`); no `@supabase/supabase-js`, no `@nafios/db`, no `src/internal/`, no clock/env/`fetch`; the eslint import-boundary rule stays green.

---

## 8. Notes / decisions

1. **COL delegates to EF3.3; it is not re-derived here.** The engine calls `countsTowardCol(status)` for the COL filter. This honors the epic's cross-ticket decision that the COL-contribution rule lives once, in the Envelope model. Should the contributing set ever change, it changes in one place and this engine follows automatically. The only status literal this engine names directly is **`'pending'`** — for the *Outstanding* subset, which is genuinely a different (narrower) question than COL and is owned by the metrics engine (`monthly-ledger.md` §5).
2. **Only `isAsmNegative` is a first-class signal.** The epic calls out the negative-ASM signal specifically because it's the more severe one (real money overspent vs. a self-imposed ceiling breach). Negative Health Margin is just a red number in EF3.13, trivially `isNegativeMoney(metrics.healthMargin)` — adding a second boolean would be redundant surface. Flagged so it isn't "helpfully" added.
3. **Amendments metric is OUT of scope for EF3.** `monthly-ledger.md` §5 lists a fifth metric (Amendments = count + net delta where `amount ≠ originalAmount`), but it applies to **template-linked** envelopes only, and EF3 has **manual envelopes only** (`templateId` null, `originalAmount` null — see the epic). So there are no amendments to compute. The engine deliberately omits it; it returns with the template epic (EF4+). Do not add an `amendments` field to `LedgerMetrics` in EF3.
4. **Timestamps stay opaque ISO strings — no Timestamp codec.** Unlike `Money`/`Month`, nothing in EF3 does timestamp arithmetic or comparison, so `createdAt`/`settledAt` are plain `string`/`null` passed through verbatim. If a later capability needs to reason over timestamps (e.g. settlement ordering), define a Timestamp codec then, in `src/domain/`, alongside that feature — not here.
5. **Metrics are computed, never stored; the engine is status-agnostic.** `derivedMetrics` is not on the type (`monthly-ledger.md` §2). The repository (EF3.10) calls `computeLedgerMetrics` on read to attach live metrics. The `reconciling → settled` snapshot (EF5+) will freeze a `LedgerMetrics` value at settle time as a historical summary — that's a *storage* decision for that epic and does not change this pure engine.
6. **Roll-forward warning is NOT a ledger metric.** The "new month began with no ledger" persistent warning (`monthly-ledger.md` §3) is derived from `today` + existing ledgers, **not** from a ledger's own fields, and is owned by the openable-month/window resolver (EF3.4). It is out of scope here — do not add it to `LedgerMetrics`. The negative-ASM banner is the only warning derivable from a single ledger, and that's what `isAsmNegative` covers.
7. **This ticket does not transition status.** `ongoing → reconciling` (EF3.7) and `reconciling → settled` (EF5+) are command concerns. Here, `LedgerStatus` + `isLedgerMutable` model the states; no transition logic ships.
8. **Spec arithmetic slip surfaced (§5 note).** The structural savings floor for Jan 2027 is **$737.35**, not the `$737.07` printed in `monthly-ledger.md` §5 — a transposition in the prose. The engine must produce 737.35 (row 9). Flagged for a follow-up spec correction; it changes none of the four headline anchors.

*Provenance (not required reading): the four derived-metric formulas, the COL `pending`+`paid` rule, the Outstanding definition, the "two metrics are distinct" warning, and the Jan 2027 worked example are from `monthly-ledger.md` §5–§6 and the EF3 epic Success Criteria; the `ledger_status` enum, `settled_at ↔ settled` CHECK, and `numeric(12,2)`/first-of-month conventions are from EF1.1; the `Money`/`Month` codecs and their helpers are from EF3.1; the `Envelope`/`EnvelopeStatus`/`countsTowardCol` seam and the COL-rule ownership are from EF3.3 and the EF3 epic cross-ticket decisions.*

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.2. It is mergeable when all of the following hold — no follow-up, no stubs, no TODOs left behind:

- [ ] Both source files (`src/domain/monthly-ledger.ts`, `src/domain/ledger-metrics.ts`) and both test files (`tests/unit/monthly-ledger.test.ts`, `tests/unit/ledger-metrics.test.ts`) are present; the §2 surface is re-exported from `src/index.ts`.
- [ ] **All §7 acceptance criteria (AC1–AC10) pass**, including the Jan 2027 anchor and the empty-ledger anchor to the cent.
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all unit tests (every §6 row), and the eslint domain/data import-boundary rule (AC10). This is the merge gate.
- [ ] The EF3.3 seam is satisfied by real, EF3.3-owned code — **stacked on or co-merged with EF3.3** (see the build-order note). The engine imports `EnvelopeStatus` / `countsTowardCol` / `Envelope`; it neither stubs nor re-implements them.
- [ ] No engine field or behavior beyond §2 (in particular: **no `amendments`**, no second negativity flag, no `Date`/clock, no roll-forward — all deferred per §8).
- [ ] This ticket's Revision History is updated; the EF3.2 checkbox in `EPIC.md` is ticked when merged.

> **PR body should call out** the one spec-facing side note: the `monthly-ledger.md` §5 structural-gap figure is corrected from `$737.07` to `$737.35` (§5 note / §8.8). File that spec fix as its own small PR if not already done — it is not part of this code PR.

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 0.1     | 2026-07-02 | NafiOS Foundation | Initial standalone task for the `MonthlyLedger` domain type + status model (`LedgerStatus`, `isLedgerMutable`) and the pure derived-metrics engine (`computeLedgerMetrics` → COL, Health Margin, ASM Contribution, Outstanding, `isAsmNegative`) in `@nafios/finance`'s domain layer. Pins the COL/Health-Margin/ASM formulas to the Jan 2027 reference (verified to the cent) and the empty-ledger anchor; delegates the COL-contribution rule to EF3.3's `countsTowardCol` (never re-implemented); defines the EF3.3 build-order seam with explicit stacked-/co-merged-PR guidance and a §9 Definition of Done (green `bun run check` as the merge gate) so the ticket is independently PR-able on completion; scopes out the Amendments metric (manual-only envelopes in EF3), timestamp codecs, roll-forward (EF3.4), and status transitions (EF3.7/EF5+). Flagged the `$737.07 → $737.35` arithmetic slip in `monthly-ledger.md` §5. |
