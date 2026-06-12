import type * as React from "react";
import { cn } from "../../lib/utils.ts";

export interface DocLogoProps
  extends Omit<React.SVGAttributes<SVGSVGElement>, "children"> {
  className?: string;
}

function DocLogo({ className, ...props }: DocLogoProps) {
  return (
    <svg
      viewBox="0 0 87 87"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-auto", className)}
      {...props}
    >
      {/* Page body with folded corner cutout */}
      <path
        d="M22.5 10.6H54.5L70.5 26.6V73.6C70.5 75.81 68.71 77.6 66.5 77.6H22.5C20.29 77.6 18.5 75.81 18.5 73.6V14.6C18.5 12.39 20.29 10.6 22.5 10.6Z"
        fill="var(--color-brand)"
      />
      {/* Dog-ear fold */}
      <path
        d="M54.5 10.6V22.6C54.5 24.81 56.29 26.6 58.5 26.6H70.5L54.5 10.6Z"
        fill="var(--color-brand-darker)"
      />
      {/* Title line */}
      <path
        d="M28.5 36.6H48.5C49.6 36.6 50.5 37.5 50.5 38.6C50.5 39.7 49.6 40.6 48.5 40.6H28.5C27.4 40.6 26.5 39.7 26.5 38.6C26.5 37.5 27.4 36.6 28.5 36.6Z"
        fill="var(--color-brand-darker)"
      />
      {/* Text line 1 */}
      <path
        opacity="0.5"
        d="M28.5 46.6H60.5C61.05 46.6 61.5 47.05 61.5 47.6C61.5 48.15 61.05 48.6 60.5 48.6H28.5C27.95 48.6 27.5 48.15 27.5 47.6C27.5 47.05 27.95 46.6 28.5 46.6Z"
        fill="var(--color-brand-darker)"
      />
      {/* Text line 2 */}
      <path
        opacity="0.5"
        d="M28.5 52.6H56.5C57.05 52.6 57.5 53.05 57.5 53.6C57.5 54.15 57.05 54.6 56.5 54.6H28.5C27.95 54.6 27.5 54.15 27.5 53.6C27.5 53.05 27.95 52.6 28.5 52.6Z"
        fill="var(--color-brand-darker)"
      />
      {/* Text line 3 */}
      <path
        opacity="0.4"
        d="M28.5 58.6H46.5C47.05 58.6 47.5 59.05 47.5 59.6C47.5 60.15 47.05 60.6 46.5 60.6H28.5C27.95 60.6 27.5 60.15 27.5 59.6C27.5 59.05 27.95 58.6 28.5 58.6Z"
        fill="var(--color-brand-darker)"
      />
    </svg>
  );
}

export { DocLogo };
