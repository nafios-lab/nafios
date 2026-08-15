import {
  computeLedgerMetrics,
  type Envelope,
  formatMoney,
  isNegativeMoney,
  type Money,
  ZERO_MONEY,
} from "@nafios/finance";
import { cn } from "@nafios/ui/lib/utils";
import { HealthMarginTile } from "./health-margin-tile";

export interface QuickOverviewProps {
  /** Opening balance the user has keyed, or `null` while the field is empty. */
  openingBalance: Money | null;
  /** Max Capped (the spending ceiling) the user has keyed, or `null` while empty. */
  maxCapped: Money | null;
  envelopesToBeCreated: Envelope[];
}

/**
 * The live "Quick Overview" preview under the create-ledger form: the three
 * derived tiles — Projected COL, Health Margin, ASM Contr. — recomputed on every
 * keystroke. It does NOT re-derive the formulas in React; it feeds the *draft*
 * ledger to `@nafios/finance`'s metrics engine so the formula lives once, in the
 * domain (EF3.11 / EF3.2).
 *
 * EF3 has no recurring templates, so the draft envelope set is always empty and
 * `Projected COL = $0.00`; the two remaining tiles collapse to the raw inputs.
 * A blank input previews as `$0.00` (`null` → `ZERO_MONEY`). The values still
 * flow through the engine, so once templates arrive (EF4+) the preview is correct
 * with no change here. Health Margin / ASM go red when negative via the shared
 * `Money` display rules — not special-cased away, even though COL = 0 keeps them
 * non-negative for now.
 */
export function QuickOverview({
  openingBalance,
  maxCapped,
  envelopesToBeCreated,
}: QuickOverviewProps) {
  const metrics = computeLedgerMetrics({
    openingBalance: openingBalance ?? ZERO_MONEY,
    maxCapped: maxCapped ?? ZERO_MONEY,
    envelopes: envelopesToBeCreated, // no recurring templates in EF3 ⇒ COL = 0
  });

  const tiles = [
    { label: "Projected COL", value: metrics.col, signed: false },
    // Health Margin renders its own gauge (HealthMarginTile) — `signed` is ignored for it.
    { label: "Health Margin", value: metrics.summarizedHealthMargin, signed: false },
    { label: "ASM Contr.", value: metrics.asmContribution, signed: true },
  ] as const;

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Quick Overview
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="flex flex-col gap-1.5 rounded-xl border bg-muted/40 px-4 py-3.5"
          >
            <span className="text-muted-foreground text-sm">{tile.label}</span>
            {tile.label === "Health Margin" ? (
              <HealthMarginTile summary={tile.value} />
            ) : (
              <span
                className={cn(
                  "font-bold text-xl tabular-nums",
                  tile.signed &&
                    (isNegativeMoney(tile.value) ? "text-destructive" : "text-success-foreground"),
                )}
              >
                {formatMoney(tile.value)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
