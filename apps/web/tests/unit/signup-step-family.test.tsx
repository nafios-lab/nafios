import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { SignupStepFamily } from "../../src/features/auth/components/signup-step-family.tsx";
import { SignupWizardProvider } from "../../src/features/auth/context/signup-wizard.tsx";
import { useSignupWizard } from "../../src/features/auth/hooks/use-signup-wizard.ts";
import type { FamilyMemberValues } from "../../src/features/auth/schemas/signup-schema.ts";

afterEach(cleanup);

// We drive the REAL FamilyMemberForm rather than mocking it: bun's `mock.module`
// is process-global and would leak the stub into family-member-form's own test
// file when the suite runs together. Most branches are reached by seeding the
// wizard with members (no form interaction needed); the add path opens the real
// form once and selects a relationship through the Radix dropdown.

// Seeds family data, then mounts the step only after the seed lands so the step's
// `useState(data.family?.familyMembers ?? [])` initialiser reads the members.
// Also surfaces wizard state for navigation assertions.
function Harness({ members }: { members: FamilyMemberValues[] }) {
  const { data, setStepData, activeStep } = useSignupWizard();
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot seed
  useEffect(() => {
    setStepData("family", { familyMembers: members });
  }, []);
  return (
    <div>
      <span data-testid="active">{activeStep}</span>
      <span data-testid="data">{JSON.stringify(data)}</span>
      {data.family ? <SignupStepFamily /> : null}
    </div>
  );
}

async function renderWithMembers(members: FamilyMemberValues[] = []) {
  await act(async () => {
    render(
      <SignupWizardProvider>
        <Harness members={members} />
      </SignupWizardProvider>,
    );
  });
}

const active = () => screen.getByTestId("active").textContent;
const wizardData = () => JSON.parse(screen.getByTestId("data").textContent ?? "{}");

const pencilButtons = () =>
  screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-pencil"));
const trashButtons = () =>
  screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-trash2"));

describe("SignupStepFamily — empty state", () => {
  test("shows the empty placeholder and a Skip-for-now navigation", async () => {
    await renderWithMembers([]);
    expect(screen.getByText("No family members yet")).toBeDefined();
    expect(screen.getByText("Add up to 10 people to manage them")).toBeDefined();
    expect(screen.getByRole("button", { name: /Add family member/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Skip for now/ })).toBeDefined();
    // No form is open initially.
    expect(screen.queryByText("Date of birth (optional)")).toBeNull();
  });
});

