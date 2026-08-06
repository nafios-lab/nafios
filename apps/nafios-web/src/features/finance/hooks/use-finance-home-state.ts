import { createLedgerQueries, type FinanceHomeState } from "@nafios/finance";
import { useQuery } from "@tanstack/react-query";
import { getFinanceClient } from "../lib/finance-client";
import { localTodayIso } from "../lib/local-today-iso";

/**
 * The Finance-Home read (EF3.13), client-side per ADR-0026: a `useQuery` against
 * the finance browser client that resolves the Home decision state
 * ({@link FinanceHomeState}) for the logged-in user. RLS scopes the read to the
 * user; a repository failure surfaces as the query's `error` (a `FinanceDataError`).
 *
 * `today` is the browser-local calendar day (D3) — keyed into `queryKey` so the
 * cache re-resolves if the day rolls over. The BE read reads no clock.
 */
export function useFinanceHomeState() {
  const today = localTodayIso();
  return useQuery<FinanceHomeState>({
    queryKey: ["finance", "home", today],
    queryFn: () => createLedgerQueries(getFinanceClient()).getFinanceHomeState(today),
    staleTime: Infinity,
  });
}
