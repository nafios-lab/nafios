import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { ServiceMenu } from "~/components/service-menu";
import { NavbarClock, SearchBar, useNavbar } from "../../../components/navbar";
import { useSidebarNav } from "../../../components/sidebar";

export const Route = createFileRoute("/_protected/_app/welcome")({
  component: Welcome,
});

function Welcome() {
  // The welcome home declares its own rail: a Home entry plus quick links into
  // the suite's modules.
  useSidebarNav([{ id: "smart-todo", label: "SmartTodo", icon: ListChecks }]);

  // The root page composes its own bar: search on the left, a live date/time
  // clock on the right. No module title.
  useNavbar({
    leftAside: (
      // Grows to a 500px cap on wide screens, but `min-w-0` lets it shrink in
      // place as the bar narrows instead of overflowing on mobile.
      <div className="min-w-0 max-w-125 flex-1">
        <SearchBar />
      </div>
    ),
    rightAside: (
      <>
        <ServiceMenu active="home" />
        <NavbarClock />
      </>
    ),
  });

  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to NafiOS</h1>
      <p className="text-muted-foreground">Your dashboard will appear here.</p>
    </div>
  );
}
