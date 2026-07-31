import { Card, CardContent, CardHeader, CardTitle } from "@nafios/ui/components/ui/card";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate } from "lucide-react";

// Index page for /finance — the finance home dashboard, rendered inside the
// finance module layout's outlet. The layout owns the rail + navbar; this file
// owns only the page body.
//
// This is the layout skeleton only (EF3.10). It establishes the two-column
// shell — a primary content column on the left and the TEMPLATES panel on the
// right — that the fresh/empty dashboard states and the ledger-creation CTAs
// will slot into later. Detailed UI, scenario logic, and data wiring are
// deliberately omitted here.
export const Route = createFileRoute("/_protected/_app/finance/")({
  component: FinanceHome,
});

function FinanceHome() {
  return (
    // Stacks vertically on small screens and splits into two columns at `lg`.
    // `h-full` lets the columns stretch to fill the shell's scroll area on wide
    // screens; the per-column `min-h` keeps each region visible while stacked.
    <div className="flex h-full min-h-full flex-col gap-6 lg:flex-row">
      {/* Left — primary content. Holds the ledger dashboard states and the
          ledger-creation entry points in a later step. Placeholder for now. */}
      <section className="flex min-h-[45vh] flex-1 flex-col lg:min-h-0 lg:flex-[1.35]">
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">Ledger dashboard — layout WIP</p>
        </div>
      </section>

      {/* Right — TEMPLATES panel. Presentational placeholder only (out of scope
          for EF3.10): no data, no handlers. */}
      <Card className="flex min-h-[45vh] flex-1 flex-col lg:min-h-0">
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
