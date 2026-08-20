import { formatMoneyToFit, moneyFromCents } from "@nafios/finance";
import { CurrencyInput } from "@nafios/ui/components/currency-input";
import { Code } from "@nafios/ui/components/typography/code";
import { Text } from "@nafios/ui/components/typography/text";
import { Card } from "@nafios/ui/components/ui/card";
import { IconButton } from "@nafios/ui/components/ui/icon-button";
import { cn } from "@nafios/ui/lib/utils";
import { useAtomValue } from "jotai";
import { Check, EditIcon } from "lucide-react";
import { useState } from "react";
import { useUpdateOpeningBal } from "~/features/finance/hooks/use-update-opening-bal";
import { _metrics_openingBalance } from "~/features/finance/state/ledger-sheet/ledger-sheet.atoms";

// interface SummaryMetric {
//   /** Stable render key — mirrors `SUMMARY_CARDS` in `ledger-loading.tsx`. */
//   key: string;
//   label: string;
//   /** PLACEHOLDER amount in raw cents (540033 === $5,400.33). */
//   cents: number;
//   valueClassName?: string;
//   editable?: boolean;
// }

// /**
//  * The five figures the summary strip reports, in display order.
//  *
//  * The amounts are hardcoded stand-ins — the metrics read is not wired yet. They go
//  * through `moneyFromCents` rather than an `as Money` cast so even the stand-ins are
//  * built the one sanctioned way, and a bad literal fails loudly instead of silently
//  * entering the domain as a fake Money.
//  */
// const SUMMARY_METRICS: readonly SummaryMetric[] = [
//   { key: "opening-bal", label: "OPENING BAL", cents: 540033, editable: true },
//   { key: "max-capped", label: "MAX CAPPED", cents: 640033, editable: true },
//   { key: "col", label: "C.O.L", cents: 23300 },
//   { key: "health-margin", label: "HEALTH MARGIN", cents: 23300, valueClassName: "text-brand" },
//   { key: "asm-contr", label: "ASM CONTR", cents: 23300 },
// ];

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
      <MetricOpenBalance />
    </div>
  );
}

/**
 *
 * @returns
 */
export function MetricOpenBalance() {
  const openingBalance = useAtomValue(_metrics_openingBalance);
  const [editMode, setEditMode] = useState(false);

  const update = useUpdateOpeningBal();

  if (openingBalance === null) {
    return null;
  }

  const displayVal = formatMoneyToFit(openingBalance);

  const handleOnChange = (val: number | null) => {
    if (val !== null) {
      update(moneyFromCents(val));
    }
  };

  return (
    <Card className="relative flex h-[90px] flex-col gap-3 p-4">
      {!editMode && (
        <IconButton
          variant={"ghost"}
          className="absolute right-2 top-1"
          icon={<EditIcon />}
          aria-label="edit-OPENING BAL"
          onClick={() => {
            setEditMode(true);
          }}
        />
      )}
      <Text variant={"caption"}>OPENING BAL</Text>
      <div className="flex mr-[-10px]">
        {editMode ? (
          <div className="flex w-full min-w-0 flex-row items-center gap-2">
            {/* `min-w-0` + `flex-1`: the field absorbs every pixel the row has spare and
             *  is the only thing that gives them back as the viewport narrows. The
             *  wrapper exists because CurrencyInput forwards `className` to the inner
             *  `<input>`, not to TextInput's outer element — the flex child here. */}
            <div className="min-w-0 flex-1">
              <CurrencyInput
                hideSymbol={true}
                currency="SGD"
                locale="en-SG"
                autoFocus
                value={openingBalance}
                onValueChange={handleOnChange}
                onBlur={() => setEditMode(false)}
                onKeyDown={(event) => event.key === "Enter" && setEditMode(false)}
                className="border-none rounded-sm bg-input/50 focus:bg-input/50 focus-visible:ring-2"
              />
            </div>
            <IconButton
              variant={"outline"}
              // `shrink-0` keeps the 36px square square: `size-9` sets a width, but a
              // flex item still shrinks below it, and a squashed tick reads as broken.
              className="shrink-0"
              icon={<Check className="text-success-foreground" />}
              aria-label="save-edit"
              onClick={() => setEditMode(false)}
            />
          </div>
        ) : (
          <Code
            className={cn("bg-transparent p-0 font-black text-lg")}
            // `shortened` means what's on screen is an abbreviation of the real
            // amount, so the spec requires `exact` stay reachable: a tooltip for
            // sighted users, and the exact string read in place of the abbreviation
            // for screen readers. Both are dropped when no precision was given up.
            title={displayVal.shortened ? displayVal.exact : undefined}
          >
            {displayVal.shortened ? (
              <>
                <span aria-hidden="true">{displayVal.text}</span>
                <span className="sr-only">{displayVal.exact}</span>
              </>
            ) : (
              displayVal.text
            )}
          </Code>
        )}
      </div>
    </Card>
  );
}
