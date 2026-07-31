import type { Month } from "@nafios/finance";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Badge } from "@nafios/ui/components/ui/badge";
import { Button } from "@nafios/ui/components/ui/button";
import { CircleHelp, ExternalLink, NotebookText } from "lucide-react";
import { formatMonthLong, formatMonthName } from "../lib/format-month";

export interface LedgerStartCardProps {
  /** Lead-Day window (from the seam). Selects the scenario: `false` → single CTA
   *  (Scenario 1), `true` → Recommended + secondary CTAs (Scenario 2). */
  readonly isWithinLeadDay: boolean;
  readonly currentMonth: Month;
  readonly nextMonth: Month;
}

/**
 * The empty/fresh state hero (EF3.10) — shown when the user has no active
 * ledger. Renders Scenario 1 (outside the Lead-Day window) or Scenario 2
 * (inside it) purely from the seam; month/year labels are computed. The CTAs are
 * eventless placeholders (no handler / no navigation) per the ticket.
 */
export function LedgerStartCard({
  isWithinLeadDay,
  currentMonth,
  nextMonth,
}: LedgerStartCardProps) {
  const currentName = formatMonthName(currentMonth);
  const nextName = formatMonthName(nextMonth);

  const body = isWithinLeadDay
    ? `${currentName} is nearly over, so we'd start you on ${nextName} — but you can still open ${currentName} if you want to track what's left.`
    : `Each month lives in its own ledger. Open one for ${currentName} to start tracking envelopes and cashflow`;

  const caption = isWithinLeadDay
    ? "You're in the recon-period, ready for next coming month"
    : `${nextName} will become available in the recon period`;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border border-dashed border-border/70 text-muted-foreground">
        <NotebookText className="size-6" aria-hidden />
      </div>

      <div className="space-y-2">
        <Heading as="h2" size="lg">
          Start your first month
        </Heading>
        <Text size="sm" muted>
          {body}
        </Text>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        {isWithinLeadDay ? (
          <>
            <Button variant="spotlight" className="w-full" iconLeft={<ExternalLink />}>
              Open {formatMonthLong(nextMonth)} ledger
              <Badge
                variant="spotlight"
                className="ml-1 rounded-full border-transparent font-medium"
              >
                Recommended
              </Badge>
            </Button>
            <Button variant="outline" className="w-full text-muted-foreground">
              Open {formatMonthLong(currentMonth)} Instead
            </Button>
          </>
        ) : (
          <Button variant="secondary" className="w-full" iconLeft={<ExternalLink />}>
            Open {formatMonthLong(currentMonth)} ledger
          </Button>
        )}
      </div>

      <Text as="span" size="xs" muted className="flex items-center gap-1.5">
        <CircleHelp className="size-3.5 shrink-0" aria-hidden />
        {caption}
      </Text>
    </div>
  );
}
