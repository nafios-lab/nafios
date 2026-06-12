import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";

const codeVariants = cva("font-mono tabular-nums", {
  variants: {
    size: {
      md: "text-md",
      sm: "text-sm",
      xs: "text-xs",
    },
    block: {
      true: "block whitespace-pre rounded-md bg-muted px-4 py-3",
      false: "rounded bg-muted px-1.5 py-0.5",
    },
  },
  defaultVariants: {
    size: "sm",
    block: false,
  },
});

export interface CodeProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof codeVariants> {
  /** Render as `<pre>` block or inline `<code>`. @default false */
  block?: boolean;
}

function Code({
  size,
  block = false,
  className,
  children,
  ...props
}: CodeProps) {
  if (block) {
    return (
      <pre className={cn(codeVariants({ size, block }), className)} {...props}>
        <code>{children}</code>
      </pre>
    );
  }

  return (
    <code className={cn(codeVariants({ size, block }), className)} {...props}>
      {children}
    </code>
  );
}

export { Code, codeVariants };
