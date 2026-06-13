import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useId, useState } from "react";
import type { DateRange } from "react-day-picker";
import type * as React from "react";
import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Calendar, type CalendarProps } from "./ui/calendar.tsx";
import { Label } from "./ui/label.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";

export interface DateRangePickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  dateFormat?: string;
  numberOfMonths?: number;
  calendarProps?: Omit<CalendarProps, "mode" | "selected" | "onSelect" | "numberOfMonths">;
}

function DateRangePicker({
  className,
  value,
  onChange,
  placeholder = "Pick a date range",
  label,
  disabled = false,
  dateFormat = "MMM dd, yyyy",
  numberOfMonths = 2,
  calendarProps,
  ...props
}: DateRangePickerProps) {
  const autoId = useId();
  const [open, setOpen] = useState(false);

  const handleSelect = (range: DateRange | undefined) => {
    onChange?.(range);
  };

  let displayText: React.ReactNode;
  if (value?.from) {
    displayText = value.to ? (
      <>
        {format(value.from, dateFormat)} – {format(value.to, dateFormat)}
      </>
    ) : (
      format(value.from, dateFormat)
    );
  } else {
    displayText = <span className="text-muted-foreground">{placeholder}</span>;
  }

  const content = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal bg-card",
            !value?.from && "text-muted-foreground",
            className,
          )}
          iconLeft={<CalendarIcon className="size-4 text-muted-foreground" />}
        >
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={handleSelect}
          numberOfMonths={numberOfMonths}
          {...calendarProps}
        />
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

export { DateRangePicker };
export type { DateRange };
