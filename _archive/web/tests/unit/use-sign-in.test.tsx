import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
// The hook orchestrates the real signInFn server fn, which builds against the
// process-wide stubs in tests/setup.ts. We drive the outcome through the shared
// `signInWithPassword` spy. The form's submit path is covered via LoginForm;
// this file targets the hook's own surface (user/system classification, reset).
import { useSignIn } from "../../src/features/auth/hooks/use-sign-in.ts";
import { resetServerFnMocks, signInWithPassword } from "../setup.ts";

const credentials = { email: "user@nafios.local", password: "password123" };

beforeEach(() => {
  resetServerFnMocks();
  signInWithPassword.mockResolvedValue({
    error: null,
    data: { user: { id: "u1", email: credentials.email }, session: {} },
  });
});

describe("useSignIn", () => {
  test("fires onSuccess with the authenticated user on a clean run", async () => {
    const onSuccess = mock((_u?: unknown) => {});
    const { result } = renderHook(() => useSignIn({ onSuccess }));

    await act(async () => {
      await result.current.signIn(credentials);
    });

    expect(onSuccess).toHaveBeenCalledWith({ id: "u1", email: credentials.email });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("classifies wrong credentials as a user error with an anti-enumeration message", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    const onError = mock((_e?: unknown) => {});
    const { result } = renderHook(() => useSignIn({ onError }));

    await act(async () => {
      await result.current.signIn(credentials);
    });

    expect(result.current.error?.kind).toBe("user");
    expect(result.current.error?.message).toBe("Incorrect email or password.");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("treats the legacy invalid_grant code as a user error too", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_grant", message: "bad grant" },
    });
    const { result } = renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn(credentials);
    });

    expect(result.current.error?.kind).toBe("user");
  });

  test("classifies any other auth failure as a system error, preserving the message", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "over_request_rate_limit", message: "Too many requests" },
    });
    const { result } = renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn(credentials);
    });

    expect(result.current.error?.kind).toBe("system");
    expect(result.current.error?.message).toBe("Too many requests");
  });

  test("reset() clears a prior error", async () => {
    signInWithPassword.mockResolvedValue({
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    const { result } = renderHook(() => useSignIn());

    await act(async () => {
      await result.current.signIn(credentials);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    expect(result.current.error).toBeNull();
  });
});
