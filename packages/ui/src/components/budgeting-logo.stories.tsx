import type { Meta, StoryObj } from "@storybook/react";
import { BudgetingLogo, type BudgetingLogoProps } from "./budgeting-logo.tsx";

const meta: Meta<BudgetingLogoProps> = {
  title: "Composites/BudgetingLogo",
  component: BudgetingLogo,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<BudgetingLogoProps>;

export const Default: Story = {};

export const Large: Story = {
  args: { className: "h-16" },
};
