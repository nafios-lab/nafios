import { Heading } from "@nafios/ui/components/typography/heading";
import { Badge } from "@nafios/ui/components/ui/badge";
import { Button } from "@nafios/ui/components/ui/button";
import { NotebookText as LedgerIcon, ListCheck, PlusCircle } from "lucide-react";

interface LedgerHeaderBarProps {
  monthLedger: string;
}
export function LedgerHeaderBar({ monthLedger }: LedgerHeaderBarProps) {
  return (
    <div className="p-4 flex flex-row items-center w-full justify-between">
      <div className="flex flex-row items-center gap-2">
        <LedgerIcon size={20} />
        <Heading as="h3">{monthLedger}</Heading>
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
