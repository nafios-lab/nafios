import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const headingVariants = cva("font-display font-semibold tracking-tight", {
  variants: {
    size: {
      "2xl": "text-2xl",
      xl: "text-xl",
      lg: "text-lg",
      md: "text-md",
      sm: "text-sm",
      xs: "text-xs",
    },
  },
});

const defaultSizeForLevel: Record<string, NonNullable<HeadingProps["size"]>> = {
  h1: "2xl",
  h2: "xl",
  h3: "lg",
  h4: "md",
  h5: "sm",
  h6: "xs",
};

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  /** HTML heading level. @default "h2" */
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}

function Heading({ as: Tag = "h2", size, className, ...props }: HeadingProps) {
  const resolvedSize = size ?? defaultSizeForLevel[Tag];
  return <Tag className={cn(headingVariants({ size: resolvedSize }), className)} {...props} />;
}

export { Heading, headingVariants };
