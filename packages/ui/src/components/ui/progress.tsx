import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const progressTrackVariants = cva("relative h-2 w-full overflow-hidden rounded-full", {
  variants: {
    variant: {
      default: "bg-primary/20",
      brand: "bg-brand/20",
      success: "bg-success-subtle",
      error: "bg-error-subtle",
      warning: "bg-warning-subtle",
      info: "bg-info-subtle",
    },
    size: {
      sm: "h-1",
      default: "h-2",
      lg: "h-3",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

const progressBarVariants = cva("h-full rounded-full transition-all duration-300 ease-in-out", {
  variants: {
    variant: {
      default: "bg-primary",
      brand: "bg-brand-darker",
      success: "bg-success-foreground",
      error: "bg-error-foreground",
      warning: "bg-warning-foreground",
      info: "bg-info-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ProgressProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    VariantProps<typeof progressTrackVariants> {
  /** Progress value from 0 to 100. */
  value?: number;
  /** Maximum value (defaults to 100). */
  max?: number;
}

function Progress({ className, variant, size, value = 0, max = 100, ...props }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(progressTrackVariants({ variant, size, className }))}
      {...props}
    >
      <div className={progressBarVariants({ variant })} style={{ width: `${pct}%` }} />
    </div>
  );
}

export { Progress, progressTrackVariants, progressBarVariants };
