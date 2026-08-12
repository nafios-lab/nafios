import { describe, expect, test } from "bun:test";
import { formatDate } from "../../src/format-date";

// Fixed local Dates (no clock read) — formatDate is a pure passthrough over
// date-fns `format`, which renders in local time.
describe("formatDate", () => {
  test("#1 renders a Date with date-fns tokens, in local time", () => {
    const d = new Date(2026, 4, 15, 9, 42, 0); // 2026-05-15 09:42 local (month 0-based)
    expect(formatDate(d, "yyyy-MM-dd")).toBe("2026-05-15");
    expect(formatDate(d, "HH:mm")).toBe("09:42");
  });

  test("#2 supports the shell clock pattern", () => {
    const d = new Date(2026, 4, 14, 9, 42, 0); // Thu 14 May 2026
    expect(formatDate(d, "EEE · d MMM · hh:mma").toUpperCase()).toBe("THU · 14 MAY · 09:42AM");
  });
});
