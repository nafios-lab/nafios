import { Card, CardContent, CardHeader, CardTitle } from "@nafios/ui/components/ui/card";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate } from "lucide-react";
import { FinanceHome } from "~/features/finance/components/finance-home";
import { PendingReconciliationSection } from "~/features/finance/components/pending-reconciliation-section";
import { ViewSettledLedgersButton } from "~/features/finance/components/view-settled-ledgers-button";

// Index page for /finance — the finance home dashboard, rendered inside the
// finance module layout's outlet. The layout owns the rail + navbar; this file
// owns only the page body.
//
// Thin route (EF3.10 + EF3.13): it composes the two-column shell — the left
// column stacks the FinanceHome hero over the Pending Reconciliation worklist,
// the right is the presentational TEMPLATES panel. Per ADR-0026 each left-column
// feature reads its own data CLIENT-SIDE via TanStack Query (the finance browser
// client, RLS-scoped) and owns its own loading / error / ready states — module
// routes do not SSR their data. This file is pure layout; it holds no read and no
// state branches of its own.
export const Route = createFileRoute("/_protected/_app/finance/")({
  component: FinanceHomePage,
});

/**
 * The left-column frame — the stable footprint the hero + worklist stack inside,
 * so the layout doesn't jump as each feature moves through its own loading /
 * error / ready states. At `lg` the two-column shell splits 60/40: `lg:flex-3`
 * here vs `lg:flex-2` on the right Templates panel (grow ratio 3:2 over a 0 basis,
 * so the column gap is shared correctly). Below `lg` the columns stack, where the
 * base `flex-1` governs vertical growth.
 */
export const FINANCE_LEFT_COLUMN_CLASS = "flex flex-1 flex-col gap-10 lg:flex-3";

function FinanceHomePage() {
  return (
    // Stacks vertically on small screens and splits into two columns at `lg`.
    <div className="flex h-full min-h-full flex-col gap-6 lg:flex-row">
      {/* Left — primary content: the ledger dashboard (client-side read). */}
      <LedgersSectionPanel />
      {/* Right — TEMPLATES panel. Presentational placeholder only (out of scope
          for EF3.10): no data, no handlers. */}
      <Card className="flex min-h-[45vh] flex-1 flex-col lg:min-h-0 lg:flex-2">
        <CardHeader className="flex-row items-center gap-2 border-b border-border pb-4">
          <LayoutTemplate className="size-4 text-muted-foreground" />
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Templates
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pt-6">
          <p className="text-sm text-muted-foreground">Design Spec WIP</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The left column: the FinanceHome hero stacked over the Pending Reconciliation
 * worklist and the View Settled Ledgers CTA inside the shared frame. The hero and
 * worklist own their own client-side read and states (ADR-0026), so this panel is
 * pure layout — no read, no aria-busy of its own (each feature signals its own
 * busy/error inline).
 */
function LedgersSectionPanel() {
  return (
    <section className={FINANCE_LEFT_COLUMN_CLASS}>
      <div className="flex flex-col items-center w-full gap-8">
        <FinanceHome />
        <PendingReconciliationSection />
        <ViewSettledLedgersButton />
      </div>
    </section>
  );
}
