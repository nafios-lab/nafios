import { SidebarInset, SidebarProvider } from "@nafios/ui/components/ui/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { onboardingStatusQueryOptions } from "~/features/onboarding/lib/onboarding-data";
import { Navbar, NavbarProvider } from "~/shared/components/navbar";
import { Sidebar, SidebarNavProvider } from "~/shared/components/sidebar";

/**
 * The shell layout for every module in the suite — the navbar + navigation rail
 * around a page `<Outlet/>`. Sits under `_protected` (pathless, so children keep
 * their own top-level URLs) and above the modules that render inside the chrome
 * (welcome today; Finance, Calendar, … as they mount).
 *
 * `onboarding` deliberately lives *outside* this layout: the wizard is a
 * full-screen flow, not a module in the shell.
 */
export const Route = createFileRoute("/_protected/_app")({
  beforeLoad: async ({ context }) => {
    // The onboarding-completion gate: a signed-in-but-unfinished user is bounced
    // to the wizard before they can reach any shell module. The status query is
    // cached (shared with the `index` redirect); Finish clears it
    // (resetOnboardingStatus) so a just-completed user reads `true` and enters.
    const completed = await context.queryClient.ensureQueryData(
      onboardingStatusQueryOptions(context.session.user.id),
    );
    if (!completed) throw redirect({ to: "/onboarding" });
  },
  component: AppLayout,
});

function AppLayout() {
  // Session is guaranteed here: `_protected` redirects to login when it's null.
  // Map it onto the rail's minimal user shape — the email carries the account,
  // and with no name/avatar stored on the session the menu falls back to
  // email-derived initials. (Surfacing the signed profile avatar is a follow-up.)
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
      <NavbarProvider>
        <SidebarNavProvider>
          <Sidebar user={{ email: session.user.email }} />
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
