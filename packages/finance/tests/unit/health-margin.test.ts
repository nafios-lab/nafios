import { describe, expect, test } from "bun:test";
import {
  decodeMoney,
  HEALTH_MARGIN_THRESHOLDS,
  type HealthStatus,
  summarizeHealthMargin,
} from "../../src/domain";

// Terse fixtures — the gauge is a pure function of two Money values (maxCapped, col);
// no DB, no clock. Money built via the canonical decode path.
const m = (value: string) => decodeMoney(value);

describe("summarizeHealthMargin — zones, boundaries, snippet text", () => {
  // [maxCapped, col, status, percent|null, text]
  const rows: ReadonlyArray<[string, string, HealthStatus, number | null, string]> = [
    // ── healthy: ratio ≥ 30% ──
    ["400.00", "152.00", "healthy", 62, "Healthy · 62%"], // 248/400 = 62%
    ["1000.00", "0.00", "healthy", 100, "Healthy · 100%"], // no spend → full headroom
    ["1000.00", "700.00", "healthy", 30, "Healthy · 30%"], // exactly 30% → healthy (inclusive floor)
    // ── tight: 10% ≤ ratio < 30% ──
    ["400.00", "288.00", "tight", 28, "Tight · 28%"], // 112/400 = 28%
    ["1000.00", "701.00", "tight", 30, "Tight · 30%"], // 299/1000 = 29.9% → rounds to 30 but bucketed tight
    ["1000.00", "900.00", "tight", 10, "Tight · 10%"], // exactly 10% → tight (inclusive floor)
    // ── at-risk: 0% ≤ ratio < 10% ──
    ["400.00", "364.00", "at-risk", 9, "At risk · 9%"], // 36/400 = 9%
    ["1000.00", "1000.00", "at-risk", 0, "At risk · 0%"], // exactly at ceiling → 0% at-risk (not over)
    ["1000.00", "901.00", "at-risk", 10, "At risk · 10%"], // 99/1000 = 9.9% → rounds to 10 but bucketed at-risk
    // ── over: ratio < 0% ──
    ["400.00", "440.00", "over", -10, "Over · -10%"], // -40/400 = -10%
    ["1000.00", "2000.00", "over", -100, "Over · -100%"], // committed 2× the ceiling
  ];

  for (const [maxCapped, col, status, percent, text] of rows) {
    test(`maxCapped ${maxCapped} / col ${col} → ${status} (${text})`, () => {
      const s = summarizeHealthMargin({ maxCapped: m(maxCapped), col: m(col) });
      expect(s.status).toBe(status);
      expect(s.percent).toBe(percent);
      expect(s.text).toBe(text);
      expect(s.ratio).not.toBeNull();
    });
  }
});

describe("summarizeHealthMargin — no-ceiling (maxCapped = 0)", () => {
  test("zero ceiling, zero col → neutral, ratio/percent null, text 'No ceiling'", () => {
    const s = summarizeHealthMargin({ maxCapped: m("0.00"), col: m("0.00") });
    expect(s.status).toBe("no-ceiling");
    expect(s.label).toBe("No ceiling");
    expect(s.ratio).toBeNull();
    expect(s.percent).toBeNull();
    expect(s.text).toBe("No ceiling");
  });

  test("zero ceiling still short-circuits even with committed col (no divide-by-zero)", () => {
    // margin = 0 − 50 = −$50, but with no ceiling there is nothing to be 'over' — neutral.
    const s = summarizeHealthMargin({ maxCapped: m("0.00"), col: m("50.00") });
    expect(s.status).toBe("no-ceiling");
    expect(s.ratio).toBeNull();
    expect(s.percent).toBeNull();
  });
});

describe("summarizeHealthMargin — thresholds are the single source of policy", () => {
  test("exposed cutoffs match the documented zones", () => {
    expect(HEALTH_MARGIN_THRESHOLDS.healthy).toBe(30);
    expect(HEALTH_MARGIN_THRESHOLDS.tight).toBe(10);
  });
});
