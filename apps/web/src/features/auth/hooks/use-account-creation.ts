/** @deprecated */

import type { AuthUser } from "@nafios/auth-core";
import type { FamilyMemberInput } from "@nafios/database";
import { useCallback, useRef, useState } from "react";
import { signUpFn } from "~/lib/auth-fns";
import { insertUserProfileFn } from "~/lib/onboarding-fns";
import type { FamilyMemberValues, SignupWizardData } from "../schemas/signup-schema";

/** How many times to attempt the profile-persist step before giving up. */
const MAX_PROFILE_ATTEMPTS = 3;

/** Supabase error codes that mean the email is already taken (user-actionable). */
const DUPLICATE_EMAIL_CODES = new Set(["user_already_exists", "email_exists"]);

/**
 * Why account creation failed. The FE has already validated all user input by
 * this point, so the only *user-actionable* failure left is an email that is
 * already registered — everything else is a system fault (a bug or an
 * infrastructure blip), not something the user can fix by editing the form.
 */
export type AccountCreationErrorKind = "user" | "system";

/** Error carrying the {@link AccountCreationErrorKind} so callers can route on it. */
export class AccountCreationError extends Error {
  readonly kind: AccountCreationErrorKind;
  constructor(message: string, kind: AccountCreationErrorKind) {
    super(message);
    this.name = "AccountCreationError";
    this.kind = kind;
  }
}

/** Runs `fn`, retrying up to `attempts` times. Throws the last error if all fail. */
async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** The wizard data needed to create an account: credentials plus family members. */
type CreateAccountData = Pick<SignupWizardData, "account" | "security" | "family">;

/** Maps a wizard family member (camelCase, form field names) to the DB input shape. */
function toFamilyMemberInput(member: FamilyMemberValues): FamilyMemberInput {
  return {
    name: member.name,
    relationship: member.relationship,
    avatarUrl: member.avatar ?? null,
    nric: member.nric ?? null,
    mobileNo: member.mobile ?? null,
    dateOfBirth: member.dateOfBirth ?? null,
  };
}

/** Outcome handed to `onSuccess` once the account is created. */
export interface AccountCreationResult {
  /** The newly created user, or `null` when email confirmation is pending. */
  user: AuthUser | null;
}

export interface UseAccountCreationOptions {
  /** Fired after the account is successfully created. */
  onSuccess?: (result: AccountCreationResult) => void;
  /** Fired when account creation fails. Inspect `error.kind` to route the
   *  outcome: `"user"` is recoverable inline (e.g. duplicate email), `"system"`
   *  is an unrecoverable server fault that should go to a generic error page. */
  onError?: (error: AccountCreationError) => void;
}

export interface UseAccountCreation {
  /** Create the account from the collected signup wizard data. */
  createAccount: (data: CreateAccountData) => Promise<void>;
  /** Whether a creation request is currently in flight. */
  isLoading: boolean;
  /** The last error from `createAccount`, or `null`. */
  error: AccountCreationError | null;
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
  const [error, setError] = useState<AccountCreationError | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const createAccount = useCallback(async (data: CreateAccountData) => {
    setIsLoading(true);
    setError(null);
    try {
      // 1) Create the auth user. With email confirmation disabled this also
      //    establishes the session cookie the next step relies on. signUpFn is
      //    resume-safe: if a session already exists (a prior attempt got this
      //    far), it returns the existing user instead of re-registering.
      const signUp = await signUpFn({
        data: {
          email: data.account.email,
          password: data.security.password,
        },
      });
      if (!signUp.ok) {
        // The only user-fixable auth failure is a duplicate email; everything
        // else from signup is a system fault.
        const kind = signUp.code && DUPLICATE_EMAIL_CODES.has(signUp.code) ? "user" : "system";
        throw new AccountCreationError(
          kind === "user"
            ? "That email is already registered. Edit it, or sign in instead."
            : signUp.message,
          kind,
        );
      }

      // 2) Persist profile + family members. The auth user now exists, so this
      //    step is retried independently — the RPC is idempotent, so retries
      //    can't duplicate rows. Exhausting the retries is a system fault.
      await withRetry(
        () =>
          insertUserProfileFn({
            data: {
              avatarUrl: null,
              familyMembers: data.family.familyMembers.map(toFamilyMemberInput),
            },
          }),
        MAX_PROFILE_ATTEMPTS,
      );

      optionsRef.current.onSuccess?.({ user: signUp.user });
    } catch (cause) {
      // AccountCreationError is already classified; anything else (network,
      // exhausted retries, unexpected throw) is an unrecoverable system fault.
      const normalized =
        cause instanceof AccountCreationError
          ? cause
          : new AccountCreationError(
              cause instanceof Error ? cause.message : "Failed to create account",
              "system",
            );
      setError(normalized);
      optionsRef.current.onError?.(normalized);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { createAccount, isLoading, error, reset };
}
