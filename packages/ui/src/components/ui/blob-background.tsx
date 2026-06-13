import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const blobBackgroundVariants = cva("relative isolate overflow-hidden bg-background", {
  variants: {
    intensity: {
      subtle: "[--blob-opacity:0.08]",
      medium: "[--blob-opacity:0.14]",
      vivid: "[--blob-opacity:0.22]",
    },
  },
  defaultVariants: {
    intensity: "medium",
  },
});

type BlobBackgroundProps = React.ComponentProps<"div"> &
  VariantProps<typeof blobBackgroundVariants>;

function BlobBackground({ className, intensity, children, ...props }: BlobBackgroundProps) {
  return (
    <div className={cn(blobBackgroundVariants({ intensity }), className)} {...props}>
      {/* Blobs use -z-10 so children stay above without a wrapper */}
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 -top-1/4 -right-1/4 h-[60%] w-[60%] rounded-full bg-brand opacity-(--blob-opacity) blur-[120px] animate-blob-drift"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 -bottom-1/4 -left-1/4 h-[50%] w-[50%] rounded-full bg-accent opacity-(--blob-opacity) blur-[100px] animate-blob-drift-reverse"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 top-1/3 left-1/3 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-darker opacity-[calc(var(--blob-opacity)*0.6)] blur-[140px] animate-blob-pulse"
      />

      {children}
    </div>
  );
}

export { BlobBackground, blobBackgroundVariants };
