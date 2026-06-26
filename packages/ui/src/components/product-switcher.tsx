import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";

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
  /** Products to display in the list. */
  items: ProductItem[];
  /**
   * Render-prop for the trigger element.
   * Receives `{ open }` so you can style based on dropdown state.
   * The returned element must accept a `ref` (use `forwardRef` or a native element).
   */
  renderTrigger: (props: { open: boolean }) => React.ReactNode;
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
  align = "center",
  side = "bottom",
  sideOffset = 8,
  contentClassName,
  open: controlledOpen,
  onOpenChange,
}: ProductSwitcherProps) {
  // Controllable open state: when `open` is supplied the parent drives it,
  // otherwise we track it internally. Either way `renderTrigger` receives the
  // *real* open state — so an uncontrolled trigger can still style itself by it.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  function handleOpenChange(next: boolean) {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{renderTrigger({ open })}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn("w-56 p-1.5", contentClassName)}
      >
        <div className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const inner = (
              <>
                {/* App-icon tile: shaded rounded square framing the base logo SVG.
                    On row hover/focus it lifts, brightens, and gains a brand ring + glow. */}
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10",
                    "shadow-sm ring-1 ring-transparent transition-all duration-200 ease-out",
                    "group-hover:bg-brand/15 group-hover:ring-brand group-hover:shadow-[0_6px_16px_-6px_hsl(var(--brand)/0.45)]",
                    "group-focus-visible:-translate-y-0.5 group-focus-visible:bg-brand/15 group-focus-visible:ring-brand group-focus-visible:shadow-[0_6px_16px_-6px_hsl(var(--brand)/0.45)]",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <Text as="span" variant="label" size="sm" className="leading-tight">
                  {item.label}
                </Text>
                {/* "Open" affordance — slides + fades in on row hover/focus. */}
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    "ml-auto size-4 shrink-0 -translate-x-1 text-foreground opacity-0 transition-all duration-200 ease-out",
                    "group-hover:translate-x-0 group-hover:opacity-100",
                    "group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
                  )}
                />
              </>
            );

            // Neutral `muted` for hover/active/focus — never the (blue) accent.
            const sharedClassName = cn(
              "group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none",
              item.active && "bg-muted font-medium text-foreground",
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
