import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const textVariants = cva("font-body", {
  variants: {
    variant: {
      default: "",
      caption: "uppercase tracking-widest text-muted-foreground/70 font-medium",
      overline: "uppercase tracking-wider text-muted-foreground font-semibold",
      label: "font-medium leading-none",
    },
    size: {
      "2xl": "text-2xl",
      xl: "text-xl",
      lg: "text-lg",
      md: "text-md",
      sm: "text-sm",
      xs: "text-xs",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    muted: {
      true: "text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const defaultSizeForVariant: Record<
  string,
  NonNullable<TextProps["size"]>
> = {
  default: "md",
  caption: "xs",
  overline: "xs",
  label: "sm",
};

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  /** HTML element to render. @default "p" */
  as?: "p" | "span" | "div";
}

function Text({
  as: Tag = "p",
  variant = "default",
  size,
  weight,
  muted,
  className,
  ...props
}: TextProps) {
  const resolvedSize = size ?? defaultSizeForVariant[variant ?? "default"];
  const resolvedWeight = weight ?? (variant === "default" ? "normal" : undefined);
  return (
    <Tag
      className={cn(
        textVariants({ variant, size: resolvedSize, weight: resolvedWeight, muted }),
        className,
      )}
      {...props}
    />
  );
}

export { Text, textVariants };
