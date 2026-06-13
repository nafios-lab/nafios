import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, AvatarFallback, AvatarImage, type AvatarProps } from "./avatar.tsx";

const meta: Meta<AvatarProps> = {
  title: "Primitives/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "default", "lg", "xl"],
    },
  },
};

export default meta;
type Story = StoryObj<AvatarProps>;

export const WithImage: Story = {
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage src="https://api.dicebear.com/9.x/initials/svg?seed=HY" alt="Hanafi Yakub" />
      <AvatarFallback>HY</AvatarFallback>
    </Avatar>
  ),
};

export const WithFallback: Story = {
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>HY</AvatarFallback>
    </Avatar>
  ),
};

export const Small: Story = {
  args: { size: "sm" },
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>HY</AvatarFallback>
    </Avatar>
  ),
};

export const Large: Story = {
  args: { size: "lg" },
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>HY</AvatarFallback>
    </Avatar>
  ),
};

export const ExtraLarge: Story = {
  args: { size: "xl" },
  render: (args) => (
    <Avatar {...args}>
      <AvatarFallback>HY</AvatarFallback>
    </Avatar>
  ),
};

export const Group: Story = {
  render: () => (
    <div className="flex -space-x-3">
      <Avatar className="border-2 border-background">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-background">
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-background">
        <AvatarFallback>EF</AvatarFallback>
      </Avatar>
    </div>
  ),
};
