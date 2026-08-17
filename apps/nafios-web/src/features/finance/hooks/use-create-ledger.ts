import {
  type CreateLedgerInput,
  type CreateLedgerResult,
  createLedgerCommands,
} from "@nafios/finance";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFinanceClient } from "../lib/finance-client";

/**
 * @TODO spec
 * @returns `useMutation()` from tanstack query
 */
export function useCreateLedger() {
  const queryClient = useQueryClient();

  return useMutation<CreateLedgerResult, Error, CreateLedgerInput>({
    mutationFn: (input) => {
      return createLedgerCommands(getFinanceClient()).createLedger(input);
    },
    onSuccess: (result) => {
      // Only a real open changes server state worth rereading.
      // A pre-write
      // rejection ({ ok: false }) wrote nothing - leave the query cache untouched
      if (result.ok) {
        //  Broad key: reresolves every Finance-Home day slices
        queryClient.invalidateQueries({ queryKey: ["finance", "home"] });
      }
    },
  });
}
