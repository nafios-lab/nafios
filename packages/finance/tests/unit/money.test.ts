import { describe, expect, test } from "bun:test";
import {
  addMoney,
  CodecError,
  type CodecErrorCode,
  compareMoney,
  decodeMoney,
  encodeMoney,
  isNegativeMoney,
  moneyFromCents,
  subtractMoney,
  sumMoney,
  toCents,
  ZERO_MONEY,
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

describe("decodeMoney / toCents / encodeMoney", () => {
  test("#1 decodes a numeric(12,2) string to integer cents", () => {
    expect(toCents(decodeMoney("7152.35"))).toBe(715235);
  });

  test("#2 both zero forms decode to ZERO_MONEY", () => {
    expect(decodeMoney("0")).toBe(ZERO_MONEY);
    expect(decodeMoney("0.00")).toBe(ZERO_MONEY);
  });

  test("#3 decodes a short-decimal negative and re-encodes canonically", () => {
    expect(encodeMoney(decodeMoney("-12.5"))).toBe("-12.50");
  });

  test("#4 encode∘decode round-trips every canonical string", () => {
    for (const s of ["7152.35", "0.00", "-12.50", "9999999999.99"]) {
      expect(encodeMoney(decodeMoney(s))).toBe(s);
    }
  });

  test("#5 rejects more than 2 decimals", () => {
    expect(codeOf(() => decodeMoney("1.005"))).toBe("money_too_many_decimals");
  });

  test("#6 rejects non-numeric / malformed strings", () => {
    for (const s of ["1,000.00", "$5", "abc", "", "NaN", "Infinity"]) {
      expect(codeOf(() => decodeMoney(s))).toBe("money_not_numeric");
    }
  });

  test("#7 rejects magnitude beyond numeric(12,2) range", () => {
    expect(codeOf(() => decodeMoney("10000000000.00"))).toBe("money_out_of_range");
  });

  test("accepts the boundary magnitude", () => {
    expect(encodeMoney(decodeMoney("-9999999999.99"))).toBe("-9999999999.99");
  });
});

describe("moneyFromCents", () => {
  test("#8 rejects a non-integer number of cents", () => {
    expect(codeOf(() => moneyFromCents(1.5))).toBe("money_not_integer_cents");
  });
});

describe("arithmetic", () => {
  test("#9 addMoney is exact (the classic float trap)", () => {
    expect(encodeMoney(addMoney(decodeMoney("0.10"), decodeMoney("0.20")))).toBe("0.30");
  });

  test("#10 subtractMoney may return a negative Money", () => {
    expect(encodeMoney(subtractMoney(decodeMoney("4307.28"), decodeMoney("7152.35")))).toBe(
      "-2845.07",
    );
  });

  test("#11 sumMoney of [] is ZERO_MONEY, of [m] is m", () => {
    expect(sumMoney([])).toBe(ZERO_MONEY);
    const m = decodeMoney("42.42");
    expect(sumMoney([m])).toBe(m);
  });

  test("#12 sumMoney adds envelope amounts exactly", () => {
    expect(encodeMoney(sumMoney(["1200.00", "3107.28"].map(decodeMoney)))).toBe("4307.28");
  });

  test("#13 compareMoney orders <, =, >", () => {
    expect(compareMoney(decodeMoney("1.00"), decodeMoney("2.00"))).toBe(-1);
    expect(compareMoney(decodeMoney("2.00"), decodeMoney("2.00"))).toBe(0);
    expect(compareMoney(decodeMoney("2.00"), decodeMoney("1.00"))).toBe(1);
  });

  test("#14 isNegativeMoney is true only below zero", () => {
    expect(isNegativeMoney(decodeMoney("-0.01"))).toBe(true);
    expect(isNegativeMoney(decodeMoney("0.00"))).toBe(false);
    expect(isNegativeMoney(decodeMoney("0.01"))).toBe(false);
  });
});

describe("§5 Jan 2027 metrics anchor", () => {
  test("reproduces Health Margin and ASM Contribution to the cent", () => {
    const opening = decodeMoney("7152.35");
    const col = decodeMoney("4307.28");
    const maxCap = decodeMoney("6415.00");

    expect(encodeMoney(subtractMoney(maxCap, col))).toBe("2107.72"); // Health Margin
    expect(encodeMoney(subtractMoney(opening, col))).toBe("2845.07"); // ASM Contribution
    expect(encodeMoney(sumMoney([decodeMoney("1200.00"), decodeMoney("3107.28")]))).toBe("4307.28");
  });
});
