/** @deprecated */

import { Stepper } from "@nafios/ui/components/ui/stepper";
import { SIGNUP_STEPS, SignupWizardProvider } from "../context/signup-wizard";
import { useSignupWizard } from "../hooks/use-signup-wizard";
import { SignupStepAccount } from "./signup-step-account";
import { SignupStepFamily } from "./signup-step-family";
import { SignupStepReview } from "./signup-step-review";
import { SignupStepSecurity } from "./signup-step-security";

const STEP_COMPONENTS = [
  SignupStepAccount,
  SignupStepSecurity,
  SignupStepFamily,
  SignupStepReview,
] as const;

function SignupWizardContent() {
  const { activeStep, goTo } = useSignupWizard();
  const StepComponent = STEP_COMPONENTS[activeStep];

  return (
    <div className="flex flex-col gap-8 min-w-[400px] max-w-[480px] w-full">
      <Stepper
        steps={[...SIGNUP_STEPS]}
        activeStep={activeStep}
        onStepClick={(index) => {
          // Only allow clicking on completed steps
          if (index < activeStep) {
            goTo(index as 0 | 1 | 2 | 3);
          }
        }}
        size="sm"
      />
      <StepComponent />
    </div>
  );
}

export function SignupWizard() {
  return (
    <SignupWizardProvider>
      <SignupWizardContent />
    </SignupWizardProvider>
  );
}
