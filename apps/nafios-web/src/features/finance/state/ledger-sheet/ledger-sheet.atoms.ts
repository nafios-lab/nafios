import type { MonthlyLedger } from "@nafios/finance";
import { atom } from "jotai";

export const _ledgerInSession = atom<MonthlyLedger | null>(null);

export const _startLedgerSession = atom(null, (_, set, payload: MonthlyLedger) => {
  set(_ledgerInSession, payload);
});
