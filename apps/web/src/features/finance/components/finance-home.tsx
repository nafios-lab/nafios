import { deriveLedgerHomeState, type LedgerHomeState } from "../lib/derive-ledger-home-state";
import { LedgerDetailCard } from "./ledger-detail-card";
import { LedgerStartCard } from "./ledger-start-card";
import { PendingReconciliationSection } from "./pending-reconciliation-section";
import { ViewSettledLedgersButton } from "./view-settled-ledgers-button";

export interface FinanceHomeProps {
  /**
   * The ledger-state seam. In EF3.10 it is injected/mocked; EF3.13 wires the
   * real read (the field names are the contract). Defaults to a locally
   * assembled seam (`hasActiveLedger` defaults to `false`).
   */
  readonly seam?: LedgerHomeState;
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
export function FinanceHome({ seam }: FinanceHomeProps) {
  const state = seam ?? deriveLedgerHomeState();

  return (
    <section className="flex min-h-[45vh] flex-1 flex-col gap-8 lg:min-h-0 lg:flex-[1.35]">
      {/* Hero — swapped by the display decision. */}
      <div className="flex flex-1 items-center justify-center">
        {state.hasActiveLedger ? (
          <LedgerDetailCard />
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
