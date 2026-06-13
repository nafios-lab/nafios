import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

function Loader({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-border text-fg-100 shadow hover:brightness-125",
        brand: "bg-brand-darker border border-brand text-fg-100 shadow hover:brightness-125",
        destructive: "bg-error text-error-foreground shadow-sm hover:bg-error/90",
        outline: "border border-input bg-background shadow-sm hover:brightness-150",
        secondary:
          "bg-accent-darker/10 border border-accent text-accent shadow-sm hover:brightness-115",
        ghost: "hover:bg-border",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  showLoader?: boolean;
  textOnLoading?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  showLoader = false,
  textOnLoading,
  iconLeft,
  iconRight,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }), "cursor-pointer!")}
      disabled={disabled || showLoader}
      {...props}
    >
      {showLoader ? <Loader /> : iconLeft}
      {showLoader ? (textOnLoading ?? children) : children}
      {iconRight}
    </Comp>
  );
}

export { Button, buttonVariants };
