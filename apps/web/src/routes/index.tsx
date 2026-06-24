import { createFileRoute, redirect } from "@tanstack/react-router";
import { getOnboardingStatusFn } from "../lib/onboarding-fns";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { session, onboardingCompleted } = await getOnboardingStatusFn();

    if (!session) {
      throw redirect({ to: "/auth/login" });
    }
    // Signed in: unfinished onboarding resumes at /onboarding; otherwise the app.
    throw redirect({ to: onboardingCompleted ? "/dashboard" : "/onboarding" });
  },
});
