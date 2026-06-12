import type * as React from "react";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover.tsx";

export interface ProductItem {
  /** Unique identifier for the product. */
  id: string;
  /** Display label shown below the icon. */
  label: string;
  /** Product icon/logo component. */
  icon: React.ComponentType<{ className?: string }>;
  /** Optional href — when provided the item renders as a link. */
  href?: string;
  /** Callback when the item is selected. */
  onSelect?: () => void;
  /** Whether this item is the currently active product. */
  active?: boolean;
}

export interface ProductSwitcherProps {
  /** Products to display in the grid. */
  items: ProductItem[];
  /**
   * Render-prop for the trigger element.
   * Receives `{ open }` so you can style based on dropdown state.
   * The returned element must accept a `ref` (use `forwardRef` or a native element).
   */
  renderTrigger: (props: { open: boolean }) => React.ReactNode;
  /** Number of columns in the grid. @default 4 */
  columns?: number;
  /** Horizontal alignment relative to the trigger. @default "center" */
  align?: "start" | "center" | "end";
  /** Which side of the trigger to open on. @default "bottom" */
  side?: "top" | "right" | "bottom" | "left";
  /** Distance in px between trigger and content. @default 8 */
  sideOffset?: number;
  /** Extra class names on the content panel. */
  contentClassName?: string;
  /** Controlled open state. */
  open?: boolean;
  /** Callback when open state changes. */
  onOpenChange?: (open: boolean) => void;
}

function ProductSwitcher({
  items,
  renderTrigger,
  columns = 4,
  align = "center",
  side = "bottom",
  sideOffset = 8,
  contentClassName,
  open: controlledOpen,
  onOpenChange,
}: ProductSwitcherProps) {
  return (
    <Popover open={controlledOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {renderTrigger({ open: controlledOpen ?? false })}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn("w-auto p-2", contentClassName)}
      >
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const inner = (
              <>
                <Icon className="size-8" />
                <Text as="span" variant="label" size="xs" className="leading-tight">
                  {item.label}
                </Text>
              </>
            );

            const sharedClassName = cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-lg p-3 text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              item.active && "bg-accent/50 text-accent-foreground",
            );

            if (item.href) {
              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={sharedClassName}
                  onClick={() => item.onSelect?.()}
                >
                  {inner}
                </a>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                className={cn(sharedClassName, "cursor-pointer")}
                onClick={() => item.onSelect?.()}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { ProductSwitcher };
