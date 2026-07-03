import { describe, expect, test } from "bun:test";
import {
  addMonths,
  CodecError,
  type CodecErrorCode,
  compareMonths,
  decodeMonth,
  encodeMonth,
  type Month,
  monthOf,
} from "../../src/domain";

// Run `fn`, assert it threw a CodecError, and return its `code` for assertion.
function codeOf(fn: () => unknown): CodecErrorCode {
  try {
    fn();
  } catch (error) {
    if (error instanceof CodecError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("expected a CodecError, but nothing was thrown");
}

describe("decodeMonth / encodeMonth", () => {
  test("#1 decodes a first-of-month DATE to YYYY-MM", () => {
    expect(decodeMonth("2027-01-01")).toBe("2027-01" as Month);
  });

  test("#2 encode∘decode round-trips to the first-of-month DATE", () => {
    expect(encodeMonth(decodeMonth("2027-01-01"))).toBe("2027-01-01");
  });

  test("#3 rejects a day component that is not 01 (first-of-month invariant)", () => {
    expect(codeOf(() => decodeMonth("2027-01-15"))).toBe("month_not_first_of_month");
  });

  test("#4 rejects non-ISO or impossible dates", () => {
    for (const s of ["2026-13-01", "2026-02-30", "2026-1-1", ""]) {
      expect(codeOf(() => decodeMonth(s))).toBe("month_not_a_date");
    }
  });
});

describe("monthOf", () => {
  test("#5 returns the month containing any day", () => {
    expect(monthOf("2027-01-15")).toBe("2027-01" as Month);
    expect(monthOf("2027-01-01")).toBe("2027-01" as Month);
  });
});

describe("addMonths", () => {
  test("#6 rolls forward across a year boundary", () => {
    expect(addMonths(decodeMonth("2026-12-01"), 1)).toBe("2027-01" as Month);
  });

  test("#7 rolls backward across a year boundary", () => {
    expect(addMonths(decodeMonth("2026-01-01"), -1)).toBe("2025-12" as Month);
  });

  test("#8 shifts a full year", () => {
    expect(addMonths(decodeMonth("2026-06-01"), 12)).toBe("2027-06" as Month);
  });
});

describe("compareMonths", () => {
  test("#9 orders <, =, >", () => {
    expect(compareMonths(decodeMonth("2026-12-01"), decodeMonth("2027-01-01"))).toBe(-1);
    expect(compareMonths(decodeMonth("2027-01-01"), decodeMonth("2027-01-01"))).toBe(0);
    expect(compareMonths(decodeMonth("2027-01-01"), decodeMonth("2026-12-01"))).toBe(1);
  });

  test("#10 sorts a list chronologically", () => {
    const months = ["2027-03", "2026-01", "2026-12", "2027-01"] as Month[];
    expect([...months].sort(compareMonths)).toEqual([
      "2026-01",
      "2026-12",
      "2027-01",
      "2027-03",
    ] as Month[]);
  });
});

describe("§5 Jan 2027 month anchor", () => {
  test("round-trips and shifts the anchor month", () => {
    const jan = decodeMonth("2027-01-01");
    expect(encodeMonth(jan)).toBe("2027-01-01");
    expect(encodeMonth(addMonths(jan, 1))).toBe("2027-02-01");
    expect(compareMonths(decodeMonth("2026-12-01"), jan)).toBe(-1);
  });
});
