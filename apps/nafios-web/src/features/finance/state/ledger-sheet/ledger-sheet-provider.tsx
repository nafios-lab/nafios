import { Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { JotaiDevtools } from "~/shared/components/dev/jotai-devtools";

interface LedgerSheetProviderProps extends PropsWithChildren {
  month: string;
}

/**
 * The client-state boundary for the ledger sheet. Every Jotai atom read beneath
 * it resolves against a store owned by this Provider, so unmounting the sheet —
 * or switching month, via the `key` — discards drafts, selection, and collapse
 * state with no cleanup effect to maintain.
 *
 * Holds no server data (ADR-0029 rule 3) and no navigational state (rule 5); it
 * carries a store handle, which is why it does not violate rule 6's ban on
 * Context-as-state-store.
 */
export function LedgerSheetProvider({ month, children }: LedgerSheetProviderProps) {
  // key={month} → a new store per month, so month-to-month navigation resets.
  return (
    <Provider key={month}>
      {children}
      {/* Inside the Provider by necessity: the inspector resolves the store it
          reads from context, and this store is the one that holds the atoms. */}
      <JotaiDevtools />
    </Provider>
  );
}
