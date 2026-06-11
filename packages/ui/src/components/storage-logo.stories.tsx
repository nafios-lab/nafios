import type { Meta, StoryObj } from "@storybook/react";
import { StorageLogo, type StorageLogoProps } from "./storage-logo.tsx";

const meta: Meta<StorageLogoProps> = {
  title: "Composites/StorageLogo",
  component: StorageLogo,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<StorageLogoProps>;

export const Default: Story = {};

export const Large: Story = {
  args: { className: "h-16" },
};
