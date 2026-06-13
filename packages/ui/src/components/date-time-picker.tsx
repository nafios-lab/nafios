import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useId, useState } from "react";
import type * as React from "react";
import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Calendar, type CalendarProps } from "./ui/calendar.tsx";
import { Label } from "./ui/label.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { Separator } from "./ui/separator.tsx";
import { TimePicker, type TimeValue } from "./ui/time-picker.tsx";

export interface DateTimePickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  dateFormat?: string;
  use12Hour?: boolean;
  minuteStep?: number;
  calendarProps?: Omit<CalendarProps, "mode" | "selected" | "onSelect">;
}

function to24Hour(hours: number, period?: "AM" | "PM"): number {
  if (!period) return hours;
  if (period === "AM") return hours === 12 ? 0 : hours;
  return hours === 12 ? 12 : hours + 12;
}

function to12Hour(hours24: number): { hours: number; period: "AM" | "PM" } {
  const period = hours24 >= 12 ? ("PM" as const) : ("AM" as const);
  const hours = hours24 % 12 || 12;
  return { hours, period };
}

function DateTimePicker({
  className,
  value,
  onChange,
  placeholder = "Pick date and time",
  label,
  disabled = false,
  dateFormat = "PPP p",
  use12Hour = true,
  minuteStep = 1,
  calendarProps,
  ...props
}: DateTimePickerProps) {
  const autoId = useId();
  const [open, setOpen] = useState(false);

  const timeValue: TimeValue | undefined = value
    ? use12Hour
      ? {
          ...to12Hour(value.getHours()),
          minutes: value.getMinutes(),
        }
      : {
          hours: value.getHours(),
          minutes: value.getMinutes(),
        }
    : undefined;

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      onChange?.(undefined);
      return;
    }
    const next = new Date(date);
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    }
    onChange?.(next);
  };

  const handleTimeChange = (tv: TimeValue) => {
    const base = value ?? new Date();
    const next = new Date(base);
    const h24 = use12Hour ? to24Hour(tv.hours, tv.period) : tv.hours;
    next.setHours(h24, tv.minutes, 0, 0);
    onChange?.(next);
  };

  const triggerContent = value ? (
    format(value, dateFormat)
  ) : (
    <span className="text-muted-foreground">{placeholder}</span>
  );

  const content = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
          iconLeft={<CalendarIcon className="size-4 text-muted-foreground" />}
        >
          {triggerContent}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={handleDateSelect} {...calendarProps} />
        <Separator />
        <div className="p-3 flex items-center justify-center">
          <TimePicker
            value={timeValue}
            onChange={handleTimeChange}
            use12Hour={use12Hour}
            minuteStep={minuteStep}
            disabled={disabled}
            variant="default"
            size="sm"
          />
        </div>
      </PopoverContent>
    </Popover>
  );

  if (!label) return <div {...props}>{content}</div>;

  return (
    <div className="flex flex-col gap-1.5" {...props}>
      <Label htmlFor={autoId}>{label}</Label>
      {content}
    </div>
  );
}

export { DateTimePicker };
