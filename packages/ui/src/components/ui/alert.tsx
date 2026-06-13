import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground border-border",
        success:
          "bg-success text-success-foreground border-success-foreground [&>svg]:text-success-foreground",
        error:
          "bg-error text-error-foreground border-error-foreground [&>svg]:text-error-foreground",
        warning:
          "bg-warning text-warning-foreground border-warning-foreground [&>svg]:text-warning-foreground",
        info: "bg-info text-info-foreground border-info-foreground [&>svg]:text-info-foreground",
        note: "bg-note text-note-foreground border-note-foreground [&>svg]:text-note-foreground",
        destructive:
          "bg-error text-error-foreground border-error-foreground [&>svg]:text-error-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      className={cn("col-start-2 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("col-start-2 text-sm [&_p]:leading-relaxed", className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle, alertVariants };
