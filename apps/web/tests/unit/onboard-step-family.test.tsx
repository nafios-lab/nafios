import { afterEach, describe, expect, test } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { OnboardStepFamily } from "../../src/features/onboarding/components/onboard-step-family.tsx";
import { OnboardingWizard } from "../../src/features/onboarding/components/onboarding-wizard.tsx";
import { OnboardingWizardProvider } from "../../src/features/onboarding/context/onboarding-wizard-provider.tsx";
import type { FamilyMemberValues } from "../../src/features/onboarding/schemas/onboarding-schema.ts";
import {
  from,
  getSession,
  insertUserProfile,
  navigate,
  resetServerFnMocks,
} from "../setup.ts";

/** Steer the completion write to succeed by giving it a session. */
function withSession(): void {
  getSession.mockResolvedValue({
    error: null,
    data: { session: { user: { id: "u1" } } },
  });
}

afterEach(cleanup);

/** Render the step inside the real wizard provider, optionally seeded. */
function renderStep(familyMembers?: FamilyMemberValues[]) {
  return render(
    <OnboardingWizardProvider
      initialData={familyMembers ? { family: { familyMembers } } : undefined}
    >
      <OnboardStepFamily />
    </OnboardingWizardProvider>,
  );
}

function openAddForm(): void {
  fireEvent.click(screen.getByRole("button", { name: "Add a family member" }));
}
function fillRequiredFields(name: string, relationshipLabel: string): void {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: relationshipLabel }));
}

describe("OnboardStepFamily — empty state", () => {
  test("renders the header, empty-state card, CTA and a Skip-for-now footer", () => {
    renderStep();
    expect(screen.getByText("Add your Family")).toBeDefined();
    expect(screen.getByText("No family members yet")).toBeDefined();
    expect(screen.getByText("Add up to 10 people to manage")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add a family member" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /Skip & finish/ })).toBeDefined();
  });
});

describe("OnboardStepFamily — add", () => {
  test("opening the form, filling it, and submitting appends the member", async () => {
    renderStep();
    openAddForm();

    expect(screen.getByText("Add family member")).toBeDefined();
    fillRequiredFields("Aisha Rahman", "Spouse");
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => {
      expect(screen.getByText("Aisha Rahman")).toBeDefined();
    });
    // Form closed, empty state replaced, footer flips to Finish setup.
    expect(screen.queryByText("Add family member")).toBeNull();
    expect(screen.queryByText("No family members yet")).toBeNull();
    expect(screen.getByRole("button", { name: /Finish setup/ })).toBeDefined();
  });

  test("the footer primary is disabled while the form is open", () => {
    renderStep();
    openAddForm();
    expect(
      (
        screen.getByRole("button", {
          name: /Skip & finish/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("Cancel closes the form and leaves the list untouched", () => {
    renderStep();
    openAddForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Add family member")).toBeNull();
    expect(screen.getByText("No family members yet")).toBeDefined();
  });
});

describe("OnboardStepFamily — seeded list", () => {
  test("restores members from wizard state with a Finish footer", () => {
    renderStep([
      { name: "Aisha Rahman", relationship: "spouse" },
      { name: "Omar Rahman", relationship: "child" },
    ]);
    expect(screen.getByText("Aisha Rahman")).toBeDefined();
    expect(screen.getByText("Omar Rahman")).toBeDefined();
    expect(screen.getByRole("button", { name: /Finish setup/ })).toBeDefined();
  });

  test("edits a member in place", async () => {
    renderStep([{ name: "Aisha Rahman", relationship: "spouse" }]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Aisha Rahman" }));
    expect(screen.getByText("Edit family member")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Aisha Khan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText("Aisha Khan")).toBeDefined();
    });
    expect(screen.queryByText("Aisha Rahman")).toBeNull();
  });

  test("hides the edited member's card while its form is open, keeping the rest", () => {
    renderStep([
      { name: "Aisha Rahman", relationship: "spouse" },
      { name: "Omar Rahman", relationship: "child" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Aisha Rahman" }));

    // The edited member's card is gone (its form stands in); the other stays.
    expect(screen.getByText("Edit family member")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Edit Aisha Rahman" }),
    ).toBeNull();
    expect(screen.getByText("Omar Rahman")).toBeDefined();

    // Cancelling restores the hidden card.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Edit Aisha Rahman" }),
    ).toBeDefined();
  });

  test("removes a member via the confirm dialog", async () => {
    renderStep([{ name: "Aisha Rahman", relationship: "spouse" }]);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Aisha Rahman" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Remove family member?")).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.getByText("No family members yet")).toBeDefined();
    });
  });

  test("hides the add CTA and shows a hint at the 10-member cap", () => {
    const tenMembers: FamilyMemberValues[] = Array.from(
      { length: 10 },
      (_, i) => ({
        name: `Member ${i}`,
        relationship: "child",
      }),
    );
    renderStep(tenMembers);

    expect(
      screen.queryByRole("button", { name: "Add a family member" }),
    ).toBeNull();
    expect(screen.getByText("You can add up to 10 people.")).toBeDefined();
    expect(screen.getByRole("button", { name: /Finish setup/ })).toBeDefined();
  });
});

describe("OnboardStepFamily — navigation (full wizard)", () => {
  async function skipToFamily() {
    render(<OnboardingWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    await waitFor(() => {
      expect(screen.getByText("Add your Family")).toBeDefined();
    });
  }

  test("Skip & finish completes onboarding and redirects to the dashboard", async () => {
    resetServerFnMocks();
    withSession();
    await skipToFamily();

    fireEvent.click(screen.getByRole("button", { name: /Skip & finish/ }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/welcome" });
    });
    // No members were added → completion writes an empty family list.
    expect(insertUserProfile).toHaveBeenCalledWith(
      { from },
      { familyMembers: [] },
    );
  });

  test("surfaces an error and stays on Family when completion is not retryable", async () => {
    resetServerFnMocks(); // default getSession = no session → completeOnboardingFn → no_session
    await skipToFamily();

    fireEvent.click(screen.getByRole("button", { name: /Skip & finish/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Couldn't finish setup",
      );
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText("Add your Family")).toBeDefined();
  });

  test("retries then surfaces an error when the completion write throws", async () => {
    resetServerFnMocks();
    getSession.mockRejectedValue(new Error("network down"));
    await skipToFamily();

    fireEvent.click(screen.getByRole("button", { name: /Skip & finish/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Couldn't finish setup",
      );
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  test("Back returns to the Profile step", async () => {
    resetServerFnMocks();
    await skipToFamily();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => {
      expect(screen.getByText("Set up your profile")).toBeDefined();
    });
  });
});
