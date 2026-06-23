import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { OnboardingWizardData } from "~/features/onboarding/schemas/onboarding-schema";

export const ONBOARDING_STEPS = [
  { label: "Profile" },
  { label: "Family" },
  { label: "Review" },
] as const;

export type StepIndex = 0 | 1 | 2;

const DEFAULT_ONBOARDING_DATA: Partial<OnboardingWizardData> = {};

export interface OnboardingWizardContextValue {
  /** Zero-based active step */
  activeStep: StepIndex;
  /** Adanced to the next step */
  next: () => void;
  /** Jump back to specific completed step or simply back */
  back: () => void;
  /** Jump to a specific completed step (for review editing). */
  goTo: (step: StepIndex) => void;
  setData: <K extends keyof OnboardingWizardData>(
    key: K,
    values: OnboardingWizardData[K],
  ) => void;
  getData: <K extends keyof OnboardingWizardData>(
    key: K,
  ) => OnboardingWizardData[K] | undefined;
}

export const OnboardingWizardContext =
  createContext<OnboardingWizardContextValue | null>(null);

export interface OnboardingWizardProviderProps {
  children: React.ReactNode;
  /**
   * Server-hydrated starting data (e.g. a previously-saved Profile step read back
   * on reload). Seeds the wizard so a refresh mid-onboarding does not present an
   * empty form for data that is already persisted. Defaults to empty.
   */
  initialData?: Partial<OnboardingWizardData>;
}

export function OnboardingWizardProvider({
  children,
  initialData = DEFAULT_ONBOARDING_DATA,
}: OnboardingWizardProviderProps) {
  const [onboardingData, setOnboardingData] =
    useState<Partial<OnboardingWizardData>>(initialData);

  const [activeStep, setActiveStep] = useState<StepIndex>(0);

  const next = useCallback(() => {
    // Three steps → valid indices are 0..2; never advance past the last.
    setActiveStep(
      (s) => Math.min(s + 1, ONBOARDING_STEPS.length - 1) as StepIndex,
    );
  }, []);

  const back = useCallback(() => {
    setActiveStep((s) => Math.max(s - 1, 0) as StepIndex);
  }, []);

  const goTo = useCallback((step: StepIndex) => {
    setActiveStep(step);
  }, []);

  const setData = useCallback(
    <K extends keyof OnboardingWizardData>(
      key: K,
      values: OnboardingWizardData[K],
    ) => {
      setOnboardingData((prev) => ({ ...prev, [key]: values }));
    },
    [],
  );

  const getData = useCallback(
    <K extends keyof OnboardingWizardData>(key: K) => {
      return onboardingData[key];
    },
    [onboardingData],
  );

  const values = useMemo<OnboardingWizardContextValue>(
    () => ({
      activeStep,
      next,
      back,
      goTo,
      setData,
      getData,
    }),
    [activeStep, next, back, goTo, setData, getData],
  );

  return (
    <OnboardingWizardContext.Provider value={values}>
      {children}
    </OnboardingWizardContext.Provider>
  );
}

/**
 * Small helper hooks to expose the `OnboardingWizardContext`
 * @returns
 */
export function useOnboardingWizard() {
  const ctx = useContext(OnboardingWizardContext);
  if (!ctx) {
    throw new Error(
      "useSignupWizard must be used within <OnboardingWizardProvider>",
    );
  }
  return ctx;
}
