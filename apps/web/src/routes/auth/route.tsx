import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getOnboardingStatusFn } from "../../lib/onboarding-fns";

export const Route = createFileRoute("/auth")({
  beforeLoad: async ({ location }) => {
    const { session, onboardingCompleted } = await getOnboardingStatusFn();
    if (!session) return;
    // A fully onboarded session has no business on any auth page.
    if (onboardingCompleted) {
      throw redirect({ to: "/dashboard" });
    }
    // An incomplete session may stay on /auth/signup to finish onboarding, but
    // anywhere else under /auth (login, etc.) bounces back to signup.
    if (location.pathname !== "/auth/signup") {
      throw redirect({ to: "/auth/signup" });
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
