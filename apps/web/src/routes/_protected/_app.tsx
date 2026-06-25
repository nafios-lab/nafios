import { SidebarInset, SidebarProvider } from "@nafios/ui/components/ui/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Navbar } from "../../components/navbar";
import { Sidebar } from "../../components/sidebar";

export const Route = createFileRoute("/_protected/_app")({
  beforeLoad: ({ context }) => {
    // Signed in but onboarding unfinished → finish it before entering the app.
    // Reuses the status `_protected` already fetched, so no extra round-trip.
    if (!context.onboardingCompleted) {
      throw redirect({ to: "/onboarding" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  return (
    // The rail is pinned to the collapsed (icon-only) state: `open={false}` with
    // a no-op `onOpenChange` makes it non-expandable. `--sidebar-width-icon`
    // widens the icon rail to match the draft.
    <SidebarProvider
      open={false}
      onOpenChange={() => {}}
      style={{ "--sidebar-width-icon": "4rem" } as CSSProperties}
    >
      <Sidebar />
      <SidebarInset>
        <Navbar email={session.user.email} />
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
