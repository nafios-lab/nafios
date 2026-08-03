import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useSignOut } from "../../src/features/auth/hooks/use-sign-out.ts";
import { createWrapper } from "../query-wrapper.tsx";
import { authClient, resetAuthMocks, signOut } from "../setup.ts";

beforeEach(resetAuthMocks);

describe("useSignOut", () => {
  test("signs out against the browser client and fires onSuccess", async () => {
    const onSuccess = mock(() => {});
    const { result } = renderHook(() => useSignOut({ onSuccess }), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.signOut();
    });

    expect(signOut).toHaveBeenCalledWith(authClient);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
  });

  test("still clears loading if the sign-out call rejects", async () => {
    signOut.mockRejectedValueOnce(new Error("revoke failed"));
    const { result } = renderHook(() => useSignOut(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.signOut()).rejects.toThrow("revoke failed");
    });

    expect(result.current.isLoading).toBe(false);
  });
});
