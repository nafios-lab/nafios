// @nafios/datetime — arbitrary date/time presentation formatting.
//
// The suite's SOLE seam over date-fns' `format` (ADR-0028): app and domain code
// must not import date-fns directly, so any "render this Date as a label" need
// routes through here. Deliberately thin — this centralizes the *dependency*,
// not the presentation patterns (those stay with the presentation code).
//
// NOTE: `pattern` is a date-fns format-token string (e.g. "EEE · d MMM · hh:mma").
// That token language is the one piece of date-fns that still reaches callers;
// swapping the underlying library later would mean revisiting these patterns.
// Accepted trade-off vs. inventing our own token dialect — see ADR-0028.

import { format } from "date-fns";

/**
 * Format a `Date` for display with a date-fns token pattern, in local time.
 *   formatDate(now, "EEE · d MMM · hh:mma") // -> "Thu · 15 May · 09:42AM"
 */
export function formatDate(date: Date, pattern: string): string {
  return format(date, pattern);
}
