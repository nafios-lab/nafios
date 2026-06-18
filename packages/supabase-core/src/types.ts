/**
 * Public types for @nafios/supabase-core.
 *
 * These describe how a consuming framework bridges its cookie API with
 * Supabase's session cookie management. They live here — not in auth-core —
 * because cookie handling is a connection concern shared by every Supabase
 * feature (auth, data, storage, realtime), not an auth-specific one.
 */

export type CookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

/**
 * Framework-agnostic cookie adapter. The consuming app implements this
 * using its framework's cookie API (e.g. TanStack Start headers).
 */
export type CookieAdapter = {
  getAll: () =>
    | { name: string; value: string }[]
    | null
    | Promise<{ name: string; value: string }[] | null>;
  setAll: (
    cookies: { name: string; value: string; options: CookieOptions }[],
  ) => void | Promise<void>;
};
