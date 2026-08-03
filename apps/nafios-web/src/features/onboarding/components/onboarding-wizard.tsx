import { Stepper } from "@nafios/ui/components/ui/stepper";
import type { OnboardingWizardData } from "~/features/onboarding/schemas/onboarding-schema";
import {
  ONBOARDING_STEPS,
  OnboardingWizardProvider,
  useOnboardingWizard,
} from "../context/onboarding-wizard-provider";
import { OnboardStepFamily } from "./onboard-step-family";
import { OnboardStepProfile } from "./onboard-step-profile";

const STEP_COMPONENTS = [OnboardStepProfile, OnboardStepFamily] as const;

function OnboardingWizardContent() {
  const { activeStep, goTo } = useOnboardingWizard();
  const StepComponent = STEP_COMPONENTS[activeStep];

  return (
    <div className="flex w-full min-w-100 max-w-120 flex-col gap-8">
      <Stepper
        steps={[...ONBOARDING_STEPS]}
        activeStep={activeStep}
        onStepClick={(index) => {
          if (index < activeStep) {
            goTo(index as 0 | 1);
          }
        }}
        size="sm"
      />
      <StepComponent />
    </div>
  );
}

export interface OnboardingWizardProps {
  /** Hydrated starting data (saved Profile read back on reload). */
  initialData?: Partial<OnboardingWizardData>;
}

export function OnboardingWizard({ initialData }: OnboardingWizardProps) {
  return (
    <OnboardingWizardProvider initialData={initialData}>
      <OnboardingWizardContent />
    </OnboardingWizardProvider>
  );
}
