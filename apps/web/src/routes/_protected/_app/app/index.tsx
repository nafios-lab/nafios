import { createFileRoute } from "@tanstack/react-router";
import { NavbarTitle, SearchBar, UserMenu, useNavbar } from "../../../../components/navbar";

export const Route = createFileRoute("/_protected/_app/app/")({
  component: AppPlaceholder,
});

function AppPlaceholder() {
  const { session } = Route.useRouteContext();

  // A module composes its own navbar from the shared building blocks: search +
  // a title on the left, its action + the user menu on the right.
  useNavbar({
    leftAside: (
      <>
        <SearchBar />
        <NavbarTitle>Modules</NavbarTitle>
      </>
    ),
    rightAside: (
      <>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          New module
        </button>
        <UserMenu email={session.user.email} />
      </>
    ),
  });

  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <h1 className="text-2xl font-bold tracking-tight">Modules</h1>
      <p className="text-muted-foreground">Domain modules will be mounted here.</p>
    </div>
  );
}
