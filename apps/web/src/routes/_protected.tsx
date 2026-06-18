import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Navbar } from "../components/navbar";
import { getOnboardingStatusFn } from "../lib/onboarding-fns";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    const { session, onboardingCompleted } = await getOnboardingStatusFn();
    if (!session) {
      throw redirect({ to: "/auth/login" });
    }
    // Signed in but onboarding unfinished — keep them out of the app and send
    // them back to finish signup rather than into a half-set-up account.
    if (!onboardingCompleted) {
      throw redirect({ to: "/auth/signup" });
    }
    return { session };
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const { session } = Route.useRouteContext();
  return (
    <div className="min-h-screen">
      <Navbar email={session.user.email} />
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
