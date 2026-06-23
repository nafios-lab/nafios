/**
 * Public types for @nafios/auth-core.
 *
 * These types are provider-agnostic — if the underlying auth provider changes,
 * consumers of this package should not need to update their code.
 */

/* ------------------------------------------------------------------ */
/*  AuthClient (opaque)                                               */
/* ------------------------------------------------------------------ */

declare const brand: unique symbol;

/**
 * Opaque handle to an auth-capable client. Obtain one via
 * `createServerClient` or `createBrowserClient`, then pass it
 * to auth operation functions.
 */
export type AuthClient = { readonly [brand]: "AuthClient" };

/* ------------------------------------------------------------------ */
/*  Domain types                                                      */
/* ------------------------------------------------------------------ */

export type AuthUser = {
  id: string;
  email: string | undefined;
  emailConfirmedAt: string | undefined;
  createdAt: string;
  /**
   * The mobile number from `user_metadata.mobile` (a formatted display string,
   * stored without SMS verification — see {@link UserMetadata}). `undefined`
   * when never set. Read-only mirror of what `updateUserMetadata` writes.
   */
  mobile: string | undefined;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | undefined;
  user: AuthUser;
};

export type AuthError = {
  message: string;
  code?: string;
};

/**
 * Editable fields on the auth user's `user_metadata`. Provider-agnostic and
 * intentionally narrow — only what NafiOS writes. Today: the onboarding mobile
 * number (a formatted display string, stored without SMS verification).
 */
export type UserMetadata = {
  mobile?: string;
};

/**
 * Discriminated result union for all auth operations.
 * On success `error` is `null`; on failure `data` is `null`.
 */
export type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthError };
