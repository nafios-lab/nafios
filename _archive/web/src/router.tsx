import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { GlobalErrorBoundary, GlobalNotFound } from "./components/error-boundaries";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // One QueryClient app-wide (ADR-0026 §5). Domain modules read/write their own
  // data client-side via TanStack Query; this is the shell's single cache.
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: GlobalErrorBoundary,
    defaultNotFoundComponent: GlobalNotFound,
  });

  // Wires the QueryClientProvider (via router.options.Wrap) + SSR
  // dehydration/hydration — the current official TanStack Start + Query pattern.
  // No hand-mounted <QueryClientProvider> in __root.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
