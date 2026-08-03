import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignOutButton } from "../../src/features/auth/components/sign-out-button.tsx";
import { createWrapper } from "../query-wrapper.tsx";
import { authClient, navigate, resetAuthMocks, signOut } from "../setup.ts";

beforeEach(resetAuthMocks);
afterEach(cleanup);

describe("SignOutButton", () => {
  test("signs out and returns the user to the login page", async () => {
    render(<SignOutButton />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /Log out/ }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/auth/login" });
    });
    expect(signOut).toHaveBeenCalledWith(authClient);
  });
});
