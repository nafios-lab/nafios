// @nafios/finance — domain layer (pure). Zero I/O, zero dependencies, no clock.
//
// THE derived-metrics engine. The four headline numbers on every ledger surface
// (COL, Health Margin, ASM Contribution, Outstanding) plus the negative-ASM
// signal are DERIVED, never stored — recomputed live on every read. The spec is
// blunt: "any implementation that produces different numbers for the same inputs
// is wrong by definition." Health Margin (MaxCapped − COL, a discipline gauge)
// and ASM Contribution (Opening − COL, real money) look alike but are distinct;
// they are pinned here, in ONE pure function, verified to the cent against the
// Jan 2027 reference, so nothing downstream re-derives them by hand.
//
// All money math flows through EF3.1's Money helpers (exact integer cents — no
// float). The COL-contributing set is decided ENTIRELY by EF3.3's countsTowardCol;
// this engine never hardcodes the pending+paid literals. The one status literal
// it names directly is 'pending', for the (narrower) Outstanding subset.

import { countsTowardCol, type EnvelopeStatus } from "./envelope";
import { isNegativeMoney, type Money, subtractMoney, sumMoney } from "./money";

/** "What's left to handle this month" — the count and summed amount of the
 *  `pending` envelopes only (monthly-ledger.md §5). `paid` is done, so it is
 *  NOT outstanding even though it counts toward COL. */
export interface Outstanding {
  readonly count: number; // number of pending envelopes
  readonly total: Money; // Σ(amount) over pending envelopes; ZERO_MONEY if none
}

/** The live derived metrics for one ledger. All money values are exact Money.
 *  Computed on read, never stored. */
export interface LedgerMetrics {
  readonly col: Money; // Σ(amount) where status is pending or paid
  readonly healthMargin: Money; // MaxCapped − COL  (may be negative = over ceiling)
  readonly asmContribution: Money; // Opening − COL    (may be negative = overspend)
  readonly outstanding: Outstanding;
  readonly isAsmNegative: boolean; // asmContribution < 0 → drives the persistent banner (EF3.13)
}

/**
 * THE metrics engine. Pure: same inputs → same outputs, no I/O, no clock.
 * Status-agnostic — it reads only balances + envelopes, so it computes the same
 * numbers whether the ledger is ongoing, reconciling, or settled.
 *
 * COL is summed via EF3.1's sumMoney over the envelopes EF3.3's countsTowardCol
 * accepts (pending + paid). Health Margin / ASM Contribution via subtractMoney
 * (both MAY be negative). Outstanding counts the `pending` subset only.
 *
 * Accepts any object with the metrics-relevant fields, so a full MonthlyLedger
 * satisfies it and test fixtures can be minimal.
 */
export function computeLedgerMetrics(ledger: {
  readonly openingBalance: Money;
  readonly maxCapped: Money;
  readonly envelopes: readonly { readonly amount: Money; readonly status: EnvelopeStatus }[];
}): LedgerMetrics {
  // COL — delegate the "which count" decision entirely to EF3.3's countsTowardCol.
  const col = sumMoney(
    ledger.envelopes.filter((e) => countsTowardCol(e.status)).map((e) => e.amount),
  );

  // Health Margin (discipline gauge) and ASM Contribution (real money) — distinct,
  // both may be negative.
  const healthMargin = subtractMoney(ledger.maxCapped, col);
  const asmContribution = subtractMoney(ledger.openingBalance, col);

  // Outstanding — the `pending` subset only (narrower than COL; `paid` is done).
  // sumMoney([]) is ZERO_MONEY, so an empty subset yields total 0 by construction.
  const pending = ledger.envelopes.filter((e) => e.status === "pending");
  const outstanding: Outstanding = {
    count: pending.length,
    total: sumMoney(pending.map((e) => e.amount)),
  };

  return {
    col,
    healthMargin,
    asmContribution,
    outstanding,
    isAsmNegative: isNegativeMoney(asmContribution),
  };
}
