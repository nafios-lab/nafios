import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
// The hook drives the REAL signUpFn server fn (built against the tests/setup.ts
// stubs). We steer the outcome through the shared `signUp` spy; `getSession`
// stays at its no-session default so signUpFn takes the fresh-signup path rather
// than the resume path. This file targets the hook's own surface: the
// user/system classification of failures and `reset`.
import { useAccountSignup } from "../../src/features/auth/hooks/use-account-signup.ts";
import { resetServerFnMocks, signUp } from "../setup.ts";

const credentials = { email: "new@nafios.local", password: "password123" };

beforeEach(() => {
  resetServerFnMocks();
  signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "u1", email: credentials.email } },
  });
});

describe("useAccountSignup", () => {
  test("fires onSuccess with the created user on a clean signup", async () => {
    const onSuccess = mock((_r?: unknown) => {});
    const { result } = renderHook(() => useAccountSignup({ onSuccess }));

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(onSuccess).toHaveBeenCalledWith({ user: { id: "u1", email: credentials.email } });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("classifies a duplicate email as a user error with an actionable message", async () => {
    signUp.mockResolvedValue({
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const { result } = renderHook(() => useAccountSignup({}));

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("user");
    expect(result.current.error?.message).toContain("already registered");
  });

  test("treats the email_exists code as a user error too", async () => {
    signUp.mockResolvedValue({ error: { code: "email_exists", message: "Email exists" } });
    const { result } = renderHook(() => useAccountSignup({}));

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("user");
  });

  test("classifies any other auth failure as a system error, preserving the message", async () => {
    signUp.mockResolvedValue({ error: { code: "weak_password", message: "Password is too weak" } });
    const { result } = renderHook(() => useAccountSignup({}));

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("system");
    expect(result.current.error?.message).toBe("Password is too weak");
  });

  test("normalizes an unexpected throw (e.g. network) into a system error", async () => {
    signUp.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useAccountSignup({}));

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("system");
    expect(result.current.error?.message).toBe("network down");
  });

  test("reset() clears a prior error", async () => {
    signUp.mockResolvedValue({ error: { code: "user_already_exists", message: "dupe" } });
    const { result } = renderHook(() => useAccountSignup({}));

    await act(async () => {
      await result.current.signupUser(credentials);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    expect(result.current.error).toBeNull();
  });
});
