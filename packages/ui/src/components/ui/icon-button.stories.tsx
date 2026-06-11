import type { Meta, StoryObj } from "@storybook/react";
import { Heart, Plus, Settings, Trash2, X } from "lucide-react";
import { IconButton, type IconButtonProps } from "./icon-button.tsx";

const meta: Meta<IconButtonProps> = {
  title: "Primitives/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "brand",
        "destructive",
        "outline",
        "secondary",
        "ghost",
      ],
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
    disabled: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<IconButtonProps>;

export const Default: Story = {
  args: { icon: <Plus />, "aria-label": "Add item" },
};

export const Brand: Story = {
  args: { icon: <Heart />, variant: "brand", "aria-label": "Like" },
};

export const Destructive: Story = {
  args: { icon: <Trash2 />, variant: "destructive", "aria-label": "Delete" },
};

export const Outline: Story = {
  args: { icon: <Settings />, variant: "outline", "aria-label": "Settings" },
};

export const Ghost: Story = {
  args: { icon: <X />, variant: "ghost", "aria-label": "Close" },
};

export const Small: Story = {
  args: { icon: <Plus />, size: "sm", "aria-label": "Add item" },
};

export const Large: Story = {
  args: { icon: <Plus />, size: "lg", "aria-label": "Add item" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton icon={<Plus />} aria-label="Default" />
      <IconButton icon={<Heart />} variant="brand" aria-label="Brand" />
      <IconButton
        icon={<Trash2 />}
        variant="destructive"
        aria-label="Destructive"
      />
      <IconButton icon={<Settings />} variant="outline" aria-label="Outline" />
      <IconButton icon={<Plus />} variant="secondary" aria-label="Secondary" />
      <IconButton icon={<X />} variant="ghost" aria-label="Ghost" />
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton icon={<Plus />} size="sm" aria-label="Small" />
      <IconButton icon={<Plus />} size="default" aria-label="Default" />
      <IconButton icon={<Plus />} size="lg" aria-label="Large" />
    </div>
  ),
};
