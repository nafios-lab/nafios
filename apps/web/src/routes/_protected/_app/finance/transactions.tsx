import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_app/finance/transactions")({
  component: FinanceTransactions,
});

function FinanceTransactions() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Finance · Transactions</h1>
      <p className="text-muted-foreground">Recent income and expense entries will appear here.</p>
    </div>
  );
}
