import { createFileRoute, redirect } from "@tanstack/react-router";
import { getOnboardingStatusFn } from "../lib/onboarding-fns";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ location }) => {
    const { session, onboardingCompleted } = await getOnboardingStatusFn();

    // Session gate for everything protected. No session → bounce to login,
    // remembering where they were headed. The onboarding-completion gate lives
    // one level down in `_app`, so /onboarding (its sibling) stays reachable
    // while incomplete instead of redirecting to itself.
    if (session === null) {
      throw redirect({ to: "/auth/login", search: { redirect: location.pathname } });
    }

    // Hand the status down so `_app` can gate on completion without refetching.
    return { session, onboardingCompleted };
  },
  // No component: this is a pure gate. TanStack renders <Outlet/> by default,
  // so children (onboarding, the `_app` shell) own their own layout.
});
