import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "~/lib/auth";

export const Route = createFileRoute("/auth")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    // Auth pages are for signed-out visitors. A signed-in user has no business
    // here — send them home, which routes them on to the app.
    if (session) {
      throw redirect({ to: "/" });
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
