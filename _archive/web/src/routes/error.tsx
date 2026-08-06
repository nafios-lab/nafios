import { Button } from "@nafios/ui/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { ErrorScreen } from "../components/error-screen";

/**
 * Generic system-error page. Reached when an operation fails for a reason the
 * user cannot fix (a bug or infrastructure fault) — e.g. account creation
 * exhausting its retries. Deliberately not session-gated, so it's reachable in
 * any auth state.
 */
export const Route = createFileRoute("/error")({
  component: ErrorPage,
});

function ErrorPage() {
  return (
    <ErrorScreen
      title="Something went wrong on our end."
      description="This wasn't you — an unexpected error stopped us from finishing. Please try again in a moment, and contact support if it keeps happening."
      action={
        <Link to="/">
          <Button variant="brand" iconLeft={<RotateCcw />}>
            Try again
          </Button>
        </Link>
      }
    />
  );
}
