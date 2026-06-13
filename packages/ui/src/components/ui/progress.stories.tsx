import type { Meta, StoryObj } from "@storybook/react";
import { Progress, type ProgressProps } from "./progress.tsx";

const meta: Meta<ProgressProps> = {
  title: "Primitives/Progress",
  component: Progress,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "brand", "success", "error", "warning", "info"],
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
    },
    max: {
      control: "number",
    },
  },
};

export default meta;
type Story = StoryObj<ProgressProps>;

export const Default: Story = {
  args: { value: 60 },
};

export const Brand: Story = {
  args: { value: 45, variant: "brand" },
};

export const Success: Story = {
  args: { value: 100, variant: "success" },
};

export const ErrorVariant: Story = {
  args: { value: 80, variant: "error" },
};

export const Warning: Story = {
  args: { value: 65, variant: "warning" },
};

export const Info: Story = {
  args: { value: 30, variant: "info" },
};

export const Sizes: Story = {
  render: () => (
    <div className="grid w-full max-w-md gap-4">
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">Small</span>
        <Progress value={60} size="sm" variant="brand" />
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">Default</span>
        <Progress value={60} size="default" variant="brand" />
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">Large</span>
        <Progress value={60} size="lg" variant="brand" />
      </div>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid w-full max-w-md gap-4">
      {(["default", "brand", "success", "error", "warning", "info"] as const).map((v) => (
        <div key={v} className="grid gap-1">
          <span className="text-xs text-muted-foreground capitalize">{v}</span>
          <Progress value={65} variant={v} />
        </div>
      ))}
    </div>
  ),
};

export const BudgetUtilisation: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-4 rounded-lg border border-input bg-card p-6">
      <span className="text-sm font-medium text-foreground">Budget Utilisation</span>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Groceries</span>
            <span className="text-xs text-muted-foreground">$420 / $500</span>
          </div>
          <Progress value={84} variant="warning" />
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Transport</span>
            <span className="text-xs text-muted-foreground">$150 / $300</span>
          </div>
          <Progress value={50} variant="success" />
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Entertainment</span>
            <span className="text-xs text-muted-foreground">$190 / $200</span>
          </div>
          <Progress value={95} variant="error" />
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Savings</span>
            <span className="text-xs text-muted-foreground">$800 / $1000</span>
          </div>
          <Progress value={80} variant="brand" />
        </div>
      </div>
    </div>
  ),
};
