import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignupStepAccount } from "../../src/features/auth/components/signup-step-account.tsx";
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
      <SignupStepAccount />
    </SignupWizardContext.Provider>,
  );
}

beforeEach(() => {
  wizard = freshWizard();
});
afterEach(cleanup);

function usernameInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Username") as HTMLInputElement;
}
function emailInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Email address") as HTMLInputElement;
}
function mobileInput(): HTMLInputElement {
  return screen.getByPlaceholderText("(+65) 9000 0000") as HTMLInputElement;
}
function form(): HTMLFormElement {
  return document.querySelector("form") as HTMLFormElement;
}

// MaskInput ignores React's synthetic onChange — its value path is a
// capture-phase native "input" listener (inputmask swallows the synthetic
// event). Setting .value then dispatching a native input event is what reaches
// the form's field.handleChange.
function typeMobile(value: string) {
  const el = mobileInput();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("SignupStepAccount — rendering", () => {
  test("renders the heading and all three fields", () => {
    renderStep();
    expect(screen.getByText("Create your account.")).toBeDefined();
    expect(usernameInput()).toBeDefined();
    expect(emailInput()).toBeDefined();
    expect(mobileInput()).toBeDefined();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDefined();
  });

  test("prefills from existing wizard data", () => {
    wizard.data = {
      account: { username: "hanafi", email: "h@nafios.local", mobile: "(+65) 9123 4567" },
    };
    renderStep();
    expect(usernameInput().value).toBe("hanafi");
    expect(emailInput().value).toBe("h@nafios.local");
  });
});

describe("SignupStepAccount — validation (submit-gated)", () => {
  test("shows no errors before the first submit attempt", () => {
    renderStep();
    fireEvent.change(usernameInput(), { target: { value: "" } });
    // Errors are gated behind `submitted` — typing alone must not surface them.
    expect(screen.queryByText("Username is required")).toBeNull();
  });

  test("surfaces errors on submit and does not advance", async () => {
    renderStep();

    fireEvent.submit(form());

    await waitFor(() => {
      expect(screen.getByText("Username is required")).toBeDefined();
    });
    expect(screen.getByText("Invalid Singapore mobile number")).toBeDefined();
    expect(wizard.next).not.toHaveBeenCalled();
    expect(wizard.setStepData).not.toHaveBeenCalled();
  });

  test("flags an invalid email", async () => {
    renderStep();

    fireEvent.change(usernameInput(), { target: { value: "hanafi" } });
    fireEvent.change(emailInput(), { target: { value: "not-an-email" } });
    typeMobile("(+65) 9123 4567");
    fireEvent.submit(form());

    await waitFor(() => {
      // zod's email error message surfaces in the email field.
      expect(emailInput().getAttribute("aria-invalid")).toBe("true");
    });
    expect(wizard.next).not.toHaveBeenCalled();
  });

  test("clears a field error in real time once corrected", async () => {
    renderStep();

    fireEvent.submit(form());
    await waitFor(() => {
      expect(screen.getByText("Username is required")).toBeDefined();
    });

    // onChange revalidation drops the error as soon as the field is valid.
    fireEvent.change(usernameInput(), { target: { value: "hanafi" } });
    await waitFor(() => {
      expect(screen.queryByText("Username is required")).toBeNull();
    });
  });
});

describe("SignupStepAccount — submission", () => {
  test("saves the account data and advances when valid", async () => {
    renderStep();

    fireEvent.change(usernameInput(), { target: { value: "hanafi" } });
    fireEvent.change(emailInput(), { target: { value: "h@nafios.local" } });
    typeMobile("(+65) 9123 4567");

    fireEvent.submit(form());

    await waitFor(() => {
      expect(wizard.next).toHaveBeenCalledTimes(1);
    });
    expect(wizard.setStepData).toHaveBeenCalledWith("account", {
      username: "hanafi",
      email: "h@nafios.local",
      mobile: "(+65) 9123 4567",
    });
  });

  test("submits via the Enter key as well as the button", async () => {
    renderStep();

    fireEvent.change(usernameInput(), { target: { value: "hanafi" } });
    fireEvent.change(emailInput(), { target: { value: "h@nafios.local" } });
    typeMobile("(+65) 9123 4567");

    fireEvent.keyDown(form(), { key: "Enter" });

    await waitFor(() => {
      expect(wizard.next).toHaveBeenCalledTimes(1);
    });
  });

  test("ignores non-Enter key presses", () => {
    renderStep();
    fireEvent.keyDown(form(), { key: "a" });
    expect(wizard.next).not.toHaveBeenCalled();
  });
});
