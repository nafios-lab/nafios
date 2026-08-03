import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
// The hook drives the REAL completeOnboarding (built against the tests/setup.ts
// spies) and reads useQueryClient() → renderHook needs the query wrapper. We
// steer the outcome through the shared `insertUserProfile` spy. This targets the
// retry model: success, retry-exhaustion, and the non-retryable break.
import { useCompleteOnboarding } from "../../src/features/onboarding/hooks/use-complete-onboarding.ts";
import { createWrapper } from "../query-wrapper.tsx";
import { db, insertUserProfile, resetOnboardingMocks } from "../setup.ts";

const GENERIC_ERROR = "We couldn't finish setting up your account. Please try again.";

beforeEach(resetOnboardingMocks);

describe("useCompleteOnboarding", () => {
  test("calls onSuccess after a successful completion write", async () => {
    const onSuccess = mock(() => {});
    const onError = mock(() => {});
    const { result } = renderHook(() => useCompleteOnboarding({ onSuccess, onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.complete({ familyMembers: [] });
    });

    expect(insertUserProfile).toHaveBeenCalledWith(db, { familyMembers: [] });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  test("retries a system fault up to 3 times, then surfaces a generic error and onError", async () => {
    insertUserProfile.mockRejectedValue(new Error("boom"));
    const onSuccess = mock(() => {});
    const onError = mock(() => {});
    const { result } = renderHook(() => useCompleteOnboarding({ onSuccess, onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.complete({ familyMembers: [] });
    });

    expect(insertUserProfile).toHaveBeenCalledTimes(3);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(GENERIC_ERROR);
    expect(result.current.isCompleting).toBe(false);
  });

  test("stops after a single attempt on the non-retryable no_session fault", async () => {
    insertUserProfile.mockRejectedValue(new Error("no_session"));
    const onError = mock(() => {});
    const { result } = renderHook(() => useCompleteOnboarding({ onSuccess: () => {}, onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.complete({ familyMembers: [] });
    });

    expect(insertUserProfile).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(GENERIC_ERROR);
  });
});
