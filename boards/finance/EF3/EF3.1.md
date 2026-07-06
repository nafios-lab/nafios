# EF3.1 — Money & Month codecs

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:domain`
> - `P0`
> - `size:S`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to build the two value types and their codecs — the `Money` type + codec and the `Month` type + codec — is in this file. Stack: **plain TypeScript, pure, zero I/O.** They live in `@nafios/finance`'s **domain layer** (`src/domain/`) — no Supabase, no `@nafios/db`, no `fetch`, no clock access. **No ORM / no Drizzle. No schema changes** (EF3 consumes the EF1 schema unchanged).
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, green `bun run check`). These are the **first two domain types to land in `src/domain/`**, deferred here from EF2. They are the foundation every later EF3 domain ticket sits on: the metrics engine (EF3.2), the envelope model (EF3.3), the openable-month resolver (EF3.4), and the ledger repository's month handling (EF3.6) all consume them. Build these first.

---

## 1. What you're building

Two pure **value types** and the codecs that convert them to/from the raw shapes the database uses. Both are framework-agnostic, side-effect-free TypeScript in `src/domain/`.

**Why they exist — the problem each solves:**

1. **`Money`.** Finance stores money as Postgres `numeric(12,2)` (EF1.1 §4). The Supabase JS SDK reads `numeric` as a **string** (e.g. `"7152.35"`), *never* a JS `number` — because floating-point can't hold decimal money exactly (`0.1 + 0.2 !== 0.3`). Every ticket that touches money (the metrics engine, envelope amounts, COL summation) must convert that string into something it can do **exact** arithmetic on, and back again for writes. Doing this ad-hoc in each ticket is how float drift and rounding bugs get in. This ticket defines the **one** money value type and the **only** sanctioned way to combine money values, so nothing downstream ever reaches for `+` on a raw number.

2. **`Month`.** A ledger is identified by its month (`2026-01`), but the `monthly_ledger.month` column stores it as a **first-of-month `DATE`** (`2026-01-01`), guarded by `CHECK (month = date_trunc('month', month))` (EF1.1 §5, `monthly-ledger.md` §2). The domain needs a type that represents "a calendar month" cleanly, converts to/from that first-of-month `DATE`, and can be ordered and shifted (next/previous month) without pulling in a date library or tripping over time zones. This ticket **owns the first-of-month invariant** — it is enforced in one place (this codec) and relied on everywhere else.

> **Cross-ticket decision (from the EF3 epic).** The first-of-month `DATE` handling for `month` is **owned by the Month codec (this ticket)** and consumed by the openable-month resolver (EF3.4) and the ledger repository (EF3.6). The exact-arithmetic-on-money rule is **owned by the Money codec (this ticket)** and consumed by the metrics engine (EF3.2) and the envelope COL sum (EF3.3). Neither invariant is re-implemented anywhere else.

---

## 2. Public API / contract

Exact TS signatures. These names are the contract every later ticket imports — keep them stable. Barrel-exported from `src/index.ts`; implementations live in `src/domain/`.

```ts
// ─────────────────────────────── Money ───────────────────────────────

/**
 * An exact money amount, held internally as a whole number of CENTS (minor units).
 * Branded so a raw `number` can never be passed where `Money` is expected — the only
 * ways to make one are decodeMoney / moneyFromCents / the arithmetic helpers below.
 * Single-currency (finance is single-currency in M1) — Money carries no currency code.
 */
export type Money = number & { readonly __brand: 'Money' };

export const ZERO_MONEY: Money; // 0 cents

/**
 * DB READ PATH. Decode a numeric(12,2) value as it arrives from the SDK — always a
 * string, e.g. "7152.35", "0.00", "-12.50". Returns Money (cents).
 * Throws CodecError when the input is not a valid numeric(12,2) string:
 *   - not numeric / malformed
 *   - more than 2 decimal places (a numeric(12,2) column can never emit this)
 *   - magnitude exceeds numeric(12,2) range (|value| > 9,999,999,999.99)
 */
export function decodeMoney(dbValue: string): Money;

/**
 * DB WRITE PATH. Encode Money to the canonical numeric(12,2) string the DB expects:
 * always exactly 2 decimal places, no thousands separators, no currency symbol.
 *   715235 (cents) -> "7152.35"   |   -1250 -> "-12.50"   |   0 -> "0.00"
 */
export function encodeMoney(value: Money): string;

