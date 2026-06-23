import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a privileged, **session-less** Supabase client authenticated with the
 * service-role key. It **bypasses RLS** and carries no user identity, so it is
 * strictly SERVER-ONLY — never import it where a browser bundle can reach it,
 * and never derive authorization from it (authz is enforced at the app layer,
 * ADR-0019).
 *
 * Uses `createClient` from `@supabase/supabase-js` directly — not the
 * `@supabase/ssr` cookie client — because this is a stateless service
 * connection, not a per-request user session: no cookies, no session
 * persistence, no token refresh.
 *
 * Intended consumer: `@nafios/storage` (avatar uploads), where the server
 * function has already verified the session and owns the object path. Reads
 * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; throws synchronously if
 * either is missing (a startup-time misconfiguration, not a runtime error).
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: SUPABASE_URL");
  if (!key) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
