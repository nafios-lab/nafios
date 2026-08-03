import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// The wizard renders the Profile step (which drives the REAL saveProfile via the
// tests/setup.ts spies) and switches to the Family step on advance. The Family
// step's useCompleteOnboarding reads useQueryClient(), so every render needs the
// query wrapper. We steer the Profile-save outcome through the auth spies.
import { OnboardingWizard } from "../../src/features/onboarding/components/onboarding-wizard.tsx";
import { createWrapper } from "../query-wrapper.tsx";
import { resetOnboardingMocks, updateUserMetadata } from "../setup.ts";

beforeEach(resetOnboardingMocks);
afterEach(cleanup);

describe("OnboardingWizard", () => {
  test("opens on the Profile step with both step labels in the stepper", () => {
    render(<OnboardingWizard />, { wrapper: createWrapper() });
    expect(screen.getByText("Set up your profile")).toBeDefined();
    expect(screen.getByText("Profile")).toBeDefined();
    expect(screen.getByText("Family")).toBeDefined();
    expect(screen.queryByText("Review")).toBeNull();
  });

  test("Skip advances to the Family step without writing anything", async () => {
    render(<OnboardingWizard />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));

    await waitFor(() => {
      expect(screen.getByText("Add your Family")).toBeDefined();
    });
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("clicking a completed step in the stepper navigates back to it", async () => {
    render(<OnboardingWizard />, { wrapper: createWrapper() });

    // Advance to Family so Profile becomes a completed (clickable) step.
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    await waitFor(() => {
      expect(screen.getByText("Add your Family")).toBeDefined();
    });

    // Click the Profile circle (index 0 < activeStep 1) → goTo(0).
    fireEvent.click(screen.getByRole("button", { name: "Step 1: Profile" }));
    await waitFor(() => {
      expect(screen.getByText("Set up your profile")).toBeDefined();
    });
  });

  test("Save with empty (valid) fields persists and advances to Family", async () => {
    render(<OnboardingWizard />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => {
      expect(screen.getByText("Add your Family")).toBeDefined();
    });
  });

  test("Save with a typed mobile writes it to user_metadata and advances", async () => {
    render(<OnboardingWizard />, { wrapper: createWrapper() });

    // MaskInput fires onValueChange off a capture-phase "input" event (it
    // swallows React's onChange), so drive it the way @nafios/ui's own test does.
    const phone = screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
    phone.value = "(+65) 9123 4567";
    fireEvent.input(phone);

    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => {
      expect(screen.getByText("Add your Family")).toBeDefined();
    });
    expect(updateUserMetadata).toHaveBeenCalledWith(
      { __authClient: true },
      { mobile: "(+65) 9123 4567" },
    );
  });

  test("a save fault holds the user on Profile with an error alert", async () => {
    // The mobile write fails → saveProfile throws → the hook surfaces a generic error.
    updateUserMetadata.mockResolvedValue({ error: { message: "boom" } });
    render(<OnboardingWizard />, { wrapper: createWrapper() });

    const phone = screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
    phone.value = "(+65) 9123 4567";
    fireEvent.input(phone);

    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Couldn't save your profile");
    });
    expect(screen.getByText("Set up your profile")).toBeDefined();
  });

  test("hydrates the phone field from server-provided initialData", () => {
    render(<OnboardingWizard initialData={{ profile: { phone: "(+65) 9123 4567" } }} />, {
      wrapper: createWrapper(),
    });

    const phone = screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
    expect(phone.value).toContain("9123");
  });
});
