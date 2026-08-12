import { Button } from "@nafios/ui/components/ui/button";
import { ChevronRight } from "lucide-react";

/**
 * `View Settled Ledgers` CTA (EF3.10) — full-width outline button rendered per
 * design at the bottom of the left column. Presentational only: no click
 * handler / no navigation (out of scope for this story).
 */
export function ViewSettledLedgersButton() {
  return (
    <Button variant="outline" className="w-full" iconRight={<ChevronRight />}>
      View Settled Ledgers
    </Button>
  );
}
