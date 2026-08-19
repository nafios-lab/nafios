import { formatTimestamp } from "@nafios/datetime";
import { Alert, AlertDescription, AlertTitle } from "@nafios/ui/components/ui/alert";
import { useAtomValue } from "jotai";
import { CheckCircle, TriangleAlert } from "lucide-react";
import { _ledgerInSession } from "../../state/ledger-sheet/ledger-sheet.atoms";

export function LedgerStatusAlert() {
  const ledger = useAtomValue(_ledgerInSession);

  if (ledger === null) {
    return null;
  }

  const { status, settledAt } = ledger;

  return (
    <div className="px-4">
      {status === "reconciling" && (
        <Alert variant={"warning"}>
          <TriangleAlert />
          <AlertTitle>This ledger is in reconciliation</AlertTitle>
          <AlertDescription>
            Please close all pending envelopese and settle it as soon as possible before running the
            next month ledger
          </AlertDescription>
        </Alert>
      )}
      {status === "settled" && settledAt !== null && (
        <Alert variant={"default"}>
          <CheckCircle />
          <AlertTitle>This ledger is settled as of {formatTimestamp(settledAt)}.</AlertTitle>
          <AlertDescription>All envelopes are locked and no other actions needed</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
