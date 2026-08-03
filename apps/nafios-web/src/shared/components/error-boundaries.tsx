import { Button } from "@nafios/ui/components/ui/button";
import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { Home, RotateCcw } from "lucide-react";
import { ErrorScreen } from "./error-screen";

/**
 * Global error boundary wired into the router as `defaultErrorComponent`. Any
 * uncaught error thrown in a route's loader, beforeLoad, or component renders
 * here instead of a blank screen. `reset()` retries the failed render in place;
 * if the fault persists the user can fall back to the home route.
 */
export function GlobalErrorBoundary({ reset }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <ErrorScreen
      title="Something went wrong on our end."
      description="This wasn't you — an unexpected error stopped us from finishing. Please try again in a moment, and contact support if it keeps happening."
      action={
        <Button
          variant="brand"
          iconLeft={<RotateCcw />}
          onClick={() => {
            // Re-run the failed route's loaders, then clear the boundary.
            router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
      }
    />
  );
}

/**
 * Global 404 boundary wired into the router as `defaultNotFoundComponent`.
 * Renders when navigation lands on a path with no matching route.
 */
export function GlobalNotFound() {
  return (
    <ErrorScreen
      title="We couldn't find that page."
      description="The page you're looking for doesn't exist or may have moved. Let's get you back on track."
      action={
        <Link to="/">
          <Button variant="brand" iconLeft={<Home />}>
            Go home
          </Button>
        </Link>
      }
    />
  );
}
