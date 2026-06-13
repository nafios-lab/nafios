// Client construction

// Auth operations
export {
  getSession,
  getUser,
  resetPasswordForEmail,
  signInWithPassword,
  signOut,
  signUp,
  updatePassword,
} from "./auth";
export { createBrowserClient, createServerClient } from "./client";

// Public types
export type {
  AuthClient,
  AuthError,
  AuthResult,
  AuthSession,
  AuthUser,
  CookieAdapter,
  CookieOptions,
} from "./types";
