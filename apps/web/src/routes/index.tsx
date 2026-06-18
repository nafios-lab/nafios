import { createFileRoute, redirect } from "@tanstack/react-router";
import { getOnboardingStatusFn } from "../lib/onboarding-fns";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { session, onboardingCompleted } = await getOnboardingStatusFn();
    if (!session) {
      throw redirect({ to: "/auth/login" });
    }
    // A signed-in user with unfinished onboarding resumes signup; otherwise the
    // dashboard.
    throw redirect({ to: onboardingCompleted ? "/dashboard" : "/auth/signup" });
  },
});
