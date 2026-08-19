import { moneyFromCents } from "@nafios/finance";
import { MetricCard } from "./metric-card";

interface SummaryMetric {
  /** Stable render key — mirrors `SUMMARY_CARDS` in `ledger-loading.tsx`. */
  key: string;
  label: string;
  /** PLACEHOLDER amount in raw cents (540033 === $5,400.33). */
  cents: number;
  valueClassName?: string;
  editable?: boolean;
}

/**
 * The five figures the summary strip reports, in display order.
 *
 * The amounts are hardcoded stand-ins — the metrics read is not wired yet. They go
 * through `moneyFromCents` rather than an `as Money` cast so even the stand-ins are
 * built the one sanctioned way, and a bad literal fails loudly instead of silently
 * entering the domain as a fake Money.
 */
const SUMMARY_METRICS: readonly SummaryMetric[] = [
  { key: "opening-bal", label: "OPENING BAL", cents: 540033, editable: true },
  { key: "max-capped", label: "MAX CAPPED", cents: 640033, editable: true },
  { key: "col", label: "C.O.L", cents: 23300 },
  { key: "health-margin", label: "HEALTH MARGIN", cents: 23300, valueClassName: "text-brand" },
  { key: "asm-contr", label: "ASM CONTR", cents: 23300 },
];

/**
 * The ledger summary strip across the top of the sheet.
 *
 * `ledger-loading.tsx` mirrors this strip card-for-card, so the card count and the
 * card height are a contract between the two, not incidental styling. Wiring the
 * real metrics should replace the constants above and leave the shape alone.
 *
 * The edit affordances render but stay inert: `onEdit` is deliberately not passed
 * until the metric-edit flow exists — a handler that silently does nothing would
 * read as a working button.
 */
export function LedgerMetrics() {
  return (
    <div className="grid grid-cols-5 gap-4 px-4 pb-4">
      {SUMMARY_METRICS.map((metric) => (
        <MetricCard
          key={metric.key}
          label={metric.label}
          value={moneyFromCents(metric.cents)}
          valueClassName={metric.valueClassName}
          editable={metric.editable}
        />
      ))}
    </div>
  );
}
