import { SidebarInset, SidebarProvider } from "@nafios/ui/components/ui/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Navbar, NavbarProvider } from "../../components/navbar";
import { Sidebar, SidebarNavProvider } from "../../components/sidebar";

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
  // Session is guaranteed here: `_protected` redirects to login when it's null.
  // Map it onto the rail's minimal user shape. The session only carries the
  // email; the (signed) account avatar rides along on `_protected`'s profile
  // read. With no name stored yet, the menu falls back to email-derived initials
  // whenever the avatar is absent.
  const { session, avatarUrl } = Route.useRouteContext();

  return (
    // The rail is pinned to the collapsed (icon-only) state: `open={false}` with
    // a no-op `onOpenChange` makes it non-expandable. `--sidebar-width-icon`
    // widens the icon rail to match the draft.
    <SidebarProvider
      open={false}
      onOpenChange={() => {}}
      style={{ "--sidebar-width-icon": "4rem" } as CSSProperties}
    >
      <NavbarProvider>
        <SidebarNavProvider>
          <Sidebar user={{ email: session.user.email, avatarUrl: avatarUrl ?? undefined }} />
          <SidebarInset>
            <Navbar />
            <div className="flex-1 overflow-auto p-6">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarNavProvider>
      </NavbarProvider>
    </SidebarProvider>
  );
}
