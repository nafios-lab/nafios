// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// A ledger is identified by its month. The `monthly_ledger.month` column stores
// it as a first-of-month DATE ("2026-01-01"), guarded by
// CHECK (month = date_trunc('month', month)). `Month` represents "a calendar
// month" as a zero-padded "YYYY-MM" string, so lexicographic order ==
// chronological order — no Date instance, no time-zone / midnight-UTC drift.
// This module OWNS the first-of-month invariant: it is enforced here (decode
// rejects day ≠ 01, encode always emits 01) and relied on everywhere else.

import { daysInMonth } from "./calendar";
import { CodecError } from "./codec-error";

/**
 * A calendar month, e.g. Jan 2026. Held as a zero-padded "YYYY-MM" string, so
 * lexicographic order == chronological order. Branded — build one only via
 * decodeMonth or monthOf.
 */
export type Month = string & { readonly __brand: "Month" };

/** Parse & validate a strict "YYYY-MM-DD" ISO date. Throws month_not_a_date on a
 *  bad format, an impossible month, or an impossible day (leap-year aware). */
function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new CodecError(
      "month_not_a_date",
      `Not an ISO date (YYYY-MM-DD): ${JSON.stringify(iso)}`,
    );
  }
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new CodecError("month_not_a_date", `Not a real calendar date: ${JSON.stringify(iso)}`);
  }
  return { year, month, day };
}

function toMonth(year: number, month: number): Month {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}` as Month;
}

/**
 * DB READ PATH. Decode a first-of-month DATE as it arrives from the SDK ("2026-01-01")
 * into Month. Throws CodecError if the value is not a valid ISO date OR its day
 * component is not 01 (the first-of-month invariant — mirrors the DB CHECK).
 */
export function decodeMonth(dbValue: string): Month {
  const { year, month, day } = parseIsoDate(dbValue);
  if (day !== 1) {
    throw new CodecError(
      "month_not_first_of_month",
      `month must be the first of the month: ${JSON.stringify(dbValue)}`,
    );
  }
  return toMonth(year, month);
}

/** DB WRITE PATH. Encode Month to the first-of-month DATE string the column expects:
 *  "2026-01" -> "2026-01-01". */
export function encodeMonth(value: Month): string {
  return `${value}-01`;
}

/**
 * The Month that CONTAINS a given calendar date. `isoDate` is a "YYYY-MM-DD" string —
 * the CALLER supplies it (e.g. "today"); the codec never reads the clock, so it stays pure.
 *   monthOf("2026-01-15") -> "2026-01"
 */
export function monthOf(isoDate: string): Month {
  const { year, month } = parseIsoDate(isoDate);
  return toMonth(year, month);
}

/** Shift a Month by n calendar months (negative = backwards), rolling the year correctly.
 *  addMonths("2026-12", 1) -> "2027-01"   |   addMonths("2026-01", -1) -> "2025-12" */
export function addMonths(value: Month, n: number): Month {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  // Work in an absolute count of months (zero-based), so year roll-over in both
  // directions is a plain divmod — no day component, no end-of-month clamping.
  const total = year * 12 + (month - 1) + n;
  return toMonth(Math.floor(total / 12), (total % 12) + 1);
}

/** Chronological comparison (lexicographic on "YYYY-MM" == chronological). */
export function compareMonths(a: Month, b: Month): -1 | 0 | 1 {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
