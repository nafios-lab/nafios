import { createFileRoute } from "@tanstack/react-router";
import { UserMenu, useNavbar } from "../../../components/navbar";
import { IconButton } from "@nafios/ui/components/ui/icon-button";
import { LayoutGrid, Search } from "lucide-react";
import { TextInput } from "@nafios/ui/components/text-input";

export const Route = createFileRoute("/_protected/_app/welcome")({
  component: Welcome,
});

function Welcome() {
  const { session } = Route.useRouteContext();

  // The root page composes its own bar: just search on the left, the user menu
  // on the right. No module title.
  useNavbar({
    leftAside: (
      <>
        <IconButton
          variant={"ghost"}
          aria-label="module-menus"
          icon={<LayoutGrid />}
        />
        <TextInput
          className="min-w-[500px]"
          placeholder="Search..."
          iconRight={<Search />}
        />
      </>
    ),
    rightAside: <UserMenu email={session.user.email} />,
  });

  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to NafiOS</h1>
      <p className="text-muted-foreground">Your dashboard will appear here.</p>
    </div>
  );
}
