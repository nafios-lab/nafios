import { formatMonthLong } from "@nafios/datetime";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Badge } from "@nafios/ui/components/ui/badge";
import { Button } from "@nafios/ui/components/ui/button";
import { useAtomValue } from "jotai";
import { NotebookText as LedgerIcon, ListCheck, PlusCircle } from "lucide-react";
import { _ledgerInSession } from "../../state/ledger-sheet/ledger-sheet.atoms";

export function LedgerHeaderBar() {
  const ledger = useAtomValue(_ledgerInSession);

  if (ledger === null) {
    return null;
  }
  return (
    <div className="p-4 flex flex-row items-center w-full justify-between">
      <div className="flex flex-row items-center gap-2">
        <LedgerIcon size={20} />
        <Heading as="h3">{formatMonthLong(ledger.month)}</Heading>
        <Badge variant="success">ON-GOING</Badge>
      </div>
      <div className="flex flex-rows items-center justify-end gap-2">
        <Button variant={"secondary"} iconLeft={<PlusCircle />}>
          Add Envelope
        </Button>
        <Button variant={"secondary"} size={"icon"}>
          <ListCheck />
        </Button>
      </div>
    </div>
  );
}
