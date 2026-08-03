import { ScreenLoader } from "@nafios/ui/components/screen-loader";
import { ThemeToggle } from "@nafios/ui/components/theme-toggle";
import { useTheme } from "@nafios/ui/hooks/use-theme";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { RouteProgress } from "~/shared/components/route-progress";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootDocument,
});

function RootDocument() {
  useTheme(); // applies `.dark` to the real <html> from index.html
  return (
    <>
      <RouteProgress />
      <Outlet />
      <ScreenLoader />
      <ThemeToggle className={import.meta.env.DEV ? "bottom-24" : undefined} />
      {import.meta.env.DEV && (
        <TanStackDevtools
          config={{ hideUntilHover: true }}
          plugins={[
            formDevtoolsPlugin(),
            { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
          ]}
        />
      )}
    </>
  );
}
