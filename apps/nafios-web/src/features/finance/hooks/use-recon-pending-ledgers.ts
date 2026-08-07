import { createLedgerQueries, type ReconPendingLedger } from "@nafios/finance";
import { useQuery } from "@tanstack/react-query";
import { getFinanceClient } from "../lib/finance-client";

/**
 * @TODO docs
 * @returns
 */
export function useReconPendingLedgers() {
  return useQuery<ReconPendingLedger[]>({
    queryKey: ["finance", "recon-pending-ledgers"],
    queryFn: () => createLedgerQueries(getFinanceClient()).getReconPendingLedgers(),
    staleTime: Infinity,
  });
}
