import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  OnboardingWizardProvider,
  useOnboardingWizard,
} from "../../src/features/onboarding/context/onboarding-wizard-provider.tsx";

function wrapper({ children }: { children: ReactNode }) {
  return <OnboardingWizardProvider>{children}</OnboardingWizardProvider>;
}

describe("useOnboardingWizard / OnboardingWizardProvider", () => {
  test("throws when used outside the provider", () => {
    expect(() => renderHook(() => useOnboardingWizard())).toThrow(
      "useOnboardingWizard must be used within <OnboardingWizardProvider>",
    );
  });

  test("next() advances and clamps at the last step", () => {
    const { result } = renderHook(() => useOnboardingWizard(), { wrapper });

    expect(result.current.activeStep).toBe(0);
    act(() => result.current.next());
    expect(result.current.activeStep).toBe(1);
    act(() => result.current.next()); // already last (Family) → clamps
    expect(result.current.activeStep).toBe(1);
  });

  test("back() retreats and clamps at the first step", () => {
    const { result } = renderHook(() => useOnboardingWizard(), { wrapper });

    act(() => result.current.goTo(1));
    expect(result.current.activeStep).toBe(1);
    act(() => result.current.back());
    expect(result.current.activeStep).toBe(0);
    act(() => result.current.back()); // already first → clamps
    expect(result.current.activeStep).toBe(0);
  });

  test("setData / getData round-trips a step's values", () => {
    const { result } = renderHook(() => useOnboardingWizard(), { wrapper });

    expect(result.current.getData("profile")).toBeUndefined();
    act(() => result.current.setData("profile", { phone: "(+65) 9123 4567" }));
    expect(result.current.getData("profile")).toEqual({ phone: "(+65) 9123 4567" });
  });

  test("seeds wizard state from server-provided initialData", () => {
    const seeded = ({ children }: { children: ReactNode }) => (
      <OnboardingWizardProvider initialData={{ profile: { phone: "(+65) 9000 0000" } }}>
        {children}
      </OnboardingWizardProvider>
    );
    const { result } = renderHook(() => useOnboardingWizard(), { wrapper: seeded });

    expect(result.current.getData("profile")).toEqual({ phone: "(+65) 9000 0000" });
  });
});
