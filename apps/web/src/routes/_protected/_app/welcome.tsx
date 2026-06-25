import { createFileRoute } from "@tanstack/react-router";
import { UserMenu, useNavbar } from "../../../components/navbar";

export const Route = createFileRoute("/_protected/_app/welcome")({
  component: Welcome,
});

function Welcome() {
  const { session } = Route.useRouteContext();

  // The root page composes its own bar: just search on the left, the user menu
  // on the right. No module title.
  useNavbar({
    rightAside: <UserMenu email={session.user.email} />,
  });

  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to NafiOS</h1>
      <p className="text-muted-foreground">Your dashboard will appear here.</p>
    </div>
  );
}