/** Low-level exact constructor from an integer number of cents. Throws CodecError on a
 *  non-integer or out-of-range value. Used by the helpers below and by test fixtures. */
export function moneyFromCents(cents: number): Money;

/** Escape hatch to the raw integer cents (rarely needed outside this module). */
export function toCents(value: Money): number;

// The ONLY sanctioned way to combine money. All exact (integer arithmetic on cents).
export function addMoney(a: Money, b: Money): Money;
export function subtractMoney(a: Money, b: Money): Money;   // result MAY be negative
export function sumMoney(values: readonly Money[]): Money;   // returns ZERO_MONEY for []
export function compareMoney(a: Money, b: Money): -1 | 0 | 1; // chronological/numeric order
export function isNegativeMoney(value: Money): boolean;

// ─────────────────────────────── Month ───────────────────────────────

/**
 * A calendar month, e.g. Jan 2026. Held as a zero-padded "YYYY-MM" string, so
 * lexicographic order == chronological order. Branded — build one only via
 * decodeMonth or monthOf.
 */
export type Month = string & { readonly __brand: 'Month' };

/**
 * DB READ PATH. Decode a first-of-month DATE as it arrives from the SDK ("2026-01-01")
 * into Month. Throws CodecError if the value is not a valid ISO date OR its day
 * component is not 01 (the first-of-month invariant — mirrors the DB CHECK).
 */
export function decodeMonth(dbValue: string): Month;

/** DB WRITE PATH. Encode Month to the first-of-month DATE string the column expects:
 *  "2026-01" -> "2026-01-01". */
export function encodeMonth(value: Month): string;

/**
 * The Month that CONTAINS a given calendar date. `isoDate` is a "YYYY-MM-DD" string —
 * the CALLER supplies it (e.g. "today"); the codec never reads the clock, so it stays pure.
 *   monthOf("2026-01-15") -> "2026-01"
 */
export function monthOf(isoDate: string): Month;

/** Shift a Month by n calendar months (negative = backwards), rolling the year correctly.
 *  addMonths("2026-12", 1) -> "2027-01"   |   addMonths("2026-01", -1) -> "2025-12" */
export function addMonths(value: Month, n: number): Month;

/** Chronological comparison. */
export function compareMonths(a: Month, b: Month): -1 | 0 | 1;

// ─────────────────────────────── Errors ──────────────────────────────

/** Thrown by the decode/construct functions above on malformed or out-of-range input.
 *  `code` distinguishes the failure so callers (or the UI parse path) can branch. */
export class CodecError extends Error {
  readonly code:
    | 'money_not_numeric'
    | 'money_too_many_decimals'
    | 'money_out_of_range'
    | 'money_not_integer_cents'
    | 'month_not_a_date'
    | 'month_not_first_of_month';
}
```

---

## 3. Package placement, layer & exports

Both codecs are **pure domain code** and land in `@nafios/finance`'s domain layer (the layer that must never import Supabase, `@nafios/db`, or `src/internal/` — enforced by the EF2 eslint import-boundary rule).

```
packages/finance/
├── src/
│   ├── index.ts            # barrel: re-exports the Money + Month public surface (§2)
│   ├── domain/
│   │   ├── money.ts        # Money type, decode/encode, arithmetic
│   │   ├── month.ts        # Month type, decode/encode, monthOf/addMonths/compareMonths
│   │   └── codec-error.ts  # CodecError
│   └── internal/           # (the data layer calls decode on read / encode on write — later tickets)
└── tests/
    └── unit/
        ├── money.test.ts   # the §6 Money matrix
        └── month.test.ts   # the §6 Month matrix
