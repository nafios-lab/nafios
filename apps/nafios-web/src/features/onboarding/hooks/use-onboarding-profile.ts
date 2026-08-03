import { useCallback, useRef, useState } from "react";
import { type SaveProfileInput, saveProfile as saveProfileData } from "../lib/onboarding-data";

/** How many times to attempt the Step-2 write before giving up (system faults). */
const MAX_PROFILE_ATTEMPTS = 3;

export type { SaveProfileInput };

export interface UseOnboardingProfileOptions {
  /** Fired after the profile write succeeds (advance the wizard here). */
  onSuccess: () => void;
}

/**
 * Drives the onboarding **Profile (Step 2) Save**. Calls the client-side
 * `saveProfile` with both optional fields; it skips whichever is empty. Retries
 * transient faults up to {@link MAX_PROFILE_ATTEMPTS}; every failure inside
 * onboarding is a system fault (there are no user-fixable errors here — see
 * specs/domain/auth-onboarding/onboarding-flow.md), so the surfaced message is
 * generic. A `no_session` fault is not retried (the route guard owns that case).
 *
 * Skip is **not** handled here: it writes nothing and simply advances the wizard.
 */
export function useOnboardingProfile({ onSuccess }: UseOnboardingProfileOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const saveProfile = useCallback(async (input: SaveProfileInput) => {
    setIsSaving(true);
    setError(null);

    for (let attempt = 0; attempt < MAX_PROFILE_ATTEMPTS; attempt++) {
      try {
        await saveProfileData(input);
        setIsSaving(false);
        onSuccessRef.current();
        return;
      } catch (cause) {
        // Signed out is not retryable; anything else is a transient system fault.
        if (cause instanceof Error && cause.message === "no_session") break;
      }
    }

    setIsSaving(false);
    setError("We couldn't save your profile. Please try again.");
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { saveProfile, isSaving, error, reset };
}
