import type { Month } from "@nafios/finance";

// Local month-label formatters for the finance home (EF3.10). Kept in the web
// feature — not the @nafios/finance domain — so labelling stays a UI concern
// with no cross-package spec change (EF3.10 plan, Decision 1).
//
// A `Month` is a "YYYY-MM" string (lexicographic == chronological, no clock, no
// Date instance). We read the two components directly and index a static month
// table — no date-fns, so there is zero time-zone / midnight-UTC drift.

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

/** Month name only: `"2026-07"` → `"July"`. Used in the body/caption copy. */
export function formatMonthName(month: Month): string {
  return parts(month).name;
}

/** Long label: `"2026-07"` → `"July 2026"`. Used in the CTA labels. */
export function formatMonthLong(month: Month): string {
  const { name, year } = parts(month);
  return `${name} ${year}`;
}