```

- **Zero I/O, zero dependencies.** No `@supabase/supabase-js`, no `@nafios/db`, no `Date.now()` / argless `new Date()` / `fetch` / env access. If a codec needs "now", the caller passes it in as a string (see `monthOf`). This is what keeps the domain layer pure and the lint boundary green.
- **Barrel is the only surface.** Everything in §2 is re-exported from `src/index.ts`; the data layer and (later) the web app import from `@nafios/finance`, never a deep path.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep these wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 Money

1. **Internal representation is integer cents.** `Money` is a branded `number` holding whole cents (minor units) — `"7152.35"` ⇒ `715235`. Integer arithmetic is exact, so `addMoney` / `subtractMoney` / `sumMoney` never drift. **No floating-point money math anywhere** — that's the whole point of the type.
2. **Safe-integer range is guaranteed.** `numeric(12,2)`'s max magnitude is `9,999,999,999.99` = `999,999,999,999` cents (~10¹²), comfortably inside `Number.MAX_SAFE_INTEGER` (~9.007×10¹⁵). Decode/`moneyFromCents` reject anything outside `±9,999,999,999.99`, so cents can never lose precision as a JS `number`.
3. **Decode is strict.** `decodeMoney` accepts only what a `numeric(12,2)` column can actually emit: an optional leading `-`, digits, an optional `.` with **at most 2** fractional digits. `"1"`, `"1.5"`, `"1.50"`, `"-12.5"`, `"0"`, `"0.00"` are valid; `"1.005"` (3 dp), `"1,000.00"` (separator), `"$5"`, `"abc"`, `""`, `"NaN"`, `"Infinity"` are `CodecError`. A malformed DB value is a data-integrity/programming error, not user input — throwing is correct here (user-typed input is handled on the UI parse path — see Notes).
4. **Encode is canonical and total.** `encodeMoney` always emits exactly 2 decimals, no separators, no symbol, with a leading `-` for negatives. `decodeMoney(encodeMoney(m)) === m` for every valid `Money` (round-trip identity).
5. **Negatives are allowed by the type.** `subtractMoney` can go negative (e.g. `ASM Contribution = Opening − COL` when overspent — `monthly-ledger.md` §5). The non-negativity of *stored* columns (`opening_balance`, `max_capped`) is enforced by DB CHECKs (EF1.1), **not** by `Money`. `Money` is a neutral numeric value type; `isNegativeMoney` is the query the negative-ASM banner (EF3.13) uses.
6. **Arithmetic is the only combine path.** `addMoney` / `subtractMoney` / `sumMoney` / `compareMoney` are the sanctioned operations; `sumMoney([])` is `ZERO_MONEY` (so an envelope-free ledger totals COL 0 — EF3.2). No division/percentage helper ships here (nothing in EF3 needs it — the config/`percentage_of_opening` layer is dropped from EF3); a rounding policy would be defined with the first feature that divides money.

### 4.2 Month

1. **Owns the first-of-month invariant.** `decodeMonth` throws `CodecError('month_not_first_of_month')` if the incoming DATE's day is not `01`, and `encodeMonth` always emits day `01`. This mirrors the DB `CHECK (month = date_trunc('month', month))` (EF1.1 §5) in the domain, in **one** place. EF3.4 and EF3.6 rely on it and never re-check it.
2. **Representation is `"YYYY-MM"`, zero-padded.** Lexicographic order equals chronological order, so `compareMonths` is a plain string compare and range checks are trivial. It's JSON-friendly and time-zone-free (no `Date` instance, no midnight-UTC drift).
3. **Pure — no clock.** `monthOf` takes the date as a `"YYYY-MM-DD"` string the caller supplies; the codec never calls `Date.now()` / `new Date()`. This is what lets the openable-month resolver (EF3.4) be a pure, fully-testable function of `today`.
4. **`addMonths` rolls the year.** Month arithmetic normalizes correctly across year boundaries in both directions (`"2026-12" +1 → "2027-01"`, `"2026-01" −1 → "2025-12"`). No day component is involved, so there is no end-of-month clamping to worry about.
5. **Input validation.** `decodeMonth` / `monthOf` reject non-ISO or impossible dates (`"2026-13-01"`, `"2026-02-30"`, `"2026-1-1"`, `""`) with `CodecError`. `monthOf` accepts any valid day (`"2026-01-15"`) and returns its month.

---

## 5. Worked example — the Jan 2027 metrics anchor

This is the reference the whole EF3 metrics engine (EF3.2) is verified against. It must reproduce **to the cent** using only these codecs — proving the codecs are correct *before* EF3.2 depends on them.

```ts
const opening  = decodeMoney('7152.35'); // 715235 cents
const col      = decodeMoney('4307.28'); // 430728 cents  (COL — summed from envelopes in EF3.2/EF3.3)
const maxCap   = decodeMoney('6415.00'); // 641500 cents

const healthMargin    = subtractMoney(maxCap, col);   // 641500 - 430728 = 210772
const asmContribution = subtractMoney(opening, col);  // 715235 - 430728 = 284507

encodeMoney(healthMargin);    // => "2107.72"   ✅ Health Margin
encodeMoney(asmContribution); // => "2845.07"   ✅ ASM Contribution

