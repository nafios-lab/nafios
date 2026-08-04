import type { Month } from "./month";

// Month-label formatters. `Month` is a "YYYY-MM" string (lexicographic ==
// chronological, no clock, no Date instance): we read the two components
// directly and index a static month table — no date-fns, so there is zero
// time-zone / midnight-UTC drift.
//
// English-only by construction. If localization ever lands, this is the seam
// that would move to `Intl.DateTimeFormat`.

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parts(month: Month): { name: string; year: string } {
  const year = month.slice(0, 4);
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return { name: MONTH_NAMES[monthIndex] ?? month, year };
}

/** Month name only: `"2026-07"` → `"July"`. */
export function formatMonthName(month: Month): string {
  return parts(month).name;
}

/** Long label: `"2026-07"` → `"July 2026"`. */
export function formatMonthLong(month: Month): string {
  const { name, year } = parts(month);
  return `${name} ${year}`;
}
