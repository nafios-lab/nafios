import { createFileRoute } from "@tanstack/react-router";

// Index page for /finance — rendered inside the finance module layout's outlet.
// The layout owns the rail + navbar; this file owns only the (stub) page body.
export const Route = createFileRoute("/_protected/_app/finance/")({
  component: FinanceOverview,
});

function FinanceOverview() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Finance · Overview</h1>
      <p className="text-muted-foreground">
        Income, expenses &amp; net worth at a glance. Real UI arrives with the finance feature epic.
      </p>
    </div>
  );
}
