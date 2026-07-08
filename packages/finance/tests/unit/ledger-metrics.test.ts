import { describe, expect, test } from "bun:test";
import {
  computeLedgerMetrics,
  decodeMoney,
  type EnvelopeStatus,
  encodeMoney,
  type LedgerStatus,
  subtractMoney,
} from "../../src/domain";

/** Build the minimal metrics-relevant ledger shape from terse fixtures. */
function ledgerOf(
  opening: string,
  maxCapped: string,
  envelopes: readonly [string, EnvelopeStatus][],
) {
  return {
    openingBalance: decodeMoney(opening),
    maxCapped: decodeMoney(maxCapped),
    envelopes: envelopes.map(([amount, status]) => ({ amount: decodeMoney(amount), status })),
  };
}

const JAN_2027 = ledgerOf("7152.35", "6415.00", [
  ["1200.00", "pending"],
  ["3107.28", "paid"],
  ["500.00", "skipped"],
  ["250.00", "carried-over"],
]);

describe("computeLedgerMetrics — the §6 matrix", () => {
  test("#1 Jan 2027 anchor reproduces every metric to the cent", () => {
    const m = computeLedgerMetrics(JAN_2027);
    expect(encodeMoney(m.col)).toBe("4307.28");
    expect(encodeMoney(m.healthMargin)).toBe("2107.72");
    expect(encodeMoney(m.asmContribution)).toBe("2845.07");
    expect(m.outstanding.count).toBe(1);
    expect(encodeMoney(m.outstanding.total)).toBe("1200.00");
    expect(m.isAsmNegative).toBe(false);
  });

  test("#2 empty ledger — COL 0, HM == MaxCapped, ASM == Opening", () => {
    const m = computeLedgerMetrics(ledgerOf("7152.35", "6415.00", []));
    expect(encodeMoney(m.col)).toBe("0.00");
    expect(encodeMoney(m.healthMargin)).toBe("6415.00");
    expect(encodeMoney(m.asmContribution)).toBe("7152.35");
    expect(m.outstanding.count).toBe(0);
    expect(encodeMoney(m.outstanding.total)).toBe("0.00");
    expect(m.isAsmNegative).toBe(false);
  });

  test("#3 only excluded statuses → COL 0 (delegates to countsTowardCol)", () => {
    const m = computeLedgerMetrics(
      ledgerOf("1000.00", "1000.00", [
        ["500.00", "skipped"],
        ["250.00", "carried-over"],
      ]),
    );
    expect(encodeMoney(m.col)).toBe("0.00");
  });

  test("#4 COL = pending + paid only", () => {
    const m = computeLedgerMetrics(
      ledgerOf("1000.00", "1000.00", [
        ["100.00", "pending"],
        ["200.00", "paid"],
        ["400.00", "skipped"],
        ["800.00", "carried-over"],
      ]),
    );
    expect(encodeMoney(m.col)).toBe("300.00");
  });

  test("#5 Outstanding is pending-only, not paid", () => {
    const m = computeLedgerMetrics(
      ledgerOf("1000.00", "1000.00", [
        ["100.00", "pending"],
        ["200.00", "pending"],
        ["300.00", "paid"],
      ]),
    );
    expect(encodeMoney(m.col)).toBe("600.00");
    expect(m.outstanding.count).toBe(2);
    expect(encodeMoney(m.outstanding.total)).toBe("300.00");
  });

  test("#6 negative ASM sets isAsmNegative", () => {
    const m = computeLedgerMetrics(
      ledgerOf("1000.00", "1000.00", [
        ["800.00", "pending"],
        ["700.00", "paid"],
      ]),
    );
    expect(encodeMoney(m.asmContribution)).toBe("-500.00");
    expect(m.isAsmNegative).toBe(true);
  });

  test("#7 ASM exactly zero is NOT negative (0 is not < 0)", () => {
    const m = computeLedgerMetrics(ledgerOf("1000.00", "1000.00", [["1000.00", "paid"]]));
    expect(encodeMoney(m.asmContribution)).toBe("0.00");
    expect(m.isAsmNegative).toBe(false);
  });

  test("#8 negative Health Margin with positive ASM", () => {
    const m = computeLedgerMetrics(ledgerOf("2000.00", "1000.00", [["1200.00", "pending"]]));
    expect(encodeMoney(m.healthMargin)).toBe("-200.00");
    expect(encodeMoney(m.asmContribution)).toBe("800.00");
    expect(m.isAsmNegative).toBe(false);
  });

  test("#9 structural gap: ASM − HM == Opening − MaxCapped", () => {
    const m = computeLedgerMetrics(JAN_2027);
    expect(encodeMoney(subtractMoney(m.asmContribution, m.healthMargin))).toBe("737.35");
  });

  test("#10 exact sum — no float drift", () => {
    const m = computeLedgerMetrics(
      ledgerOf("100.00", "100.00", [
        ["0.10", "pending"],
        ["0.20", "paid"],
      ]),
    );
    expect(encodeMoney(m.col)).toBe("0.30");
  });

  test("#11 status-agnostic — same metrics for ongoing/reconciling/settled", () => {
    const statuses: LedgerStatus[] = ["ongoing", "reconciling", "settled"];
    const snapshot = (status: LedgerStatus) => {
      // A full ledger carries `status`; the engine reads only balances + envelopes,
      // so it must yield identical metrics whatever the status is.
      const ledger = { ...JAN_2027, status };
      const m = computeLedgerMetrics(ledger);
      return {
        col: encodeMoney(m.col),
        healthMargin: encodeMoney(m.healthMargin),
        asmContribution: encodeMoney(m.asmContribution),
        count: m.outstanding.count,
        total: encodeMoney(m.outstanding.total),
        isAsmNegative: m.isAsmNegative,
      };
    };
    const baseline = snapshot("ongoing");
    for (const status of statuses) {
      expect(snapshot(status)).toEqual(baseline);
    }
  });
});
