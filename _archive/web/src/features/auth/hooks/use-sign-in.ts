import type { AuthUser } from "@nafios/auth-core";
import { useCallback, useRef, useState } from "react";
import { signInFn } from "~/lib/auth-fns";

/**
 * Supabase error codes that mean the credentials didn't match (user-actionable).
 * Email confirmation is disabled on staging, so `invalid_credentials` is the
 * realistic sign-in failure; `invalid_grant` is the older GoTrue alias.
 */
const INVALID_CREDENTIAL_CODES = new Set(["invalid_credentials", "invalid_grant"]);

/**
 * Why sign-in failed. `"user"` is recoverable inline (wrong email/password);
 * `"system"` is an unrecoverable server/infra fault, not something the user can
 * fix by editing the form. Mirrors `useAccountCreation`'s error model.
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
 * Encapsulates the sign-in server call: manages the in-flight (`isLoading`) and
 * `error` state, classifies the outcome, and forwards it to `onSuccess` /
 * `onError`. Wrong credentials surface as a `"user"` error (recoverable inline);
 * anything else is a `"system"` fault. Callbacks are read from a ref so `signIn`
 * stays referentially stable even when callers pass inline closures.
 */
export function useSignIn(options: UseSignInOptions = {}): UseSignIn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const signIn = useCallback(async (credentials: SignInCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInFn({ data: credentials });
      if (!result.ok) {
        // Don't reveal which half was wrong — anti-enumeration. Anything that
        // isn't a credential mismatch is a system fault the user can't fix.
        const isCredentialError = result.code && INVALID_CREDENTIAL_CODES.has(result.code);
        throw new SignInError(
          isCredentialError ? "Incorrect email or password." : result.message,
          isCredentialError ? "user" : "system",
        );
      }
      optionsRef.current.onSuccess?.(result.user);
    } catch (cause) {
      const normalized =
        cause instanceof SignInError
          ? cause
          : new SignInError(cause instanceof Error ? cause.message : "Failed to sign in", "system");
      setError(normalized);
      optionsRef.current.onError?.(normalized);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { signIn, isLoading, error, reset };
}
