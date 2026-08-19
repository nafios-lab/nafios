import { formatMonthLong, type Month } from "@nafios/datetime";
import { toast } from "@nafios/ui/components/ui/sonner";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useLedger } from "../../hooks/use-ledger";
import { _startLedgerSession } from "../../state/ledger-sheet/ledger-sheet.atoms";
import { LedgerHeaderBar } from "./ledger-header-bar";
import { LedgerLoading } from "./ledger-loading";
import { LedgerStatusAlert } from "./ledger-status-alert";

interface LedgerSheetProps {
  ledgerMonth: Month;
}
export function LedgerSheet({ ledgerMonth }: LedgerSheetProps) {
  const { isPending, data, isError, error, refetch } = useLedger(ledgerMonth);

  const startLedgerSession = useSetAtom(_startLedgerSession);

  useEffect(() => {
    if (!isPending && data?.ledger) {
      startLedgerSession(data.ledger);
    }
  }, [isPending, data?.ledger, startLedgerSession]);

  const TO_SHOW_ERROR = Boolean(isError && error !== null);

  useEffect(() => {
    if (!TO_SHOW_ERROR) {
      return;
    }
    // `error.message` is a `FinanceDataError` string — diagnostics, not copy — so
    // it goes to the console and the toast keeps to one line plus a retry.
    console.error(`[finance] failed to load the ${ledgerMonth} ledger`, error);

    // A stable id keeps a retry replacing the same toast instead of stacking.
    toast.error(`Couldn't load your ${formatMonthLong(ledgerMonth)} ledger`, {
      id: `ledger-load-failed:${ledgerMonth}`,
      description: "Nothing was lost. Check your connection and try again.",
      action: { label: "Retry", onClick: () => void refetch() },
      closeButton: true,
      duration: Infinity,
    });
  }, [TO_SHOW_ERROR, error, ledgerMonth, refetch]);

  if (isPending || TO_SHOW_ERROR) {
    return <LedgerLoading />;
  }

  return (
    <div className="flex flex-col">
      <LedgerHeaderBar />
      <LedgerStatusAlert />
    </div>
  );
}
