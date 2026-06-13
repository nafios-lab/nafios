import type { Meta, StoryObj } from "@storybook/react";
import { Switch, type SwitchProps } from "./switch.tsx";

const meta: Meta<SwitchProps> = {
  title: "Primitives/Switch",
  component: Switch,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "brand"],
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
  },
};

export default meta;
type Story = StoryObj<SwitchProps>;

export const Default: Story = {
  args: {},
};

export const WithLabel: Story = {
  args: { label: "Airplane mode" },
};

export const WithDescription: Story = {
  args: {
    label: "Marketing emails",
    description: "Receive emails about new products, features, and more.",
  },
};

export const Brand: Story = {
  args: {
    label: "Dark mode",
    variant: "brand",
    defaultChecked: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Enable notifications",
    error: "Notification permission is required.",
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
    <div className="flex items-center gap-6">
      <Switch label="Small" size="sm" defaultChecked />
      <Switch label="Default" size="default" defaultChecked />
      <Switch label="Large" size="lg" defaultChecked />
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Switch label="Default" variant="default" defaultChecked />
      <Switch label="Brand" variant="brand" defaultChecked />
    </div>
  ),
};

export const SettingsCard: Story = {
  render: () => (
    <div className="grid gap-4 max-w-sm rounded-lg border border-input bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">Push notifications</span>
          <span className="text-xs text-muted-foreground">
            Receive push notifications on your device.
          </span>
        </div>
        <Switch variant="brand" defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">Email digest</span>
          <span className="text-xs text-muted-foreground">
            Get a weekly summary of your activity.
          </span>
        </div>
        <Switch variant="brand" />
      </div>
      <div className="flex items-center justify-between">
        <div className="grid gap-1">
          <span className="text-sm font-medium text-foreground">SMS alerts</span>
          <span className="text-xs text-muted-foreground">
            Receive critical alerts via text message.
          </span>
        </div>
        <Switch variant="brand" />
      </div>
    </div>
  ),
};
