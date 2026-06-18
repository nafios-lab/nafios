import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Navbar } from "../../src/components/navbar.tsx";
import { navigate, resetServerFnMocks, signOut } from "../setup.ts";

// Navbar's logout calls the real signOutFn server fn (which builds against the
// process-wide createServerFn/auth-core stubs in tests/setup.ts) and then
// navigates. We assert on the shared `signOut` and `navigate` spies.

beforeEach(resetServerFnMocks);
afterEach(cleanup);

describe("Navbar", () => {
  test("renders the app name and the user email when provided", () => {
    render(<Navbar email="user@nafios.local" />);
    expect(screen.getByText("NafiOS")).toBeDefined();
    expect(screen.getByText("user@nafios.local")).toBeDefined();
  });

  test("omits the email element when no email is supplied", () => {
    render(<Navbar email={undefined} />);
    expect(screen.getByText("NafiOS")).toBeDefined();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  test("logout signs out and redirects to the login page", async () => {
    render(<Navbar email="user@nafios.local" />);

    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/login" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
