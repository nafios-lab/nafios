import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignupWizard } from "../../src/features/auth/components/signup-wizard.tsx";

afterEach(cleanup);

// Advance off the Account step by supplying valid values and submitting. The
// step gates next() behind onSubmit validation, so the payload must be valid.
// MaskInput ignores React's synthetic onChange (inputmask swallows it); a native
// "input" event is what reaches the field, which is what fireEvent.change emits.
async function completeAccountStep() {
  fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "nafi" } });
  fireEvent.change(screen.getByPlaceholderText("Email address"), {
    target: { value: "nafi@nafios.local" },
  });
  const mobile = screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
  mobile.value = "(+65) 9123 4567";
  mobile.dispatchEvent(new Event("input", { bubbles: true }));

  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
  await waitFor(() => {
    expect(screen.getByText("Set your security PIN.")).toBeDefined();
  });
}

describe("SignupWizard", () => {
  test("renders the stepper with all four steps and the Account step first", () => {
    render(<SignupWizard />);
    expect(screen.getByLabelText("Step 1: Account")).toBeDefined();
    expect(screen.getByLabelText("Step 2: Security")).toBeDefined();
    expect(screen.getByLabelText("Step 3: Family")).toBeDefined();
    expect(screen.getByLabelText("Step 4: Review")).toBeDefined();
    expect(screen.getByText("Create your account.")).toBeDefined();
    expect(screen.getByLabelText("Step 1: Account").getAttribute("aria-current")).toBe("step");
  });

  test("swaps in the Security step component once Account submits (active step advances)", async () => {
    render(<SignupWizard />);
    await completeAccountStep();
    expect(screen.getByText("Set your security PIN.")).toBeDefined();
    expect(screen.getByLabelText("Step 2: Security").getAttribute("aria-current")).toBe("step");
  });

  test("steps backward when the Security step's Back button fires", async () => {
    render(<SignupWizard />);
    await completeAccountStep();
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    await waitFor(() => {
      expect(screen.getByText("Create your account.")).toBeDefined();
    });
    expect(screen.getByLabelText("Step 1: Account").getAttribute("aria-current")).toBe("step");
  });

  test("jumps back to a completed step via the stepper (goTo guard: index < activeStep)", async () => {
    render(<SignupWizard />);
    await completeAccountStep();
    // On Security (index 1); the completed Account circle (index 0) is clickable.
    fireEvent.click(screen.getByLabelText("Step 1: Account"));
    await waitFor(() => {
      expect(screen.getByText("Create your account.")).toBeDefined();
    });
  });

  test("ignores stepper clicks on the active or future steps (guard: index >= activeStep)", async () => {
    render(<SignupWizard />);
    await completeAccountStep();
    // Active step (Security, index 1) — guard rejects index === activeStep.
    fireEvent.click(screen.getByLabelText("Step 2: Security"));
    expect(screen.getByText("Set your security PIN.")).toBeDefined();
    // Future step (Review, index 3 > activeStep 1) — guard rejects it too.
    fireEvent.click(screen.getByLabelText("Step 4: Review"));
    expect(screen.getByText("Set your security PIN.")).toBeDefined();
  });
});
