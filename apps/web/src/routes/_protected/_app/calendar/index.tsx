import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_app/calendar/")({
  component: CalendarMonth,
});

function CalendarMonth() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Calendar · Month</h1>
      <p className="text-muted-foreground">
        A monthly grid of events and shared schedules will render here.
      </p>
    </div>
  );
}
