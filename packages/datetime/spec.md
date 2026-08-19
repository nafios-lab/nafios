# @nafios/datetime — Specification

## Purpose

Shared, framework-agnostic **date & calendar-time utilities** for the NafiOS
suite: the `Month` value type and its operations, day-level calendar math,
month-label formatting, the calendar codec error, and the clock + display-format
seam (`today` / `isToday` / `formatDate` / `formatTimestamp`). Owned by nothing domain-specific so
any module (Finance, Budgeting, Calendar, SmartTodo, …) depends on it directly.

**This package is the suite's sole abstraction over `date-fns`**
([ADR-0028](../../adr/0028-datetime-sole-date-fns-seam.md)): it is the *only*
package that may import `date-fns`; every other app and package does date/time
work through this barrel and never imports `date-fns` directly (enforced by a
Biome `noRestrictedImports` guard). Centralizing the dependency here keeps the
vendor swappable and the timezone/parsing footguns handled in one place.
`@nafios/ui` is the one exemption — a Date-native design-system leaf.

The calendar *math* (the `Month` codec, `addMonths`, `compareMonths`,
`daysInMonth`) stays pure and clock-free — callers pass "today" in as a
`"YYYY-MM-DD"` string — so it remains deterministic and trivially testable. The
clock read (`today` / `isToday`) is isolated to `day.ts`: the only `new Date()`
in the package.

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

### Clock (`day.ts`)

- `today(): string` — today's local calendar day as a `"YYYY-MM-DD"` string.
  Reads the system clock (the only clock read in the package).
- `isToday(isoDate: string): boolean` — whether a `"YYYY-MM-DD"` date is today's
  local calendar day.

### Date formatting

- `formatDate(date: Date, pattern: string): string` — render a `Date` for
  display using a date-fns token pattern, in local time (e.g.
  `"EEE · d MMM · hh:mma"`). The suite's sole seam over date-fns' `format`;
  `pattern` is a date-fns token string (the one piece of date-fns that reaches
  callers — see [ADR-0028](../../adr/0028-datetime-sole-date-fns-seam.md)).
- `formatTimestamp(iso: string): string` — the suite's **one standardized
  timestamp label**. Takes an ISO-8601 *instant* string exactly as a Postgres
  `timestamptz` arrives over PostgREST / the Supabase SDK
  (`"2027-02-01T09:15:00+00:00"`, `"…Z"`, with or without fractional seconds)
  and renders `"1 Feb 2027, 5:15 PM"` in the caller's **local** time zone.
  Throws `CodecError` (`timestamp_not_a_datetime`) on anything that is not a
  parseable instant.

  It differs from `formatDate` on purpose: `formatDate` is the generic escape
  hatch (caller owns the `Date` and the pattern), whereas `formatTimestamp` owns
  **both the parse and the pattern** so every `timestamptz` in the suite reads
  identically wherever it is shown. Reach for `formatDate` only when a surface
  genuinely needs its own pattern (e.g. the shell clock).

  Two contract notes:

  - **Non-null input.** Nullable columns (`settledAt`, `paidAt`) stay the
    caller's to narrow — only the caller knows whether absence should render as
    `"—"`, `"Not yet paid"`, or nothing at all.
  - **Local time, and only for instants.** Consistent with `today` / `formatDate`
    (Invariant #1), the label is the user's own wall clock, so a UTC-midnight
    instant reads as the previous evening west of UTC. A surface that needs a
    *fixed* calendar day is looking at a `DATE` column, not a timestamp, and
    belongs on the `Month` / `"YYYY-MM-DD"` path — which is why a bare
    `"YYYY-MM-DD"` is **rejected** rather than widened to local midnight (that
    would print a `12:00 AM` the data never contained).

### Errors

- `CodecError` (`class`, `readonly code: CodecErrorCode`) — thrown by the
  `Month` decode path.
- `CodecErrorCode = "month_not_a_date" | "month_not_first_of_month" |
  "timestamp_not_a_datetime"`.

This is **this package's** codec error only — the `Month` decode path and
`formatTimestamp`'s instant parse. Value families in other packages
(e.g. finance's `Money`) own their own decode error; the two are independent and
never interoperate in a `catch`.

## Invariants

1. **The suite's only `date-fns` importer** (except `@nafios/ui`). `date-fns` is
   a dependency of this package and every consumer routes date/time work through
   this barrel — enforced by a Biome `noRestrictedImports` guard
   ([ADR-0028](../../adr/0028-datetime-sole-date-fns-seam.md)). The calendar
   *math* stays pure and clock-free (no I/O, no clock); the single `new Date()`
   lives in `day.ts`.
2. `Month` is day-less and first-of-month-canonical (decode rejects day ≠ 01;
   encode always emits `-01`).
3. The barrel is the only public surface.

## Testing

`bun test` (unit) with a 90% per-file coverage gate under `--coverage`
([ADR-0020](../../adr/0020-test-coverage-scoping-and-gate.md)). The barrel and
test files are excluded from the denominator.
