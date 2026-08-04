import { Alert, AlertDescription, AlertTitle } from "@nafios/ui/components/ui/alert";
import { Button } from "@nafios/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@nafios/ui/components/ui/card";
import { Skeleton } from "@nafios/ui/components/ui/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate, TriangleAlert } from "lucide-react";
import { FINANCE_LEFT_COLUMN_CLASS, FinanceHome } from "~/features/finance/components/finance-home";
import { useFinanceHomeState } from "~/features/finance/hooks/use-finance-home-state";

// Index page for /finance — the finance home dashboard, rendered inside the
// finance module layout's outlet. The layout owns the rail + navbar; this file
// owns only the page body.
//
// Thin route (EF3.10 + EF3.13): it composes the two-column shell — the left
// content column is the FinanceHome feature (owns the ledger-state display
// decision + the fresh/empty states), the right is the presentational TEMPLATES
// panel. Per ADR-0026 the ledger-state seam is read CLIENT-SIDE via TanStack
// Query (the finance browser client, RLS-scoped) — module routes do not SSR their
// data, so the left column owns a mandatory loading state and a generic error
// state; both live here (routes/ is coverage-exempt) and stay minimal.
export const Route = createFileRoute("/_protected/_app/finance/")({
  component: FinanceHomePage,
});

function FinanceHomePage() {
  return (
    // Stacks vertically on small screens and splits into two columns at `lg`.
    <div className="flex h-full min-h-full flex-col gap-6 lg:flex-row">
      {/* Left — primary content: the ledger dashboard (client-side read). */}
      <FinanceHomeColumn />

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

/**
 * The left column: the client-side finance-home read (ADR-0026) with its
 * loading / error / ready states. A read only ever yields a generic failure
 * (a SELECT under RLS never surfaces a code the UI branches on — EF3.13 R3), so
 * the error path is one generic card + retry; no error-code matrix.
 */
function FinanceHomeColumn() {
  const query = useFinanceHomeState();

  if (query.isPending) {
    return (
      <section className={FINANCE_LEFT_COLUMN_CLASS} aria-busy="true">
        <div className="flex flex-col flex-1 items-start w-full gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className={FINANCE_LEFT_COLUMN_CLASS}>
        <div className="flex flex-col flex-1 items-center w-full">
          <Alert variant="error">
            <TriangleAlert />
            <AlertTitle>Couldn't load your finance home</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              Something went wrong reading your ledgers. Please try again.
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </section>
    );
  }

  return <FinanceHome seam={query.data} />;
}