// COL is a sum of envelope amounts, done exactly, never as floats:
sumMoney([decodeMoney('1200.00'), decodeMoney('3107.28')]); // => 430728  ("4307.28")
sumMoney([]);                                               // => ZERO_MONEY ("0.00")

// Month round-trip + arithmetic (window resolver / repository rely on this):
const jan = decodeMonth('2027-01-01'); // "2027-01"
encodeMonth(jan);                      // => "2027-01-01"
encodeMonth(addMonths(jan, 1));        // => "2027-02-01"
monthOf('2027-01-15');                 // => "2027-01"
compareMonths(decodeMonth('2026-12-01'), jan); // => -1  (Dec 2026 < Jan 2027)
```

---

## 6. Verification matrix (unit tests)

Encode these as unit tests in `tests/unit/money.test.ts` and `tests/unit/month.test.ts` so `bun run check` enforces them. Pure functions — no DB, no fixtures needed.

**Money**

| #  | Action | Expected |
|----|--------|----------|
| 1  | `decodeMoney('7152.35')` then `toCents` | `715235` |
| 2  | `decodeMoney('0')`, `decodeMoney('0.00')` | both `ZERO_MONEY` (`0`) |
| 3  | `decodeMoney('-12.5')` then `encodeMoney` | `"-12.50"` |
| 4  | `encodeMoney(decodeMoney(s))` for `s ∈ {"7152.35","0.00","-12.50","9999999999.99"}` | equals the input `s` (round-trip) |
| 5  | `decodeMoney('1.005')` | ❌ `CodecError('money_too_many_decimals')` |
| 6  | `decodeMoney('1,000.00')`, `'$5'`, `'abc'`, `''`, `'NaN'`, `'Infinity'` | ❌ `CodecError('money_not_numeric')` |
| 7  | `decodeMoney('10000000000.00')` (> range) | ❌ `CodecError('money_out_of_range')` |
| 8  | `moneyFromCents(1.5)` (non-integer) | ❌ `CodecError('money_not_integer_cents')` |
| 9  | `addMoney(decodeMoney('0.10'), decodeMoney('0.20'))` then `encodeMoney` | `"0.30"` (exact — the classic float trap) |
| 10 | `subtractMoney(decodeMoney('4307.28'), decodeMoney('7152.35'))` then `encodeMoney` | `"-2845.07"` (negatives allowed) |
| 11 | `sumMoney([])` / `sumMoney([m])` | `ZERO_MONEY` / `m` |
| 12 | `sumMoney(['1200.00','3107.28'].map(decodeMoney))` then `encodeMoney` | `"4307.28"` |
| 13 | `compareMoney` on `<`, `=`, `>` pairs | `-1`, `0`, `1` |
| 14 | `isNegativeMoney` on `-0.01`, `0.00`, `0.01` | `true`, `false`, `false` |

**Month**

| #  | Action | Expected |
|----|--------|----------|
| 1  | `decodeMonth('2027-01-01')` | `"2027-01"` |
| 2  | `encodeMonth(decodeMonth('2027-01-01'))` | `"2027-01-01"` (round-trip) |
| 3  | `decodeMonth('2027-01-15')` | ❌ `CodecError('month_not_first_of_month')` |
| 4  | `decodeMonth('2026-13-01')`, `'2026-02-30'`, `'2026-1-1'`, `''` | ❌ `CodecError('month_not_a_date')` |
| 5  | `monthOf('2027-01-15')` / `monthOf('2027-01-01')` | both `"2027-01"` |
| 6  | `addMonths(decodeMonth('2026-12-01'), 1)` | `"2027-01"` |
| 7  | `addMonths(decodeMonth('2026-01-01'), -1)` | `"2025-12"` |
| 8  | `addMonths(decodeMonth('2026-06-01'), 12)` | `"2027-06"` |
| 9  | `compareMonths` on `2026-12` vs `2027-01`, equal, reverse | `-1`, `0`, `1` |
| 10 | `[...].sort(compareMonths)` is chronological | ordered correctly |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/domain/money.ts`, `src/domain/month.ts`, and `src/domain/codec-error.ts` exist in `@nafios/finance`; the full public surface in §2 is re-exported from `src/index.ts`; wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `Money` is a branded integer-cents value type; `decodeMoney` / `encodeMoney` are exact inverses (round-trip identity), decode is strict (§4.1 rules 3), and range/scale are enforced (§4.1 rules 2–3).
- [ ] **AC3** — `addMoney` / `subtractMoney` / `sumMoney` / `compareMoney` are exact (integer arithmetic), `subtractMoney` may return a negative `Money`, and `sumMoney([]) === ZERO_MONEY`. No float math is used anywhere.
- [ ] **AC4** — `Month` is a branded `"YYYY-MM"` value type; `decodeMonth` / `encodeMonth` round-trip; the **first-of-month invariant is enforced here** (decode rejects day ≠ 01; encode always emits day 01), mirroring EF1.1's DB CHECK.
- [ ] **AC5** — `monthOf`, `addMonths`, `compareMonths` behave per §4.2; the codecs read no clock and take `today`/dates as caller-supplied strings (pure).
- [ ] **AC6** — The §5 Jan 2027 anchor reproduces `"2107.72"` (Health Margin) and `"2845.07"` (ASM Contribution) to the cent via the codecs alone.
- [ ] **AC7** — Every row of both §6 matrices passes as a unit test; `bun run check` is green.
- [ ] **AC8** — **Boundary stays pure:** `src/domain/money.ts` / `month.ts` / `codec-error.ts` import no `@supabase/supabase-js`, no `@nafios/db`, no `src/internal/`, and use no clock/env/`fetch`; the eslint import-boundary rule stays green.

