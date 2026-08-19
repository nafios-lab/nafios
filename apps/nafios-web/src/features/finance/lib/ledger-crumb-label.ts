import { formatMonthLong, monthOf } from "@nafios/datetime";

/**
 * The navbar crumb for a ledger sheet — `"2026-08-01"` → `"Ledger : August 2026"`.
 *
 * The noun rides *in* the label rather than sitting as its own crumb:
 * `/finance/ledger` is not a place (it redirects to the module root), so a
 * "Ledger" segment would point at the crumb before it.
 *
 * Takes the raw route param, not a `Month`, because the crumb is derived in the
 * Finance layout from a route match — the param is whatever is in the URL, and
 * it may be junk. A malformed month is the ledger page's error to surface, not
 * the navbar's, so this degrades to the bare noun instead of throwing and taking
 * the module chrome down with it.
 */
export function ledgerCrumbLabel(monthParam: string): string {
  try {
    return `Ledger : ${formatMonthLong(monthOf(monthParam))}`;
  } catch {
    return "Ledger";
  }
}
