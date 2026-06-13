import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, Minus } from "lucide-react";
import type * as React from "react";
import { useId } from "react";
import { cn } from "../../lib/utils.ts";
import { Text } from "../typography/text.tsx";
import { Label } from "./label.tsx";

const checkboxVariants = cva(
  "peer shrink-0 rounded-sm border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-input bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground",
        brand:
          "border-input bg-background data-[state=checked]:bg-brand-darker data-[state=checked]:border-brand data-[state=checked]:text-fg-100 data-[state=indeterminate]:bg-brand-darker data-[state=indeterminate]:border-brand data-[state=indeterminate]:text-fg-100",
        error:
          "border-error-foreground bg-background data-[state=checked]:bg-error data-[state=checked]:border-error-foreground data-[state=checked]:text-error-foreground data-[state=indeterminate]:bg-error data-[state=indeterminate]:border-error-foreground data-[state=indeterminate]:text-error-foreground",
      },
      size: {
        sm: "size-3.5",
        default: "size-4",
        lg: "size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const indicatorIconSize: Record<string, string> = {
  sm: "size-2.5",
  default: "size-3",
  lg: "size-3.5",
};

export interface CheckboxProps
  extends Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "children">,
    VariantProps<typeof checkboxVariants> {
  label?: string;
  description?: string;
  error?: string;
  size?: "sm" | "default" | "lg";
}

function Checkbox({
  className,
  variant,
  size = "default",
  label,
  description,
  error,
  id: idProp,
  ...props
}: CheckboxProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const resolvedVariant = error ? "error" : variant;
  const iconSize = indicatorIconSize[size ?? "default"];

  const checkbox = (
    <CheckboxPrimitive.Root
      id={id}
      className={cn(
        checkboxVariants({
          variant: resolvedVariant,
          size,
          className: label ? undefined : className,
        }),
      )}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : description ? descriptionId : undefined}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? (
          <Minus className={iconSize} />
        ) : (
          <Check className={iconSize} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label && !description && !error) return checkbox;

  return (
    <div className={cn("flex items-start gap-2", className)}>
      {checkbox}
      <div className="grid gap-1">
        {label && (
          <Label htmlFor={id} className="cursor-pointer leading-none">
            {label}
          </Label>
        )}
        {description && !error && (
          <Text id={descriptionId} size="xs" muted>
            {description}
          </Text>
        )}
        {error && (
          <Text id={errorId} size="xs" className="text-error-foreground">
            {error}
          </Text>
        )}
      </div>
    </div>
  );
}

export { Checkbox, checkboxVariants };
