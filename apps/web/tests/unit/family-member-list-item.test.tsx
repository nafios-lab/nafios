import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FamilyMemberListItem } from "../../src/features/onboarding/components/family-member-list-item.tsx";
import type { FamilyListEntry } from "../../src/features/onboarding/lib/family-helpers.ts";

afterEach(cleanup);

function entry(overrides: Partial<FamilyListEntry> = {}): FamilyListEntry {
  return {
    clientKey: "k1",
    name: "Aisha Rahman",
    relationship: "spouse",
    ...overrides,
  };
}

describe("FamilyMemberListItem", () => {
  test("renders the name and relationship", () => {
    render(<FamilyMemberListItem member={entry()} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText("Aisha Rahman")).toBeDefined();
    expect(screen.getByText("spouse")).toBeDefined();
  });

  test("renders the name initials in the avatar fallback", () => {
    render(<FamilyMemberListItem member={entry()} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText("AR")).toBeDefined();
  });

  test("shows a masked NRIC when present", () => {
    render(
      <FamilyMemberListItem
        member={entry({ nric: "S1234567A" })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("*****567A")).toBeDefined();
  });

  test("omits the NRIC line when absent", () => {
    render(<FamilyMemberListItem member={entry()} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText(/\*\*\*\*\*/)).toBeNull();
  });

  test("calls onEdit when the edit button is clicked", () => {
    const onEdit = mock(() => {});
    render(<FamilyMemberListItem member={entry()} onEdit={onEdit} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Aisha Rahman" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test("calls onDelete only after confirming in the destructive dialog", async () => {
    const onDelete = mock(() => {});
    render(<FamilyMemberListItem member={entry()} onEdit={() => {}} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Aisha Rahman" }));

    await waitFor(() => {
      expect(screen.getByText("Remove family member?")).toBeDefined();
    });
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test("disables the row actions when disabled", () => {
    render(
      <FamilyMemberListItem member={entry()} onEdit={() => {}} onDelete={() => {}} disabled />,
    );
    expect(screen.getByRole("button", { name: "Edit Aisha Rahman" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Remove Aisha Rahman" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
