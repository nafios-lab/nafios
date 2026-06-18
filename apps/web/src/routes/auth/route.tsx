import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessionFn } from "../../lib/auth-fns";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { session } = await getSessionFn();
    if (session) {
      throw redirect({ to: "/dashboard" });
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
