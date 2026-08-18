import { formatMonthLong, monthOf } from "@nafios/datetime";
import { createFileRoute } from "@tanstack/react-router";
import { LedgerHeaderBar } from "~/features/finance/components/ledger/ledger-header-bar";

export const Route = createFileRoute("/_protected/_app/finance/ledger/$month")({
  component: RouteComponent,
});

function RouteComponent() {
  const { month } = Route.useParams();

  return (
    <div className="flex flex-col gap-4">
      <LedgerHeaderBar monthLedger={formatMonthLong(monthOf(month))} />
    </div>
  );
}
