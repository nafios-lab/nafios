import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// The wizard renders the Profile step (which drives the REAL
// saveOnboardingProfileFn via the tests/setup.ts spies) and switches to the
// Family step on advance. We steer the save outcome through `getSession`.
import { OnboardStepReview } from "../../src/features/onboarding/components/onboard-step-review.tsx";
import { OnboardingWizard } from "../../src/features/onboarding/components/onboarding-wizard.tsx";
import { getSession, resetServerFnMocks, updateUserMetadata } from "../setup.ts";

function withSession(): void {
  getSession.mockResolvedValue({ error: null, data: { session: { user: { id: "u1" } } } });
}

beforeEach(resetServerFnMocks);
afterEach(cleanup);

describe("OnboardingWizard", () => {
  test("opens on the Profile step with every step label in the stepper", () => {
    render(<OnboardingWizard />);
    expect(screen.getByText("Set up your profile")).toBeDefined();
    expect(screen.getByText("Profile")).toBeDefined();
    expect(screen.getByText("Family")).toBeDefined();
    expect(screen.getByText("Review")).toBeDefined();
  });

  test("Skip advances to the Family step without writing anything", async () => {
    render(<OnboardingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));

    await waitFor(() => {
      expect(screen.getByText("Add your Family")).toBeDefined();
    });
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  test("clicking a completed step in the stepper navigates back to it", async () => {
    render(<OnboardingWizard />);

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
    withSession();
    render(<OnboardingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => {
      expect(screen.getByText("Add your Family")).toBeDefined();
    });
  });

  test("Save with a typed mobile writes it to user_metadata and advances", async () => {
    withSession();
    render(<OnboardingWizard />);

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
    // getSession default = no session → saveOnboardingProfileFn returns no_session.
    render(<OnboardingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Couldn't save your profile");
    });
    expect(screen.getByText("Set up your profile")).toBeDefined();
  });

  test("hydrates the phone field from server-provided initialData", () => {
    render(<OnboardingWizard initialData={{ profile: { phone: "(+65) 9123 4567" } }} />);

    const phone = screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
    expect(phone.value).toContain("9123");
  });
});

describe("Onboarding step stubs", () => {
  test("the Review stub renders its placeholder", () => {
    render(<OnboardStepReview />);
    expect(screen.getByText("OnboardingStep Review")).toBeDefined();
  });
});
