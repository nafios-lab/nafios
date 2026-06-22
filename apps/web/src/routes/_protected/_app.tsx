import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Navbar } from "../../components/navbar";

export const Route = createFileRoute("/_protected/_app")({
  beforeLoad: ({ context }) => {
    // Signed in but onboarding unfinished → finish it before entering the app.
    // Reuses the status `_protected` already fetched, so no extra round-trip.
    if (!context.onboardingCompleted) {
      throw redirect({ to: "/onboarding" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
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
