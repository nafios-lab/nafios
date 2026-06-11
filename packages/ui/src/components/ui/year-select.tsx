import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const YEARS_PER_PAGE = 12;

const yearSelectVariants = cva(
  "inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
  {
    variants: {
      variant: {
        default: "hover:bg-muted hover:text-foreground",
        brand: "hover:bg-brand/10 hover:text-brand-darker",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface YearSelectProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    VariantProps<typeof yearSelectVariants> {
  value?: number;
  onChange?: (year: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

function YearSelect({
  className,
  variant,
  value,
  onChange,
  min = 1900,
  max = 2100,
  disabled = false,
  ...props
}: YearSelectProps) {
  const currentYear = value ?? new Date().getFullYear();
  const [pageStart, setPageStart] = useState(
    () => currentYear - (currentYear % YEARS_PER_PAGE),
  );

  const years = useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i < YEARS_PER_PAGE; i++) {
      const y = pageStart + i;
      if (y >= min && y <= max) result.push(y);
    }
    return result;
  }, [pageStart, min, max]);

  const canGoPrev = pageStart - YEARS_PER_PAGE >= min;
  const canGoNext = pageStart + YEARS_PER_PAGE <= max;

  const goPrev = useCallback(
    () => canGoPrev && setPageStart((s) => s - YEARS_PER_PAGE),
    [canGoPrev],
  );
  const goNext = useCallback(
    () => canGoNext && setPageStart((s) => s + YEARS_PER_PAGE),
    [canGoNext],
  );

  return (
    <div className={cn("flex flex-col gap-2 p-2", className)} {...props}>
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev || disabled}
          className="inline-flex size-7 items-center justify-center rounded-full border bg-transparent opacity-50 hover:opacity-100 transition-opacity disabled:pointer-events-none disabled:opacity-25"
          aria-label="Previous years"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">
          {pageStart} – {pageStart + YEARS_PER_PAGE - 1}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext || disabled}
          className="inline-flex size-7 items-center justify-center rounded-full border bg-transparent opacity-50 hover:opacity-100 transition-opacity disabled:pointer-events-none disabled:opacity-25"
          aria-label="Next years"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div role="listbox" aria-label="Select year" className="grid grid-cols-3 gap-2">
        {years.map((year) => {
          const isSelected = value === year;
          return (
            <button
              key={year}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => onChange?.(year)}
              className={cn(
                yearSelectVariants({ variant }),
                "h-9 px-2",
                isSelected &&
                  (variant === "brand"
                    ? "bg-brand-darker text-fg-100"
                    : "bg-primary text-primary-foreground"),
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { YearSelect };
