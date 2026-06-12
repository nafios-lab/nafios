import type * as React from "react";
import { cn } from "../lib/utils.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

export interface MenuItemDef {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect?: () => void;
}

export type MenuEntry =
  | ({ type?: "item" } & MenuItemDef)
  | { type: "separator" }
  | { type: "label"; label: string }
  | { type: "group"; label?: string; items: MenuItemDef[] };

export interface DropdownMenuFieldProps {
  /** The element that opens the dropdown when clicked. */
  trigger: React.ReactNode;
  /** Menu entries: items, separators, labels, or groups. */
  items: MenuEntry[];
  /** Horizontal alignment relative to the trigger. */
  align?: "start" | "center" | "end";
  /** Which side of the trigger to open on. */
  side?: "top" | "right" | "bottom" | "left";
  /** Extra class names on the content panel. */
  contentClassName?: string;
  /** Controlled open state. */
  open?: boolean;
  /** Callback when open state changes. */
  onOpenChange?: (open: boolean) => void;
}

function renderItem(item: MenuItemDef, index: number) {
  const Icon = item.icon;
  return (
    <DropdownMenuItem
      key={index}
      disabled={item.disabled}
      onSelect={item.onSelect}
      className={cn(item.destructive && "text-destructive focus:text-destructive")}
    >
      {Icon && <Icon className="size-4" />}
      <span>{item.label}</span>
      {item.shortcut && (
        <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>
      )}
    </DropdownMenuItem>
  );
}

function renderEntry(entry: MenuEntry, index: number) {
  if (entry.type === "separator") {
    return <DropdownMenuSeparator key={index} />;
  }
  if (entry.type === "label") {
    return <DropdownMenuLabel key={index}>{entry.label}</DropdownMenuLabel>;
  }
  if (entry.type === "group") {
    return (
      <DropdownMenuGroup key={index}>
        {entry.label && <DropdownMenuLabel>{entry.label}</DropdownMenuLabel>}
        {entry.items.map((item, i) => renderItem(item, i))}
      </DropdownMenuGroup>
    );
  }
  return renderItem(entry, index);
}

function DropdownMenuField({
  trigger,
  items,
  align = "start",
  side,
  contentClassName,
  open,
  onOpenChange,
}: DropdownMenuFieldProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        className={cn("min-w-48", contentClassName)}
      >
        {items.map((entry, index) => renderEntry(entry, index))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { DropdownMenuField };
