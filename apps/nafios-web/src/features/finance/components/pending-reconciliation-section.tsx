import { Text } from "@nafios/ui/components/typography/text";
import { Alert, AlertDescription, AlertTitle } from "@nafios/ui/components/ui/alert";
import { Button } from "@nafios/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@nafios/ui/components/ui/collapsible";
import { Skeleton } from "@nafios/ui/components/ui/skeleton";
import { ChevronDown, Clock, ReceiptText, TriangleAlert } from "lucide-react";
import { useReconPendingLedgers } from "../hooks/use-recon-pending-ledgers";
import { PendingReconciliationLedgersList } from "./pending-reconciliation-ledgers-list";

/**
 * Pending Reconciliation section (EF3.10 / EF3.13) — the reconciliation worklist.
 * Reads client-side (ADR-0026) via `useReconPendingLedgers`: a collapsible
 * `<n> PENDING RECONCILIATION` header (the count from the resolved data) over a
 * body that is a skeleton while the read is in flight, a generic error card +
 * retry on failure, the `All caught up` empty state when nothing is reconciling,
 * else the `PendingReconciliationLedgersList` worklist. Renders as a sibling
 * below the hero (`FinanceHome`) in the left column (Scenario 4). Starts expanded
 * so the resolved state shows without a click.
 */
export function PendingReconciliationSection() {
  const query = useReconPendingLedgers();

  return (
    <Collapsible defaultOpen data-slot="pending-reconciliation" className="w-full">
      <CollapsibleTrigger className="group flex w-full items-center justify-between border-b border-border pb-3 text-left">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ReceiptText className="size-4" aria-hidden />
          {query.isPending ? <Skeleton className="h-4 w-8" /> : (query.data?.ledgers?.length ?? 0)}{" "}
          PENDING RECONCILIATION
        </span>
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {query.isError ? (
          <div className="py-4">
            <Alert variant="error">
              <TriangleAlert />
              <AlertTitle>Couldn't load pending reconciliations</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                Something went wrong reading your ledgers. Please try again.
                <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            {query.isPending && <Skeleton className="h-64 w-full rounded-xl" />}
            {!query.isPending &&
              (query.data.ledgers?.length === 0 ? (
                <>
                  <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border/70">
                    <Clock className="size-5 text-success-foreground" aria-hidden />
                  </div>
                  <Text size="sm" weight="medium">
                    All caught up, Yay!
                  </Text>
                </>
              ) : (
                <PendingReconciliationLedgersList ledgers={query.data.ledgers} />
              ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
