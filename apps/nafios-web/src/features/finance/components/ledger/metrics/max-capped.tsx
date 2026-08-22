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
import { useUpdateLedgerHeader } from "~/features/finance/hooks/use-update-ledger-header";
import { ACK_OVERSPEND_COPY } from "~/features/finance/lib/ledger-header-update-rejection";

export function MetricMaxCapped() {
  const [editMode, setEditMode] = useState(false);

  const {
    baseLedger,
    fieldValue,
    setFieldValue,
    mutate,
    pendingAck,
    confirmAck,
    declineAck,
    cancelUpdate,
  } = useUpdateLedgerHeader({ field: "maxCapped" });

  const commit = () => {
    setEditMode(false);

    if (!baseLedger || fieldValue === null) return;
    if (compareMoney(fieldValue, baseLedger.maxCapped) === 0) return;
    mutate({ value: fieldValue, ack: false });
  };

  const onBlur = () => {
    setEditMode(false);
    cancelUpdate();
  };

  if (fieldValue === null) return null;

  const displayVal = formatMoneyToFit(fieldValue);

  return (
    <>
      <ConfirmDialog
        open={pendingAck !== null}
        onReject={declineAck}
        onConfirm={confirmAck}
        title={ACK_OVERSPEND_COPY.title}
        description={ACK_OVERSPEND_COPY.description}
      />
      <Card className="relative flex h-[90px] flex-col gap-3 p-4">
        {!editMode && (
          <IconButton
            variant={"ghost"}
            className="absolute right-2 top-1"
            icon={<EditIcon />}
            aria-label="edit-maxcapped"
            onClick={() => setEditMode(true)}
          />
        )}
        <Text variant="caption">MAX CAPPED</Text>
        <div className="flex mr-[-10px]">
          {editMode ? (
            <div className="flex w-full min-w-0 flex-row items-center gap-2">
              <div className="min-w-0 flex-1">
                <CurrencyInput
                  hideSymbol
                  currency="SGD"
                  locale="en-SG"
                  autoFocus
                  value={fieldValue}
                  onValueChange={(cents) => cents !== null && setFieldValue(moneyFromCents(cents))}
                  onBlur={onBlur}
                  onKeyDown={(event) => event.key === "Enter" && commit()}
                  className="border-none rounded-sm bg-input/50 focus:bg-input/50 focus-visible:ring-2"
                />
              </div>
              <IconButton
                variant="outline"
                className="shrink-0"
                icon={<Check className="text-success-foreground" />}
                aria-label="save-change-max-capped"
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
