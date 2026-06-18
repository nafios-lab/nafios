import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("FamilyMemberForm — header & labels", () => {
  test("uses default add-mode title and submit label", () => {
    render(<FamilyMemberForm onSubmit={noop} onCancel={noop} />);
    expect(screen.getByText("Add family member")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add member" })).toBeDefined();
  });

  test("renders edit-mode title and submit label when provided", () => {
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={noop}
        title="Edit family member"
        submitLabel="Save changes"
        defaultValues={{ name: "Jane Doe", relationship: "spouse" }}
      />,
    );
    expect(screen.getByText("Edit family member")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDefined();
  });
});

describe("FamilyMemberForm — submit gating", () => {
  test("submit stays disabled with an empty name or relationship", () => {
    render(<FamilyMemberForm onSubmit={noop} onCancel={noop} />);
    const submit = screen.getByRole("button", { name: "Add member" }) as HTMLButtonElement;
    // Empty form → both name and relationship missing → disabled.
    expect(submit.disabled).toBe(true);

    // Name only is still not enough — relationship is required to enable submit.
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "Solo Name" },
    });
    expect(submit.disabled).toBe(true);
  });

  test("submit enables once both name and relationship are present (via defaults)", () => {
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={noop}
        defaultValues={{ name: "Jane Doe", relationship: "spouse" }}
      />,
    );
    const submit = screen.getByRole("button", { name: "Add member" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

describe("FamilyMemberForm — field handlers", () => {
  test("editing the name field updates its value and the avatar fallback initials", () => {
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={noop}
        // Default avatar surfaces the initials fallback in happy-dom.
        defaultValues={{ name: "Jane Doe", relationship: "spouse", avatar: "data:img,x" }}
      />,
    );
    const nameInput = screen.getByPlaceholderText("Username") as HTMLInputElement;
    expect(nameInput.value).toBe("Jane Doe");
    fireEvent.change(nameInput, { target: { value: "Mary Jane Watson" } });
    fireEvent.blur(nameInput);
    expect(nameInput.value).toBe("Mary Jane Watson");
    // Initials recompute from first + last name → MW.
    expect(screen.getByText("MW")).toBeDefined();
  });

  test("optional text fields capture input and flow into the submitted member", async () => {
    const onSubmit = mock((_: unknown) => {});
    render(
      <FamilyMemberForm
        onSubmit={onSubmit}
        onCancel={noop}
        defaultValues={{ name: "Jane Doe", relationship: "spouse" }}
      />,
    );

    const nric = screen.getByPlaceholderText("NRIC (optional)") as HTMLInputElement;
    fireEvent.change(nric, { target: { value: "S1234567A" } });
    fireEvent.blur(nric);
    expect(nric.value).toBe("S1234567A");

    const mobile = screen.getByPlaceholderText("Mobile number (optional)") as HTMLInputElement;
    fireEvent.change(mobile, { target: { value: "(+65) 9123 4567" } });
    fireEvent.blur(mobile);
    expect(mobile.value).toBe("(+65) 9123 4567");

    fireEvent.click(screen.getByRole("button", { name: "Add member" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: "Jane Doe",
      relationship: "spouse",
      nric: "S1234567A",
      mobile: "(+65) 9123 4567",
    });
  });

  test("date-of-birth field renders and accepts input without error", () => {
    render(
      <FamilyMemberForm
        onSubmit={noop}
        onCancel={noop}
        defaultValues={{ name: "Jane Doe", relationship: "spouse" }}
      />,
    );
    const dob = screen.getByPlaceholderText("Date of birth (optional)") as HTMLInputElement;
    // The masked input is controlled by inputmask; just prove its handlers wire up
    // (the field's onValueChange/onBlur fire without throwing).
    expect(() => {
      fireEvent.change(dob, { target: { value: "01 / 01 / 1990" } });
      fireEvent.blur(dob);
    }).not.toThrow();
  });

  test("selecting a relationship through the dropdown enables submit and sets the value", async () => {
    // The Radix Select animates and emits act() warnings; silence console so the
    // volume doesn't dominate the run while we drive the real picker once.
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const onSubmit = mock((_: unknown) => {});
    try {
      render(<FamilyMemberForm onSubmit={onSubmit} onCancel={noop} />);

      fireEvent.change(screen.getByPlaceholderText("Username"), {
        target: { value: "New Person" },
      });

      // Open the Radix select and pick an option to drive onValueChange → handleChange.
      await act(async () => {
        fireEvent.click(screen.getByText("Relationship..."));
        await new Promise((r) => setTimeout(r, 20));
      });
      const options = screen.getAllByText("Parent");
      await act(async () => {
        fireEvent.click(options[options.length - 1]);
        await new Promise((r) => setTimeout(r, 20));
      });

      const submit = screen.getByRole("button", { name: "Add member" }) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);

      fireEvent.click(submit);
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
        name: "New Person",
        relationship: "parent",
      });
    } finally {
      errorSpy.mockRestore();
    }
  }, 15000);
});

describe("FamilyMemberForm — submit-gated validation (memory: errors only after first submit)", () => {
  test("an invalid mobile blocks submit and surfaces the error only after submitting", async () => {
    const onSubmit = mock((_: unknown) => {});
    render(
      <FamilyMemberForm
        onSubmit={onSubmit}
        onCancel={noop}
        defaultValues={{ name: "Jane Doe", relationship: "spouse" }}
      />,
    );

    const mobile = screen.getByPlaceholderText("Mobile number (optional)") as HTMLInputElement;
    fireEvent.change(mobile, { target: { value: "12345" } });

    // Before submitting, no validation error is shown (submit-gated).
    expect(screen.queryByText("Invalid Singapore mobile number")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add member" }));

    // After the first submit attempt the error surfaces and onSubmit is blocked.
    await waitFor(() => {
      expect(screen.getByText("Invalid Singapore mobile number")).toBeDefined();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Correcting the field clears the error in real time, then submit succeeds.
    fireEvent.change(mobile, { target: { value: "(+65) 9123 4567" } });
    await waitFor(() => {
      expect(screen.queryByText("Invalid Singapore mobile number")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
