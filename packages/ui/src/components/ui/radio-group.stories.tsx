import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup, RadioGroupItem, type RadioGroupProps } from "./radio-group.tsx";

const meta: Meta<RadioGroupProps> = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["vertical", "horizontal"],
    },
    disabled: {
      control: "boolean",
    },
    error: {
      control: "text",
    },
  },
};

export default meta;
type Story = StoryObj<RadioGroupProps>;

export const Default: Story = {
  render: (args) => (
    <RadioGroup defaultValue="option-1" {...args}>
      <RadioGroupItem value="option-1" label="Option one" />
      <RadioGroupItem value="option-2" label="Option two" />
      <RadioGroupItem value="option-3" label="Option three" />
    </RadioGroup>
  ),
};

export const WithDescriptions: Story = {
  render: (args) => (
    <RadioGroup defaultValue="card" {...args}>
      <RadioGroupItem
        value="card"
        label="Credit card"
        description="Pay with Visa, Mastercard, or AMEX."
      />
      <RadioGroupItem
        value="bank"
        label="Bank transfer"
        description="Direct debit from your bank account."
      />
      <RadioGroupItem
        value="crypto"
        label="Cryptocurrency"
        description="Pay with Bitcoin or Ethereum."
      />
    </RadioGroup>
  ),
};

export const Brand: Story = {
  render: (args) => (
    <RadioGroup defaultValue="monthly" {...args}>
      <RadioGroupItem value="monthly" label="Monthly" variant="brand" />
      <RadioGroupItem value="yearly" label="Yearly" variant="brand" />
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: (args) => (
    <RadioGroup defaultValue="sm" orientation="horizontal" {...args}>
      <RadioGroupItem value="sm" label="Small" />
      <RadioGroupItem value="md" label="Medium" />
      <RadioGroupItem value="lg" label="Large" />
    </RadioGroup>
  ),
};

export const WithError: Story = {
  render: (args) => (
    <RadioGroup error="Please select a payment method." {...args}>
      <RadioGroupItem value="card" label="Credit card" variant="error" />
      <RadioGroupItem value="bank" label="Bank transfer" variant="error" />
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <RadioGroup defaultValue="option-1" disabled {...args}>
      <RadioGroupItem value="option-1" label="Selected (disabled)" />
      <RadioGroupItem value="option-2" label="Unselected (disabled)" />
    </RadioGroup>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" label="Small" size="sm" />
      </RadioGroup>
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" label="Default" size="default" />
      </RadioGroup>
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" label="Large" size="lg" />
      </RadioGroup>
    </div>
  ),
};

export const Card: Story = {
  render: () => (
    <RadioGroup defaultValue="push" className="max-w-sm">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders a native input */}
      <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-4 cursor-pointer has-checked:border-brand has-checked:bg-brand/5 transition-colors">
        <RadioGroupItem value="push" variant="brand" className="mt-0.5" />
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">Push notifications</span>
          <span className="text-xs text-muted-foreground">
            Receive push notifications on your device.
          </span>
        </div>
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders a native input */}
      <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-4 cursor-pointer has-checked:border-brand has-checked:bg-brand/5 transition-colors">
        <RadioGroupItem value="email" variant="brand" className="mt-0.5" />
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">Email digest</span>
          <span className="text-xs text-muted-foreground">
            Get a weekly summary of your activity.
          </span>
        </div>
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders a native input */}
      <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-4 cursor-pointer has-checked:border-brand has-checked:bg-brand/5 transition-colors">
        <RadioGroupItem value="sms" variant="brand" className="mt-0.5" />
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">SMS alerts</span>
          <span className="text-xs text-muted-foreground">
            Receive critical alerts via text message.
          </span>
        </div>
      </label>
    </RadioGroup>
  ),
};
