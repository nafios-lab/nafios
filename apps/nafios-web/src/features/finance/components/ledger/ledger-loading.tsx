import { Skeleton } from "@nafios/ui/components/ui/skeleton";

/** Stable keys for the summary strip — one per metric card the loaded sheet renders. */
const SUMMARY_CARDS = ["opening-bal", "max-capped", "col", "health-margin", "asm-contr"] as const;

/** Placeholder envelope rows — enough to fill the fold without implying a real count. */
const ENVELOPE_ROWS = ["row-1", "row-2", "row-3", "row-4"] as const;

/**
 * Loading state for the monthly ledger sheet.
 *
 * Mirrors the loaded layout geometry 1:1 — the header bar (`ledger-header-bar.tsx`),
 * the five-card summary strip, and the envelope panel — so swapping in real data
 * causes no layout shift. Card and panel chrome render solid; only the content
 * inside them pulses, which reads as "this box is filling in" rather than
 * "the page is still being built".
 */
export function LedgerLoading() {
  return (
    <output aria-busy="true" className="flex w-full flex-col">
      <span className="sr-only">Loading ledger…</span>

      {/* Header bar — matches <LedgerHeaderBar/>: icon + month + status, actions right. */}
      <div className="flex w-full flex-row items-center justify-between p-4">
        <div className="flex flex-row items-center gap-2">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex flex-row items-center justify-end gap-2">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4">
        {/* Summary strip — same responsive grid as the loaded metric cards. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SUMMARY_CARDS.map((card) => (
            <div key={card} className="flex flex-col gap-3 rounded-xl bg-card p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>

        {/* Envelope panel — chrome is real, rows pulse. */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4">
          {ENVELOPE_ROWS.map((row) => (
            <div key={row} className="flex flex-row items-center gap-4 py-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24 max-w-full" />
              </div>
              <Skeleton className="h-5 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </output>
  );
}
