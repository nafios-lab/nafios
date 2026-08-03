import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
// The hook signs up directly against the (mocked) browser client. `getUser`
// stays at its no-user default so the hook takes the fresh-signup path rather
// than the resume path; we steer the outcome through the shared `signUp` spy.
import { useAccountSignup } from "../../src/features/auth/hooks/use-account-signup.ts";
import { createWrapper } from "../query-wrapper.tsx";
import { authClient, getUser, resetAuthMocks, signUp } from "../setup.ts";

const credentials = { email: "new@nafios.local", password: "password123" };

beforeEach(() => {
  resetAuthMocks();
  signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "u1", email: credentials.email }, session: {} },
  });
});

describe("useAccountSignup", () => {
  test("signs up against the browser client and fires onSuccess with the user", async () => {
    const onSuccess = mock((_r?: unknown) => {});
    const { result } = renderHook(() => useAccountSignup({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(signUp).toHaveBeenCalledWith(authClient, credentials);
    expect(onSuccess).toHaveBeenCalledWith({ user: { id: "u1", email: credentials.email } });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("resume path: an already-authenticated user skips signUp", async () => {
    // A prior partial attempt already created + signed in the user.
    getUser.mockResolvedValueOnce({
      error: null,
      data: { user: { id: "u1", email: credentials.email } },
    });
    const onSuccess = mock((_r?: unknown) => {});
    const { result } = renderHook(() => useAccountSignup({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(signUp).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({ user: { id: "u1", email: credentials.email } });
  });

  test("classifies a duplicate email as a user error with an actionable message", async () => {
    signUp.mockResolvedValue({
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const { result } = renderHook(() => useAccountSignup({}), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("user");
    expect(result.current.error?.message).toContain("already registered");
  });

  test("treats the email_exists code as a user error too", async () => {
    signUp.mockResolvedValue({ error: { code: "email_exists", message: "Email exists" } });
    const { result } = renderHook(() => useAccountSignup({}), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("user");
  });

  test("classifies any other auth failure as a system error, preserving the message", async () => {
    signUp.mockResolvedValue({ error: { code: "weak_password", message: "Password is too weak" } });
    const { result } = renderHook(() => useAccountSignup({}), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("system");
    expect(result.current.error?.message).toBe("Password is too weak");
  });

  test("normalizes an unexpected throw (e.g. network) into a system error", async () => {
    signUp.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useAccountSignup({}), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.signupUser(credentials);
    });

    expect(result.current.error?.kind).toBe("system");
    expect(result.current.error?.message).toBe("network down");
  });

  test("reset() clears a prior error", async () => {
    signUp.mockResolvedValue({ error: { code: "user_already_exists", message: "dupe" } });
    const { result } = renderHook(() => useAccountSignup({}), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.signupUser(credentials);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    expect(result.current.error).toBeNull();
  });
});
