import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_app/calendar/schedule")({
  component: CalendarSchedule,
});

function CalendarSchedule() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Calendar · Schedule</h1>
      <p className="text-muted-foreground">
        An agenda-style list of upcoming events will appear here.
      </p>
    </div>
  );
}
