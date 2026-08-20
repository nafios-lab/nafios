import { formatMoneyToFit, type Money } from "@nafios/finance";
import { CurrencyInput } from "@nafios/ui/components/currency-input";
import { Code } from "@nafios/ui/components/typography/code";
import { Text } from "@nafios/ui/components/typography/text";
import { Card } from "@nafios/ui/components/ui/card";
import { IconButton } from "@nafios/ui/components/ui/icon-button";
import { cn } from "@nafios/ui/lib/utils";
import { Check, EditIcon as EditMetricIcon } from "lucide-react";
import { useState } from "react";

interface MetricCardProps {
  label: string;
  /** The figure this card reports. The card formats it itself — a metric card in a
   *  5-up row IS the width-constrained slot `formatMoneyToFit` was written for, and
   *  keeping the call here is what lets the card honour `shortened` (see below). */
  value: Money;
  /** Extra classes for the figure alone — a metric that carries a verdict tints it. */
  valueClassName?: string;
  editable?: boolean;
  onEdit?: () => void;
}

/**
 * @deprecated
 * One figure in the ledger summary strip: a caption, the amount, and an optional
 * edit affordance.
 *
 * Height is pinned to the same 90px `ledger-loading.tsx` draws for its skeleton
 * card. The two states must occupy identical space or the read landing shifts the
 * page — change one and change the other (`ledger-metrics.test.tsx` fails the pair
 * together). `box-sizing: border-box` means the Card's border is inside the 90px,
 * so the bordered card and the borderless skeleton measure the same.
 */
export function MetricCard(props: MetricCardProps) {
  const [editMode, setEditMode] = useState(false);

  const amount = formatMoneyToFit(props.value);

  return (
    <Card className="relative flex h-[90px] flex-col gap-3 p-4">
      {props.editable && !editMode && (
        <IconButton
          variant={"ghost"}
          className="absolute right-2 top-1"
          icon={<EditMetricIcon />}
          aria-label={`edit-${props.label}`}
          onClick={() => {
            setEditMode(true);
            props.onEdit?.();
          }}
        />
      )}
      <Text variant={"caption"}>{props.label}</Text>
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
            className={cn("bg-transparent p-0 font-black text-lg", props.valueClassName)}
            // `shortened` means what's on screen is an abbreviation of the real
            // amount, so the spec requires `exact` stay reachable: a tooltip for
            // sighted users, and the exact string read in place of the abbreviation
            // for screen readers. Both are dropped when no precision was given up.
            title={amount.shortened ? amount.exact : undefined}
          >
            {amount.shortened ? (
              <>
                <span aria-hidden="true">{amount.text}</span>
                <span className="sr-only">{amount.exact}</span>
              </>
            ) : (
              amount.text
            )}
          </Code>
        )}
      </div>
    </Card>
  );
}
