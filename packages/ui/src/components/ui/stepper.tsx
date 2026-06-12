import { cn } from "../../lib/utils.ts";

export type StepperSize = "sm" | "md" | "lg";

export interface StepperStep {
  /** Label displayed below the step circle. */
  label: string;
}

export interface StepperProps {
  /** Array of steps to display. */
  steps: StepperStep[];
  /** Zero-based index of the currently active step. */
  activeStep: number;
  /** Called when a step circle is clicked. */
  onStepClick?: (index: number) => void;
  /** Size of the step circles and labels. Defaults to "md". */
  size?: StepperSize;
  /** Additional class name on the root wrapper. */
  className?: string;
}

const circleSize: Record<StepperSize, string> = {
  sm: "size-7 text-xs",
  md: "size-10 text-sm",
  lg: "size-13 text-md",
};

const labelSize: Record<StepperSize, string> = {
  sm: "text-xs mt-1.5",
  md: "text-xs mt-2",
  lg: "text-sm mt-2.5",
};

const connectorHeight: Record<StepperSize, string> = {
  sm: "h-px",
  md: "h-0.5",
  lg: "h-0.75",
};

function Stepper({
  steps,
  activeStep,
  onStepClick,
  size = "md",
  className,
}: StepperProps) {
  return (
    <div
      className={cn("flex w-full items-start justify-between", className)}
      role="navigation"
      aria-label="Progress"
    >
      {steps.map((step, index) => {
        const isActive = index === activeStep;
        const isCompleted = index < activeStep;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.label} className="flex flex-1 flex-col items-center">
            {/* Connector line + circle row */}
            <div className="flex w-full items-center">
              {/* Left connector */}
              {index > 0 ? (
                <div
                  className={cn(
                    "flex-1",
                    connectorHeight[size],
                    index <= activeStep
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                  )}
                />
              ) : (
                <div className="flex-1" />
              )}

              {/* Step circle */}
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                disabled={!onStepClick}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${step.label}`}
                className={cn(
                  "relative z-10 flex shrink-0 items-center justify-center rounded-full font-medium transition-colors",
                  circleSize[size],
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive &&
                    "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  isCompleted && "bg-primary/50 text-primary-foreground",
                  !isActive &&
                    !isCompleted &&
                    "bg-muted-foreground/20 text-muted-foreground",
                  onStepClick
                    ? "cursor-pointer hover:opacity-80"
                    : "cursor-default",
                )}
              >
                {index + 1}
              </button>

              {/* Right connector */}
              {!isLast ? (
                <div
                  className={cn(
                    "flex-1",
                    connectorHeight[size],
                    index < activeStep
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                  )}
                />
              ) : (
                <div className="flex-1" />
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                "uppercase tracking-wider",
                labelSize[size],
                isActive
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { Stepper };
