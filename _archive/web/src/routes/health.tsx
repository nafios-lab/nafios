import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/health")({
  component: Health,
});

function Health() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Health Check</h1>
      <p className="text-green-600 text-lg font-semibold">OK</p>
    </main>
  );
}
