import { Logo } from "@nafios/ui/components/logo";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingWizard } from "~/features/onboarding/components/onboarding-wizard";
import {
  getOnboardingProfile,
  onboardingStatusQueryOptions,
} from "~/features/onboarding/lib/onboarding-data";

export const Route = createFileRoute("/_protected/onboarding")({
  // Already finished? The wizard has nothing to do — send them to the app. The
  // status query is cached (shared with the /welcome gate and the index redirect).
  beforeLoad: async ({ context }) => {
    const completed = await context.queryClient.ensureQueryData(
      onboardingStatusQueryOptions(context.session.user.id),
    );
    if (completed) throw redirect({ to: "/welcome" });
  },
  // Hydrate the wizard from already-saved data so a reload mid-onboarding does
  // not present an empty Profile form (mobile lives in user_metadata, avatar is
  // a private-bucket object path signed for display). Client-side (no SSR):
  // TanStack awaits the loader before mounting the component, so there is no
  // empty-then-fill flash.
  loader: async () => {
    const profile = await getOnboardingProfile();
    return { profile: { avatar: profile.avatar ?? undefined, phone: profile.phone } };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { profile } = Route.useLoaderData();

  return (
    <div className="flex h-screen w-full flex-col gap-0">
      <div id="page-header" className="flex h-17.5 w-full flex-row items-center justify-start px-6">
        <Logo variant="word" />
      </div>

      <div id="form-container" className="flex h-full flex-col items-center justify-center">
        <OnboardingWizard initialData={{ profile }} />
      </div>
    </div>
  );
}
