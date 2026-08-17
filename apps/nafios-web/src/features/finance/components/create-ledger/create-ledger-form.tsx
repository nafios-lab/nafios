import { encodeMonth, formatMonthLong, type Month } from "@nafios/datetime";
import type { CreateLedgerRejectionReason, CreateLedgerResult, Money } from "@nafios/finance";
import { ConfirmDialog } from "@nafios/ui/components/confirm-dialog";
import { ErrorDialog } from "@nafios/ui/components/error-dialog";
import { Button } from "@nafios/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nafios/ui/components/ui/dialog";
import { toast } from "@nafios/ui/components/ui/sonner";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCreateLedger } from "../../hooks/use-create-ledger";
import {
  type CreateLedgerFormValues,
  createLedgerSchema,
} from "../../schemas/create-ledger-schema";
import { MoneyInput } from "../shared/money-input";
import { EnvPreviewList } from "./env-preview-list";
import { QuickOverview } from "./quick-overview";
import { SaveDefaultsCheckbox } from "./save-defaults-checkbox";

interface CreateLedgerFormProps {
  ledgerMonth: Month;
  trigger: React.ReactNode;
}

const EMPTY_FORM: CreateLedgerFormValues = {
  openingBalance: null,
  maxCapped: null,
  acknowledgeOverspend: false,
};

// The reasons that surface as a blocking ErrorDialog. `overspend_warning`
// is deliberately excluded — it drives the ConfirmDialog (amber acknowledge
// flow), not the error surface.
type BlockedLedgerReason = Exclude<CreateLedgerRejectionReason, "overspend_warning">;

// Record<> makes this exhaustive: a new BlockedLedgerReason won't compile
// until it has a title here.
const BLOCKED_LEDGER_TITLES: Record<BlockedLedgerReason, string> = {
  exceeds_hard_cap: "Exceeds hard cap",
  negative_amount: "No negative amounts",
  month_not_openable: "This month can't be opened",
};

const BLOCKED_LEDGER_DESCRIPTIONS: Record<BlockedLedgerReason, string> = {
  exceeds_hard_cap:
    "Your spending cap is more than twice your opening balance. That's too far into deficit to open, and it can't be overridden — lower the cap and try again.",
  negative_amount:
    "Opening balance and spending cap must both be zero or more. Remove the negative amount and try again.",
  month_not_openable:
    "This month is outside the window you can open right now. You can only open the current month or the month ahead — pick one of those instead.",
};

export function CreateLedgerForm(props: CreateLedgerFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [ledgerCreateException, setLedgerCreateException] = useState<BlockedLedgerReason | null>(
    null,
  );
  const nav = useNavigate();

  const createLedger = useCreateLedger();

  const formApi = useForm({
    defaultValues: EMPTY_FORM,
    validators: {
      onSubmit: createLedgerSchema,
      onChange: createLedgerSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const result: CreateLedgerResult = await createLedger.mutateAsync({
          month: props.ledgerMonth,
          openingBalance: value.openingBalance as Money,
          maxCapped: value.maxCapped as Money,
          acknowledgedOverspend: value.acknowledgeOverspend ?? false,
        });

        if (!result.ok) {
          // Branch on `reason` alone — the UI needs no guardrail payload. Only the
          // amber case opens the confirm flow; every other reason is a blocking
          // ErrorDialog. (The else-branch narrows `reason` to BlockedLedgerReason.)
          if (result.reason === "overspend_warning") {
            setConfirmDialogOpen(true);
          } else {
            setLedgerCreateException(result.reason);
          }
          return;
        }
        setFormOpen(false);
        nav({ to: "/finance/ledger/$month", params: { month: encodeMonth(props.ledgerMonth) } });
      } catch (err) {
        toast.error("Couldn't open ledger", {
          description: err instanceof Error ? err.message : "Something went wrong.",
          closeButton: true,
          duration: Infinity,
        });
      }
    },
  });

  const handleSubmit = () => {
    setSubmitted(true);
    formApi.handleSubmit();
  };

  const handleConfirmAcknowledgement = () => {
    formApi.setFieldValue("acknowledgeOverspend", true);
    formApi.handleSubmit();
  };

  return (
    <>
      <ErrorDialog
        open={ledgerCreateException !== null}
        title={BLOCKED_LEDGER_TITLES[ledgerCreateException ?? "month_not_openable"]}
        description={BLOCKED_LEDGER_DESCRIPTIONS[ledgerCreateException ?? "month_not_openable"]}
        onDismiss={() => setLedgerCreateException(null)}
        dismissLabel="Close"
      />
      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        title="Spending cap exceeds your balance"
        description="Your spending cap is higher than your opening balance, so this ledger is set up to run at a deficit. You can continue, but the month will start in overspend. Acknowledge to open it anyway."
        confirmLabel="Acknowledge & open"
        onConfirm={handleConfirmAcknowledgement}
      />
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (open) {
            formApi.reset();
          }
        }}
      >
        <DialogTrigger asChild>{props.trigger}</DialogTrigger>
        <DialogContent className="p-0 sm:max-w-2xl">
          <DialogHeader className="border-b p-4">
            <DialogTitle>Open {formatMonthLong(props.ledgerMonth)}</DialogTitle>
            <DialogDescription>New Month Ledger</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSubmit();
            }}
          >
            <div className="flex flex-row items-start gap-4">
              <div className="flex-1">
                <formApi.Field name="openingBalance">
                  {(field) => (
                    <MoneyInput
                      name={field.name}
                      label="Opening balance"
                      value={field.state.value}
                      error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                    />
                  )}
                </formApi.Field>
              </div>
              <div className="flex-1">
                <formApi.Field name="maxCapped">
                  {(field) => (
                    <MoneyInput
                      name={field.name}
                      label="Max Capped"
                      value={field.state.value}
                      error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                    />
                  )}
                </formApi.Field>
              </div>
            </div>

            <SaveDefaultsCheckbox />
            <formApi.Subscribe
              selector={(state) => ({
                openingBalance: state.values.openingBalance,
                maxCapped: state.values.maxCapped,
              })}
            >
              {({ openingBalance, maxCapped }) => (
                <QuickOverview
                  openingBalance={openingBalance}
                  maxCapped={maxCapped}
                  envelopesToBeCreated={[]}
                />
              )}
            </formApi.Subscribe>
            <EnvPreviewList envs={[]} />
            <formApi.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button variant="brand" type="submit" showLoader={isSubmitting}>
                  Open ledger
                </Button>
              )}
            </formApi.Subscribe>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
