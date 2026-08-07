import { createLedgerQueries, type ReconPendingLedgersQueryResp } from "@nafios/finance";
import { useQuery } from "@tanstack/react-query";
import { getFinanceClient } from "../lib/finance-client";

/**
 * @TODO docs
 * @returns
 */
export function useReconPendingLedgers() {
  return useQuery<ReconPendingLedgersQueryResp>({
    queryKey: ["finance", "recon-pending-ledgers"],
    queryFn: () => createLedgerQueries(getFinanceClient()).getReconPendingLedgers(),
    staleTime: Infinity,
  });
}
