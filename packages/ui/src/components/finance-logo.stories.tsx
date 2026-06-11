import type { Meta, StoryObj } from "@storybook/react";
import { FinanceLogo, type FinanceLogoProps } from "./finance-logo.tsx";

const meta: Meta<FinanceLogoProps> = {
  title: "Composites/FinanceLogo",
  component: FinanceLogo,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<FinanceLogoProps>;

export const Default: Story = {};

export const Large: Story = {
  args: { className: "h-16" },
};
