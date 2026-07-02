// Connection factories — the only sanctioned way to construct a Supabase
// client in the monorepo.

// Re-exported provider types. Feature packages (auth-core, database, …) import
// these from here rather than from `@supabase/*` directly, so this stays the
// single package that depends on the Supabase SDK.
export type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";
// Session-less anon-key client with a per-request JWT attached — auth.uid()
// resolves and RLS applies. Consumed by feature packages (e.g. @nafios/finance)
// via asDb. See authed-client.ts and spec.md.
export { createAuthedClient } from "./authed-client";
export { createBrowserClient, createServerClient } from "./client";
// Privileged, session-less server client (service-role key). SERVER-ONLY —
// bypasses RLS. See service-role-client.ts and spec.md.
export { createServiceRoleClient } from "./service-role-client";
// Connection types
export type { CookieAdapter, CookieOptions } from "./types";
