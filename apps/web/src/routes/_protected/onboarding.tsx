import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/onboarding")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_protected/onboarding"!</div>;
}
