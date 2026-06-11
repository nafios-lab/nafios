import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const monthShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const monthSelectVariants = cva(
  "inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "hover:bg-muted hover:text-foreground",
        brand:
          "hover:bg-brand/10 hover:text-brand-darker",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface MonthSelectProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    VariantProps<typeof monthSelectVariants> {
  value?: number;
  onChange?: (month: number) => void;
  short?: boolean;
  disabled?: boolean;
  disabledMonths?: number[];
}

function MonthSelect({
  className,
  variant,
  value,
  onChange,
  short = false,
  disabled = false,
  disabledMonths = [],
  ...props
}: MonthSelectProps) {
  const labels = short ? monthShort : months;

  return (
    <div
      className={cn("grid grid-cols-3 gap-2 p-2", className)}
      role="listbox"
      aria-label="Select month"
      {...props}
    >
      {labels.map((label, index) => {
        const isSelected = value === index;
        const isDisabled = disabled || disabledMonths.includes(index);

        return (
          <button
            key={label}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={isDisabled}
            onClick={() => onChange?.(index)}
            className={cn(
              monthSelectVariants({ variant }),
              "h-9 px-2",
              isSelected &&
                (variant === "brand"
                  ? "bg-brand-darker text-fg-100"
                  : "bg-primary text-primary-foreground"),
              isDisabled && "pointer-events-none opacity-50",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export { MonthSelect, months, monthShort };
