import {
  createBrowserClient as createSupaBrowserClient,
  createServerClient as createSupaServerClient,
} from "@supabase/ssr";
import { wrapClient } from "./internal/unwrap";
import type { AuthClient, CookieAdapter } from "./types";

function getConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env: SUPABASE_URL");
  if (!key) throw new Error("Missing env: SUPABASE_ANON_KEY");

  return { url, key };
}

/**
 * Creates an auth client for server-side use (SSR, server functions).
 * The caller provides a `CookieAdapter` that bridges the framework's
 * cookie API with Supabase's session cookie management.
 */
export function createServerClient(cookies: CookieAdapter): AuthClient {
  const { url, key } = getConfig();

  const client = createSupaServerClient(url, key, {
    cookies: {
      getAll: cookies.getAll,
      setAll: cookies.setAll,
    },
  });

  return wrapClient(client);
}

/**
 * Creates an auth client for browser-side use. Cookie management
 * is handled automatically by the browser.
 */
export function createBrowserClient(): AuthClient {
  const { url, key } = getConfig();
  const client = createSupaBrowserClient(url, key);
  return wrapClient(client);
}
