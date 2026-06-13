import type { Meta, StoryObj } from "@storybook/react";
import { AlertCircle, CheckCircle2, Info, MessageSquare, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./alert.tsx";

const meta: Meta<typeof Alert> = {
  title: "Primitives/Alert",
  component: Alert,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "success", "error", "warning", "info", "note", "destructive"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert>
      <MessageSquare />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert variant="success">
      <CheckCircle2 />
      <AlertTitle>Payment confirmed</AlertTitle>
      <AlertDescription>
        Your transaction of $1,250.00 has been processed successfully.
      </AlertDescription>
    </Alert>
  ),
};

export const ErrorVariant: Story = {
  name: "Error",
  render: () => (
    <Alert variant="error">
      <AlertCircle />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>Failed to sync your accounts. Please try again later.</AlertDescription>
    </Alert>
  ),
};

export const Warning: Story = {
  render: () => (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>Budget exceeded</AlertTitle>
      <AlertDescription>Your "Groceries" category is 15% over budget this month.</AlertDescription>
    </Alert>
  ),
};

export const InfoVariant: Story = {
  name: "Info",
  render: () => (
    <Alert variant="info">
      <Info />
      <AlertTitle>Scheduled maintenance</AlertTitle>
      <AlertDescription>
        The system will undergo maintenance on Sunday 2:00–4:00 AM UTC.
      </AlertDescription>
    </Alert>
  ),
};

export const Note: Story = {
  render: () => (
    <Alert variant="note">
      <MessageSquare />
      <AlertTitle>Did you know?</AlertTitle>
      <AlertDescription>
        You can use keyboard shortcuts to navigate between modules.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Document expired</AlertTitle>
      <AlertDescription>
        This document has passed its retention date and will be archived in 7 days.
      </AlertDescription>
    </Alert>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <Alert variant="info">
      <Info />
      <AlertTitle>Quick tip: press ⌘K to open the command palette.</AlertTitle>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  render: () => (
    <Alert variant="warning">
      <AlertTitle>Budget warning</AlertTitle>
      <AlertDescription>3 of your 8 categories are over budget this month.</AlertDescription>
    </Alert>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid w-full max-w-lg gap-4">
      {(
        [
          { variant: "default", icon: MessageSquare, title: "Default" },
          { variant: "success", icon: CheckCircle2, title: "Success" },
          { variant: "error", icon: AlertCircle, title: "Error" },
          { variant: "warning", icon: TriangleAlert, title: "Warning" },
          { variant: "info", icon: Info, title: "Info" },
          { variant: "note", icon: MessageSquare, title: "Note" },
        ] as const
      ).map(({ variant, icon: Icon, title }) => (
        <Alert key={variant} variant={variant}>
          <Icon />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>This is an example of the {variant} alert variant.</AlertDescription>
        </Alert>
      ))}
    </div>
  ),
};
