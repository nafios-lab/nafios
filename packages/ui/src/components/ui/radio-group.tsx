import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cva, type VariantProps } from "class-variance-authority";
import { Circle } from "lucide-react";
import type * as React from "react";
import { useId } from "react";
import { cn } from "../../lib/utils.ts";
import { Text } from "../typography/text.tsx";
import { Label } from "./label.tsx";

const radioGroupVariants = cva("grid gap-2", {
  variants: {
    orientation: {
      vertical: "grid-flow-row",
      horizontal: "grid-flow-col justify-start",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

const radioItemVariants = cva(
  "aspect-square rounded-full border shadow-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-input bg-background text-primary data-[state=checked]:border-primary",
        brand:
          "border-input bg-background text-brand-darker data-[state=checked]:border-brand",
        error:
          "border-error-foreground bg-background text-error-foreground data-[state=checked]:border-error-foreground",
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
  sm: "size-2",
  default: "size-2.5",
  lg: "size-3",
};

export interface RadioGroupProps
  extends React.ComponentProps<typeof RadioGroupPrimitive.Root> {
  error?: string;
}

function RadioGroup({
  className,
  orientation = "vertical",
  error,
  children,
  ...props
}: RadioGroupProps) {
  const errorId = error ? `${props.id ?? "radio-group"}-error` : undefined;
  const layoutOrientation =
    orientation === "horizontal" ? "horizontal" : "vertical";

  return (
    <div className="grid gap-1.5">
      <RadioGroupPrimitive.Root
        className={cn(
          radioGroupVariants({
            orientation: layoutOrientation,
            className,
          }),
        )}
        orientation={orientation}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
      >
        {children}
      </RadioGroupPrimitive.Root>
      {error && (
        <Text id={errorId} size="xs" className="text-error-foreground">
          {error}
        </Text>
      )}
    </div>
  );
}

export interface RadioGroupItemProps
  extends Omit<
      React.ComponentProps<typeof RadioGroupPrimitive.Item>,
      "children"
    >,
    VariantProps<typeof radioItemVariants> {
  label?: string;
  description?: string;
  size?: "sm" | "default" | "lg";
}

function RadioGroupItem({
  className,
  variant,
  size = "default",
  label,
  description,
  id: idProp,
  ...props
}: RadioGroupItemProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const descriptionId = `${id}-description`;
  const iconSize = indicatorIconSize[size ?? "default"];

  const radio = (
    <RadioGroupPrimitive.Item
      id={id}
      className={cn(
        radioItemVariants({
          variant,
          size,
          className: label ? undefined : className,
        }),
      )}
      aria-describedby={description ? descriptionId : undefined}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className={cn(iconSize, "fill-current")} />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );

  if (!label && !description) return radio;

  return (
    <div className={cn("flex items-start gap-2", className)}>
      {radio}
      <div className="grid gap-1">
        {label && (
          <Label htmlFor={id} className="cursor-pointer leading-none">
            {label}
          </Label>
        )}
        {description && (
          <Text id={descriptionId} size="xs" muted>
            {description}
          </Text>
        )}
      </div>
    </div>
  );
}

export { RadioGroup, RadioGroupItem, radioGroupVariants, radioItemVariants };
