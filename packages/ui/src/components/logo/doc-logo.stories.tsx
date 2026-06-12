import type { Meta, StoryObj } from "@storybook/react";
import { DocLogo, type DocLogoProps } from "./doc-logo.tsx";

type StoryArgs = DocLogoProps;

const meta: Meta<StoryArgs> = {
  title: "Logos/DocLogo",
  component: DocLogo,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const CustomSize: Story = {
  args: { className: "h-16 w-auto" },
};
