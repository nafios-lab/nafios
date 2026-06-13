import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "./separator.tsx";

const meta: Meta = {
  title: "Primitives/Separator",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const Horizontal: Story = {
  render: () => (
    <div className="space-y-4">
      <p className="text-sm">Content above</p>
      <Separator />
      <p className="text-sm">Content below</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-4">
      <span className="text-sm">Left</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Right</span>
    </div>
  ),
};

export const InList: Story = {
  render: () => (
    <div className="w-64 space-y-1">
      <p className="text-sm font-medium">NafiOS Apps</p>
      <Separator />
      <div className="space-y-1 text-sm">
        <p>Finance</p>
        <p>Budgeting</p>
        <p>Document</p>
      </div>
    </div>
  ),
};
