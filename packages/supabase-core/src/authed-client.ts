import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a **session-less** anon-key client with a per-request JWT attached via
 * a global `Authorization: Bearer <token>` header — the documented Supabase
 * per-request pattern. With the JWT attached, `auth.uid()` resolves and **RLS
 * applies**, so the client runs as the request user.
 *
 * Uses `createClient` from `@supabase/supabase-js` directly (like
 * `createServiceRoleClient`), not the `@supabase/ssr` cookie client: the token
 * is supplied per request, so no session is persisted and no token is
 * auto-refreshed.
 *
 * Returns the **untyped** client — schema typing (`SupabaseClient<Database>`) is
 * applied downstream by `@nafios/database`'s `asDb`. The anon key alone grants
 * no access; the JWT is what authorizes the request. Reads `SUPABASE_URL` and
 * `SUPABASE_ANON_KEY`; throws synchronously if either is missing.
 */
export function createAuthedClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env: SUPABASE_URL");
  if (!key) throw new Error("Missing env: SUPABASE_ANON_KEY");

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
