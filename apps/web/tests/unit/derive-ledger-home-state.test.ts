import { describe, expect, test } from "bun:test";
import { monthOf } from "@nafios/finance";
import { deriveLedgerHomeState } from "../../src/features/finance/lib/derive-ledger-home-state.ts";

// The Lead-Day window (leadDays = 7) is open ⟺ (daysInMonth − dayOfMonth) < 7.
// July has 31 days, so the window opens on the 25th (31 − 25 = 6 < 7) and is
// closed on the 24th (31 − 24 = 7). Those two dates pin the boundary.

describe("deriveLedgerHomeState", () => {
  test("outside the Lead-Day window → isWithinLeadDay false, current/next months resolved", () => {
    const state = deriveLedgerHomeState({ today: "2026-07-10" });
    expect(state.isWithinLeadDay).toBe(false);
    expect(state.currentMonth).toBe(monthOf("2026-07-01"));
    expect(state.nextMonth).toBe(monthOf("2026-08-01"));
    expect(state.hasActiveLedger).toBe(false);
  });

  test("inside the Lead-Day window → isWithinLeadDay true", () => {
    const state = deriveLedgerHomeState({ today: "2026-07-28" });
    expect(state.isWithinLeadDay).toBe(true);
  });

  test("Lead-Day boundary: day 24 is outside, day 25 is inside", () => {
    expect(deriveLedgerHomeState({ today: "2026-07-24" }).isWithinLeadDay).toBe(false);
    expect(deriveLedgerHomeState({ today: "2026-07-25" }).isWithinLeadDay).toBe(true);
  });

  test("rolls the year over at December → January", () => {
    const state = deriveLedgerHomeState({ today: "2026-12-20" });
    expect(state.currentMonth).toBe(monthOf("2026-12-01"));
    expect(state.nextMonth).toBe(monthOf("2027-01-01"));
  });

  test("hasActiveLedger passes the injected mock flag through", () => {
    const state = deriveLedgerHomeState({ today: "2026-07-10", hasActiveLedger: true });
    expect(state.hasActiveLedger).toBe(true);
    // The Lead-Day fields are still resolved even when a ledger is active.
    expect(state.isWithinLeadDay).toBe(false);
  });

  test("defaults to the local client date when no `today` is supplied", () => {
    const state = deriveLedgerHomeState();
    // Shape-only: the clock read yields a valid Month pair; nextMonth is current + 1.
    expect(state.currentMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(state.nextMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(state.hasActiveLedger).toBe(false);
    expect(typeof state.isWithinLeadDay).toBe("boolean");
    expect(state.nextMonth > state.currentMonth).toBe(true);
  });
});