describe("SignupStepFamily — list rendering", () => {
  test("renders a card per member with masked NRIC, label, and two-letter initials", async () => {
    await renderWithMembers([
      { name: "Jane Doe", relationship: "spouse", nric: "S1234567A", avatar: "data:img,x" },
    ]);
    expect(screen.getByText("Jane Doe")).toBeDefined();
    expect(screen.getByText("SPOUSE")).toBeDefined();
    // maskNric keeps the first 5 chars then masks the rest: S1234567A → S1234****
    expect(screen.getByText("S1234****")).toBeDefined();
    // getInitials → first + last initial, surfaced via AvatarFallback.
    expect(screen.getByText("JD")).toBeDefined();
    // The Add button switches to its has-members copy and Continue appears.
    expect(screen.getByRole("button", { name: /Add a family member/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDefined();
  });

  test("single-name member shows a one-letter initial and omits the NRIC chip", async () => {
    await renderWithMembers([{ name: "Bobby", relationship: "child" }]);
    expect(screen.getByText("Bobby")).toBeDefined();
    expect(screen.getByText("CHILD")).toBeDefined();
    expect(screen.getByText("B")).toBeDefined();
    // No NRIC → no masked value present.
    expect(screen.queryByText(/\*/)).toBeNull();
  });

  test("short NRIC values are left unmasked", async () => {
    await renderWithMembers([{ name: "Kid", relationship: "child", nric: "S12" }]);
    // maskNric returns the raw value when length <= 5.
    expect(screen.getByText("S12")).toBeDefined();
  });

  test("falls back to the raw relationship value when unmapped", async () => {
    // @ts-expect-error — exercising the `?? member.relationship` label fallback.
    await renderWithMembers([{ name: "Pat", relationship: "guardian" }]);
    expect(screen.getByText("guardian")).toBeDefined();
  });
});

describe("SignupStepFamily — add member flow", () => {
  test("opens the add form, fills it, and renders the new member", async () => {
    // The Radix Select emits many act() warnings as it animates; silence console
    // so the volume doesn't dominate the run while we drive the real picker once.
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      await renderWithMembers([]);
      fireEvent.click(screen.getByRole("button", { name: /Add family member/ }));

      // Add mode shows the default title (edit mode would say "Edit family member").
      expect(screen.getByText("Add family member")).toBeDefined();
      fireEvent.change(screen.getByPlaceholderText("Username"), {
        target: { value: "New Person" },
      });

      // Drive the relationship dropdown so the submit button enables.
      await act(async () => {
        fireEvent.click(screen.getByText("Relationship..."));
        await new Promise((r) => setTimeout(r, 20));
      });
      const options = screen.getAllByText("Child");
      await act(async () => {
        fireEvent.click(options[options.length - 1]);
        await new Promise((r) => setTimeout(r, 20));
      });

      fireEvent.click(screen.getByRole("button", { name: "Add member" }));
      await waitFor(
        () => {
          if (screen.queryByText("Add family member")) throw new Error("add form still open");
        },
        { timeout: 3000 },
      );

      expect(screen.getByText("New Person")).toBeDefined();
      expect(screen.getByText("CHILD")).toBeDefined();
    } finally {
      errorSpy.mockRestore();
    }
  }, 15000);

  test("cancelling the add form returns to the list without adding", async () => {
    await renderWithMembers([]);
    fireEvent.click(screen.getByRole("button", { name: /Add family member/ }));
    // The form's date field is unique to the open form (not the closed list).
    expect(screen.getByPlaceholderText("Date of birth (optional)")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("Date of birth (optional)")).toBeNull();
    expect(screen.getByText("No family members yet")).toBeDefined();
  });
});

describe("SignupStepFamily — edit & remove", () => {
  const seed: FamilyMemberValues[] = [
    { name: "Jane Doe", relationship: "spouse", nric: "S1234567A" },
    { name: "Bobby", relationship: "child" },
  ];

  test("editing a member opens a prefilled edit form and saves the change", async () => {
    await renderWithMembers(seed);
    fireEvent.click(pencilButtons()[0]);

    // Edit mode: distinct title, prefilled name, and Save changes label.
    expect(screen.getByText("Edit family member")).toBeDefined();
    const nameInput = screen.getByPlaceholderText("Username") as HTMLInputElement;
    expect(nameInput.value).toBe("Jane Doe");

    fireEvent.change(nameInput, { target: { value: "Jane Smith" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await Promise.resolve();
    });
    await waitFor(
      () => {
        if (screen.queryByText("Edit family member")) throw new Error("edit form still open");
      },
      { timeout: 3000 },
    );
    expect(screen.getByText("Jane Smith")).toBeDefined();
    expect(screen.getByText("Bobby")).toBeDefined();
  }, 10000);

  test("editing only mutates the targeted index", async () => {
    await renderWithMembers(seed);
    fireEvent.click(pencilButtons()[1]); // edit Bobby
    const nameInput = screen.getByPlaceholderText("Username") as HTMLInputElement;
    expect(nameInput.value).toBe("Bobby");
    fireEvent.change(nameInput, { target: { value: "Bobby Jr" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await Promise.resolve();
    });
    await waitFor(
      () => {
        if (screen.queryByText("Edit family member")) throw new Error("edit form still open");
      },
      { timeout: 3000 },
    );
    expect(screen.getByText("Bobby Jr")).toBeDefined();
    expect(screen.getByText("Jane Doe")).toBeDefined();
  }, 10000);

  test("cancelling an edit leaves the member unchanged", async () => {
    await renderWithMembers(seed);
    fireEvent.click(pencilButtons()[0]);
    expect(screen.getByText("Edit family member")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Edit family member")).toBeNull();
    expect(screen.getByText("Jane Doe")).toBeDefined();
  });

  test("removing a member drops it from the list", async () => {
    await renderWithMembers(seed);
    expect(trashButtons().length).toBe(2);
    fireEvent.click(trashButtons()[0]);
    expect(screen.queryByText("Jane Doe")).toBeNull();
    expect(screen.getByText("Bobby")).toBeDefined();
  });
});

describe("SignupStepFamily — navigation", () => {
  test("Continue persists members and advances one step", async () => {
    const seed: FamilyMemberValues[] = [{ name: "Jane Doe", relationship: "spouse" }];
    await renderWithMembers(seed);
    // The provider starts on step 0, so next() advances 0 → 1.
    expect(active()).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(active()).toBe("1");
    expect(wizardData().family).toEqual({ familyMembers: seed });
  });

  test("Skip for now persists the empty list and still advances", async () => {
    await renderWithMembers([]);
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    expect(active()).toBe("1");
    expect(wizardData().family).toEqual({ familyMembers: [] });
  });

  test("Back persists members and clamps at the first step", async () => {
    const seed: FamilyMemberValues[] = [{ name: "Jane Doe", relationship: "spouse" }];
    await renderWithMembers(seed);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    // Already on step 0 → back() clamps at 0, but still persists the members.
    expect(active()).toBe("0");
    expect(wizardData().family).toEqual({ familyMembers: seed });
  });
});
