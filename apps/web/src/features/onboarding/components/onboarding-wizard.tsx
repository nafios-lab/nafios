import { Stepper } from "@nafios/ui/components/ui/stepper";
import type { OnboardingWizardData } from "~/features/auth/schemas/onboarding-schema";
import {
  ONBOARDING_STEPS,
  OnboardingWizardProvider,
  useOnboardingWizard,
} from "../context/onboarding-wizard-provider";
import { OnboardStepFamily } from "./onboard-step-family";
import { OnboardStepProfile } from "./onboard-step-profile";
import { OnboardStepReview } from "./onboard-step-review";

const STEP_COMPONENTS = [OnboardStepProfile, OnboardStepFamily, OnboardStepReview] as const;

function OnboardingWizardContent() {
  const { activeStep, goTo } = useOnboardingWizard();
  const StepComponent = STEP_COMPONENTS[activeStep];

  return (
    <div className="flex flex-col gap-8 min-w-[400px] max-w-[480px] w-full">
      <Stepper
        steps={[...ONBOARDING_STEPS]}
        activeStep={activeStep}
        onStepClick={(index) => {
          if (index < activeStep) {
            goTo(index as 0 | 1 | 2);
          }
        }}
        size="sm"
      />
      <StepComponent />
    </div>
  );
}

export interface OnboardingWizardProps {
  /** Server-hydrated starting data (saved Profile read back on reload). */
  initialData?: Partial<OnboardingWizardData>;
}

export function OnboardingWizard({ initialData }: OnboardingWizardProps) {
  return (
    <OnboardingWizardProvider initialData={initialData}>
      <OnboardingWizardContent />
    </OnboardingWizardProvider>
  );
}
