import { monthOf } from "@nafios/datetime";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_app/finance/ledger/$month")({
  component: RouteComponent,
});

function RouteComponent() {
  const { month } = Route.useParams();
  const monthDisplay = monthOf(month);

  return <div>Monthly Ledger: {monthDisplay}</div>;
}
