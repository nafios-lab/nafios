import type { Meta, StoryObj } from "@storybook/react";
import { Code } from "./code.tsx";

const meta: Meta<typeof Code> = {
  title: "Typography/Code",
  component: Code,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["md", "sm", "xs"],
    },
    block: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Code>;

export const Inline: Story = {
  render: () => (
    <p className="text-sm">
      Run <Code>bun install</Code> to get started.
    </p>
  ),
};

export const Block: Story = {
  args: {
    block: true,
    children: `const total = items.reduce(
  (sum, item) => sum + item.amount,
  0,
);`,
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-2">
      <p>
        md: <Code size="md">console.log("hello")</Code>
      </p>
      <p>
        sm: <Code size="sm">console.log("hello")</Code>
      </p>
      <p>
        xs: <Code size="xs">console.log("hello")</Code>
      </p>
    </div>
  ),
};

export const DataDisplay: Story = {
  render: () => (
    <div className="flex gap-4">
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Balance</p>
        <Code size="md" className="bg-transparent">
          $12,340.56
        </Code>
      </div>
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Account</p>
        <Code size="md" className="bg-transparent">
          4821-XXXX
        </Code>
      </div>
    </div>
  ),
};
