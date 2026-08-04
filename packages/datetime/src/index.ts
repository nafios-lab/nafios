// @nafios/datetime — the single public barrel (the only export surface).
//
// Calendar-time primitives shared across the suite: the `Month` value type
// ("YYYY-MM", lexicographic == chronological) + its codec and month math, the
// leap-year-aware `daysInMonth`, the month-label formatters, and the calendar
// `CodecError` thrown by the `Month` decode path. Pure: zero I/O, zero
// dependencies, no clock — callers supply "today".

export { daysInMonth } from "./calendar";
export { CodecError, type CodecErrorCode } from "./codec-error";
export { formatMonthLong, formatMonthName } from "./format-month";
export {
  addMonths,
  compareMonths,
  decodeMonth,
  encodeMonth,
  type Month,
  monthOf,
} from "./month";
