import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { useId } from "react";
import { cn } from "../../lib/utils.ts";
import { Text } from "../typography/text.tsx";
import { Label } from "./label.tsx";

const switchVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        brand:
          "data-[state=checked]:bg-brand-darker data-[state=unchecked]:bg-input",
      },
      size: {
        sm: "h-4 w-7",
        default: "h-5 w-9",
        lg: "h-6 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const thumbSize: Record<string, string> = {
  sm: "size-3",
  default: "size-4",
  lg: "size-5",
};

const thumbTranslate: Record<string, string> = {
  sm: "data-[state=checked]:translate-x-3",
  default: "data-[state=checked]:translate-x-4",
  lg: "data-[state=checked]:translate-x-5",
};

export interface SwitchProps
  extends Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "children">,
    VariantProps<typeof switchVariants> {
  label?: string;
  description?: string;
  error?: string;
  size?: "sm" | "default" | "lg";
}

function Switch({
  className,
  variant,
  size = "default",
  label,
  description,
  error,
  id: idProp,
  ...props
}: SwitchProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  const switchEl = (
    <SwitchPrimitive.Root
      id={id}
      className={cn(
        switchVariants({ variant, size, className: label ? undefined : className }),
      )}
      aria-invalid={error ? true : undefined}
      aria-describedby={
        error ? errorId : description ? descriptionId : undefined
      }
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=unchecked]:translate-x-0",
          thumbSize[size],
          thumbTranslate[size],
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label && !description && !error) return switchEl;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {switchEl}
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

export { Switch, switchVariants };
