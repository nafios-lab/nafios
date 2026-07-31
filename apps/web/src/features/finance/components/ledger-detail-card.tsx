import { Card } from "@nafios/ui/components/ui/card";
import { Text } from "@nafios/ui/components/typography/text";

/**
 * Placeholder Ledger Detail Card (EF3.10) — the left-column hero when the user
 * has an active (`ongoing`) ledger. A bare `Card` shell only: no data, no
 * metrics, no handlers. It reserves the ledger-card presentation so EF3.13 / the
 * ongoing-ledger view can fill it later without moving the display-decision
 * branch. No dedicated design image exists for this state yet.
 */
export function LedgerDetailCard() {
  return (
    <Card
      data-slot="ledger-detail-card"
      aria-label="Ledger detail"
      className="flex min-h-48 w-full max-w-md items-center justify-center border-dashed bg-muted/10 p-6 text-center"
    >
      <Text size="sm" muted>
        Ledger detail — design WIP
      </Text>
    </Card>
  );
}
