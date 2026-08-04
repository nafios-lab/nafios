# @nafios/datetime

Shared **calendar-time primitives** for the suite. Pure, framework-agnostic,
zero I/O, no clock — the value types and operations that any module dealing in
calendar months/days depends on, owned by nothing domain-specific.

Extracted from `@nafios/finance` (2026-08) once `Month` proved to be a generic
temporal primitive rather than a finance concept: it is the standard library's
`Temporal.PlainYearMonth`, and Budgeting / Calendar / SmartTodo all need it.
Finance now depends on this package and re-exports `Month` on its own barrel for
consumer ergonomics (its public types reference `Month`).

## What this package does

- **`Month`** — a calendar month as a branded zero-padded `"YYYY-MM"` string, so
  lexicographic order == chronological order (no `Date`, no time-zone / midnight-UTC
  drift). Built only via `decodeMonth` / `monthOf` (the brand is unforgeable).
- **Month codec + math** — `decodeMonth` / `encodeMonth` (the first-of-month
  DATE seam, `"2026-01" ↔ "2026-01-01"`), `monthOf` (the month containing a
  caller-supplied `"YYYY-MM-DD"`), `addMonths`, `compareMonths`.
- **`daysInMonth(year, month)`** — leap-year-aware day count (a public calendar
  fact; e.g. finance's creation-window sizes its lead-day range with it).
- **`formatMonthName` / `formatMonthLong`** — `Month` → human label (`"July"`,
  `"July 2026"`). English-only by construction; the `Intl` seam if i18n lands.
- **`CodecError` + `CodecErrorCode`** — thrown by the `Month` decode path on a
  malformed / out-of-range value (`month_not_a_date` / `month_not_first_of_month`).

## Public API surface

All public exports live in `src/index.ts` (the barrel). Consumers import
`@nafios/datetime`, never deep paths.

## Invariants

1. **Pure.** Zero I/O, zero runtime dependencies, no clock read. Callers supply
   "today" as a `"YYYY-MM-DD"` string; this package never calls `new Date()`.
2. **`Month` is day-less and first-of-month-canonical.** Decode rejects a day
   component ≠ 01; encode always emits `-01`.
3. The barrel exports **only** the public API.

## Non-obvious gotchas

- **This is the CALENDAR codec error only.** `CodecError` here carries the two
  `month_*` codes. Other value families own their own decode error — finance's
  `Money` throws `@nafios/finance`'s own `CodecError`. The two classes are
  independent and never meet in a `catch` (nothing does `instanceof` across the
  boundary), so the identical name is not a conflict.
- **`Month` != the `Temporal` global.** This package models the concept as a
  branded string; it does not wrap the TC39 `Temporal` API.
- **No build step.** Consumed as TypeScript source via Bun workspace resolution
  ([ADR-0006](../../adr/0006-no-build-internal-packages.md)).

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts         # barrel — public exports only
  month.ts         # Month value type + codec + monthOf/addMonths/compareMonths
  calendar.ts      # daysInMonth (leap-year aware)
  codec-error.ts   # CodecError + CodecErrorCode (month_* codes)
  format-month.ts  # formatMonthName / formatMonthLong
tests/unit/        # bun:test unit tests
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
