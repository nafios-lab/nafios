import { monthOf } from "@nafios/datetime";
import { type MonthlyLedger, moneyFromCents } from "@nafios/finance";

/**
 * A `MonthlyLedger` header — the exact shape `getLedger` resolves (no envelopes,
 * no derived metrics; both are separate reads per the domain spec §2).
 *
 * Shared by the ledger-sheet suites so the sheet, the header bar, and the atoms
 * all assert against one fixture: a field added to the entity is added here once.
 * The money figures are illustrative — nothing under test re-derives from them.
 */
export function makeLedger(overrides: Partial<MonthlyLedger> = {}): MonthlyLedger {
  return {
    id: "led_july_2026",
    month: monthOf("2026-07-01"),
    openingBalance: moneyFromCents(715235), // $7,152.35
    maxCapped: moneyFromCents(500000), // $5,000.00
    status: "ongoing",
    createdAt: "2026-07-01T08:00:00.000Z",
    settledAt: null,
    ...overrides,
  };
}
