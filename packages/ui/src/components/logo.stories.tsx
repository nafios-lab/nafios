import type { Meta, StoryObj } from "@storybook/react";
import { Logo, type LogoProps } from "./logo.tsx";

const meta: Meta<LogoProps> = {
  title: "Composites/Logo",
  component: Logo,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "radio",
      options: ["icon", "full"],
    },
  },
};

export default meta;
type Story = StoryObj<LogoProps>;

export const Icon: Story = {
  args: {
    variant: "icon",
  },
};

export const Full: Story = {
  args: {
    variant: "full",
  },
};

export const CustomSize: Story = {
  args: {
    variant: "full",
    className: "h-16",
  },
};

