import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FamilyMemberForm } from "../../src/features/onboarding/components/family-member-form.tsx";
import type { FamilyListEntry } from "../../src/features/onboarding/lib/family-helpers.ts";

afterEach(cleanup);

function form(): HTMLFormElement {
  return document.querySelector("form") as HTMLFormElement;
}
function nameInput(): HTMLInputElement {
  return screen.getByLabelText("Name") as HTMLInputElement;
}
function selectRelationship(label: string): void {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: label }));
}

describe("FamilyMemberForm — rendering", () => {
  test("shows the add title and an 'Add member' submit", () => {
    render(<FamilyMemberForm onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("Add family member")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add member" })).toBeDefined();
  });

  test("seeds the edit title, fields, and a 'Save changes' submit", () => {
    const initialValue: FamilyListEntry = {
      clientKey: "k1",
      name: "Aisha Rahman",
      relationship: "spouse",
      nric: "S1234567A",
      dateOfBirth: "1990-12-25",
    };
    render(
      <FamilyMemberForm initialValue={initialValue} onSubmit={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByText("Edit family member")).toBeDefined();
    expect(nameInput().value).toBe("Aisha Rahman");
    expect((screen.getByLabelText("NRIC") as HTMLInputElement).value).toBe("S1234567A");
    expect((screen.getByLabelText("Date of birth") as HTMLInputElement).value).toContain("1990");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDefined();
  });
});

describe("FamilyMemberForm — submit gating", () => {
  test("the submit button is disabled until name and relationship are set", async () => {
    render(<FamilyMemberForm onSubmit={() => {}} onCancel={() => {}} />);
    const submit = screen.getByRole("button", { name: "Add member" }) as HTMLButtonElement;

    expect(submit.disabled).toBe(true);

    fireEvent.change(nameInput(), { target: { value: "Aisha Rahman" } });
    expect(submit.disabled).toBe(true); // relationship still empty

    selectRelationship("Spouse");
    await waitFor(() => {
      expect(submit.disabled).toBe(false);
    });
  });

  test("errors stay quiet until the first submit, then clear in real time", async () => {
    const onSubmit = mock(() => {});
    render(<FamilyMemberForm onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.queryByText("Name is required")).toBeNull();

    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeDefined();
      expect(screen.getByText("Relationship is required")).toBeDefined();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(nameInput(), { target: { value: "Aisha Rahman" } });
    await waitFor(() => {
      expect(screen.queryByText("Name is required")).toBeNull();
    });
  });
});

describe("FamilyMemberForm — submission", () => {
  test("emits a cleaned, spec-shaped member (NRIC uppercased, empty optionals dropped)", async () => {
    const onSubmit = mock((_member: unknown) => {});
    render(<FamilyMemberForm onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.change(nameInput(), { target: { value: "Aisha Rahman" } });
    selectRelationship("Spouse");
    fireEvent.change(screen.getByLabelText("NRIC"), { target: { value: "s1234567a" } });

    fireEvent.submit(form());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Aisha Rahman",
        relationship: "spouse",
        avatar: undefined,
        nric: "S1234567A",
        mobileNo: undefined,
        dateOfBirth: undefined,
      });
    });
  });

  test("passes through a formatted mobile and converts the DOB to ISO", async () => {
    const onSubmit = mock((_member: unknown) => {});
    render(<FamilyMemberForm onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.change(nameInput(), { target: { value: "Bob Tan" } });
    selectRelationship("Child");

    const mobile = screen.getByLabelText("Mobile") as HTMLInputElement;
    mobile.value = "(+65) 9123 4567";
    fireEvent.input(mobile);

    const dob = screen.getByLabelText("Date of birth") as HTMLInputElement;
    dob.value = "25 / 12 / 1990";
    fireEvent.input(dob);

    fireEvent.submit(form());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Bob Tan",
        relationship: "child",
        avatar: undefined,
        nric: undefined,
        mobileNo: "(+65) 9123 4567",
        dateOfBirth: "1990-12-25",
      });
    });
  });

  test("does not submit a malformed mobile", async () => {
    const onSubmit = mock(() => {});
    render(<FamilyMemberForm onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.change(nameInput(), { target: { value: "Bob Tan" } });
    selectRelationship("Child");

    const mobile = screen.getByLabelText("Mobile") as HTMLInputElement;
    mobile.value = "999";
    fireEvent.input(mobile);

    fireEvent.submit(form());

    await waitFor(() => {
      expect(screen.getByText("Invalid Singapore mobile number")).toBeDefined();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("Cancel calls onCancel without submitting", () => {
    const onCancel = mock(() => {});
    const onSubmit = mock(() => {});
    render(<FamilyMemberForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
