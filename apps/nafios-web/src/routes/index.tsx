import { createFileRoute, redirect } from "@tanstack/react-router";
import { onboardingStatusQueryOptions } from "~/features/onboarding/lib/onboarding-data";
import { sessionQueryOptions } from "~/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) throw redirect({ to: "/auth/login" });

    // Signed in: unfinished onboarding resumes at /onboarding; otherwise the app.
    // The status query is cached and shared with the /onboarding and /welcome gates.
    const completed = await context.queryClient.ensureQueryData(
      onboardingStatusQueryOptions(session.user.id),
    );
    throw redirect({ to: completed ? "/welcome" : "/onboarding" });
  },
});
