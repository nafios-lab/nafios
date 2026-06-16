import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignupStepSecurity } from "../../src/features/auth/components/signup-step-security.tsx";
import {
  SignupWizardContext,
  type SignupWizardContextValue,
} from "../../src/features/auth/context/signup-wizard.tsx";

// The step reads/writes the signup wizard via useSignupWizard(), which is just
// useContext(SignupWizardContext). We inject a fake value through the REAL
// provider rather than mock.module-ing the hook: bun's module mock is
// process-global and leaks the stub into sibling test files. This also covers
// the real hook for free.
type FakeWizard = {
  activeStep: SignupWizardContextValue["activeStep"];
  data: SignupWizardContextValue["data"];
  next: ReturnType<typeof mock>;
  back: ReturnType<typeof mock>;
  goTo: ReturnType<typeof mock>;
  setStepData: ReturnType<typeof mock>;
  isSubmitting: boolean;
  setIsSubmitting: ReturnType<typeof mock>;
};

let wizard: FakeWizard;

function freshWizard(): FakeWizard {
  return {
    activeStep: 0,
    data: {},
    next: mock(() => {}),
    back: mock(() => {}),
    goTo: mock(() => {}),
    setStepData: mock(() => {}),
    isSubmitting: false,
    setIsSubmitting: mock(() => {}),
  };
}

function renderStep() {
  return render(
    <SignupWizardContext.Provider value={wizard as SignupWizardContextValue}>
      <SignupStepSecurity />
    </SignupWizardContext.Provider>,
  );
}

beforeEach(() => {
  wizard = freshWizard();
});
afterEach(cleanup);

function passwordInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Password") as HTMLInputElement;
}
function confirmInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Confirm Password") as HTMLInputElement;
}
function form(): HTMLFormElement {
  return document.querySelector("form") as HTMLFormElement;
}

describe("SignupStepSecurity — rendering", () => {
  test("renders the heading, both fields, and nav buttons", () => {
    renderStep();
    expect(screen.getByText("Set your security PIN.")).toBeDefined();
    expect(passwordInput()).toBeDefined();
    expect(confirmInput()).toBeDefined();
    expect(screen.getByRole("button", { name: /Back/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDefined();
  });

  test("prefills from existing wizard data", () => {
    wizard.data = { security: { password: "secret123", confirmPassword: "secret123" } };
    renderStep();
    expect(passwordInput().value).toBe("secret123");
    expect(confirmInput().value).toBe("secret123");
  });
});

describe("SignupStepSecurity — validation (submit-gated)", () => {
  test("shows no errors before the first submit attempt", () => {
    renderStep();
    fireEvent.change(passwordInput(), { target: { value: "short" } });
    expect(screen.queryByText("Password must be at least 8 characters")).toBeNull();
  });

  test("surfaces required/length errors on submit and does not advance", async () => {
    renderStep();

    fireEvent.submit(form());

    await waitFor(() => {
      expect(screen.getByText("Password is required")).toBeDefined();
    });
    expect(screen.getByText("Please confirm your password")).toBeDefined();
    expect(wizard.next).not.toHaveBeenCalled();
    expect(wizard.setStepData).not.toHaveBeenCalled();
  });

  test("rejects a password shorter than 8 characters", async () => {
    renderStep();

    fireEvent.change(passwordInput(), { target: { value: "short" } });
    fireEvent.change(confirmInput(), { target: { value: "short" } });
    fireEvent.submit(form());

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 8 characters")).toBeDefined();
    });
    expect(wizard.next).not.toHaveBeenCalled();
  });

  test("flags a mismatched confirmation on the confirm field", async () => {
    renderStep();

    fireEvent.change(passwordInput(), { target: { value: "password123" } });
    fireEvent.change(confirmInput(), { target: { value: "password124" } });
    fireEvent.submit(form());

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeDefined();
    });
    expect(wizard.next).not.toHaveBeenCalled();
  });

  test("clears the mismatch error in real time once the passwords match", async () => {
    renderStep();

    fireEvent.change(passwordInput(), { target: { value: "password123" } });
    fireEvent.change(confirmInput(), { target: { value: "password124" } });
    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeDefined();
    });

    // Fixing the confirmation re-validates (onChange) and drops the error.
    fireEvent.change(confirmInput(), { target: { value: "password123" } });
    await waitFor(() => {
      expect(screen.queryByText("Passwords do not match")).toBeNull();
    });
  });
});

describe("SignupStepSecurity — navigation & submission", () => {
  test("Back invokes the wizard's back() without submitting", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(wizard.back).toHaveBeenCalledTimes(1);
    expect(wizard.next).not.toHaveBeenCalled();
  });

  test("saves the security data and advances when valid and matching", async () => {
    renderStep();

    fireEvent.change(passwordInput(), { target: { value: "password123" } });
    fireEvent.change(confirmInput(), { target: { value: "password123" } });
    fireEvent.submit(form());

    await waitFor(() => {
      expect(wizard.next).toHaveBeenCalledTimes(1);
    });
    expect(wizard.setStepData).toHaveBeenCalledWith("security", {
      password: "password123",
      confirmPassword: "password123",
    });
  });
});

describe("SignupStepSecurity — password visibility toggle", () => {
  test("toggles the password field between masked and visible", () => {
    renderStep();
    expect(passwordInput().type).toBe("password");

    // The password field is the first credential toggle button.
    const toggles = screen.getAllByRole("button", { name: "Show credential" });
    fireEvent.click(toggles[0] as HTMLElement);
    expect(passwordInput().type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide credential" }));
    expect(passwordInput().type).toBe("password");
  });
});
