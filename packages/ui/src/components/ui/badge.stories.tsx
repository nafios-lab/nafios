import type { Meta, StoryObj } from "@storybook/react";
import { CheckCircle2, Clock, Lock, ShieldCheck, Star, TrendingUp, Zap } from "lucide-react";
import { Badge } from "./badge.tsx";

const meta: Meta<typeof Badge> = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "outline",
        "success",
        "error",
        "warning",
        "info",
        "note",
        "destructive",
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  render: () => <Badge>Default</Badge>,
};

export const Secondary: Story = {
  render: () => <Badge variant="secondary">Secondary</Badge>,
};

export const Outline: Story = {
  render: () => <Badge variant="outline">Outline</Badge>,
};

export const Success: Story = {
  render: () => <Badge variant="success">Paid</Badge>,
};

export const ErrorVariant: Story = {
  name: "Error",
  render: () => <Badge variant="error">Failed</Badge>,
};

export const Warning: Story = {
  render: () => <Badge variant="warning">Pending</Badge>,
};

export const InfoVariant: Story = {
  name: "Info",
  render: () => <Badge variant="info">Processing</Badge>,
};

export const Note: Story = {
  render: () => <Badge variant="note">Draft</Badge>,
};

export const Destructive: Story = {
  render: () => <Badge variant="destructive">Overdue</Badge>,
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="success">Paid</Badge>
      <Badge variant="error">Failed</Badge>
      <Badge variant="warning">Pending</Badge>
      <Badge variant="info">Processing</Badge>
      <Badge variant="note">Draft</Badge>
      <Badge variant="destructive">Overdue</Badge>
    </div>
  ),
};

export const WithIcon: Story = {
  name: "With Icon",
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">
        <CheckCircle2 className="mr-1 size-3" />
        Paid
      </Badge>
      <Badge variant="info">
        <Clock className="mr-1 size-3" />
        Processing
      </Badge>
      <Badge variant="warning">
        <Zap className="mr-1 size-3" />
        Pending
      </Badge>
      <Badge variant="note">
        <Lock className="mr-1 size-3" />
        Locked
      </Badge>
    </div>
  ),
};

export const WithDot: Story = {
  name: "With Status Dot",
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">
        <span className="mr-1.5 size-1.5 rounded-full bg-success-foreground" />
        Active
      </Badge>
      <Badge variant="warning">
        <span className="mr-1.5 size-1.5 rounded-full bg-warning-foreground" />
        Pending
      </Badge>
      <Badge variant="error">
        <span className="mr-1.5 size-1.5 rounded-full bg-error-foreground" />
        Offline
      </Badge>
      <Badge variant="outline">
        <span className="mr-1.5 size-1.5 rounded-full bg-muted-foreground" />
        Inactive
      </Badge>
    </div>
  ),
};

export const IconOnly: Story = {
  name: "Icon Only",
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">
        <CheckCircle2 className="size-3" />
      </Badge>
      <Badge variant="info">
        <ShieldCheck className="size-3" />
      </Badge>
      <Badge variant="warning">
        <Star className="size-3" />
      </Badge>
      <Badge>
        <TrendingUp className="size-3" />
      </Badge>
    </div>
  ),
};

export const FinanceExample: Story = {
  name: "Finance Statuses",
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">
        <CheckCircle2 className="mr-1 size-3" />
        Paid
      </Badge>
      <Badge variant="warning">
        <Clock className="mr-1 size-3" />
        Pending
      </Badge>
      <Badge variant="error">Overdue</Badge>
      <Badge variant="info">
        <span className="mr-1.5 size-1.5 rounded-full bg-info-foreground" />
        Processing
      </Badge>
      <Badge variant="note">On Hold</Badge>
      <Badge variant="secondary">Carry-over</Badge>
    </div>
  ),
};
