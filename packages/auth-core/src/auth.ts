import { mapError, mapSession, mapUser } from "./internal/mappers";
import { unwrapClient } from "./internal/unwrap";
import type { AuthClient, AuthResult, AuthSession, AuthUser } from "./types";

/**
 * Registers a new user with email and password.
 * If email confirmation is enabled, `session` will be `null` until confirmed.
 */
export async function signUp(
  client: AuthClient,
  params: { email: string; password: string },
): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>> {
  const { data, error } = await unwrapClient(client).auth.signUp({
    email: params.email,
    password: params.password,
  });

  if (error) return { data: null, error: mapError(error) };

  return {
    data: {
      user: data.user ? mapUser(data.user) : null,
      session: data.session ? mapSession(data.session) : null,
    },
    error: null,
  };
}

/**
 * Signs in a user with email and password.
 */
export async function signInWithPassword(
  client: AuthClient,
  params: { email: string; password: string },
): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>> {
  const { data, error } = await unwrapClient(client).auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });

  if (error) return { data: null, error: mapError(error) };

  return {
    data: {
      user: mapUser(data.user),
      session: mapSession(data.session),
    },
    error: null,
  };
}

/**
 * Signs out the current user and clears the session.
 */
export async function signOut(client: AuthClient): Promise<AuthResult<null>> {
  const { error } = await unwrapClient(client).auth.signOut();

  if (error) return { data: null, error: mapError(error) };

  return { data: null, error: null };
}

/**
 * Returns the current session, or `null` if no session exists.
 */
export async function getSession(
  client: AuthClient,
): Promise<AuthResult<{ session: AuthSession | null }>> {
  const { data, error } = await unwrapClient(client).auth.getSession();

  if (error) return { data: null, error: mapError(error) };

  return {
    data: {
      session: data.session ? mapSession(data.session) : null,
    },
    error: null,
  };
}

/**
 * Returns the current user by validating the JWT with the server.
 * Prefer this over reading the user from the session for security-sensitive operations.
 */
export async function getUser(client: AuthClient): Promise<AuthResult<{ user: AuthUser }>> {
  const { data, error } = await unwrapClient(client).auth.getUser();

  if (error) return { data: null, error: mapError(error) };

  return {
    data: { user: mapUser(data.user) },
    error: null,
  };
}

/**
 * Sends a password-reset email to the given address.
 */
export async function resetPasswordForEmail(
  client: AuthClient,
  email: string,
): Promise<AuthResult<null>> {
  const { error } = await unwrapClient(client).auth.resetPasswordForEmail(email);

  if (error) return { data: null, error: mapError(error) };

  return { data: null, error: null };
}

/**
 * Sets a new password for the currently authenticated user.
 * Used on the password-reset page after the user clicks the reset link.
 */
export async function updatePassword(
  client: AuthClient,
  newPassword: string,
): Promise<AuthResult<{ user: AuthUser }>> {
  const { data, error } = await unwrapClient(client).auth.updateUser({
    password: newPassword,
  });

  if (error) return { data: null, error: mapError(error) };

  return {
    data: { user: mapUser(data.user) },
    error: null,
  };
}
