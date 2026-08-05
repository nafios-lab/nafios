import type { FinanceHomeState } from "@nafios/finance";
import { LedgerDetailCard } from "./ledger-detail-card";
import { LedgerStartCard } from "./ledger-start-card";
import { PendingReconciliationSection } from "./pending-reconciliation-section";
import { ViewSettledLedgersButton } from "./view-settled-ledgers-button";

/**
 * The left-column frame. Shared with the route's loading / error states AND the
 * ready state (`FinanceHome`) so the layout doesn't jump between loading / error
 * / ready — one source of truth for the section footprint. At `lg` the two-column
 * shell splits 60/40: `lg:flex-3` here vs `lg:flex-2` on the right Templates
 * panel (grow ratio 3:2 over a 0 basis, so the column gap is shared correctly).
 * Below `lg` the columns stack, where the base `flex-1` governs vertical growth.
 */
export const FINANCE_LEFT_COLUMN_CLASS = "flex flex-1 flex-col gap-10 lg:flex-3";

export interface FinanceHomeProps {
  /**
   * The ledger-state seam — the finance-home read's return (EF3.13). Required:
   * the page supplies it from `useFinanceHomeState`; tests inject it. Its field
   * names ARE the contract. Pure props (no query dependency) — so this component
   * needs no provider wrapper under test.
   */
  readonly seam: FinanceHomeState;
}

/**
 * Finance Home — the left (primary) content column (EF3.10).
 *
 * Owns the DISPLAY DECISION: it branches the hero region on the seam's
 * `hasActiveLedger` — `true` → the placeholder `LedgerDetailCard`, `false` → the
 * empty/fresh `LedgerStartCard` (which itself picks Scenario 1 vs 2 from the
 * Lead-Day flag). The Pending Reconciliation placeholder + `View Settled
 * Ledgers` render below the hero in BOTH branches (Scenario 4).
 */
export function FinanceHome({ seam: state }: FinanceHomeProps) {
  return (
    <section className={FINANCE_LEFT_COLUMN_CLASS}>
      {/* Hero — swapped by the display decision. */}
      <div className="flex  items-start justify-center">
        {state.hasActiveLedger && state.activeLedgerSummary !== null ? (
          <LedgerDetailCard {...state.activeLedgerSummary} />
        ) : (
          <LedgerStartCard
            isWithinLeadDay={state.isWithinLeadDay}
            currentMonth={state.currentMonth}
            nextMonth={state.nextMonth}
          />
        )}
      </div>

      {/* Reserved in both branches (Scenario 4) — kept even when the detail
          card shows, since a future task fills the reconciliation space. */}
      <div className="flex flex-col gap-6">
        <PendingReconciliationSection />
        <ViewSettledLedgersButton />
      </div>
    </section>
  );
}
