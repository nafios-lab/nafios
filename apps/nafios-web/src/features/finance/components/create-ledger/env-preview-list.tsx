import type { Envelope } from "@nafios/finance";
import { Text } from "@nafios/ui/components/typography/text";
import { Card, CardContent } from "@nafios/ui/components/ui/card";
import { ListRestart } from "lucide-react";

type EnvPreviewListProps = {
  envs: Envelope[];
};
export function EnvPreviewList({ envs = [] }: EnvPreviewListProps) {
  /**
   * @TODO implement the list display for the envelopes
   */
  if (envs.length > 0) {
    return null;
  }

  /**
   * Display empty when no envelopes to be created upon creating this
   * ledger
   */
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center p-8 gap-4">
        <ListRestart className="text-muted-foreground" />
        <Text as="p" size={"sm"} muted className="text-center">
          No envelopes will be generated — you have no recurring templates yet. Add line items once
          the ledger opens.
        </Text>
      </CardContent>
    </Card>
  );
}
