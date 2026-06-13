import type { Meta, StoryObj } from "@storybook/react";
import { NotebookLogo, type NotebookLogoProps } from "./notebook-logo.tsx";

const meta: Meta<NotebookLogoProps> = {
  title: "Logos/NotebookLogo",
  component: NotebookLogo,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<NotebookLogoProps>;

export const Default: Story = {};

export const Large: Story = {
  args: { className: "h-16" },
};
