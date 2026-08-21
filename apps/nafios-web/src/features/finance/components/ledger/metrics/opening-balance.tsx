import { compareMoney, formatMoneyToFit, moneyFromCents } from "@nafios/finance";
import { ConfirmDialog } from "@nafios/ui/components/confirm-dialog";
import { CurrencyInput } from "@nafios/ui/components/currency-input";
import { Code } from "@nafios/ui/components/typography/code";
import { Text } from "@nafios/ui/components/typography/text";
import { Card } from "@nafios/ui/components/ui/card";
import { IconButton } from "@nafios/ui/components/ui/icon-button";
import { cn } from "@nafios/ui/lib/utils";
import { Check, EditIcon } from "lucide-react";
import { useState } from "react";
import { useOptimisticOpeningBal } from "~/features/finance/hooks/use-optimistic-opening-bal";
import { ACK_OVERSPEND_COPY } from "~/features/finance/lib/openin-bal-rejection";

/**
 *
 * @returns
 */
export function MetricOpenBalance() {
  const [editMode, setEditMode] = useState(false);
  const {
    baseLedger,
    openingBalance,
    setOpeningBalance,
    mutate,
    pendingAck,
    declineOverspend,
    confirmOverspend,
    cancelUpdate,
  } = useOptimisticOpeningBal();

  /**
   * Commit the changes on the opening balance input fields,
   *
   * @returns
   */
  const commit = () => {
    setEditMode(false);

    if (!baseLedger || openingBalance === null) return;
    if (compareMoney(openingBalance, baseLedger.openingBalance) === 0) return;
    mutate({ value: openingBalance, ack: false });
  };

  const onBlur = () => {
    setEditMode(false);
    cancelUpdate();
  };

  /**
   * Null is the PRE-READ state, not a zero: no ledger has been handed to the session
   * yet. Rendering the card here would put a $0.00 on screen that nobody read, so the
   * strip stays blank until the session is seeded — the same branch the header bar
   * takes for a month with no ledger.
   */
  if (openingBalance === null) return null;

  const displayVal = formatMoneyToFit(openingBalance);

  return (
    <>
      {/* `onReject` and NOT `onOpenChange`: the latter fires behind EVERY close,
       *  including the one Radix runs right after a confirm click, which would
       *  roll back the very value the user just acknowledged. `onReject` covers
       *  cancel, Esc, overlay and the X - every decline, and nothing else. The
       *  dialog closes on its own once the decision clears `pendingAck`. */}
      <ConfirmDialog
        open={pendingAck !== null}
        onReject={declineOverspend}
        title={ACK_OVERSPEND_COPY.title}
        description={ACK_OVERSPEND_COPY.description}
        confirmLabel="Acknowledge & save"
        onConfirm={confirmOverspend}
      />
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
                  onValueChange={(cents) =>
                    cents !== null && setOpeningBalance(moneyFromCents(cents))
                  }
                  onBlur={onBlur}
                  onKeyDown={(event) => event.key === "Enter" && commit()}
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
    </>
  );
}
