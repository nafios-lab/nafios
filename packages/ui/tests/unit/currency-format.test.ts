import { describe, expect, test } from "bun:test";
import {
  caretForValueChars,
  clampMinor,
  countValueCharsBefore,
  formatDraft,
  formatMinor,
  groupIntegerDigits,
  parseToMinor,
  resolveCurrencyConfig,
  sanitizeInput,
} from "../../src/internal/currency-format.ts";

const usd = resolveCurrencyConfig("en-US", "USD");
const eur = resolveCurrencyConfig("de-DE", "EUR");
const jpy = resolveCurrencyConfig("ja-JP", "JPY");

describe("resolveCurrencyConfig", () => {
  test("derives USD presentation from Intl", () => {
    expect(usd.symbol).toBe("$");
    expect(usd.fractionDigits).toBe(2);
    expect(usd.decimal).toBe(".");
    expect(usd.group).toBe(",");
  });

  test("derives de-DE EUR separators (swapped decimal/group)", () => {
    expect(eur.fractionDigits).toBe(2);
    expect(eur.decimal).toBe(",");
    expect(eur.group).toBe(".");
    expect(eur.symbol).toBe("€");
  });

  test("derives a zero-fraction currency (JPY)", () => {
    expect(jpy.fractionDigits).toBe(0);
    expect(jpy.symbol).toBe("¥");
  });
});

describe("sanitizeInput", () => {
  test("keeps digits and a single decimal, dropping stray characters", () => {
    expect(sanitizeInput("$1,234.56", usd, false)).toBe("1234.56");
    expect(sanitizeInput("12abc3", usd, false)).toBe("123");
  });

  test("caps the fraction at the currency's fraction digits", () => {
    expect(sanitizeInput("1.239", usd, false)).toBe("1.23");
  });

  test("ignores a second decimal separator", () => {
    expect(sanitizeInput("1.2.3", usd, false)).toBe("1.23");
  });

  test("strips leading zeros but keeps a lone zero", () => {
    expect(sanitizeInput("007", usd, false)).toBe("7");
    expect(sanitizeInput("0", usd, false)).toBe("0");
    expect(sanitizeInput("0.5", usd, false)).toBe("0.5");
  });

  test("keeps a leading minus only when negatives are allowed", () => {
    expect(sanitizeInput("-42", usd, true)).toBe("-42");
    expect(sanitizeInput("-42", usd, false)).toBe("42");
  });

  test("drops the decimal entirely for zero-fraction currencies", () => {
    expect(sanitizeInput("1234.56", jpy, false)).toBe("1234");
  });

  test("treats a typed '.' as the decimal for de-DE (where ',' is the decimal)", () => {
    // de-DE decimal is ",", group is "." — a "." must NOT be read as decimal there.
    expect(sanitizeInput("1.234,56", eur, false)).toBe("1234,56");
  });
});

describe("parseToMinor", () => {
  test("parses whole and fractional USD amounts to cents", () => {
    expect(parseToMinor("5", usd, false)).toBe(500);
    expect(parseToMinor("1.2", usd, false)).toBe(120);
    expect(parseToMinor("7152.35", usd, false)).toBe(715235);
  });

  test("returns null for an empty or decimal-only field", () => {
    expect(parseToMinor("", usd, false)).toBeNull();
    expect(parseToMinor(".", usd, false)).toBeNull();
    expect(parseToMinor("-", usd, true)).toBeNull();
  });

  test("handles a bare leading decimal", () => {
    expect(parseToMinor(".5", usd, false)).toBe(50);
  });

  test("parses negatives when allowed, and never yields -0", () => {
    expect(parseToMinor("-3", usd, true)).toBe(-300);
    expect(parseToMinor("-0", usd, true)).toBe(0);
    expect(Object.is(parseToMinor("-0", usd, true), -0)).toBe(false);
  });

  test("parses de-DE decimal comma to cents", () => {
    expect(parseToMinor("12,50", eur, false)).toBe(1250);
  });

  test("parses zero-fraction currency to whole units", () => {
    expect(parseToMinor("7152", jpy, false)).toBe(7152);
  });
});

