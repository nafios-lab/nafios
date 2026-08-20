import type { Money } from "@nafios/finance";
import { useSetAtom } from "jotai";
import { _metrics_openingBalance } from "../state/ledger-sheet/ledger-sheet.atoms";

export function useUpdateOpeningBal() {
  const updateOpeningBalance = useSetAtom(_metrics_openingBalance);

  return (value: Money) => {
    updateOpeningBalance(value);
    /** Lets do optimistic update here */
  };
}
