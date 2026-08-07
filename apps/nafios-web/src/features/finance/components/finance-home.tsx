import { Alert, AlertDescription, AlertTitle } from "@nafios/ui/components/ui/alert";
import { Button } from "@nafios/ui/components/ui/button";
import { Skeleton } from "@nafios/ui/components/ui/skeleton";
import { TriangleAlert } from "lucide-react";
import { useFinanceHomeState } from "../hooks/use-finance-home-state";
import { LedgerDetailCard } from "./ledger-detail-card";
import { LedgerStartCard } from "./ledger-start-card";
import { NextLedgerAlert } from "./next-ledger-alert";

/**
 * Finance Home hero (EF3.10 / EF3.13) — the left column's primary content.
 *
 * Owns its own client-side read (ADR-0026) via `useFinanceHomeState`, so it also
 * owns the states that read implies: a skeleton while it's in flight, and a
 * generic error card + retry on failure (a SELECT under RLS never surfaces a code
 * the UI branches on — EF3.13 R3, so one generic path, no error-code matrix).
 *
 * On the resolved seam it makes the DISPLAY DECISION, branching on
 * `fresh_start_ledger` — `true` → the empty/fresh `LedgerStartCard` (which itself
 * picks Scenario 1 vs 2 from the Lead-Day flag); `false` → the `NextLedgerAlert`
 * plus the `LedgerDetailCard` whenever an `activeLedgerSummary` is present (a
 * non-fresh user with no ongoing ledger — e.g. only reconciling / settled — still
 * gets the alert, just no detail card). The Pending Reconciliation worklist is a
 * sibling rendered by the route, not here.
 */
export function FinanceHome() {
  const query = useFinanceHomeState();

  if (query.isPending) {
    return <Skeleton className="h-60 w-full rounded-xl" />;
  }

  if (query.isError) {
    return (
      <Alert variant="error">
        <TriangleAlert />
        <AlertTitle>Couldn't load your finance home</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          Something went wrong reading your ledgers. Please try again.
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const { fresh_start_ledger, isWithinLeadDay, currentMonth, nextMonth, activeLedgerSummary } =
    query.data;

  if (fresh_start_ledger) {
    return (
      <LedgerStartCard
        isWithinLeadDay={isWithinLeadDay}
        currentMonth={currentMonth}
        nextMonth={nextMonth}
      />
    );
  }

  return (
    <>
      <NextLedgerAlert {...query.data} />
      {activeLedgerSummary && <LedgerDetailCard {...activeLedgerSummary} />}
    </>
  );
}
