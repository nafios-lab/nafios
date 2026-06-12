import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useId, useState } from "react";
import type * as React from "react";
import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Calendar, type CalendarProps } from "./ui/calendar.tsx";
import { Label } from "./ui/label.tsx";
import { MonthSelect } from "./month-select.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { YearSelect } from "./year-select.tsx";

type NavigationView = "calendar" | "month" | "year";

export interface DatePickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  dateFormat?: string;
  calendarProps?: Omit<CalendarProps, "mode" | "selected" | "onSelect">;
}

function DatePicker({
  className,
  value,
  onChange,
  placeholder = "Pick a date",
  label,
  disabled = false,
  dateFormat = "PPP",
  calendarProps,
  ...props
}: DatePickerProps) {
  const autoId = useId();
  const [open, setOpen] = useState(false);
  const [navView, setNavView] = useState<NavigationView>("calendar");
  const [viewMonth, setViewMonth] = useState<Date>(value ?? new Date());

  const handleSelect = (date: Date | undefined) => {
    onChange?.(date);
    if (date) setOpen(false);
  };

  const handleMonthPick = (month: number) => {
    const next = new Date(viewMonth);
    next.setMonth(month);
    setViewMonth(next);
    setNavView("calendar");
  };

  const handleYearPick = (year: number) => {
    const next = new Date(viewMonth);
    next.setFullYear(year);
    setViewMonth(next);
    setNavView("month");
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
            "w-full justify-start text-left font-normal bg-card",
            !value && "text-muted-foreground",
            className,
          )}
          iconLeft={<CalendarIcon className="size-4 text-muted-foreground" />}
        >
          {triggerContent}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {navView === "calendar" && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setNavView("month")}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-10 font-display text-sm font-medium hover:underline cursor-pointer pointer-events-auto"
            >
              {format(viewMonth, "MMMM yyyy")}
            </button>
            <Calendar
              mode="single"
              selected={value}
              onSelect={handleSelect}
              month={viewMonth}
              onMonthChange={setViewMonth}
              {...calendarProps}
              classNames={{
                caption_label: "invisible",
                ...calendarProps?.classNames,
              }}
            />
          </div>
        )}
        {navView === "month" && (
          <div className="p-2">
            <button
              type="button"
              onClick={() => setNavView("year")}
              className="w-full text-center font-display text-sm font-medium hover:underline cursor-pointer mb-2"
            >
              {viewMonth.getFullYear()}
            </button>
            <MonthSelect
              value={viewMonth.getMonth()}
              onChange={handleMonthPick}
              short
            />
          </div>
        )}
        {navView === "year" && (
          <YearSelect
            value={viewMonth.getFullYear()}
            onChange={handleYearPick}
          />
        )}
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

export { DatePicker };
