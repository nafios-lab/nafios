import { type AuthUser, signInWithPassword } from "@nafios/auth-core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { getAuthClient, invalidateSession } from "~/lib/auth";

/**
 * Supabase error codes that mean the credentials didn't match (user-actionable).
 * Email confirmation is disabled on staging, so `invalid_credentials` is the
 * realistic sign-in failure; `invalid_grant` is the older GoTrue alias.
 */
const INVALID_CREDENTIAL_CODES = new Set(["invalid_credentials", "invalid_grant"]);

/**
 * Why sign-in failed. `"user"` is recoverable inline (wrong email/password);
 * `"system"` is an unrecoverable server/infra fault, not something the user can
 * fix by editing the form. Mirrors `useAccountSignup`'s error model.
 */
export type SignInErrorKind = "user" | "system";

/** Error carrying the {@link SignInErrorKind} so callers can route on it. */
export class SignInError extends Error {
  readonly kind: SignInErrorKind;
  constructor(message: string, kind: SignInErrorKind) {
    super(message);
    this.name = "SignInError";
    this.kind = kind;
  }
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface UseSignInOptions {
  /** Fired after a successful sign-in, with the authenticated user. */
  onSuccess?: (user: AuthUser) => void;
  /** Fired when sign-in fails. Inspect `error.kind` to route the outcome. */
  onError?: (error: SignInError) => void;
}

export interface UseSignIn {
  /** Sign in with the given credentials. */
  signIn: (credentials: SignInCredentials) => Promise<void>;
  /** Whether a sign-in request is currently in flight. */
  isLoading: boolean;
  /** The last error from `signIn`, or `null`. */
  error: SignInError | null;
  /** Clear the current error state. */
  reset: () => void;
}

/**
 * Encapsulates the sign-in call: manages the in-flight (`isLoading`) and `error`
 * state, classifies the outcome, and forwards it to `onSuccess` / `onError`.
 * Signs in **directly** against the Supabase browser client (no server fn) — the
 * client persists the new session in the browser; we then invalidate the cached
 * `['session']` query so route guards observe it on the next navigation. Wrong
 * credentials surface as a `"user"` error (recoverable inline); anything else is
 * a `"system"` fault. Callbacks are read from a ref so `signIn` stays
 * referentially stable even when callers pass inline closures.
 */
export function useSignIn(options: UseSignInOptions = {}): UseSignIn {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const signIn = useCallback(
    async (credentials: SignInCredentials) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await signInWithPassword(getAuthClient(), credentials);
        if (result.error) {
          // Don't reveal which half was wrong — anti-enumeration. Anything that
          // isn't a credential mismatch is a system fault the user can't fix.
          const isCredentialError =
            result.error.code && INVALID_CREDENTIAL_CODES.has(result.error.code);
          throw new SignInError(
            isCredentialError ? "Incorrect email or password." : result.error.message,
            isCredentialError ? "user" : "system",
          );
        }
        // The browser client persisted the session; refresh the cached
        // ['session'] so the redirect target's beforeLoad sees it.
        await invalidateSession(queryClient);
        optionsRef.current.onSuccess?.(result.data.user);
      } catch (cause) {
        const normalized =
          cause instanceof SignInError
            ? cause
            : new SignInError(
                cause instanceof Error ? cause.message : "Failed to sign in",
                "system",
              );
        setError(normalized);
        optionsRef.current.onError?.(normalized);
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient],
  );

  const reset = useCallback(() => setError(null), []);

  return { signIn, isLoading, error, reset };
}
