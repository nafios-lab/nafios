// Connection factories — the only sanctioned way to construct a Supabase
// client in the monorepo.

// Re-exported provider types. Feature packages (auth-core, database, …) import
// these from here rather than from `@supabase/*` directly, so this stays the
// single package that depends on the Supabase SDK.
export type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";
export { createBrowserClient, createServerClient } from "./client";
// Connection types
export type { CookieAdapter, CookieOptions } from "./types";
