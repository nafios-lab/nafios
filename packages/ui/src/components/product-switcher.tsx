import type * as React from "react";
import { useState } from "react";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";

export interface ProductItem {
  /** Unique identifier for the product. */
  id: string;
  /** Display label shown next to the icon. */
  label: string;
  /** Optional one-line summary shown beneath the label to hint what the module does. */
  description?: string;
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
  /** Products to display in the list. Read-only so callers can pass an `as const` list. */
  items: readonly ProductItem[];
  /**
   * Id of the currently-active product. The matching item gets the active
   * highlight — so consumers can derive it from the current route/location
   * instead of hand-setting `active` on each item. `undefined` = no active item.
   * Composes with a per-item `active` flag (either marks an item active).
   */
  activeItem?: string;
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
  activeItem,
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
        className={cn("w-72 p-1.5", contentClassName)}
      >
        <div className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            // Active if the parent marks it by id (route-driven) or the item
            // opts in via its own flag. `activeItem === undefined` disables the
            // id path (no id equals undefined), so nothing is active by default.
            const isActive = item.active || item.id === activeItem;
            const inner = (
              <>
                <Icon className="size-6" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 justify-start text-left">
                  <Text as="span" variant="label" size="sm" className="truncate leading-tight">
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text as="span" size="xs" muted className="line-clamp-2 leading-snug">
                      {item.description}
                    </Text>
                  ) : null}
                </span>
                {/* Trailing brand dot marks the active product. The slot is always
                    reserved (only its opacity toggles) so activating a row never
                    reflows the layout — inactive rows keep the same spare space. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full bg-brand transition-opacity duration-200",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
              </>
            );

            // Full-contrast `foreground` text at rest so rows read as clickable
            // (not disabled). Neutral `muted` background is the hover/active/focus
            // affordance — never the (blue) accent.
            const sharedClassName = cn(
              "group flex w-full items-center gap-3 rounded-md px-2.5 py-4 text-foreground transition-colors",
              "hover:bg-muted",
              "focus-visible:bg-muted focus-visible:outline-none",
              isActive && "bg-muted font-medium",
            );

            if (item.href) {
              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={sharedClassName}
                  aria-current={isActive ? "page" : undefined}
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
                aria-current={isActive ? "page" : undefined}
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
