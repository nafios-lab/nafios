/** @deprecated */

import { createContext, useCallback, useMemo, useState } from "react";
import type { SignupWizardData } from "../schemas/signup-schema";

export const SIGNUP_STEPS = [
  { label: "Account" },
  { label: "Security" },
  { label: "Family" },
  { label: "Review" },
] as const;

export type StepIndex = 0 | 1 | 2 | 3;

export interface SignupWizardContextValue {
  /** Zero-based active step. */
  activeStep: StepIndex;
  /** Accumulated form data from completed steps. */
  data: Partial<SignupWizardData>;
  /** Advance to the next step, saving current step's data. */
  next: () => void;
  /** Go back one step. */
  back: () => void;
  /** Jump to a specific completed step (for review editing). */
  goTo: (step: StepIndex) => void;
  /** Save a step's data into the wizard state. */
  setStepData: <K extends keyof SignupWizardData>(key: K, values: SignupWizardData[K]) => void;
  /** Whether the wizard is submitting the final data. */
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
}

export const SignupWizardContext = createContext<SignupWizardContextValue | null>(null);

const DEFAULT_DATA: Partial<SignupWizardData> = {};

export function SignupWizardProvider({ children }: { children: React.ReactNode }) {
  const [activeStep, setActiveStep] = useState<StepIndex>(0);
  const [data, setData] = useState<Partial<SignupWizardData>>(DEFAULT_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const next = useCallback(() => {
    setActiveStep((s) => Math.min(s + 1, 3) as StepIndex);
  }, []);

  const back = useCallback(() => {
    setActiveStep((s) => Math.max(s - 1, 0) as StepIndex);
  }, []);

  const goTo = useCallback((step: StepIndex) => {
    setActiveStep(step);
  }, []);

  const setStepData = useCallback(
    <K extends keyof SignupWizardData>(key: K, values: SignupWizardData[K]) => {
      setData((prev) => ({ ...prev, [key]: values }));
    },
    [],
  );

  const value = useMemo<SignupWizardContextValue>(
    () => ({
      activeStep,
      data,
      next,
      back,
      goTo,
      setStepData,
      isSubmitting,
      setIsSubmitting,
    }),
    [activeStep, data, next, back, goTo, setStepData, isSubmitting],
  );

  return <SignupWizardContext.Provider value={value}>{children}</SignupWizardContext.Provider>;
}
