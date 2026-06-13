import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button.tsx";
import { Toaster, toast } from "./sonner.tsx";

const meta: Meta = {
  title: "Primitives/Toast",
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Button variant="outline" onClick={() => toast("Event has been created")}>
      Show Toast
    </Button>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
        })
      }
    >
      With Description
    </Button>
  ),
};

export const Success: Story = {
  render: () => (
    <Button variant="brand" onClick={() => toast.success("Changes saved successfully")}>
      Success
    </Button>
  ),
};

export const ErrorToast: Story = {
  render: () => (
    <Button variant="destructive" onClick={() => toast.error("Something went wrong")}>
      Error
    </Button>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast("File deleted", {
          action: {
            label: "Undo",
            onClick: () => toast("File restored"),
          },
        })
      }
    >
      With Action
    </Button>
  ),
};

export const PromiseToast: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.promise(
          new window.Promise<{ name: string }>((resolve) =>
            setTimeout(() => resolve({ name: "Sonner" }), 2000),
          ),
          {
            loading: "Loading...",
            success: (data) => `${data.name} toast has been added`,
            error: "Error",
          },
        )
      }
    >
      Promise
    </Button>
  ),
};
