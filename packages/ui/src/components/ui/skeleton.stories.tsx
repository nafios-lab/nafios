import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, AvatarFallback } from "./avatar.tsx";
import { Skeleton } from "./skeleton.tsx";

const meta: Meta = {
  title: "Primitives/Skeleton",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => <Skeleton className="h-4 w-48" />,
};

export const Circle: Story = {
  render: () => <Skeleton className="size-10 rounded-full" />,
};

export const CardPlaceholder: Story = {
  render: () => (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4 w-72">
      <Skeleton className="h-32 w-full rounded-md" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ),
};

export const ProfilePlaceholder: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  ),
};

export const TablePlaceholder: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-96">
      {["row-1", "row-2", "row-3", "row-4", "row-5"].map((id) => (
        <div key={id} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  ),
};

export const WithLoadedContent: Story = {
  name: "Skeleton → Avatar transition",
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="size-10 rounded-full" />
        <span className="text-xs text-muted-foreground">Loading</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Avatar>
          <AvatarFallback>HY</AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">Loaded</span>
      </div>
    </div>
  ),
};
