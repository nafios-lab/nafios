import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "./label.tsx";
import { TextInput } from "../text-input.tsx";

const meta: Meta<typeof Label> = {
  title: "Primitives/Label",
  component: Label,
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: "text",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  args: { children: "Label text" },
};

export const WithInput: Story = {
  render: () => <TextInput label="Email" placeholder="you@example.com" />,
};
