import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_app/app/")({
  component: AppPlaceholder,
});

function AppPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <h1 className="text-2xl font-bold tracking-tight">Modules</h1>
      <p className="text-muted-foreground">Domain modules will be mounted here.</p>
    </div>
  );
}
