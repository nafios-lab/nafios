import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { useId } from "react";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import { Label } from "./ui/label.tsx";

const textInputVariants = cva(
  "flex h-9 w-full rounded-full border bg-card px-3 py-1 text-md shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default: "border-input focus-visible:ring-ring",
        error: "border-error-foreground focus-visible:ring-error-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface TextInputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof textInputVariants> {
  label?: string;
  helperText?: string;
  error?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  borderLess?: boolean;
  /** Content rendered inside the input's relative container (e.g. overlays). */
  inputOverlay?: React.ReactNode;
}

function TextInput({
  className,
  variant,
  label,
  helperText,
  error,
  iconLeft,
  iconRight,
  borderLess,
  inputOverlay,
  id: idProp,
  type,
  ...props
}: TextInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const resolvedVariant = error ? "error" : variant;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={id} className={cn(error && "text-error-foreground")}>
          {label}
        </Label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {iconLeft}
          </span>
        )}
        <input
          id={id}
          type={type}
          className={cn(
            textInputVariants({ variant: resolvedVariant }),
            iconLeft && "pl-9",
            iconRight && "pr-9",
            className,
            borderLess && "border-transparent",
          )}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : helperText ? `${id}-helper` : undefined
          }
          {...props}
        />
        {iconRight && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {iconRight}
          </span>
        )}
        {inputOverlay}
      </div>
      {error && (
        <Text id={`${id}-error`} size="xs" className="text-error-foreground">
          {error}
        </Text>
      )}
      {!error && helperText && (
        <Text id={`${id}-helper`} size="xs" muted>
          {helperText}
        </Text>
      )}
    </div>
  );
}

export { TextInput, textInputVariants };
