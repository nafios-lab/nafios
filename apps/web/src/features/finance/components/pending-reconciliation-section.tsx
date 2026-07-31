import { Text } from "@nafios/ui/components/typography/text";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@nafios/ui/components/ui/collapsible";
import { ChevronDown, Clock, ReceiptText } from "lucide-react";

/**
 * Pending Reconciliation section (EF3.10) — presentational placeholder, no data.
 * A collapsible `0 PENDING RECONCILIATION` header over an `All caught up` empty
 * state, built on the kit `Collapsible`. Renders below the hero in BOTH
 * left-column branches (Scenario 4). Starts expanded so the empty state shows.
 */
export function PendingReconciliationSection() {
  return (
    <Collapsible defaultOpen data-slot="pending-reconciliation">
      <CollapsibleTrigger className="group flex w-full items-center justify-between border-b border-border pb-3 text-left">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ReceiptText className="size-4" aria-hidden />0 PENDING RECONCILIATION
        </span>
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border/70">
            <Clock className="size-5 text-success-foreground" aria-hidden />
          </div>
          <Text size="sm" weight="medium">
            All caught up
          </Text>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
