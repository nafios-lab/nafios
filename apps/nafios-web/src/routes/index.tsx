import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "~/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    // Signed in → the app home; otherwise the login page. (Onboarding-completion
    // gating lands in Phase 8 alongside the real shell + /welcome.)
    throw redirect({ to: session ? "/home" : "/auth/login" });
  },
});
