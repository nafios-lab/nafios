import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import type * as React from "react";

// shadcn/ui `Collapsible` — a thin, unstyled wrapper over Radix Collapsible.
// Structural only (open/closed disclosure); consumers own the trigger/content
// styling. Not forked: re-pulling via `shadcn add` stays clash-free.

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return <CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return <CollapsiblePrimitive.CollapsibleContent data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
