# @nafios/datetime

Shared **date & calendar-time utilities** for the suite — framework-agnostic and
owned by nothing domain-specific. **The one package allowed to import `date-fns`**
([ADR-0028](../../adr/0028-datetime-sole-date-fns-seam.md)): every other app and
package does date/time work through this barrel and never imports `date-fns`
directly (Biome-enforced; `@nafios/ui` is the sole exemption). The calendar math
(`Month`, codecs, `daysInMonth`, formatters) stays pure and clock-free; `day.ts`
is the isolated clock seam (`today` / `isToday`) — the only `new Date()` here.

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
- **`today` / `isToday`** (`day.ts`) — today's local calendar day as `"YYYY-MM-DD"`,
  and a same-day check. The **only** clock read in the package (see Invariant 1).
- **`formatDate(date, pattern)`** (`format-date.ts`) — render a `Date` for display
  via a date-fns token pattern; the suite's sole seam over date-fns' `format`.

## Public API surface

All public exports live in `src/index.ts` (the barrel). Consumers import
`@nafios/datetime`, never deep paths.

## Invariants

1. **The suite's only `date-fns` importer; calendar math stays pure.** `date-fns`
   is a dependency of this package and no other (except `@nafios/ui`) — every
   consumer routes date/time work through this barrel (Biome `noRestrictedImports`,
   [ADR-0028](../../adr/0028-datetime-sole-date-fns-seam.md)). `month.ts` /
   `calendar.ts` / `format-month.ts` still do zero I/O and never read the clock —
   callers pass "today" in as a `"YYYY-MM-DD"` string. The single `new Date()`
   lives in `day.ts` and nowhere else, so the calendar math stays deterministic.
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
- **`formatDate` leaks date-fns tokens.** `pattern` is a date-fns format-token
  string; that token dialect is the one bit of date-fns that reaches callers.
  Swapping the vendor later means revisiting patterns, not import sites — the
  accepted trade-off of a thin format seam ([ADR-0028](../../adr/0028-datetime-sole-date-fns-seam.md)).
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
  day.ts           # today / isToday (THE clock seam — the only new Date() here)
  format-date.ts   # formatDate — the date-fns `format` seam (Date -> label)
  codec-error.ts   # CodecError + CodecErrorCode (month_* codes)
  format-month.ts  # formatMonthName / formatMonthLong
tests/unit/        # bun:test unit tests
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
