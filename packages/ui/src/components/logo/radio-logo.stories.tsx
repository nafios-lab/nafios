import type { Meta, StoryObj } from "@storybook/react";
import { RadioLogo, type RadioLogoProps } from "./radio-logo.tsx";

const meta: Meta<RadioLogoProps> = {
  title: "Logos/RadioLogo",
  component: RadioLogo,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<RadioLogoProps>;

export const Default: Story = {};

export const Large: Story = {
  args: { className: "h-16" },
};
