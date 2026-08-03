import { Logo } from "@nafios/ui/components/logo";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignOutButton } from "~/features/auth/components/sign-out-button";
import { onboardingStatusQueryOptions } from "~/features/onboarding/lib/onboarding-data";

export const Route = createFileRoute("/_protected/welcome")({
  // The onboarding-completion gate: a signed-in-but-unfinished user is bounced
  // to the wizard. The status query is cached (shared with the /onboarding gate
  // and the index redirect); Finish clears it (resetOnboardingStatus) so a
  // just-completed user reads `true` here and is not bounced back.
  beforeLoad: async ({ context }) => {
    const completed = await context.queryClient.ensureQueryData(
      onboardingStatusQueryOptions(context.session.user.id),
    );
    if (!completed) throw redirect({ to: "/onboarding" });
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo variant="word" />
      <Heading>Welcome to NafiOS</Heading>
      <Text muted>{session.user.email}</Text>
      <SignOutButton />
    </main>
  );
}
