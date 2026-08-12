import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { isToday, today } from "../../src/day";

// `today` / `isToday` read the system clock, so pin it with a fixed local time.
// Midday avoids any local-midnight ambiguity when deriving the calendar day.
afterEach(() => {
  setSystemTime(); // restore the real clock
});

describe("today", () => {
  test("#1 returns the local calendar day as zero-padded YYYY-MM-DD", () => {
    setSystemTime(new Date(2026, 7, 10, 12, 0, 0)); // 2026-08-10 (month is 0-based)
    expect(today()).toBe("2026-08-10");
  });

  test("#2 zero-pads single-digit month and day", () => {
    setSystemTime(new Date(2026, 0, 5, 12, 0, 0)); // 2026-01-05
    expect(today()).toBe("2026-01-05");
  });
});

describe("isToday", () => {
  test("#3 true when the date is today's local calendar day", () => {
    setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
    expect(isToday("2026-08-10")).toBe(true);
  });

  test("#4 false for any other day", () => {
    setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
    expect(isToday("2026-08-09")).toBe(false);
    expect(isToday("2026-08-11")).toBe(false);
    expect(isToday("2025-08-10")).toBe(false);
  });
});
