import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * A fresh `QueryClient` + provider wrapper for `render` / `renderHook`. The auth
 * hooks read `useQueryClient()` to invalidate `['session']`, so every render
 * under test needs a provider. Retries are off so a rejected query surfaces
 * immediately instead of being retried.
 */
export function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
