import { formatMonthLong, type Month } from "@nafios/datetime";
import { Button } from "@nafios/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nafios/ui/components/ui/dialog";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
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
};

export function CreateLedgerForm(props: CreateLedgerFormProps) {
  const [submitted, setSubmitted] = useState(false);

  const formApi = useForm({
    defaultValues: EMPTY_FORM,
    validators: {
      onSubmit: createLedgerSchema,
      onChange: createLedgerSchema,
    },
    onSubmit: async ({ value }) => {
      // Do something with form data
      console.log(value);
    },
  });

  const handleSubmit = () => {
    setSubmitted(true);
    formApi.handleSubmit();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
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
          <Button variant="brand" type="submit">
            Open ledger
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
