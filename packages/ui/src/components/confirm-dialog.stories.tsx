import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { Button } from "./ui/button.tsx";

const meta = {
  title: "Composites/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button variant="outline">Delete item</Button>,
    title: "Are you sure?",
    description: "This action cannot be undone. This will permanently delete the item.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    variant: "destructive",
    onConfirm: fn(),
  },
};

export const NonDestructive: Story = {
  args: {
    trigger: <Button>Confirm action</Button>,
    title: "Confirm",
    description: "Are you sure you want to proceed?",
    onConfirm: fn(),
  },
};
