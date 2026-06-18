import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Navbar } from "../components/navbar";
import { getSessionFn } from "../lib/auth-fns";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    const { session } = await getSessionFn();
    if (!session) {
      throw redirect({ to: "/auth/login" });
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
