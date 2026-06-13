import type { Meta, StoryObj } from "@storybook/react";
import { Bold, Italic, Underline } from "lucide-react";
import { Toggle, type ToggleProps } from "./toggle.tsx";

const meta: Meta<ToggleProps> = {
  title: "Primitives/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline"],
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
type Story = StoryObj<ToggleProps>;

export const Default: Story = {
  args: {
    children: "Toggle",
    "aria-label": "Toggle",
  },
};

export const WithIcon: Story = {
  args: {
    children: <Bold />,
    "aria-label": "Toggle bold",
  },
};

export const Outline: Story = {
  args: {
    variant: "outline",
    children: <Italic />,
    "aria-label": "Toggle italic",
  },
};

export const WithText: Story = {
  args: {
    children: (
      <>
        <Bold />
        Bold
      </>
    ),
    "aria-label": "Toggle bold",
  },
};

export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Toggle size="sm" aria-label="Small">
        <Bold />
      </Toggle>
      <Toggle size="default" aria-label="Default">
        <Bold />
      </Toggle>
      <Toggle size="lg" aria-label="Large">
        <Bold />
      </Toggle>
    </div>
  ),
};

export const TextFormatting: Story = {
  render: () => (
    <div className="flex items-center gap-1">
      <Toggle variant="outline" size="sm" aria-label="Toggle bold">
        <Bold />
      </Toggle>
      <Toggle variant="outline" size="sm" aria-label="Toggle italic">
        <Italic />
      </Toggle>
      <Toggle variant="outline" size="sm" aria-label="Toggle underline">
        <Underline />
      </Toggle>
    </div>
  ),
};
