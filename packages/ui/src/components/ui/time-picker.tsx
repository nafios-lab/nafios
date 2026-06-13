import { cva, type VariantProps } from "class-variance-authority";
import { ChevronUp, ChevronDown, Clock } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import type * as React from "react";
import { cn } from "../../lib/utils.ts";
import { Label } from "./label.tsx";

const timePickerVariants = cva(
  "inline-flex items-center gap-1 rounded-full border bg-card text-md shadow-sm transition-colors focus-within:outline-none focus-within:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default: "border-input focus-within:ring-ring",
        brand: "border-brand focus-within:ring-brand",
      },
      size: {
        sm: "h-8 px-2 text-xs",
        default: "h-9 px-3",
        lg: "h-10 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type Period = "AM" | "PM";

export interface TimeValue {
  hours: number;
  minutes: number;
  period?: Period;
}

export interface TimePickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    VariantProps<typeof timePickerVariants> {
  value?: TimeValue;
  onChange?: (value: TimeValue) => void;
  use12Hour?: boolean;
  minuteStep?: number;
  label?: string;
  disabled?: boolean;
  showIcon?: boolean;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  if (value > max) return min;
  if (value < min) return max;
  return value;
}

function TimePicker({
  className,
  variant,
  size,
  value,
  onChange,
  use12Hour = true,
  minuteStep = 1,
  label,
  disabled = false,
  showIcon = true,
  ...props
}: TimePickerProps) {
  const autoId = useId();
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  const hours = value?.hours ?? 12;
  const minutes = value?.minutes ?? 0;
  const period = value?.period ?? "AM";

  const maxHour = use12Hour ? 12 : 23;
  const minHour = use12Hour ? 1 : 0;

  const emit = useCallback(
    (patch: Partial<TimeValue>) => {
      onChange?.({
        hours,
        minutes,
        period: use12Hour ? period : undefined,
        ...patch,
      });
    },
    [hours, minutes, period, use12Hour, onChange],
  );

  const incHour = () => emit({ hours: clamp(hours + 1, minHour, maxHour) });
  const decHour = () => emit({ hours: clamp(hours - 1, minHour, maxHour) });
  const incMinute = () => emit({ minutes: clamp(minutes + minuteStep, 0, 59) });
  const decMinute = () => emit({ minutes: clamp(minutes - minuteStep, 0, 59) });
  const togglePeriod = () => emit({ period: period === "AM" ? "PM" : "AM" });

  // Local editing state — allows intermediate values while typing
  const [editingHour, setEditingHour] = useState<string | null>(null);
  const [editingMinute, setEditingMinute] = useState<string | null>(null);

  const commitHour = (raw: string) => {
    setEditingHour(null);
    const stripped = raw.replace(/\D/g, "");
    if (stripped === "") return;
    const n = Number.parseInt(stripped, 10);
    if (!Number.isNaN(n)) {
      emit({ hours: Math.max(minHour, Math.min(maxHour, n)) });
    }
  };

  const commitMinute = (raw: string) => {
    setEditingMinute(null);
    const stripped = raw.replace(/\D/g, "");
    if (stripped === "") return;
    const n = Number.parseInt(stripped, 10);
    if (!Number.isNaN(n)) {
      emit({ minutes: Math.max(0, Math.min(59, n)) });
    }
  };

  const handleHourInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setEditingHour(raw);
  };

  const handleMinuteInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setEditingMinute(raw);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleHourKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setEditingHour(null);
      incHour();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setEditingHour(null);
      decHour();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitHour(e.currentTarget.value);
      minuteRef.current?.focus();
    }
  };

  const handleMinuteKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setEditingMinute(null);
      incMinute();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setEditingMinute(null);
      decMinute();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitMinute(e.currentTarget.value);
      e.currentTarget.blur();
    }
  };

  const spinner = (onUp: () => void, onDown: () => void) => (
    <div className="flex flex-col -my-0.5">
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={onUp}
        className="inline-flex items-center justify-center size-4 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
        aria-label="Increment"
      >
        <ChevronUp className="size-3" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={onDown}
        className="inline-flex items-center justify-center size-4 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
        aria-label="Decrement"
      >
        <ChevronDown className="size-3" />
      </button>
    </div>
  );

  const picker = (
    <div className={cn(timePickerVariants({ variant, size }), className)} {...props}>
      {showIcon && <Clock className="size-4 text-muted-foreground shrink-0" />}

      {/* Hours */}
      <input
        ref={hourRef}
        type="text"
        inputMode="numeric"
        value={editingHour ?? pad(hours)}
        onChange={handleHourInput}
        onKeyDown={handleHourKey}
        onFocus={handleFocus}
        onBlur={(e) => commitHour(e.target.value)}
        disabled={disabled}
        aria-label="Hours"
        className="w-6 bg-transparent text-center outline-none font-mono tabular-nums"
        maxLength={2}
      />
      {spinner(incHour, decHour)}

      <span className="text-muted-foreground">:</span>

      {/* Minutes */}
      <input
        ref={minuteRef}
        type="text"
        inputMode="numeric"
        value={editingMinute ?? pad(minutes)}
        onChange={handleMinuteInput}
        onKeyDown={handleMinuteKey}
        onFocus={handleFocus}
        onBlur={(e) => commitMinute(e.target.value)}
        disabled={disabled}
        aria-label="Minutes"
        className="w-6 bg-transparent text-center outline-none font-mono tabular-nums"
        maxLength={2}
      />
      {spinner(incMinute, decMinute)}

      {/* AM/PM toggle */}
      {use12Hour && (
        <button
          type="button"
          onClick={togglePeriod}
          disabled={disabled}
          className="ml-1 rounded-full px-1.5 py-0.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
          aria-label={`Switch to ${period === "AM" ? "PM" : "AM"}`}
        >
          {period}
        </button>
      )}
    </div>
  );

  if (!label) return picker;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={autoId}>{label}</Label>
      {picker}
    </div>
  );
}

export { TimePicker, timePickerVariants };
