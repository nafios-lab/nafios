# @nafios/datetime — Specification

## Purpose

Shared, framework-agnostic **calendar-time primitives** for the NafiOS suite:
the `Month` value type and its operations, day-level calendar math, month-label
formatting, and the calendar codec error. Owned by nothing domain-specific so
any module (Finance, Budgeting, Calendar, SmartTodo, …) depends on it directly.

Pure by contract: **zero I/O, zero runtime dependencies, no clock**. Any "today"
is supplied by the caller as a `"YYYY-MM-DD"` string; this package never reads
the system clock, so every function is deterministic and trivially testable.

## Background

`Month` originated in `@nafios/finance` (EF3.1) because finance was the first
module to need a calendar month. It is, however, a generic temporal primitive —
the standard library's `Temporal.PlainYearMonth` — with no finance semantics,
and multiple modules need it. It was extracted here (2026-08); `@nafios/finance`
now depends on `@nafios/datetime` and re-exports `Month` on its own barrel to
keep its public surface stable (finance's public types reference `Month`).

The finance **creation-window resolver** deliberately stayed in `@nafios/finance`:
it is a ledger *policy* built on these primitives, not a calendar fact.

## Public API

All exports are surfaced by `src/index.ts`.

### `Month`

A calendar month held as a branded zero-padded `"YYYY-MM"` string, so
lexicographic order equals chronological order. Branded — constructible only via
`decodeMonth` or `monthOf`.

### Month codec & math

- `decodeMonth(value: string): Month` — decode a first-of-month DATE
  (`"2026-01-01"`) to `Month`. Throws `CodecError` (`month_not_a_date`) on a
  malformed / impossible date, or (`month_not_first_of_month`) when the day
  component is not `01`.
- `encodeMonth(value: Month): string` — encode to the first-of-month DATE string
  (`"2026-01"` → `"2026-01-01"`).
- `monthOf(isoDate: string): Month` — the month containing a caller-supplied
  `"YYYY-MM-DD"` date. Throws `CodecError` (`month_not_a_date`) on a bad date.
- `addMonths(value: Month, n: number): Month` — shift by `n` calendar months
  (negative = backwards), rolling the year correctly.
- `compareMonths(a: Month, b: Month): -1 | 0 | 1` — chronological comparison.

### Calendar math

- `daysInMonth(year: number, month: number): number` — leap-year-aware day count
  for a 1–12 month.

### Formatting

- `formatMonthName(month: Month): string` — month name only (`"2026-07"` →
  `"July"`).
- `formatMonthLong(month: Month): string` — name + year (`"2026-07"` →
  `"July 2026"`).

English-only by construction; the seam that would move to `Intl.DateTimeFormat`
if localization is ever required.

### Errors

- `CodecError` (`class`, `readonly code: CodecErrorCode`) — thrown by the
  `Month` decode path.
- `CodecErrorCode = "month_not_a_date" | "month_not_first_of_month"`.

This is the **calendar** codec error only. Value families in other packages
(e.g. finance's `Money`) own their own decode error; the two are independent and
never interoperate in a `catch`.

## Invariants

1. Pure — no I/O, no dependencies, no clock read.
2. `Month` is day-less and first-of-month-canonical (decode rejects day ≠ 01;
   encode always emits `-01`).
3. The barrel is the only public surface.

## Testing

`bun test` (unit) with a 90% per-file coverage gate under `--coverage`
([ADR-0020](../../adr/0020-test-coverage-scoping-and-gate.md)). The barrel and
test files are excluded from the denominator.
