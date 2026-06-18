import { createRouter } from "@tanstack/react-router";
import { GlobalErrorBoundary, GlobalNotFound } from "./components/error-boundaries";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultErrorComponent: GlobalErrorBoundary,
    defaultNotFoundComponent: GlobalNotFound,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
