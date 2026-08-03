import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "~/lib/auth";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);

    // Session gate for everything protected. No session → bounce to login,
    // remembering where they were headed. Unlike the old SSR app this runs
    // after the JS bundle loads, so an unauthenticated user sees a brief shell
    // flash before the redirect — not a security regression, because RLS is the
    // real boundary (ADR-0026) and protected data never loads.
    if (session === null) {
      throw redirect({ to: "/auth/login", search: { redirect: location.pathname } });
    }

    // Hand the session down so children read the user without a refetch.
    return { session };
  },
  // No component: this is a pure gate. TanStack renders <Outlet/> by default,
  // so children own their own layout.
});
