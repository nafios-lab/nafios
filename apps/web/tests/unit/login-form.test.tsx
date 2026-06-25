import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
// react-router (useNavigate + Link) and @nafios/auth-core are stubbed
// process-wide in tests/setup.ts. The form drives the REAL signInFn, which calls
// the shared `signInWithPassword` spy; navigation lands on the shared `navigate`
// spy. We steer both from here.
import { LoginForm } from "../../src/features/auth/components/login-form.tsx";
import { navigate, resetServerFnMocks, signInWithPassword } from "../setup.ts";

beforeEach(resetServerFnMocks);
afterEach(cleanup);

function emailInput(): HTMLInputElement {
  return screen.getByPlaceholderText("Email address") as HTMLInputElement;
}
function passwordInput(): HTMLInputElement {
  return screen.getByPlaceholderText("password") as HTMLInputElement;
}
function submitForm(): void {
  fireEvent.submit(document.getElementById("login-form") as HTMLFormElement);
}
function fillValid(): void {
  fireEvent.change(emailInput(), { target: { value: "user@nafios.local" } });
  fireEvent.change(passwordInput(), { target: { value: "password123" } });
}

describe("LoginForm — rendering", () => {
  test("renders the heading, fields, and primary actions", () => {
    render(<LoginForm />);
    expect(screen.getByText("Welcome back.")).toBeDefined();
    expect(emailInput()).toBeDefined();
    expect(passwordInput()).toBeDefined();
    expect(screen.getByText("Remember Me")).toBeDefined();
    expect(screen.getByText("Forgot Password ?")).toBeDefined();
    expect(screen.getByRole("button", { name: /Login/ })).toBeDefined();
    expect(screen.getByText("Create one")).toBeDefined();
  });

  test("the create-account link points at the signup route", () => {
    render(<LoginForm />);
    const link = screen.getByText("Create one").closest("a");
    expect(link?.getAttribute("href")).toBe("/auth/signup");
  });
});

describe("LoginForm — validation (submit-gated)", () => {
  test("stays quiet until the first submit", () => {
    render(<LoginForm />);

    fireEvent.blur(emailInput());
    fireEvent.blur(passwordInput());

    // Errors are gated behind a submit attempt — blurring alone shows nothing.
    expect(screen.queryByText("Enter a valid email address")).toBeNull();
    expect(screen.queryByText("Password is required")).toBeNull();
  });

  test("surfaces email and password errors after an empty submit", async () => {
    render(<LoginForm />);

    submitForm();

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address")).toBeDefined();
      expect(screen.getByText("Password is required")).toBeDefined();
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test("clears the email error in real time once it becomes valid", async () => {
    render(<LoginForm />);

    submitForm();
    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address")).toBeDefined();
    });

    fireEvent.change(emailInput(), { target: { value: "user@nafios.local" } });
    await waitFor(() => {
      expect(screen.queryByText("Enter a valid email address")).toBeNull();
    });
  });
});

describe("LoginForm — submission", () => {
  test("signs in with the typed credentials and navigates home on success", async () => {
    render(<LoginForm />);
    fillValid();

    submitForm();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/" });
    });
    expect(signInWithPassword).toHaveBeenCalledWith(
      { __authClient: true },
      { email: "user@nafios.local", password: "password123" },
    );
  });

  test("navigates to the redirectTo target when provided", async () => {
    render(<LoginForm redirectTo="/welcome" />);
    fillValid();

    submitForm();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/welcome" });
    });
  });

  test("shows an anti-enumeration message and does not navigate on wrong credentials", async () => {
    signInWithPassword.mockResolvedValue({
      error: {
        code: "invalid_credentials",
        message: "Invalid login credentials",
      },
    });
    render(<LoginForm />);
    fillValid();

    submitForm();

    // The submit error is surfaced inside an Alert, not plain text.
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Incorrect email or password.",
      );
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  test("shows a generic retry message on a system fault", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "over_request_rate_limit", message: "Too many requests" },
    });
    render(<LoginForm />);
    fillValid();

    submitForm();

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  test("does not call the auth server fn while values are invalid", async () => {
    render(<LoginForm />);

    submitForm();

    await waitFor(() => {
      expect(screen.getByText("Password is required")).toBeDefined();
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("LoginForm — password visibility toggle", () => {
  test("toggles the password field between masked and visible", () => {
    render(<LoginForm />);
    expect(passwordInput().type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show credential" }));
    expect(passwordInput().type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide credential" }));
    expect(passwordInput().type).toBe("password");
  });
});
