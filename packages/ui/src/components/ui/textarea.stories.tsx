import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "./label.tsx";
import { Textarea } from "./textarea.tsx";

const meta: Meta<React.ComponentProps<typeof Textarea>> = {
  title: "Primitives/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    rows: { control: "number" },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: "Type your message here…",
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="message">Your message</Label>
      <Textarea id="message" placeholder="Type your message here…" />
    </div>
  ),
};

export const WithDefaultValue: Story = {
  args: {
    defaultValue:
      "This is a pre-filled textarea with some content that spans multiple lines.\n\nIt can contain paragraphs and other text formatting.",
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Disabled textarea",
    disabled: true,
  },
};

export const CustomRows: Story = {
  args: {
    placeholder: "This textarea has 6 rows",
    rows: 6,
  },
};
