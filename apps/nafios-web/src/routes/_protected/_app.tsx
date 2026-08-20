import { SidebarInset, SidebarProvider } from "@nafios/ui/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { onboardingStatusQueryOptions } from "~/features/onboarding/lib/onboarding-data";
import { profileQueryOptions } from "~/lib/profile";
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
  // The email carries the account; the display avatar lives in `profiles`, not
  // on the session, so it is a separate signed read. Non-blocking `useQuery` (not
  // a route guard): the shell paints instantly with email-derived initials and
  // swaps in the photo when it arrives — the avatar never gates navigation, and
  // the menu falls back to initials whenever it is absent.
  const { session } = Route.useRouteContext();
  const { data: profile } = useQuery(profileQueryOptions(session.user.id));

  return (
    // The rail is pinned to the collapsed (icon-only) state: `open={false}` with
    // a no-op `onOpenChange` makes it non-expandable. `--sidebar-width-icon`
    // widens the icon rail to match the draft.
    <SidebarProvider
      open={false}
      onOpenChange={() => {}}
      // The shell owns the viewport: pin the wrapper to exactly one screen
      // (`h-svh`, overriding the primitive's `min-h-svh`) and clip it, so the
      // document itself never scrolls. That bounded height is what lets the
      // page container below scroll *under* a fixed navbar + rail.
      className="h-svh overflow-hidden"
      style={{ "--sidebar-width-icon": "4rem" } as CSSProperties}
    >
      <NavbarProvider>
        <SidebarNavProvider>
          <Sidebar user={{ email: session.user.email, avatarUrl: profile?.avatarUrl }} />
          {/* `min-h-0`/`min-w-0` so this column may shrink below its content in
              the flex row — without them the auto minimum size wins and the
              scroll container below is pushed past the viewport. */}
          <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
            <Navbar />
            {/* The page scroll container: the only scrolling element in the
                shell, on *both* axes. Everything above it (navbar) and beside
                it (rail) stays put — the navbar compresses responsively rather
                than scrolling sideways with the page. Pages may pin their own
                sub-headers with `sticky top-0`. */}
            <div className="min-h-0 flex-1 overflow-auto">
              {/* The page floor: content never squeezes below this, it scrolls
                  horizontally instead. The min-width must sit on the *content*
                  inside the scroller — putting it on the scroll container just
                  widens the container, so nothing ever overflows it. */}
              <div className="min-w-[1200px]">
                <Outlet />
              </div>
            </div>
          </SidebarInset>
        </SidebarNavProvider>
      </NavbarProvider>
    </SidebarProvider>
  );
}
