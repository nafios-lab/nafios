import type * as React from "react";
import { Button, type ButtonProps } from "./button.tsx";
import { cn } from "../../lib/utils.ts";

type IconButtonSize = "default" | "sm" | "lg";

export interface IconButtonProps
  extends Omit<
    ButtonProps,
    "size" | "iconLeft" | "iconRight" | "children" | "textOnLoading" | "showLoader"
  > {
  /** Any React node — lucide-react, heroicons, a custom SVG, etc. */
  icon: React.ReactNode;
  /** Controls the square dimensions. Defaults to "default" (36 px). */
  size?: IconButtonSize;
  /** Accessible label (required since there is no visible text). */
  "aria-label": string;
}

const sizeMap: Record<IconButtonSize, string> = {
  sm: "size-8 [&_svg]:size-3.5",
  default: "size-9 [&_svg]:size-4",
  lg: "size-10 [&_svg]:size-5",
};

function IconButton({ icon, size = "default", className, ...props }: IconButtonProps) {
  return (
    <Button size="icon" className={cn(sizeMap[size], "rounded-full", className)} {...props}>
      {icon}
    </Button>
  );
}

export { IconButton };
