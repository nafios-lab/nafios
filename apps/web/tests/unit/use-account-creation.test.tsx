import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
// The hook orchestrates the real signUpFn / insertUserProfileFn server fns,
// which build against the process-wide stubs in tests/setup.ts. We drive the
// outcome through the shared `signUp` / `insertUserProfile` spies. The signup
// wizard's submit path is covered via SignupStepReview; this file targets the
// hook's own surface (onSuccess/onError classification, reset).
import { useAccountCreation } from "../../src/features/auth/hooks/use-account-creation.ts";
import { insertUserProfile, resetServerFnMocks, signUp } from "../setup.ts";

const data = {
  account: { username: "h", email: "test@nafios.local", mobile: "(+65) 9000 0000" },
  security: { password: "password123", confirmPassword: "password123" },
  family: { familyMembers: [] },
};

beforeEach(() => {
  resetServerFnMocks();
  signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "u1", email: "test@nafios.local" } },
  });
});

describe("useAccountCreation", () => {
  test("fires onSuccess with the created user on a clean run", async () => {
    const onSuccess = mock((_r?: unknown) => {});
    const { result } = renderHook(() => useAccountCreation({ onSuccess }));

    await act(async () => {
      await result.current.createAccount(data);
    });

    expect(onSuccess).toHaveBeenCalledWith({
      user: { id: "u1", email: "test@nafios.local" },
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("classifies a duplicate email as a user-actionable error", async () => {
    signUp.mockResolvedValue({
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const onError = mock((_e?: unknown) => {});
    const { result } = renderHook(() => useAccountCreation({ onError }));

    await act(async () => {
      await result.current.createAccount(data);
    });

    expect(result.current.error?.kind).toBe("user");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(insertUserProfile).not.toHaveBeenCalled();
  });

  test("classifies a non-duplicate auth failure as a system error", async () => {
    signUp.mockResolvedValue({
      error: { code: "weak_password", message: "Password too weak" },
    });
    const { result } = renderHook(() => useAccountCreation());

    await act(async () => {
      await result.current.createAccount(data);
    });

    expect(result.current.error?.kind).toBe("system");
  });

  test("reset() clears a prior error", async () => {
    signUp.mockResolvedValue({
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const { result } = renderHook(() => useAccountCreation());

    await act(async () => {
      await result.current.createAccount(data);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    expect(result.current.error).toBeNull();
  });
});
