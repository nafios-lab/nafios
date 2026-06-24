import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
// The hook drives the REAL saveOnboardingProfileFn (built against the
// tests/setup.ts stubs). We steer the outcome through the shared auth spies.
// This file targets the hook's retry model: success, the non-retryable break,
// retry-exhaustion, recovery after a thrown attempt, and `reset`.
import { useOnboardingProfile } from "../../src/features/onboarding/hooks/use-onboarding-profile.ts";
import { getSession, resetServerFnMocks, updateUserMetadata } from "../setup.ts";

const GENERIC_ERROR = "We couldn't save your profile. Please try again.";

function withSession(): void {
  getSession.mockResolvedValue({ error: null, data: { session: { user: { id: "u1" } } } });
}

beforeEach(resetServerFnMocks);

describe("useOnboardingProfile", () => {
  test("calls onSuccess after a successful save", async () => {
    withSession();
    const onSuccess = mock(() => {});
    const { result } = renderHook(() => useOnboardingProfile({ onSuccess }));

    await act(async () => {
      await result.current.saveProfile({ mobile: "(+65) 9123 4567" });
    });

    expect(updateUserMetadata).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.isSaving).toBe(false);
  });

  test("stops after a single attempt on the non-retryable no_session fault", async () => {
    // getSession default = no session → saveOnboardingProfileFn returns no_session.
    const onSuccess = mock(() => {});
    const { result } = renderHook(() => useOnboardingProfile({ onSuccess }));

    await act(async () => {
      await result.current.saveProfile({ mobile: "(+65) 9123 4567" });
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
    expect(result.current.error).toBe(GENERIC_ERROR);
  });

  test("retries a system fault up to 3 times, then surfaces a generic error", async () => {
    withSession();
    updateUserMetadata.mockResolvedValue({
      error: { code: "update_metadata_failed", message: "boom" },
    });
    const { result } = renderHook(() => useOnboardingProfile({ onSuccess: () => {} }));

    await act(async () => {
      await result.current.saveProfile({ mobile: "(+65) 9123 4567" });
    });

    expect(updateUserMetadata).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBe(GENERIC_ERROR);
  });

  test("recovers when an earlier attempt throws but a later one succeeds", async () => {
    // First getSession rejects → the server fn throws → the hook's catch falls
    // through to the next attempt, which succeeds.
    let calls = 0;
    getSession.mockImplementation(() => {
      calls += 1;
      if (calls < 2) return Promise.reject(new Error("network"));
      return Promise.resolve({ error: null, data: { session: { user: { id: "u1" } } } });
    });
    const onSuccess = mock(() => {});
    const { result } = renderHook(() => useOnboardingProfile({ onSuccess }));

    await act(async () => {
      await result.current.saveProfile({ mobile: "(+65) 9123 4567" });
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  test("reset() clears a prior error", async () => {
    const { result } = renderHook(() => useOnboardingProfile({ onSuccess: () => {} }));

    await act(async () => {
      await result.current.saveProfile({ mobile: "(+65) 9123 4567" });
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    expect(result.current.error).toBeNull();
  });
});