---

## 8. Notes / decisions

1. **Money representation = integer cents (branded `number`).** Chosen over (a) a decimal library (`big.js`/`decimal.js` — adds a dependency to a layer we deliberately keep zero-dep) and (b) a branded decimal string (arithmetic would re-parse on every op and invite float footguns). Integer cents give exact math with plain `+`/`−`, fit safely in a JS `number` for the full `numeric(12,2)` range (§4.1 rule 2), and serialize cleanly. **This is the primary decision to confirm** — if the team later needs multi-currency or division-heavy money math, revisit here; it's a contained change behind the branded type.
2. **Month representation = `"YYYY-MM"` branded string.** Chosen over a `{ year, month }` object (more allocation, needs a custom comparator) and over a `Date` instance (time-zone/midnight-UTC hazards). Lexicographic == chronological ordering makes `compareMonths` and range queries trivial. Confirm.
3. **Decode throws; user input is a separate concern.** Malformed *DB* values are integrity errors → throwing `CodecError` is right. The create form (EF3.12) takes *user-typed* strings, where a thrown error would be a poor UX. A thin `safeParseMoney(input): { ok: true; value: Money } | { ok: false; error: CodecError }` wrapper for that path is a **reasonable addition when EF3.12 lands** — not built here to avoid over-scoping the codec. Flagged so it isn't reinvented.
4. **No display/locale formatting here.** Currency symbols, thousands separators, and locale formatting are a **web/UI concern** (EF3.13) — `encodeMoney` only produces the canonical DB string. Keeping presentation out of the codec keeps the domain layer pure and single-currency-agnostic.
5. **No division / rounding policy in EF3.1.** Nothing in EF3 divides money (the `percentage_of_opening` config path is dropped from EF3 — see the epic). If a later capability needs it, define the rounding rule (e.g. banker's rounding) alongside that feature, in this module.
6. **Codecs are the seam, the data layer is the caller.** Repositories (EF3.6/EF3.8) call `decodeMoney`/`decodeMonth` when mapping a DB row → domain and `encodeMoney`/`encodeMonth` when mapping domain → an insert/update. The codecs themselves never touch the SDK.

*Provenance (not required reading): the `numeric(12,2)` money convention and "read as string" note are from EF1.1 §4; the first-of-month `DATE` + `CHECK (month = date_trunc('month', month))` invariant is from EF1.1 §5 and `monthly-ledger.md` §2; the Jan 2027 metrics anchor and the derived-metric formulas are from the EF3 epic and `monthly-ledger.md` §5; the "codecs live in `src/domain/`, deferred from EF2" placement is from EF2.md Notes and EF2.1 §7.*

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 0.1     | 2026-07-02 | NafiOS Foundation | Initial standalone task for the `Money` (branded integer-cents) and `Month` (branded `YYYY-MM`) value types + codecs in `@nafios/finance`'s domain layer: decode/encode contracts, exact money arithmetic (`add`/`subtract`/`sum`/`compare`), month arithmetic (`monthOf`/`addMonths`/`compareMonths`), the first-of-month invariant owned here, the Jan 2027 metrics anchor, unit-test matrices, and acceptance criteria. First domain types to land in `src/domain/` (deferred from EF2). |
