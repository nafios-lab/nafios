import type { AuthError as SupaAuthError } from "@nafios/supabase-core";
import type { AuthError, AuthSession, AuthUser } from "../types";

type SupaUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  created_at: string;
};

type SupaSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupaUser;
};

export function mapUser(user: SupaUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    emailConfirmedAt: user.email_confirmed_at ?? undefined,
    createdAt: user.created_at,
  };
}

export function mapSession(session: SupaSession): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: mapUser(session.user),
  };
}

export function mapError(error: SupaAuthError): AuthError {
  return {
    message: error.message,
    code: error.code,
  };
}
