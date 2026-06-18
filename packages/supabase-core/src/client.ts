import {
  createBrowserClient as createSupaBrowserClient,
  createServerClient as createSupaServerClient,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CookieAdapter } from "./types";

function getConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env: SUPABASE_URL");
  if (!key) throw new Error("Missing env: SUPABASE_ANON_KEY");

  return { url, key };
}

/**
 * Creates a raw Supabase client for server-side use (SSR, server functions).
 * The caller provides a `CookieAdapter` that bridges the framework's cookie
 * API with Supabase's session cookie management.
 *
 * Returns the untyped client. Feature packages (auth-core, database, …) layer
 * their own typing/abstraction on top; this package owns only the connection.
 */
export function createServerClient(cookies: CookieAdapter): SupabaseClient {
  const { url, key } = getConfig();

  return createSupaServerClient(url, key, {
    cookies: {
      getAll: cookies.getAll,
      setAll: cookies.setAll,
    },
  });
}

/**
 * Creates a raw Supabase client for browser-side use. Cookie management is
 * handled automatically by the browser.
 */
export function createBrowserClient(): SupabaseClient {
  const { url, key } = getConfig();
  return createSupaBrowserClient(url, key);
}
