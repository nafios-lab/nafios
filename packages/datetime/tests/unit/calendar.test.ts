import { describe, expect, test } from "bun:test";
import { daysInMonth } from "../../src/calendar";

describe("daysInMonth", () => {
  test("31-day months", () => {
    for (const m of [1, 3, 5, 7, 8, 10, 12]) {
      expect(daysInMonth(2026, m)).toBe(31);
    }
  });

  test("30-day months", () => {
    for (const m of [4, 6, 9, 11]) {
      expect(daysInMonth(2026, m)).toBe(30);
    }
  });

  test("February — 28 in a common year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  test("February — 29 in a leap year (divisible by 4)", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  test("February — 28 in a century that is NOT divisible by 400", () => {
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  test("February — 29 in a century divisible by 400", () => {
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});
