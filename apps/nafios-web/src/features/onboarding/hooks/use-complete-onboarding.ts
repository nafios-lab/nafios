import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  type CompleteOnboardingInput,
  completeOnboarding,
  resetOnboardingStatus,
} from "../lib/onboarding-data";

/** How many times to attempt the final write before giving up (system faults). */
const MAX_COMPLETE_ATTEMPTS = 3;

export type { CompleteOnboardingInput };

export interface UseCompleteOnboardingOptions {
  /** Fired after the completion write succeeds (navigate to the dashboard here). */
  onSuccess: () => void;
  /** Fired after every retry is exhausted (e.g. to hide the screen loader). */
  onError?: () => void;
}

/**
 * Drives the onboarding **Family (Step 3) Finish** — the completion commit point.
 * Calls the client-side `completeOnboarding` with the collected family members;
 * it uploads their avatars and stamps `onboarding_completed_at`. Retries
 * transient faults up to {@link MAX_COMPLETE_ATTEMPTS}; every failure here is a
 * system fault (there are no user-fixable errors in onboarding), so the surfaced
 * message is generic. A `no_session` fault is not retried.
 *
 * On success it **clears the cached completion gate** (`resetOnboardingStatus`)
 * so `/welcome` re-reads the freshly-stamped completion instead of the cached
 * `false` and does not bounce the user back. `isCompleting` is intentionally
 * left `true`: the caller navigates away and the full-screen loader should
 * persist until the route unmounts.
 */
export function useCompleteOnboarding({ onSuccess, onError }: UseCompleteOnboardingOptions) {
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const complete = useCallback(
    async (input: CompleteOnboardingInput) => {
      setIsCompleting(true);
      setError(null);

      for (let attempt = 0; attempt < MAX_COMPLETE_ATTEMPTS; attempt++) {
        try {
          await completeOnboarding(input);
          resetOnboardingStatus(queryClient);
          // Leave isCompleting true — onSuccess navigates and the loader rides
          // the transition until this route unmounts.
          onSuccessRef.current();
          return;
        } catch (cause) {
          if (cause instanceof Error && cause.message === "no_session") break;
        }
      }

      setIsCompleting(false);
      setError("We couldn't finish setting up your account. Please try again.");
      onErrorRef.current?.();
    },
    [queryClient],
  );

  return { complete, isCompleting, error };
}
