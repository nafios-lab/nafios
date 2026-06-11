import { ChevronLeft, ChevronRight } from "lucide-react";
import type * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "../../lib/utils.ts";
import { buttonVariants } from "./button.tsx";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const isRange = props.mode === "range";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption:
          "flex justify-center pt-1 relative items-center text-sm font-medium h-9",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute top-3 left-3 z-20",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute top-3 right-3 z-20",
        ),
        month_grid: "w-full border-collapse space-x-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-full w-8 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-sm border border-transparent focus-within:relative focus-within:z-20",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal aria-selected:opacity-100 rounded-full",
        ),
        range_start:
          "day-range-start rounded-l-full !rounded-r-none !border-l-brand !border-t-brand !border-b-brand !border-r-transparent [&>button]:rounded-l-full [&>button]:rounded-r-none",
        range_end:
          "day-range-end rounded-r-full !rounded-l-none !border-r-brand !border-t-brand !border-b-brand !border-l-transparent [&>button]:rounded-r-full [&>button]:rounded-l-none",
        selected: cn(
          "text-foreground hover:bg-muted",
          isRange
            ? "border border-brand rounded-full [&>button]:rounded-full"
            : "border border-brand rounded-full",
        ),
        today: cn(
          "text-brand bg-brand/10 rounded-full!",
          isRange ? "rounded-md" : "rounded-full",
        ),
        outside:
          "day-outside text-muted-foreground aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "!rounded-none [&>button]:!rounded-none !border-t-brand !border-b-brand !border-l-transparent !border-r-transparent aria-selected:text-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className="size-4" />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
export type { CalendarProps };