describe("formatMinor", () => {
  test("groups at rest and stays plain while editing (USD)", () => {
    expect(formatMinor(715235, usd, true)).toBe("7,152.35");
    expect(formatMinor(715235, usd, false)).toBe("7152.35");
  });

  test("formats zero and negatives", () => {
    expect(formatMinor(0, usd, true)).toBe("0.00");
    expect(formatMinor(-143030, usd, true)).toBe("-1,430.30");
  });

  test("formats a zero-fraction currency without decimals", () => {
    expect(formatMinor(7152, jpy, true)).toBe("7,152");
  });
});

describe("clampMinor", () => {
  test("passes through null and in-range values", () => {
    expect(clampMinor(null, 0, 100)).toBeNull();
    expect(clampMinor(50, 0, 100)).toBe(50);
  });

  test("clamps to the nearest bound", () => {
    expect(clampMinor(150, 0, 100)).toBe(100);
    expect(clampMinor(-5, 0, 100)).toBe(0);
  });

  test("treats missing bounds as unbounded", () => {
    expect(clampMinor(9999)).toBe(9999);
    expect(clampMinor(-9999, undefined, 0)).toBe(-9999);
  });
});

describe("groupIntegerDigits", () => {
  test("inserts separators every three digits from the right", () => {
    expect(groupIntegerDigits("1234567", ",")).toBe("1,234,567");
    expect(groupIntegerDigits("1234", ",")).toBe("1,234");
  });

  test("leaves short and empty strings untouched", () => {
    expect(groupIntegerDigits("12", ",")).toBe("12");
    expect(groupIntegerDigits("", ",")).toBe("");
  });

  test("honours a non-comma separator (de-DE uses '.')", () => {
    expect(groupIntegerDigits("1234567", ".")).toBe("1.234.567");
  });
});

describe("formatDraft", () => {
  test("groups the integer part live while leaving the fraction as typed", () => {
    expect(formatDraft("1234567", usd, false)).toBe("1,234,567");
    expect(formatDraft("1234.5", usd, false)).toBe("1,234.5"); // not padded to .50
  });

  test("preserves a trailing decimal point mid-entry", () => {
    expect(formatDraft("1234.", usd, false)).toBe("1,234.");
  });

  test("re-grouping already-grouped input is idempotent", () => {
    expect(formatDraft("1,234,567", usd, false)).toBe("1,234,567");
  });

  test("keeps the sign for negatives when allowed", () => {
    expect(formatDraft("-1234", usd, true)).toBe("-1,234");
  });

  test("groups with de-DE separators", () => {
    expect(formatDraft("1234,5", eur, false)).toBe("1.234,5");
  });
});

describe("caret tracking", () => {
  test("counts value chars, skipping grouping separators", () => {
    // "1,234.5" → before index 5 ("1,234") there are 4 value chars (1,2,3,4).
    expect(countValueCharsBefore("1,234.5", 5, usd)).toBe(4);
    // The minus counts as a value char.
    expect(countValueCharsBefore("-1,234", 6, usd)).toBe(5);
  });

  test("maps a value-char count back to a string offset past the separators", () => {
    // 4 value chars into "1,234,567" lands after the "4", i.e. offset 5.
    expect(caretForValueChars("1,234,567", 4, usd)).toBe(5);
    expect(caretForValueChars("1,234,567", 0, usd)).toBe(0);
  });

  test("round-trips a caret across a regrouping edit", () => {
    // Typing turns "123456" (caret after 6 digits) into "123,456"; the caret should
    // still sit after the 6th digit — offset 7.
    const before = countValueCharsBefore("123456", 6, usd);
    expect(caretForValueChars("123,456", before, usd)).toBe(7);
  });
});
