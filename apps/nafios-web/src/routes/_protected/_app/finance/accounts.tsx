import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_app/finance/accounts")({
  component: FinanceAccounts,
});

function FinanceAccounts() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Finance · Accounts</h1>
      <p className="text-muted-foreground">Bank, cash &amp; card accounts will be listed here.</p>
    </div>
  );
}
