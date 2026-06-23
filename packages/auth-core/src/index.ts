// Client construction

// Connection types — re-exported from supabase-core so existing consumers can
// keep importing the cookie adapter contract from auth-core unchanged.
export type { CookieAdapter, CookieOptions } from "@nafios/supabase-core";
// Auth operations
export {
  getSession,
  getUser,
  resetPasswordForEmail,
  signInWithPassword,
  signOut,
  signUp,
  updatePassword,
  updateUserMetadata,
} from "./auth";
export { createBrowserClient, createServerClient } from "./client";
// Public types
export type {
  AuthClient,
  AuthError,
  AuthResult,
  AuthSession,
  AuthUser,
  UserMetadata,
} from "./types";
