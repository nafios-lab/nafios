import { describe, expect, test } from "bun:test";
import { moneyFromCents } from "@nafios/finance";
import { createLedgerSchema } from "../../src/features/finance/schemas/create-ledger-schema.ts";

describe("createLedgerSchema", () => {
  test("accepts two keyed-in Money values and narrows them to non-null", () => {
    const result = createLedgerSchema.safeParse({
      openingBalance: moneyFromCents(715235),
      maxCapped: moneyFromCents(500000),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // `refine` narrows away the `null`, so the parsed output is the Money half
      // of CreateLedgerInput ready to drop into the command.
      expect(result.data.openingBalance).toBe(moneyFromCents(715235));
      expect(result.data.maxCapped).toBe(moneyFromCents(500000));
    }
  });

  test("accepts a zero amount — only null is the empty (failing) state", () => {
    const result = createLedgerSchema.safeParse({
      openingBalance: moneyFromCents(0),
      maxCapped: moneyFromCents(0),
    });
    expect(result.success).toBe(true);
  });

  test("rejects a null opening balance with the field's required message", () => {
    const result = createLedgerSchema.safeParse({
      openingBalance: null,
      maxCapped: moneyFromCents(500000),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "openingBalance");
      expect(issue?.message).toBe("Enter an opening balance");
    }
  });

  test("rejects a null spending cap with the field's required message", () => {
    const result = createLedgerSchema.safeParse({
      openingBalance: moneyFromCents(715235),
      maxCapped: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "maxCapped");
      expect(issue?.message).toBe("Enter a spending cap");
    }
  });

  test("reports both fields when the whole form is empty", () => {
    const result = createLedgerSchema.safeParse({ openingBalance: null, maxCapped: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual([
        "maxCapped",
        "openingBalance",
      ]);
    }
  });
});
