import { signOut as signOutOp } from "@nafios/auth-core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { getAuthClient, invalidateSession } from "~/lib/auth";

export interface UseSignOutOptions {
  /** Fired after the session has been cleared (e.g. to navigate to login). */
  onSuccess?: () => void;
}

export interface UseSignOut {
  /** Sign the current user out and clear the cached session. */
  signOut: () => Promise<void>;
  /** Whether a sign-out request is currently in flight. */
  isLoading: boolean;
}

/**
 * Signs the user out directly against the Supabase browser client (no server
 * fn), then invalidates the cached `['session']` query so guards re-evaluate as
 * signed-out. The session is dropped regardless of the revoke result — a failed
 * server-side revoke must not strand the user inside the app with a client that
 * believes it is authenticated.
 */
export function useSignOut(options: UseSignOutOptions = {}): UseSignOut {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await signOutOp(getAuthClient());
      await invalidateSession(queryClient);
      optionsRef.current.onSuccess?.();
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  return { signOut, isLoading };
}
