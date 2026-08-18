import type { MonthlyLedger } from "@nafios/finance";
import { atom } from "jotai";

export const _ledgerInSession = atom<MonthlyLedger | null>(null);

export const _startLedgerSession = atom(null, (_, set, payload: MonthlyLedger) => {
  set(_ledgerInSession, payload);
});

// jotai-devtools lists atoms by `debugLabel`, falling back to a meaningless
// `1:atom` / `2:atom`. `@vitejs/plugin-react` v6 is oxc-based, so
// `jotai/babel/plugin-debug-label` can't derive these automatically — every atom
// in this app labels itself here, beside its definition.
_ledgerInSession.debugLabel = "ledgerInSession";
_startLedgerSession.debugLabel = "startLedgerSession";
