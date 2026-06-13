import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useTheme } from "@nafios/ui/hooks/use-theme";
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
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
