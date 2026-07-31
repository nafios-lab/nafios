import { Card, CardContent, CardHeader, CardTitle } from "@nafios/ui/components/ui/card";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate } from "lucide-react";
import { FinanceHome } from "~/features/finance/components/finance-home";

// Index page for /finance — the finance home dashboard, rendered inside the
// finance module layout's outlet. The layout owns the rail + navbar; this file
// owns only the page body.
//
// Thin route (EF3.10): it composes the two-column shell — the left content
// column is the FinanceHome feature (owns the ledger-state display decision +
// the fresh/empty states), the right is the presentational TEMPLATES panel. The
// ledger-state seam is injected/mocked inside FinanceHome for this story (the
// real read is EF3.13); the route stays free of business logic.
export const Route = createFileRoute("/_protected/_app/finance/")({
  component: FinanceHomePage,
});

function FinanceHomePage() {
  return (
    // Stacks vertically on small screens and splits into two columns at `lg`.
    // `h-full` lets the columns stretch to fill the shell's scroll area on wide
    // screens; the per-column `min-h` keeps each region visible while stacked.
    <div className="flex h-full min-h-full flex-col gap-6 lg:flex-row">
      {/* Left — primary content: the ledger dashboard + creation entry points. */}
      <FinanceHome />

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
