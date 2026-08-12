// @nafios/datetime — THE clock seam.
//
// The one module that reads the system clock. Everything else takes "today" as
// an argument, so the calendar math stays deterministic; the `new Date()` lives
// here and nowhere else.
//
// Formatting goes through date-fns — this package is the suite's sole date-fns
// seam (ADR-0028). date-fns `format` renders in LOCAL time, so `today` is the
// user's local calendar day, NOT UTC (which `Date#toISOString` would give and
// which reports the wrong day west of UTC after local midnight).

import { format } from "date-fns";

/**
 * Today's calendar day as a zero-padded "YYYY-MM-DD" string, in the caller's
 * LOCAL time zone. Reads the system clock.
 *   today() // -> "2026-08-10"
 */
export function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Whether `isoDate` is today's local calendar day. `isoDate` is a "YYYY-MM-DD"
 * string (the package's canonical day format, e.g. a DATE column value). Reads
 * the system clock (via {@link today}).
 *   isToday("2026-08-10") // -> true on 2026-08-10
 */
export function isToday(isoDate: string): boolean {
  return isoDate === today();
}
