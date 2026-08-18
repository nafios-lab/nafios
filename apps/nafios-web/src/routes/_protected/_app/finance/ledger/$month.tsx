import { formatMonthLong, monthOf } from "@nafios/datetime";
import { createFileRoute } from "@tanstack/react-router";
import { LedgerSheet } from "~/features/finance/components/ledger";
import { LedgerSheetProvider } from "~/features/finance/state/ledger-sheet/ledger-sheet-provider";

export const Route = createFileRoute("/_protected/_app/finance/ledger/$month")({
  component: RouteComponent,
});

function RouteComponent() {
  const { month } = Route.useParams();

  const ledgerMonth = monthOf(month);
  return (
    <LedgerSheetProvider month={formatMonthLong(ledgerMonth)}>
      <LedgerSheet ledgerMonth={ledgerMonth} />
    </LedgerSheetProvider>
  );
}
