import { describe, expect, test } from "bun:test";
import { monthOf } from "@nafios/finance";
import { formatMonthLong, formatMonthName } from "../../src/features/finance/lib/format-month.ts";

describe("formatMonthName", () => {
  test("names the month, ignoring the day component", () => {
    expect(formatMonthName(monthOf("2026-07-15"))).toBe("July");
    expect(formatMonthName(monthOf("2026-01-01"))).toBe("January");
    expect(formatMonthName(monthOf("2026-12-31"))).toBe("December");
  });
});

describe("formatMonthLong", () => {
  test("appends the year", () => {
    expect(formatMonthLong(monthOf("2026-07-15"))).toBe("July 2026");
    expect(formatMonthLong(monthOf("2025-12-01"))).toBe("December 2025");
    expect(formatMonthLong(monthOf("2027-01-09"))).toBe("January 2027");
  });
});
