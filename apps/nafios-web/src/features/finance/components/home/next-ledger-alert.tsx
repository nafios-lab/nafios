import { formatMonthLong, formatMonthName } from "@nafios/datetime";
import type { FinanceHomeState } from "@nafios/finance";
import { Alert, AlertDescription, AlertTitle } from "@nafios/ui/components/ui/alert";
import { Button } from "@nafios/ui/components/ui/button";
import { CalendarPlus, ExternalLink } from "lucide-react";

/**
 * Next-Ledger Alert (EF3.10) — the Lead-Day nudge to roll into next month,
 * shown above the active ledger's detail card whenever `today` falls inside the
 * Lead-Day window. Outside the window it renders nothing: mid-month there is no
 * "next month is ready" prompt.
 *
 * Two tones, driven by whether the closing month still has pending envelopes:
 *   • pending > 0  → `info` (blue) — wrapping up is the clean-close path, but the
 *                    user may open next month now and the stragglers reconcile.
 *   • pending === 0 → `success` (green) — the month is settled, roll over freely.
 * "No active ledger" collapses to the settled tone by construction: no ongoing
 * summary ⇒ zero pending. Colors track the theme's info/success tokens, not the
 * design mock's literal palette — same stance as the Ledger Detail Card.
 *
 * Presentation only — the CTA is an eventless placeholder (no handler / no
 * navigation) like the other EF3.10 heroes; the open-ledger flow lands later.
 */
export function NextLedgerAlert(state: FinanceHomeState) {
  // Purely a Lead-Day-window concern — nothing to prompt mid-month.
  if (!state.isWithinLeadDay) return null;

  const closingName = formatMonthName(state.currentMonth);
  const nextName = formatMonthName(state.nextMonth);
  // "July" → "Jul": the first three letters ARE the standard English
  // abbreviation for every month (Jan…Dec), so no separate formatter is needed.
  const nextShort = nextName.slice(0, 3);

  const pendingCount = state.activeLedgerSummary?.metrics.outstanding.count ?? 0;
  const hasPending = pendingCount > 0;

  const body = hasPending
    ? `Wrap up ${closingName}'s ${pendingCount} pending ${
        pendingCount === 1 ? "envelope" : "envelopes"
      } first for a clean close - or open ${nextName} now and they'll move into reconciliation`
    : `${closingName} is all settled — nothing pending. Roll into ${nextName} whenever you're ready.`;

  const autoCaption = `Opens automatically on ${nextShort} 1 if you don't`;

  return (
    <Alert variant={hasPending ? "info" : "success"} className="mb-6 gap-y-1.5 p-5">
      <CalendarPlus aria-hidden />
      <AlertTitle className="text-base font-semibold">
        {formatMonthLong(state.nextMonth)} is ready to open
      </AlertTitle>
      <AlertDescription>
        <p className="leading-relaxed">{body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="outline"
            iconLeft={<ExternalLink aria-hidden />}
            className="border-current/30 bg-transparent text-current hover:border-current/50 hover:bg-current/10 active:bg-current/15"
          >
            Open {nextName} ledger
          </Button>
          <span className="text-sm text-current/70">{autoCaption}</span>
        </div>
      </AlertDescription>
    </Alert>
  );
}
