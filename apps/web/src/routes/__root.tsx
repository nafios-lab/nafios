import { ScreenLoader } from "@nafios/ui/components/screen-loader";
import { useTheme } from "@nafios/ui/hooks/use-theme";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { DevResetButton } from "../components/dev-reset-button";
import { RouteProgress } from "../components/route-progress";
import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NafiOS" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const { resolvedTheme } = useTheme();

  return (
    <html lang="en" className={resolvedTheme === "dark" ? "dark" : ""}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground font-body antialiased">
        <RouteProgress />
        <Outlet />
        <ScreenLoader />
        <DevResetButton />
        <Scripts />
        {import.meta.env.DEV && (
          <TanStackDevtools config={{ hideUntilHover: true }} plugins={[formDevtoolsPlugin()]} />
        )}
      </body>
    </html>
  );
}
