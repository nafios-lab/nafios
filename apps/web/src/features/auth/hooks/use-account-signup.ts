import type { AuthUser } from "@nafios/auth-core";
import { useCallback, useRef, useState } from "react";
import { signUpFn } from "~/lib/auth-fns";
import type { AccountSignupValues } from "../schemas/signup-schema";

/** Supabase error codes that mean the email is already taken (user-actionable). */
const DUPLICATE_EMAIL_CODES = new Set(["user_already_exists", "email_exists"]);

/**
 * Why account signup failed. The FE has already validated all user input by this point,
 * so the only *user-actionable* failure left is an email that is already registered - everything
 * else is a system fault (a bug or an infrastructure blip), not something the user can fix by editing the form
 */
export type AccountSignupErrorKind = "user" | "system";

export class AccountSignupError extends Error {
  readonly kind: AccountSignupErrorKind;

  constructor(message: string, kind: AccountSignupErrorKind) {
    super(message);
    this.name = "AccountSignError";
    this.kind = kind;
  }
}

export interface AccountSignupResult {
  /** The newly created user, or `null` when email confirmation is pending.But for now
   * we expect user not to be NULL because email confirmation flow is omitted
   */
  user: AuthUser | null;
}

export interface UseAccountSignupOptions {
  /** Fired after the account is successfully created */
  onSuccess?: (result: AccountSignupResult) => void;
}

type AccountSignupFormPayload = Omit<AccountSignupValues, "confirmPassword">;

export function useAccountSignup(options: UseAccountSignupOptions) {
  const [isLoading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<AccountSignupError | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const signupUser = useCallback(async (data: AccountSignupFormPayload) => {
    setLoading(true);
    setError(null);

    try {
      const signupResp = await signUpFn({
        data,
      });

      if (!signupResp.ok) {
        // The only user-fixable auth failure is a duplicate email; everything
        // else from signup is a system fault
        const kind =
          signupResp.code && DUPLICATE_EMAIL_CODES.has(signupResp.code) ? "user" : "system";

        throw new AccountSignupError(
          kind === "user"
            ? "That email is already registered. Edit it, or sign in instead."
            : signupResp.message,
          kind,
        );
      }

      optionsRef.current.onSuccess?.({ user: signupResp.user });
    } catch (cause) {
      // AccountCreationError is already classified; anything else (network,
      // exhausted retries, unexpected throw) is an unrecoverable system fault.
      const normalized =
        cause instanceof AccountSignupError
          ? cause
          : new AccountSignupError(
              cause instanceof Error ? cause.message : "Failed to create account",
              "system",
            );
      setError(normalized);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { signupUser, isLoading, error, reset };
}
