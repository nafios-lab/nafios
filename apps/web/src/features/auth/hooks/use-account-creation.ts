import type { AuthUser } from "@nafios/auth-core";
import { useCallback, useRef, useState } from "react";
import { signUpFn } from "~/lib/auth-fns";
import type { SignupWizardData } from "../schemas/signup-schema";

/** Outcome handed to `onSuccess` once the account is created. */
export interface AccountCreationResult {
  /** The newly created user, or `null` when email confirmation is pending. */
  user: AuthUser | null;
}

export interface UseAccountCreationOptions {
  /** Fired after the account is successfully created. */
  onSuccess?: (result: AccountCreationResult) => void;
  /** Fired when account creation fails for any reason. */
  onError?: (error: Error) => void;
}

export interface UseAccountCreation {
  /** Create the account from the collected signup wizard data. */
  createAccount: (data: Pick<SignupWizardData, "account" | "security">) => Promise<void>;
  /** Whether a creation request is currently in flight. */
  isLoading: boolean;
  /** The last error thrown by `createAccount`, or `null`. */
  error: Error | null;
  /** Clear the current error state. */
  reset: () => void;
}

/**
 * Encapsulates the account-creation server call: manages the in-flight
 * (`isLoading`) and `error` state, and forwards the outcome to `onSuccess` /
 * `onError`. Callbacks are read from a ref so `createAccount` stays referentially
 * stable even when callers pass inline closures.
 */
export function useAccountCreation(options: UseAccountCreationOptions = {}): UseAccountCreation {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const createAccount = useCallback(
    async (data: Pick<SignupWizardData, "account" | "security">) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await signUpFn({
          data: {
            email: data.account.email,
            password: data.security.password,
          },
        });
        optionsRef.current.onSuccess?.(result);
      } catch (cause) {
        const normalized = cause instanceof Error ? cause : new Error("Failed to create account");
        setError(normalized);
        optionsRef.current.onError?.(normalized);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => setError(null), []);

  return { createAccount, isLoading, error, reset };
}
