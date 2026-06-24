import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getOnboardingStatusFn } from "../../lib/onboarding-fns";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { session } = await getOnboardingStatusFn();
    // Auth pages are for signed-out visitors. A signed-in user has no business
    // here — send them home, which routes them on to the dashboard or onboarding.
    if (session) {
      throw redirect({ to: "/" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <Outlet />
    </main>
  );
}
