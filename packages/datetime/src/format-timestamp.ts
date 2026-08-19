// @nafios/datetime — the suite's standardized timestamp display format.
//
// One job: turn an ISO-8601 *instant* string — a `timestamptz` as PostgREST /
// the Supabase SDK hands it back (`"2027-02-01T09:15:00+00:00"`) — into the one
// label the whole suite uses for "when did this happen". Unlike `formatDate`
// (which takes a `Date` + a caller-chosen pattern), this owns BOTH the parse and
// the pattern: callers pass the raw string and get the house format back, so a
// timestamp reads identically in a banner, a table cell and a tooltip.
//
// Renders in LOCAL time, the package-wide convention (see day.ts): the same
// instant shown to a user in Singapore and one in London reads as their own wall
// clock. A UTC-midnight instant therefore displays as the previous evening west
// of UTC — correct for "this happened at this moment", wrong if a caller needs a
// fixed calendar day. Such a caller wants a DATE column (decoded via `Month` /
// "YYYY-MM-DD"), not a timestamp.

import { format, isValid, parseISO } from "date-fns";
import { CodecError } from "./codec-error";

/** The house format: `"1 Feb 2027, 5:15 PM"`. Day is un-padded, month is the
 *  3-letter abbreviation, time is 12-hour — the same reading order as the rest
 *  of the suite's date labels (`formatMonthLong` → "February 2027"). */
const DISPLAY_PATTERN = "d MMM yyyy, h:mm a";

/** A full ISO-8601 instant: a date, a `T`, and a time. Deliberately rejects a
 *  bare `"YYYY-MM-DD"` — `parseISO` widens that to local midnight, so it would
 *  render a `12:00 AM` the data never contained. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Format an ISO-8601 timestamp string for display, in the caller's LOCAL time
 * zone. The suite's single standardized timestamp label — use it everywhere a
 * `timestamptz` value is shown to a user.
 *   formatTimestamp("2027-02-01T09:15:00+00:00") // -> "1 Feb 2027, 5:15 PM" (in SGT)
 *
 * Takes a non-null string: a nullable column (`settledAt`, `paidAt`) is the
 * caller's to narrow, because only the caller knows what absence should render
 * as ("—", "Not yet paid", nothing at all).
 *
 * @throws {CodecError} (`timestamp_not_a_datetime`) when `iso` is not a parseable
 * ISO-8601 instant. A stored timestamp that fails here is a data-integrity or
 * programming error, not user input — the same discipline as the `Month` decode
 * path — so it throws rather than silently rendering a placeholder.
 */
export function formatTimestamp(iso: string): string {
  if (!ISO_INSTANT.test(iso)) {
    throw new CodecError(
      "timestamp_not_a_datetime",
      `Not an ISO-8601 timestamp (expected "YYYY-MM-DDTHH:mm…"): ${JSON.stringify(iso)}`,
    );
  }
  const parsed = parseISO(iso);
  if (!isValid(parsed)) {
    throw new CodecError("timestamp_not_a_datetime", `Not a real instant: ${JSON.stringify(iso)}`);
  }
  return format(parsed, DISPLAY_PATTERN);
}
