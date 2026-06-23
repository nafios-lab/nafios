import { Logo } from "@nafios/ui/components/logo";
import { createFileRoute } from "@tanstack/react-router";
import { OnboardingWizard } from "~/features/onboarding/components/onboarding-wizard";
import { getOnboardingProfileFn } from "~/lib/onboarding-fns";

export const Route = createFileRoute("/_protected/onboarding")({
  // Hydrate the wizard from already-saved data so a reload mid-onboarding does
  // not present an empty Profile form (mobile lives in user_metadata, avatar is
  // a private-bucket object path signed for display). Runs on SSR + navigation,
  // so the data is present at first paint — no empty-then-fill flash.
  loader: async () => {
    const profile = await getOnboardingProfileFn();
    return { profile: { avatar: profile.avatar ?? undefined, phone: profile.phone } };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { profile } = Route.useLoaderData();

  return (
    <div className="flex h-screen w-full flex-col gap-0">
      <div
        id="page-header"
        className="flex h-[70px] w-full flex-row items-center justify-start px-6"
      >
        <Logo variant="word" />
      </div>

      <div id="form-container" className="flex h-full flex-col items-center justify-center">
        <OnboardingWizard initialData={{ profile }} />
        <div className="flex flex-row items-center gap-2 justify-center mt-8"></div>
      </div>
    </div>
  );
}
