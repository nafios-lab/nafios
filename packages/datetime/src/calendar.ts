// @nafios/datetime — pure. Zero I/O, zero dependencies, no clock.
//
// Day-level calendar math, shared by the two day-aware modules: the `Month`
// codec (month.ts) needs it to VALIDATE the day component of an ISO date, and
// downstream window/resolver logic (e.g. finance's creation window) needs it to
// size day-of-month ranges. Homed here so the leap-year rule has ONE definition
// rather than a copy in each caller.

/** Leap-year rule: divisible by 4, except centuries not divisible by 400. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a given calendar month (1–12), leap-year aware for February. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}
