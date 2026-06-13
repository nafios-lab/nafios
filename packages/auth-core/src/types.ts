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
 * Discriminated result union for all auth operations.
 * On success `error` is `null`; on failure `data` is `null`.
 */
export type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthError };

/* ------------------------------------------------------------------ */
/*  Cookie adapter (server client)                                    */
/* ------------------------------------------------------------------ */

export type CookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

/**
 * Framework-agnostic cookie adapter. The consuming app implements this
 * using its framework's cookie API (e.g. TanStack Start headers).
 */
export type CookieAdapter = {
  getAll: () =>
    | { name: string; value: string }[]
    | null
    | Promise<{ name: string; value: string }[] | null>;
  setAll: (
    cookies: { name: string; value: string; options: CookieOptions }[],
  ) => void | Promise<void>;
};
