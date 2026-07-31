import type { Meta, StoryObj } from "@storybook/react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.tsx";

const meta: Meta<typeof Collapsible> = {
  title: "Primitives/Collapsible",
  component: Collapsible,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  render: () => (
    <Collapsible className="w-80">
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-border px-4 py-2 text-sm font-medium">
        0 PENDING RECONCILIATION
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 py-3 text-sm text-muted-foreground">
        All caught up
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-80">
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-border px-4 py-2 text-sm font-medium">
        Details
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 py-3 text-sm text-muted-foreground">
        This section starts expanded.
      </CollapsibleContent>
    </Collapsible>
  ),
};
