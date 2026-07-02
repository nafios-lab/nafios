import { TextInput } from "@nafios/ui/components/text-input";
import { createFileRoute } from "@tanstack/react-router";
import { ListChecks, Search } from "lucide-react";
import { ServiceMenu } from "~/components/service-menu";
import { NavbarClock, useNavbar } from "../../../components/navbar";
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
      <>
        <ServiceMenu active="home" />
        <TextInput
          className="min-w-[500px] border-transparent"
          placeholder="Search..."
          iconRight={<Search />}
        />
      </>
    ),
    rightAside: <NavbarClock />,
  });

  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to NafiOS</h1>
      <p className="text-muted-foreground">Your dashboard will appear here.</p>
    </div>
  );
}
