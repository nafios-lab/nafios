import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// Renders the Profile step directly inside the real wizard provider. It drives
// the REAL saveProfile via the tests/setup.ts spies; useOnboardingProfile does
// NOT read useQueryClient(), so no query wrapper is needed. We steer the
// mobile-write outcome through `updateUserMetadata`.
import { OnboardStepProfile } from "../../src/features/onboarding/components/onboard-step-profile.tsx";
import { OnboardingWizardProvider } from "../../src/features/onboarding/context/onboarding-wizard-provider.tsx";
import { resetOnboardingMocks, updateUserMetadata } from "../setup.ts";

beforeEach(resetOnboardingMocks);
afterEach(cleanup);

function renderStep() {
  return render(
    <OnboardingWizardProvider>
      <OnboardStepProfile />
    </OnboardingWizardProvider>,
  );
}

describe("OnboardStepProfile", () => {
  test("renders the header and both actions", () => {
    renderStep();
    expect(screen.getByText("Set up your profile")).toBeDefined();
    expect(screen.getByRole("button", { name: /Skip for now/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Save and continue/ })).toBeDefined();
  });

  test("Skip advances without writing anything", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("typing a mobile and Save writes it to user_metadata", async () => {
    renderStep();

    const phone = screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
    phone.value = "(+65) 9123 4567";
    fireEvent.input(phone);

    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => {
      expect(updateUserMetadata).toHaveBeenCalledWith(
        { __authClient: true },
        { mobile: "(+65) 9123 4567" },
      );
    });
  });

  test("a save fault surfaces the error alert", async () => {
    updateUserMetadata.mockResolvedValue({ error: { message: "boom" } });
    renderStep();

    const phone = screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
    phone.value = "(+65) 9123 4567";
    fireEvent.input(phone);

    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Couldn't save your profile");
    });
  });
});
