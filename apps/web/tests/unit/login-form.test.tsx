import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as ReactRouter from "@tanstack/react-router";

// LoginForm imports `Link` from @tanstack/react-router, which needs a live
// router context to render. Stub just `Link` with a plain anchor and spread the
// module's real exports back: bun's `mock.module` is process-global, so
// preserving the other exports keeps this stub from breaking sibling test files.
mock.module("@tanstack/react-router", () => ({
  ...ReactRouter,
  Link: ({ children, to, ...props }: { children: React.ReactNode; to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const { LoginForm } = await import("../../src/features/auth/components/login-form.tsx");

afterEach(cleanup);

function usernameInput(): HTMLInputElement {
  return screen.getByPlaceholderText("username") as HTMLInputElement;
}
function passwordInput(): HTMLInputElement {
  return screen.getByPlaceholderText("password") as HTMLInputElement;
}

describe("LoginForm — rendering", () => {
  test("renders the heading, fields, and primary actions", () => {
    render(<LoginForm />);
    expect(screen.getByText("Welcome back.")).toBeDefined();
    expect(usernameInput()).toBeDefined();
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

describe("LoginForm — validation (onBlur, submit-gated)", () => {
  test("surfaces required errors after blurring empty fields", async () => {
    render(<LoginForm />);

    fireEvent.blur(usernameInput());
    fireEvent.blur(passwordInput());

    await waitFor(() => {
      expect(screen.getByText("Username is required")).toBeDefined();
      expect(screen.getByText("Password is required")).toBeDefined();
    });
  });

  test("surfaces min-length errors for too-short values", async () => {
    render(<LoginForm />);

    fireEvent.change(usernameInput(), { target: { value: "ab" } });
    fireEvent.blur(usernameInput());
    fireEvent.change(passwordInput(), { target: { value: "12345" } });
    fireEvent.blur(passwordInput());

    await waitFor(() => {
      expect(screen.getByText("Username must be at least 3 characters")).toBeDefined();
      expect(screen.getByText("Password must be at least 6 characters")).toBeDefined();
    });
  });

  test("clears the error in real time once the field becomes valid", async () => {
    render(<LoginForm />);

    fireEvent.change(usernameInput(), { target: { value: "ab" } });
    fireEvent.blur(usernameInput());
    await waitFor(() => {
      expect(screen.getByText("Username must be at least 3 characters")).toBeDefined();
    });

    // Correcting the field re-validates (onBlur revalidation) and drops the error.
    fireEvent.change(usernameInput(), { target: { value: "hanafi" } });
    fireEvent.blur(usernameInput());
    await waitFor(() => {
      expect(screen.queryByText("Username must be at least 3 characters")).toBeNull();
    });
  });
});

describe("LoginForm — submission", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  test("does not submit while values are invalid", async () => {
    render(<LoginForm />);

    fireEvent.submit(document.getElementById("login-form") as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText("Username is required")).toBeDefined();
    });
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("submits the typed credentials and remember-me flag when valid", async () => {
    render(<LoginForm />);

    fireEvent.change(usernameInput(), { target: { value: "hanafi" } });
    fireEvent.change(passwordInput(), { target: { value: "password123" } });

    // The Remember Me checkbox toggles the boolean field.
    fireEvent.click(screen.getByText("Remember Me"));

    fireEvent.submit(document.getElementById("login-form") as HTMLFormElement);

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith("login submit", {
        username: "hanafi",
        password: "password123",
        rememberMe: true,
      });
    });
  });

  test("submits with remember-me false when the box is left unchecked", async () => {
    render(<LoginForm />);

    fireEvent.change(usernameInput(), { target: { value: "hanafi" } });
    fireEvent.change(passwordInput(), { target: { value: "password123" } });

    fireEvent.submit(document.getElementById("login-form") as HTMLFormElement);

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith("login submit", {
        username: "hanafi",
        password: "password123",
        rememberMe: false,
      });
    });
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
