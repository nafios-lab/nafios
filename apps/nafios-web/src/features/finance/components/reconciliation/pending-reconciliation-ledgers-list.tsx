import { formatMonthLong } from "@nafios/datetime";
import { formatMoney, type ReconPendingLedger } from "@nafios/finance";
import { Text } from "@nafios/ui/components/typography/text";
import { Card } from "@nafios/ui/components/ui/card";
import { ChevronRight, NotebookText } from "lucide-react";

interface PendingReconciliationLedgersListProps {
  ledgers: ReconPendingLedger[];
}

export function PendingReconciliationLedgersList({
  ledgers,
}: PendingReconciliationLedgersListProps) {
  return (
    <div className="flex w-full flex-col gap-3 text-left">
      {ledgers.map((l) => (
        <Card key={`${l.id}-recon-pending-ledger`} className="overflow-hidden">
          {/* Header — notebook + month label */}
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <span className="flex items-center gap-2.5">
              <NotebookText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <Text as="span" weight="semibold" className="uppercase tracking-wide">
                {formatMonthLong(l.month)}
              </Text>
            </span>
          </div>

          {/* Footer — pending tally + review action, divided from the header */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <Text as="span" size="sm" weight="medium" className="text-warning-foreground">
                {l.pendingEnvCounts} {l.pendingEnvCounts === 1 ? "Pending" : "Pendings"}
              </Text>
              <Text as="span" size="sm" muted>
                Pending Amount:{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(l.pendingSumAmount)}
                </span>
              </Text>
            </div>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
            >
              Review
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
