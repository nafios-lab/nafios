import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_app/finance/ledger/")({
  beforeLoad: () => {
    throw redirect({ to: "/finance" });
  },
});
