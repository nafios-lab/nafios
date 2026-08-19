import { describe, expect, test } from "bun:test";
import {
  addMoney,
  compareMoney,
  decodeMoney,
  encodeMoney,
  formatMoney,
  formatMoneyToFit,
  isNegativeMoney,
  moneyFromCents,
  subtractMoney,
  sumMoney,
  toCents,
  ZERO_MONEY,
} from "../../src/domain";
import { codeOf } from "./codec-error.helper";

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

  // Regression: a numeric column selected WITHOUT a ::text cast comes back from
  // PostgREST as a JS number. RegExp.test stringifies its argument, so such a
  // value used to slip past the format guard and die on `.startsWith` as an
  // opaque TypeError. It must fail as a typed CodecError at the boundary.
  test("#6b rejects a non-string input (uncast numeric) as money_not_numeric", () => {
    for (const v of [7152.35, 0, -12.5, null, undefined, {}]) {
      expect(codeOf(() => decodeMoney(v as unknown as string))).toBe("money_not_numeric");
    }
  });

  test("#7 rejects magnitude beyond numeric(12,2) range", () => {
    expect(codeOf(() => decodeMoney("10000000000.00"))).toBe("money_out_of_range");
  });

  test("accepts the boundary magnitude", () => {
    expect(encodeMoney(decodeMoney("-9999999999.99"))).toBe("-9999999999.99");
  });
});

describe("formatMoney", () => {
  test("formats a positive amount with thousands separator + $ symbol", () => {
    expect(formatMoney(decodeMoney("7152.35"))).toBe("$7,152.35");
  });

  test("formats a negative amount", () => {
    expect(formatMoney(decodeMoney("-1430.30"))).toBe("-$1,430.30");
  });

  test("formats zero with 2 decimal places", () => {
    expect(formatMoney(ZERO_MONEY)).toBe("$0.00");
  });
});

describe("formatMoneyToFit", () => {
  test("#15 leaves an amount that already fits untouched", () => {
    const fit = formatMoneyToFit(decodeMoney("7152.35"));
    expect(fit).toEqual({ text: "$7,152.35", exact: "$7,152.35", shortened: false });
  });

  test("#16 the default budget is exactly '$999,999.99' — the widest untouched amount", () => {
    const fit = formatMoneyToFit(decodeMoney("999999.99"));
    expect(fit.text).toBe("$999,999.99");
    expect(fit.text.length).toBe(11);
    expect(fit.shortened).toBe(false);
  });

  test("#17 one character over the budget drops the cents, not the digits", () => {
    // "$1,000,000.00" is 13 chars; the whole-dollar form is 10 and fits.
    const fit = formatMoneyToFit(decodeMoney("1000000.00"));
    expect(fit).toEqual({ text: "$1,000,000", exact: "$1,000,000.00", shortened: true });
  });

  test("#18 keeps every significant digit while the whole-dollar form still fits", () => {
    expect(formatMoneyToFit(decodeMoney("12340343.43")).text).toBe("$12,340,343");
  });

  test("#19 falls through to magnitude notation once whole dollars overrun too", () => {
    const fit = formatMoneyToFit(decodeMoney("123456789.00"));
    expect(fit).toEqual({ text: "$123.46M", exact: "$123,456,789.00", shortened: true });
  });

  test("#20 carries the sign into the compact form", () => {
    expect(formatMoneyToFit(decodeMoney("-123456789.00")).text).toBe("-$123.46M");
  });

  test("#21 handles the widest value numeric(12,2) can hold", () => {
    const fit = formatMoneyToFit(decodeMoney("9999999999.99"));
    expect(fit).toEqual({ text: "$10B", exact: "$9,999,999,999.99", shortened: true });
  });

  test("#22 zero fits and is never abbreviated", () => {
    expect(formatMoneyToFit(ZERO_MONEY)).toEqual({
      text: "$0.00",
      exact: "$0.00",
      shortened: false,
    });
  });

  test("#23 honours a caller-supplied budget narrower than the default", () => {
    // "$12,340.56" is 10 chars — fine by default, one too many at 8.
    expect(formatMoneyToFit(decodeMoney("12340.56")).text).toBe("$12,340.56");
    expect(formatMoneyToFit(decodeMoney("12340.56"), 8).text).toBe("$12,341");
  });

  test("#24 never rounds a non-zero amount away to '$0'", () => {
    // "$0" (2 chars) would fit the 3-char budget, but reporting nothing while
    // money is present is worse than overrunning the slot.
    const fit = formatMoneyToFit(decodeMoney("0.25"), 3);
    expect(fit.text).toBe("$0.25");
    expect(fit.exact).toBe("$0.25");
  });

  // Boundary of the anti-"$0" guard above: 50 cents is the first amount that does
  // NOT round away, so it takes the whole-dollar branch and reads "$1". Pinned
  // because it is the one place the fit ladder shows a materially different figure
  // (a 100% relative error) — tolerable only because it needs a caller-supplied
  // budget this narrow, and because `exact` still carries the true amount.
  test("#24b at exactly 50 cents the guard releases and the whole-dollar form wins", () => {
    const fit = formatMoneyToFit(decodeMoney("0.50"), 3);
    expect(fit.text).toBe("$1");
    expect(fit.exact).toBe("$0.50");
    expect(fit.shortened).toBe(true);
  });

  test("#25 returns the shortest form rather than truncating when nothing fits", () => {
    const fit = formatMoneyToFit(decodeMoney("1234.50"), 1);
    expect(fit.text).toBe("$1.23K");
    expect(fit.text.length).toBeGreaterThan(1); // best effort, never a cut-off number
    expect(fit.shortened).toBe(true);
  });

  test("#26 `exact` is always formatMoney's output, whichever branch ran", () => {
    for (const s of ["7152.35", "0.00", "-12.50", "1000000.00", "9999999999.99"]) {
      const value = decodeMoney(s);
      expect(formatMoneyToFit(value).exact).toBe(formatMoney(value));
    }
  });

  test("#27 `shortened` is exactly `text !== exact`", () => {
    for (const s of ["7152.35", "0.00", "-12.50", "1000000.00", "123456789.00"]) {
      const fit = formatMoneyToFit(decodeMoney(s));
      expect(fit.shortened).toBe(fit.text !== fit.exact);
    }
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
