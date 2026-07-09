import { describe, expect, test } from "bun:test";
import { DEFAULT_CATEGORIES } from "../../src/domain/default-categories";

// UNIT test over the pure default-category catalog (EF3.9 §4.1). Pins the exact
// eight-entry set + 0-based, monotonic displayOrder so a tuning edit is a
// deliberate, visible change (the list is the single source of truth — §2.1).

describe("DEFAULT_CATEGORIES", () => {
  test("is the exact eight-category set from finance-domain-spec §3, in order", () => {
    expect(DEFAULT_CATEGORIES).toEqual([
      { name: "Debt", displayOrder: 0 },
      { name: "Subscriptions", displayOrder: 1 },
      { name: "Taxes", displayOrder: 2 },
      { name: "Bills", displayOrder: 3 },
      { name: "Set-Asides", displayOrder: 4 },
      { name: "Advisories", displayOrder: 5 },
      { name: "Insurances & Investments", displayOrder: 6 },
      { name: "Life", displayOrder: 7 },
    ]);
  });

  test("displayOrder is 0-based and monotonic (matches array index)", () => {
    DEFAULT_CATEGORIES.forEach((c, i) => {
      expect(c.displayOrder).toBe(i);
    });
  });
});
