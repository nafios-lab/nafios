import { formatMonthLong, formatMonthName } from "@nafios/datetime";
import { formatMoney, type LedgerStatus, type LedgerSummaryCard } from "@nafios/finance";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Badge } from "@nafios/ui/components/ui/badge";
import { Card } from "@nafios/ui/components/ui/card";
import { Progress } from "@nafios/ui/components/ui/progress";
import { cn } from "@nafios/ui/lib/utils";
import {
  ArrowRightFromLine,
  CircleCheck,
  CircleMinus,
  Clock,
  type LucideIcon,
  NotebookText,
} from "lucide-react";

/** Per-status header pill. Stays on our semantic-feedback palette (success /
 *  warning / muted) rather than the design mock's raw greens. */
const STATUS_PILL: Record<LedgerStatus, { readonly label: string; readonly className: string }> = {
  ongoing: {
    label: "On-going",
    className: "border-success-subtle bg-success/50 text-success-foreground",
  },
  reconciling: {
    label: "Reconciling",
    className: "border-warning-subtle bg-warning/50 text-warning-foreground",
  },
  settled: { label: "Settled", className: "border-border bg-muted text-muted-foreground" },
};

/** One headline metric — an overline label over a large exact-money figure. */
function MetricTile({
  label,
  value,
  negative = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly negative?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-4">
      <Text as="span" variant="overline">
        {label}
      </Text>
      <Text as="span" size="xl" weight="bold" className={cn(negative && "text-error-foreground")}>
        {value}
      </Text>
    </div>
  );
}

/** A status tally in the footer — icon + count, tinted by the status token so
 *  the whole chip reads as one color. */
function StatusChip({
  icon: Icon,
  count,
  label,
  className,
}: {
  readonly icon: LucideIcon;
  readonly count: number;
  readonly label: string;
  readonly className: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <Text as="span" size="sm" weight="medium">
        {count} {label}
      </Text>
    </span>
  );
}

/**
 * Ledger Detail Card (EF3.10) — the left-column hero when the user has an active
 * ledger. Composes the ledger summary read (`LedgerSummaryCard`) into the header
 * pill, the month + opening/max-capped line, the two headline metrics
 * (Cost of Living / Free Margin), the paid-vs-total envelope progress bar, and
 * the per-status footer tally. Presentation only — no data fetching, no
 * handlers. Colors track the NafiOS theme tokens, not the design mock's literal
 * palette.
 */
export function LedgerDetailCard(summary: LedgerSummaryCard) {
  const pill = STATUS_PILL[summary.status];
  const { counts, metrics } = summary;

  const chips: readonly {
    readonly icon: LucideIcon;
    readonly count: number;
    readonly label: string;
    readonly className: string;
  }[] = [
    { icon: CircleCheck, count: counts.paid, label: "Paid", className: "text-status-paid" },
    { icon: Clock, count: counts.pending, label: "Pending", className: "text-status-pending" },
    // Skipped is only meaningful once something has been skipped.
    ...(counts.skipped > 0
      ? [
          {
            icon: CircleMinus,
            count: counts.skipped,
            label: "Skipped",
            className: "text-status-on-hold",
          },
        ]
      : []),
    {
      icon: ArrowRightFromLine,
      count: counts.carriedOver,
      label: "Carry-Over",
      className: "text-status-carry-over",
    },
  ];

  return (
    <Card
      data-slot="ledger-detail-card"
      aria-label={`Ledger for ${formatMonthLong(summary.month)}`}
      className="w-full p-6"
    >
      {/* Header — icon + label, and the lifecycle pill. */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <NotebookText className="size-5 shrink-0" aria-hidden />
          <Text as="span" variant="overline">
            Ledger
          </Text>
        </div>
        <Badge
          variant="outline"
          className={cn("rounded-full px-3 uppercase tracking-wider", pill.className)}
        >
          {pill.label}
        </Badge>
      </div>

      <div className="mt-4 h-px bg-border/60" />

      {/* Month + opening/ceiling line. */}
      <div className="mt-5 space-y-1">
        <Heading as="h2" size="xl" className="uppercase">
          {formatMonthName(summary.month)}, {summary.month.slice(0, 4)}
        </Heading>
        <Text size="sm" muted>
          {formatMoney(summary.openingBalance)} Opening · {formatMoney(summary.maxCapped)} Max
          Capped
        </Text>
      </div>

      {/* The two headline metrics. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricTile label="Cost of Living" value={formatMoney(metrics.col)} />
        <MetricTile
          label="Free Margin (ASM)"
          value={formatMoney(metrics.asmContribution)}
          negative={metrics.isAsmNegative}
        />
      </div>

      {/* Envelope progress — paid share of the whole ledger. */}
      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Text as="span" size="sm" muted>
            Envelope Progress
          </Text>
          <Text as="span" size="sm" muted>
            {metrics.outstanding.count} pending
          </Text>
        </div>
        <Progress variant="brand" value={counts.paid} max={Math.max(counts.total, 1)} />
      </div>

      {/* Per-status tally. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        {chips.map((chip) => (
          <StatusChip
            key={chip.label}
            icon={chip.icon}
            count={chip.count}
            label={chip.label}
            className={chip.className}
          />
        ))}
      </div>
    </Card>
  );
}
