import { useCallback, useRef, useState } from "react";
import { type CompleteOnboardingInput, completeOnboardingFn } from "~/lib/onboarding-fns";

/** How many times to attempt the final write before giving up (system faults). */
const MAX_COMPLETE_ATTEMPTS = 3;

/** Result codes the server returns that are NOT worth retrying. */
const NON_RETRYABLE = new Set(["no_session"]);

export interface UseCompleteOnboardingOptions {
  /** Fired after the completion write succeeds (navigate to the dashboard here). */
  onSuccess: () => void;
  /** Fired after every retry is exhausted (e.g. to hide the screen loader). */
  onError?: () => void;
}

/**
 * Drives the onboarding **Family (Step 3) Finish** — the completion commit point.
 * Calls `completeOnboardingFn` with the collected family members; the server
 * uploads their avatars and stamps `onboarding_completed_at`. Retries `system`
 * faults up to {@link MAX_COMPLETE_ATTEMPTS}; every failure here is a system fault
 * (there are no user-fixable errors in onboarding — see
 * specs/domain/onboarding-flow.md), so the surfaced message is generic.
 *
 * On success `isCompleting` is intentionally left `true`: the caller navigates
 * away and the full-screen loader should persist until the route unmounts, so we
 * never flip back to the idle state.
 */
export function useCompleteOnboarding({ onSuccess, onError }: UseCompleteOnboardingOptions) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const complete = useCallback(async (input: CompleteOnboardingInput) => {
    setIsCompleting(true);
    setError(null);

    for (let attempt = 0; attempt < MAX_COMPLETE_ATTEMPTS; attempt++) {
      try {
        const result = await completeOnboardingFn({ data: input });
        if (result.ok) {
          // Leave isCompleting true — onSuccess navigates and the loader rides
          // the transition until this route unmounts.
          onSuccessRef.current();
          return;
        }
        if (NON_RETRYABLE.has(result.code)) break;
      } catch {
        // Network / unexpected throw — fall through to the next attempt.
      }
    }

    setIsCompleting(false);
    setError("We couldn't finish setting up your account. Please try again.");
    onErrorRef.current?.();
  }, []);

  return { complete, isCompleting, error };
}
