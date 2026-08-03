import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { createFileRoute } from "@tanstack/react-router";
import { SignOutButton } from "~/features/auth/components/sign-out-button";

/**
 * Phase 7 placeholder — the first protected landing, here to prove the session
 * gate and the sign-out loop end-to-end. Phase 8 replaces it with the real
 * shell (navbar, onboarding gate, mounted modules).
 */
export const Route = createFileRoute("/_protected/home")({
  component: HomePage,
});

function HomePage() {
  const { session } = Route.useRouteContext();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Heading>You're signed in.</Heading>
      <Text muted>{session.user.email}</Text>
      <SignOutButton />
    </main>
  );
}
