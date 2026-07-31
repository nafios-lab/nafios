import { createFileRoute, redirect } from "@tanstack/react-router";
import { getOnboardingStatusFn } from "../lib/onboarding-fns";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { user, onboardingCompleted } = await getOnboardingStatusFn();

    if (!user) {
      throw redirect({ to: "/auth/login" });
    }
    // Signed in: unfinished onboarding resumes at /onboarding; otherwise the app.
    throw redirect({ to: onboardingCompleted ? "/welcome" : "/onboarding" });
  },
});
