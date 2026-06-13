import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox, type CheckboxProps } from "./checkbox.tsx";

const meta: Meta<CheckboxProps> = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "brand", "error"],
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
    label: {
      control: "text",
    },
    description: {
      control: "text",
    },
    error: {
      control: "text",
    },
    disabled: {
      control: "boolean",
    },
    checked: {
      control: "select",
      options: [true, false, "indeterminate"],
    },
  },
};

export default meta;
type Story = StoryObj<CheckboxProps>;

export const Default: Story = {
  args: { label: "" },
};
export const WithLabel: Story = {
  args: { label: "Accept terms and conditions" },
};

export const WithDescription: Story = {
  args: {
    label: "Marketing emails",
    description: "Receive emails about new products, features, and more.",
  },
};

export const Brand: Story = {
  args: {
    label: "Remember me",
    variant: "brand",
    defaultChecked: true,
  },
};

export const WithError: Story = {
  args: {
    label: "I agree to the terms",
    error: "You must accept the terms to continue.",
  },
};

export const Indeterminate: Story = {
  args: {
    label: "Select all",
    checked: "indeterminate",
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled option",
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    label: "Disabled checked",
    disabled: true,
    defaultChecked: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <Checkbox label="Small" size="sm" defaultChecked />
      <Checkbox label="Default" size="default" defaultChecked />
      <Checkbox label="Large" size="lg" defaultChecked />
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <Checkbox label="Default" variant="default" defaultChecked />
      <Checkbox label="Brand" variant="brand" defaultChecked />
      <Checkbox label="Error" variant="error" defaultChecked />
    </div>
  ),
};

export const Card: Story = {
  render: () => (
    <div className="grid gap-3 max-w-sm">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders a native input */}
      <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-4 cursor-pointer has-checked:border-brand has-checked:bg-brand/5 transition-colors">
        <Checkbox variant="brand" defaultChecked className="mt-0.5" />
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">Push notifications</span>
          <span className="text-xs text-muted-foreground">
            Receive push notifications on your device.
          </span>
        </div>
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders a native input */}
      <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-4 cursor-pointer has-checked:border-brand has-checked:bg-brand/5 transition-colors">
        <Checkbox variant="brand" className="mt-0.5" />
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">Email digest</span>
          <span className="text-xs text-muted-foreground">
            Get a weekly summary of your activity.
          </span>
        </div>
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders a native input */}
      <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-4 cursor-pointer has-checked:border-brand has-checked:bg-brand/5 transition-colors">
        <Checkbox variant="brand" className="mt-0.5" />
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">SMS alerts</span>
          <span className="text-xs text-muted-foreground">
            Receive critical alerts via text message.
          </span>
        </div>
      </label>
    </div>
  ),
};
