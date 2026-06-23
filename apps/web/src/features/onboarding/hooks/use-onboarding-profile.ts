import { useCallback, useRef, useState } from "react";
import { type SaveOnboardingProfileInput, saveOnboardingProfileFn } from "~/lib/onboarding-fns";

/** How many times to attempt the Step-2 write before giving up (system faults). */
const MAX_PROFILE_ATTEMPTS = 3;

/** Result codes the server returns that are NOT worth retrying. */
const NON_RETRYABLE = new Set(["no_session"]);

export interface UseOnboardingProfileOptions {
  /** Fired after the profile write succeeds (advance the wizard here). */
  onSuccess: () => void;
}

/**
 * Drives the onboarding **Profile (Step 2) Save**. Calls `saveOnboardingProfileFn`
 * with both optional fields; the server skips whichever is empty. Retries
 * `system` faults up to {@link MAX_PROFILE_ATTEMPTS}; every failure inside
 * onboarding is a system fault (there are no user-fixable errors here — see
 * specs/domain/onboarding-flow.md), so the surfaced message is generic.
 *
 * Skip is **not** handled here: it writes nothing and simply advances the wizard.
 */
export function useOnboardingProfile({ onSuccess }: UseOnboardingProfileOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const saveProfile = useCallback(async (input: SaveOnboardingProfileInput) => {
    setIsSaving(true);
    setError(null);

    for (let attempt = 0; attempt < MAX_PROFILE_ATTEMPTS; attempt++) {
      try {
        const result = await saveOnboardingProfileFn({ data: input });
        if (result.ok) {
          setIsSaving(false);
          onSuccessRef.current();
          return;
        }
        if (NON_RETRYABLE.has(result.code)) break;
      } catch {
        // Network / unexpected throw — fall through to the next attempt.
      }
    }

    setIsSaving(false);
    setError("We couldn't save your profile. Please try again.");
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { saveProfile, isSaving, error, reset };
}
