import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ErrorDialog } from "./error-dialog.tsx";
import { Button } from "./ui/button.tsx";

const meta = {
  title: "Composites/ErrorDialog",
  component: ErrorDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof ErrorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button variant="outline">Trigger error</Button>,
    title: "Something went wrong",
    description: "We couldn't save your changes. Please try again.",
    onDismiss: fn(),
  },
};

export const WithRetry: Story = {
  args: {
    trigger: <Button variant="outline">Trigger error</Button>,
    title: "Failed to load ledger",
    description: "The request timed out before the server responded.",
    onRetry: fn(),
    onDismiss: fn(),
  },
};

export const WithDetails: Story = {
  args: {
    trigger: <Button variant="outline">Trigger error</Button>,
    title: "Request failed",
    description: "The server rejected the request.",
    details: "HTTP 422 — validation_error: `amount` must be a positive integer.",
    onRetry: fn(),
    onDismiss: fn(),
  },
};
