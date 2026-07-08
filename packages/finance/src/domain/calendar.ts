// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// Private day-level calendar math, shared by the two day-aware domain modules:
// the `Month` codec (month.ts) needs it to VALIDATE the day component of an ISO
// date, and the creation-window resolver (creation-window.ts) needs it to size
// the final-`leadDays` window. Homed here so the leap-year rule has ONE
// definition rather than a copy in each caller. Deliberately NOT re-exported
// from the domain barrel: `Month` is day-less by design, so day-of-month math is
// an implementation detail, never part of the public @nafios/finance surface.

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
