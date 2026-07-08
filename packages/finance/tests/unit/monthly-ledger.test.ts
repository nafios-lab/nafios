import { describe, expect, test } from "bun:test";
import { isLedgerMutable } from "../../src/domain";

describe("isLedgerMutable — the status model's one rule", () => {
  test("#12 ongoing and reconciling ledgers are mutable", () => {
    expect(isLedgerMutable("ongoing")).toBe(true);
    expect(isLedgerMutable("reconciling")).toBe(true);
  });

  test("#13 settled ledgers are locked (immutable)", () => {
    expect(isLedgerMutable("settled")).toBe(false);
  });
});
