import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { NavbarClock, SearchBar, useNavbar } from "~/shared/components/navbar";
import { ServiceMenu } from "~/shared/components/service-menu";
import { useSidebarNav } from "~/shared/components/sidebar";

export const Route = createFileRoute("/_protected/_app/welcome")({
  component: Welcome,
});

function Welcome() {
  // The welcome home declares its own rail: a quick link into the suite's
  // modules. (Inert for now — the rail wires clicks to routes as modules mount.)
  useSidebarNav([{ id: "smart-todo", label: "SmartTodo", icon: ListChecks }]);

  // The root page composes its own bar: search on the left; the service menu +
  // a live date/time clock on the right. No module title — this is home.
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
      <Heading>Welcome to NafiOS</Heading>
      <Text muted>Your dashboard will appear here.</Text>
    </div>
  );
}
