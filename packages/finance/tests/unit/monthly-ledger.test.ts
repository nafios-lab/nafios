import { describe, expect, test } from "bun:test";
import { isLedgerHeaderEditable, isLedgerMutable } from "../../src/domain";

describe("isLedgerMutable — the status model's one rule", () => {
  test("#12 ongoing and reconciling ledgers are mutable", () => {
    expect(isLedgerMutable("ongoing")).toBe(true);
    expect(isLedgerMutable("reconciling")).toBe(true);
  });

  test("#13 settled ledgers are locked (immutable)", () => {
    expect(isLedgerMutable("settled")).toBe(false);
  });
});

describe("isLedgerHeaderEditable — the header (openingBalance / maxCapped) lock", () => {
  test("only an ongoing ledger's header money fields are editable", () => {
    expect(isLedgerHeaderEditable("ongoing")).toBe(true);
  });

  test("reconciling locks the header — the DIVERGENCE from isLedgerMutable", () => {
    // Reconciliation adjusts reality (envelope amounts, still mutable) to match
    // what happened; it never moves the month's income or its ceiling.
    expect(isLedgerHeaderEditable("reconciling")).toBe(false);
    expect(isLedgerMutable("reconciling")).toBe(true);
  });

  test("settled locks the header, like everything else", () => {
    expect(isLedgerHeaderEditable("settled")).toBe(false);
  });
});
