import type { Meta, StoryObj } from "@storybook/react";
import { Lock, User } from "lucide-react";
import { Button, type ButtonProps } from "./button.tsx";

type StoryArgs = Omit<ButtonProps, "iconLeft" | "iconRight"> & {
  iconLeft?: boolean;
  iconRight?: boolean;
};

const meta: Meta<StoryArgs> = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "brand", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    disabled: {
      control: "boolean",
    },
    showLoader: {
      control: "boolean",
    },
    textOnLoading: {
      control: "text",
    },
    iconLeft: {
      control: "boolean",
    },
    iconRight: {
      control: "boolean",
    },
  },
  render: ({ iconLeft, iconRight, ...args }) => (
    <Button
      {...args}
      iconLeft={iconLeft ? <User /> : undefined}
      iconRight={iconRight ? <Lock /> : undefined}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: { children: "Default" },
};

export const Brand: Story = {
  args: { children: "Brand", variant: "brand" },
};

export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive" },
};

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
};

export const Secondary: Story = {
  args: { children: "Secondary", variant: "secondary" },
};

export const Ghost: Story = {
  args: { children: "Ghost", variant: "ghost" },
};

export const Link: Story = {
  args: { children: "Link", variant: "link" },
};

export const Small: Story = {
  args: { children: "Small", size: "sm" },
};

export const Large: Story = {
  args: { children: "Large", size: "lg" },
};
