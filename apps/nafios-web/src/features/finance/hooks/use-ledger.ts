import type { Month } from "@nafios/datetime";
import { createLedgerQueries, type GetLedgerQueryResp } from "@nafios/finance";
import { useQuery } from "@tanstack/react-query";
import { getFinanceClient } from "../lib/finance-client";

/**
 * The single-ledger read behind the `/finance/ledger/$month` route, client-side
 * per ADR-0026: a `useQuery` against the finance browser client that resolves the
 * caller's {@link GetLedgerQueryResp} for one calendar month. RLS scopes the read
 * to the logged-in user; a repository failure surfaces as the query's `error`
 * (a `FinanceDataError`).
 *
 * Keyed by MONTH, not by id — `(user_id, month)` is the ledger's natural key per
 * user and the same key the route carries, so the page resolves straight from its
 * own URL with no id round-trip. `month` is part of `queryKey`, so each month
 * caches independently and navigating between months never reads a stale sibling.
 *
 * `data.ledger` is `null` for a month the user never opened — the roll-forward
 * gap the route renders as "not opened yet", a NORMAL state rather than an error,
 * so branch on `data.ledger`, not on `error`. The payload is the bare
 * `MonthlyLedger` header: no envelopes and no derived metrics (those come from the
 * envelope read / `get_ledger_summary`).
 *
 * @param month The month to read — a branded `Month` (`"YYYY-MM"`), so decode the
 *   route's `$month` param through `decodeMonth` before passing it here.
 * @returns `useQuery()` from tanstack query over `GetLedgerQueryResp`.
 */
export function useLedger(month: Month) {
  return useQuery<GetLedgerQueryResp>({
    queryKey: ["finance", "ledger", month],
    queryFn: () => createLedgerQueries(getFinanceClient()).getLedger(month),
    staleTime: Infinity,
  });
}
