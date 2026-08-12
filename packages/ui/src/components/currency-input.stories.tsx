import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CurrencyInput, type CurrencyInputProps } from "./currency-input.tsx";

const meta: Meta<CurrencyInputProps> = {
  title: "Composites/CurrencyInput",
  component: CurrencyInput,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A guided currency field. Auto-groups **live as you type** " +
          '("1234567" → "1,234,567") with the caret held in place, pads the fraction ' +
          "on blur, and talks to its owner in **integer minor units** (cents for USD) " +
          "via `value` / `onValueChange` — never a lossy float.",
      },
    },
  },
  argTypes: {
    currency: { control: "text" },
    locale: { control: "text" },
    label: { control: "text" },
    helperText: { control: "text" },
    error: { control: "text" },
    placeholder: { control: "text" },
    allowNegative: { control: "boolean" },
    hideSymbol: { control: "boolean" },
    disabled: { control: "boolean" },
    min: { control: "number" },
    max: { control: "number" },
    value: { control: false },
    defaultValue: { control: false },
    onValueChange: { control: false },
  },
};

export default meta;
type Story = StoryObj<CurrencyInputProps>;

export const Default: Story = {
  args: { label: "Amount", placeholder: "0.00" },
};

export const WithInitialValue: Story = {
  args: { label: "Opening balance", defaultValue: 715235, helperText: "Stored as 715235 cents." },
};

export const WithError: Story = {
  args: { label: "Amount", defaultValue: 0, error: "Amount must be greater than zero." },
};

export const WithoutSymbol: Story = {
  args: { label: "Amount", hideSymbol: true, placeholder: "0.00" },
};

export const AllowNegative: Story = {
  args: { label: "Adjustment", allowNegative: true, defaultValue: -143030 },
};

export const CappedAtOneThousand: Story = {
  args: {
    label: "Amount (max $1,000)",
    max: 100000,
    helperText: "Values above 100000 cents are clamped.",
  },
};

export const EuroDeLocale: Story = {
  args: { label: "Betrag", currency: "EUR", locale: "de-DE", defaultValue: 715235 },
};

export const JapaneseYen: Story = {
  args: { label: "金額", currency: "JPY", locale: "ja-JP", defaultValue: 7152 },
};

export const SingaporeDollar: Story = {
  args: {
    label: "Amount",
    currency: "SGD",
    locale: "en-SG",
    defaultValue: 715235,
    helperText: "SGD in the en-SG locale — S$ symbol, 2 fraction digits.",
  },
};

export const MalaysianRinggit: Story = {
  args: {
    label: "Jumlah",
    currency: "MYR",
    locale: "ms-MY",
    defaultValue: 715235,
    helperText: "MYR in the ms-MY locale — RM symbol, 2 fraction digits.",
  },
};

export const Disabled: Story = {
  args: { label: "Amount", defaultValue: 500000, disabled: true },
};

/**
 * Fully controlled: the parent owns the minor-unit value and echoes what the field
 * emits — proving the round-trip from keystrokes to exact integer cents.
 */
export const Controlled: Story = {
  render: (args) => {
    const [minor, setMinor] = useState<number | null>(129900);
    return (
      <div className="flex w-72 flex-col gap-3">
        <CurrencyInput {...args} label="Price" value={minor} onValueChange={setMinor} />
        <p className="text-muted-foreground text-sm">
          Emitted minor units: <code>{minor === null ? "null" : minor}</code>
        </p>
      </div>
    );
  },
};
