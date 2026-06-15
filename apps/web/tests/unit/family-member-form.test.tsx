import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FamilyMemberForm } from "../../src/features/auth/components/family-member-form.tsx";

const noop = () => {};

afterEach(cleanup);

describe("FamilyMemberForm — getInitials fallback", () => {
  // getInitials is exercised through the AvatarUpload fallback, which renders
  // only when a value is set (happy-dom can't load the <img>, so the fallback
  // text shows). Each case supplies a default avatar to surface the initials.
  test("derives two-letter initials from a full name", () => {
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={noop}
        defaultValues={{ name: "John Doe", relationship: "spouse", avatar: "data:img,x" }}
      />,
    );
    expect(screen.getByText("JD")).toBeDefined();
  });

  test("uses a single initial for a mononym", () => {
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={noop}
        defaultValues={{ name: "Madonna", relationship: "other", avatar: "data:img,x" }}
      />,
    );
    expect(screen.getByText("M")).toBeDefined();
  });

  test("collapses extra whitespace when picking first and last initials", () => {
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={noop}
        defaultValues={{
          name: "  Anne   Marie  Smith ",
          relationship: "child",
          avatar: "data:img,x",
        }}
      />,
    );
    expect(screen.getByText("AS")).toBeDefined();
  });
});

describe("FamilyMemberForm — avatar wiring", () => {
  // The upload → onChange → state path lives in AvatarUpload and is covered in
  // @nafios/ui's avatar-upload.test.tsx. Here we prove the form forwards the
  // avatar it holds into the submitted member.
  test("includes the existing avatar in the submitted member", async () => {
    const onSubmit = mock((_: unknown) => {});
    render(
      <FamilyMemberForm
        onSubmit={onSubmit}
        onCancel={noop}
        defaultValues={{
          name: "Jane Doe",
          relationship: "spouse",
          avatar: "data:image/webp;base64,EXISTING",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: "Jane Doe",
      relationship: "spouse",
      avatar: "data:image/webp;base64,EXISTING",
    });
  });

  test("trims the name and drops empty optional fields on submit", async () => {
    const onSubmit = mock((_: unknown) => {});
    render(
      <FamilyMemberForm
        onSubmit={onSubmit}
        onCancel={noop}
        defaultValues={{ name: "  Jane Doe  ", relationship: "spouse" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const payload = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.name).toBe("Jane Doe");
    expect(payload.avatar).toBeUndefined();
    expect(payload.nric).toBeUndefined();
    expect(payload.mobile).toBeUndefined();
  });

  test("calls onCancel when Cancel is clicked", () => {
    const onCancel = mock(() => {});
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={onCancel}
        defaultValues={{ name: "Jane Doe", relationship: "spouse" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
