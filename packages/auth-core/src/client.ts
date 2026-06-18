import {
  type CookieAdapter,
  createBrowserClient as createSbBrowserClient,
  createServerClient as createSbServerClient,
} from "@nafios/supabase-core";
import { wrapClient } from "./internal/unwrap";
import type { AuthClient } from "./types";

/**
 * Creates an auth client for server-side use (SSR, server functions).
 * The caller provides a `CookieAdapter` that bridges the framework's
 * cookie API with Supabase's session cookie management.
 *
 * The underlying connection comes from `@nafios/supabase-core`; this package
 * wraps it into an opaque `AuthClient` that exposes only auth operations.
 */
export function createServerClient(cookies: CookieAdapter): AuthClient {
  return wrapClient(createSbServerClient(cookies));
}

/**
 * Creates an auth client for browser-side use. Cookie management is
 * handled automatically by the browser.
 */
export function createBrowserClient(): AuthClient {
  return wrapClient(createSbBrowserClient());
}
