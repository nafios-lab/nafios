import { describe, expect, test } from "bun:test";
import {
  decodeMoney,
  encodeMoney,
  evaluateMaxCapped,
  type MaxCappedZone,
  validateMaxCapped,
} from "../../src/domain";

// Terse fixtures — the §6 matrix is a pure comparison of two Money values;
// no DB, no clock. Money assertions compare via encodeMoney (canonical string).
const m = (value: string) => decodeMoney(value);

describe("evaluateMaxCapped — zones, hardCap, savingsDraw (§6 rows 1–9)", () => {
  // [opening, maxCapped, zone, savingsDraw|null, hardCap]
  const rows: ReadonlyArray<[string, string, MaxCappedZone, string | null, string]> = [
    ["7152.35", "6415.00", "ok", null, "14304.70"], // #1 real Jan 2027 ceiling under income
    ["7152.35", "7152.35", "ok", null, "14304.70"], // #2 == opening → green (Case 2)
    ["7152.35", "7152.36", "amber", "0.01", "14304.70"], // #3 one cent above opening → amber
    ["7152.35", "7500.00", "amber", "347.65", "14304.70"], // #4 RFC-022 scenario
    ["7152.35", "14304.70", "amber", "7152.35", "14304.70"], // #5 exactly 2× → top of amber
    ["7152.35", "14304.71", "blocked", null, "14304.70"], // #6 one cent above 2× → blocked
    ["7152.35", "71523.50", "blocked", null, "14304.70"], // #7 decimal-slip typo (10×)
    ["0.00", "0.00", "ok", null, "0.00"], // #8 zero opening, zero cap → green
    ["0.00", "0.01", "blocked", null, "0.00"], // #9 zero opening ⇒ 2×=0; any positive cap blocked
  ];

  for (const [i, [opening, maxCapped, zone, savingsDraw, hardCap]] of rows.entries()) {
    test(`#${i + 1} opening ${opening} / maxCapped ${maxCapped} → ${zone}`, () => {
      const g = evaluateMaxCapped(m(opening), m(maxCapped));
      expect(g.zone).toBe(zone);
      expect(encodeMoney(g.hardCap)).toBe(hardCap);
      if (savingsDraw === null) {
        expect(g.savingsDraw).toBeNull();
      } else {
        expect(g.savingsDraw).not.toBeNull();
        expect(encodeMoney(g.savingsDraw as ReturnType<typeof m>)).toBe(savingsDraw);
      }
    });
  }
});

describe("validateMaxCapped — the gate & confirmed interaction (§6 rows 10–16)", () => {
  test("#10 green passes; confirmed irrelevant", () => {
    const r = validateMaxCapped({
      openingBalance: m("7152.35"),
      maxCapped: m("6415.00"),
      confirmed: false,
    });
    expect(r.ok).toBe(true);
    expect(r.guardrail.zone).toBe("ok");
  });

  test("#11 == opening boundary → green", () => {
    const r = validateMaxCapped({
      openingBalance: m("7152.35"),
      maxCapped: m("7152.35"),
      confirmed: false,
    });
    expect(r.ok).toBe(true);
    expect(r.guardrail.zone).toBe("ok");
  });

  test("#12 amber, not confirmed → requires_confirmation", () => {
    const r = validateMaxCapped({
      openingBalance: m("7152.35"),
      maxCapped: m("7500.00"),
      confirmed: false,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("requires_confirmation");
    expect(r.guardrail.zone).toBe("amber");
  });

  test("#13 amber, confirmed → passes", () => {
    const r = validateMaxCapped({
      openingBalance: m("7152.35"),
      maxCapped: m("7500.00"),
      confirmed: true,
    });
    expect(r.ok).toBe(true);
    expect(r.guardrail.zone).toBe("amber");
  });

  test("#14 exactly 2×, confirmed → passes (top of amber)", () => {
    const r = validateMaxCapped({
      openingBalance: m("7152.35"),
      maxCapped: m("14304.70"),
      confirmed: true,
    });
    expect(r.ok).toBe(true);
    expect(r.guardrail.zone).toBe("amber");
  });

  test("#15 blocked; confirmed: true does NOT override", () => {
    const r = validateMaxCapped({
      openingBalance: m("7152.35"),
      maxCapped: m("14304.71"),
      confirmed: true,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("exceeds_hard_cap");
    expect(r.guardrail.zone).toBe("blocked");
  });

  test("#16 blocked regardless of confirm", () => {
    const r = validateMaxCapped({
      openingBalance: m("7152.35"),
      maxCapped: m("20000.00"),
      confirmed: false,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("exceeds_hard_cap");
    expect(r.guardrail.zone).toBe("blocked");
  });

  test("#17 both variants carry guardrail === evaluateMaxCapped(opening, maxCapped)", () => {
    const cases: ReadonlyArray<[string, string, boolean]> = [
      ["7152.35", "6415.00", false],
      ["7152.35", "7500.00", false],
      ["7152.35", "7500.00", true],
      ["7152.35", "14304.71", true],
    ];
    for (const [opening, maxCapped, confirmed] of cases) {
      const r = validateMaxCapped({
        openingBalance: m(opening),
        maxCapped: m(maxCapped),
        confirmed,
      });
      const g = evaluateMaxCapped(m(opening), m(maxCapped));
      expect(r.guardrail.zone).toBe(g.zone);
      expect(encodeMoney(r.guardrail.hardCap)).toBe(encodeMoney(g.hardCap));
      expect(r.guardrail.savingsDraw === null).toBe(g.savingsDraw === null);
      if (g.savingsDraw !== null && r.guardrail.savingsDraw !== null) {
        expect(encodeMoney(r.guardrail.savingsDraw)).toBe(encodeMoney(g.savingsDraw));
      }
    }
  });
});

describe("purity / boundary (§6 rows 18–20)", () => {
  test("#18 hardCap = addMoney(opening, opening), exact (not float * 2)", () => {
    const g = evaluateMaxCapped(m("7152.35"), m("6415.00"));
    expect(encodeMoney(g.hardCap)).toBe("14304.70");
  });

  test("#19 result carries no message string — only zone + Money amounts", () => {
    const keys = Object.keys(evaluateMaxCapped(m("7152.35"), m("7500.00"))).sort();
    expect(keys).toEqual(["hardCap", "savingsDraw", "zone"]);
  });

  test("#20 never throws on any Money pair (incl. negative / zero opening)", () => {
    expect(() => evaluateMaxCapped(m("-100.00"), m("50.00"))).not.toThrow();
    expect(() => evaluateMaxCapped(m("0.00"), m("0.00"))).not.toThrow();
    expect(() =>
      validateMaxCapped({ openingBalance: m("-100.00"), maxCapped: m("500.00"), confirmed: false }),
    ).not.toThrow();
  });
});
