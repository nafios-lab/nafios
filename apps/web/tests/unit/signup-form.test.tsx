import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// react-router (useNavigate + Link) and @nafios/auth-core are stubbed
// process-wide in tests/setup.ts. The form drives the REAL signUpFn, which calls
// the shared `signUp` spy; navigation lands on the shared `navigate` spy.
import { SignupForm } from "../../src/features/auth/components/signup-form.tsx";
import { navigate, resetServerFnMocks, signUp } from "../setup.ts";

beforeEach(() => {
  resetServerFnMocks();
  signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "u1", email: "new@nafios.local" } },
  });
});
afterEach(cleanup);

function emailInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Email") as HTMLInputElement;
}
function passwordInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Password") as HTMLInputElement;
}
function confirmInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Confirm Password") as HTMLInputElement;
}
function submitForm(container: HTMLElement): void {
  fireEvent.submit(container.querySelector("form") as HTMLFormElement);
}
function fillValid(): void {
  fireEvent.change(emailInput(), { target: { value: "new@nafios.local" } });
  fireEvent.change(passwordInput(), { target: { value: "password123" } });
  fireEvent.change(confirmInput(), { target: { value: "password123" } });
}

describe("SignupForm — rendering", () => {
  test("renders the heading, the three fields, and the submit", () => {
    render(<SignupForm />);
    expect(screen.getByText("Create your account.")).toBeDefined();
    expect(emailInput()).toBeDefined();
    expect(passwordInput()).toBeDefined();
    expect(confirmInput()).toBeDefined();
    expect(screen.getByRole("button", { name: /Sign up/ })).toBeDefined();
  });
});

describe("SignupForm — validation (submit-gated)", () => {
  test("surfaces a field error after an empty submit and does not call signUp", async () => {
    const { container } = render(<SignupForm />);

    submitForm(container);

    await waitFor(() => {
      expect(screen.getByText("Invalid email address")).toBeDefined();
    });
    expect(signUp).not.toHaveBeenCalled();
  });

  test("flags mismatched passwords", async () => {
    const { container } = render(<SignupForm />);
    fireEvent.change(emailInput(), { target: { value: "new@nafios.local" } });
    fireEvent.change(passwordInput(), { target: { value: "password123" } });
    fireEvent.change(confirmInput(), { target: { value: "different1" } });

    submitForm(container);

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeDefined();
    });
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe("SignupForm — submission", () => {
  test("signs up with the typed credentials and navigates home on success", async () => {
    const { container } = render(<SignupForm />);
    fillValid();

    submitForm(container);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/" });
    });
    expect(signUp).toHaveBeenCalledWith(
      { __authClient: true },
      { email: "new@nafios.local", password: "password123" },
    );
  });

  test("shows an actionable alert on a duplicate email and does not navigate", async () => {
    signUp.mockResolvedValue({
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const { container } = render(<SignupForm />);
    fillValid();

    submitForm(container);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("already registered");
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  test("surfaces the raw message on a system fault", async () => {
    signUp.mockResolvedValue({ error: { code: "weak_password", message: "Password is too weak" } });
    const { container } = render(<SignupForm />);
    fillValid();

    submitForm(container);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Password is too weak");
    });
  });
});
