# 0028. `@nafios/datetime` is the suite's sole `date-fns` seam

- **Status:** Accepted
- **Date:** 2026-08-10
- **Source:** Adding `today` / `isToday` / `formatDate` to `@nafios/datetime`, and
  the decision that all suite date/time logic must route through one abstraction
  rather than importing `date-fns` directly. **Supersedes** `@nafios/datetime`'s
  original "pure, zero-dependency, no-clock" contract (its
  [spec](../packages/datetime/spec.md) Invariant #1).

## Context

`@nafios/datetime` was extracted (2026-08) as **pure calendar primitives** — the
`Month` value type and codec, `daysInMonth`, month-label formatters — under a
hard contract: zero I/O, zero runtime dependencies, no clock. Callers supplied
"today" as a `"YYYY-MM-DD"` string, so every function was deterministic.

That contract covered *calendar math* but not the two things apps actually need
at runtime: the **current date** (today / is-this-today) and **formatting a
`Date` for display** (e.g. the shell navbar clock, `EEE · d MMM · hh:mma`). Both
require a clock and a formatting library.

The suite standardized on `date-fns`, but it was imported **directly** wherever
those needs arose — `apps/nafios-web` (the navbar) and `@nafios/ui` (the date
pickers). Scattering a vendor dependency across modules is the problem this ADR
closes:

- every module couples to `date-fns`' API surface, so the library is not
  swappable without a repo-wide edit;
- each site re-encounters `date-fns`' footguns (`parseISO` treating a bare
  `"YYYY-MM-DD"` as **UTC midnight**, then local-time comparisons drifting a day)
  instead of handling them once, centrally;
- there is no single place to add project conventions (string-first inputs, our
  own error types) on top of the vendor.

## Decision

Make `@nafios/datetime` the **one and only** package that imports `date-fns`;
everything else does date/time work through its barrel.

1. **Single importer.** All apps and domain/logic packages import date helpers
   from `@nafios/datetime`, never `date-fns` directly. `date-fns` is a dependency
   of `@nafios/datetime` and no other package (bar the exemption below).
2. **Enforced by lint.** A Biome `noRestrictedImports` rule bans `date-fns` /
   `date-fns/*` repo-wide; an `overrides` entry exempts the allowed importers.
   New code that needs a `date-fns` capability not yet wrapped must add a thin
   wrapper to `@nafios/datetime` rather than reach for the vendor.
3. **`@nafios/ui` is exempted.** It is a Date-native design-system leaf: its
   calendar/picker components inherently work in `Date`-space for rendering, and
   routing them through a string-first seam would drag `Date`-rendering concerns
   broadly into `datetime`'s public API for no real gain. The exemption is a
   known, bounded hole — a presentation leaf with no domain logic.
4. **The API grows incrementally.** First additions: `today` / `isToday` (the
   isolated clock seam in `day.ts`, the package's only `new Date()`) and
   `formatDate(date, pattern)` (a thin seam over `date-fns`' `format`). The
   calendar *math* (`Month` codec, `addMonths`, `compareMonths`, `daysInMonth`)
   stays pure and clock-free.

This **supersedes** `datetime`'s original Invariant #1. The calendar math remains
pure; the package *as a whole* is no longer dependency-free or clock-free by
contract — by design, because it is now the abstraction layer, not a leaf of
pure values.

## Consequences

- `date-fns` is swappable from **one** file set, and the timezone/parsing
  handling lives in one place rather than being re-derived per call site.
- **`formatDate`'s `pattern` is a `date-fns` token string** — the one piece of
  `date-fns` that still reaches callers. Swapping the vendor later means
  revisiting patterns, not import sites. Accepted trade-off versus inventing a
  bespoke token dialect for a thin format seam.
- **`Date` enters `datetime`'s public API** as an input type
  (`formatDate(date: Date, …)`). Unavoidable for a real date library and for the
  live navbar clock, which holds a ticking `Date`.
- Adding a wrapper before using a new `date-fns` function is a small, deliberate
  tax that keeps the seam intact; the lint rule makes the tax non-optional.
- `@nafios/ui` keeps its direct `date-fns` dependency. Revisit the exemption if
  its date usage grows past presentational formatting.

## Alternatives considered

- **Keep `datetime` pure; let each app import `date-fns` directly.** Rejected:
  this is the status quo the decision removes — vendor coupling scattered across
  modules, no single swap point, footguns re-implemented per site.
- **Include `@nafios/ui` in the ban.** Rejected this round: the pickers are
  `Date`-native UI widgets; forcing them through a string-first seam would push
  `Date` broadly into `datetime`'s public API or add awkward conversions, for
  little gain. Revisit if ui's date usage grows beyond presentation.
- **Re-base the pure `Month` math on `date-fns` too.** Rejected: the string math
  (`addMonths` / `compareMonths` / the `Month` codec) is trivially correct and
  `Date`-free; running it through `date-fns` `Date` objects buys nothing and
  reintroduces the exact timezone hazards the `Month` string model eliminates.
  `date-fns` backs the clock/formatting work only.
