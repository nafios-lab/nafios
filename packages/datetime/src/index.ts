// @nafios/datetime — the single public barrel (the only export surface).
//
// Calendar-time primitives shared across the suite: the `Month` value type
// ("YYYY-MM", lexicographic == chronological) + its codec and month math, the
// leap-year-aware `daysInMonth`, the month-label formatters, and the calendar
// `CodecError` thrown by the `Month` decode path. The calendar math is pure
// (zero I/O, zero dependencies) and takes "today" as an argument; `day.ts` is
// the one deliberate exception — the clock seam (`today` / `isToday`).

export { daysInMonth } from "./calendar";
export { CodecError, type CodecErrorCode } from "./codec-error";
export { isToday, today } from "./day";
export { formatDate } from "./format-date";
export { formatMonthLong, formatMonthName } from "./format-month";
export {
  addMonths,
  compareMonths,
  decodeMonth,
  encodeMonth,
  type Month,
  monthOf,
} from "./month";
