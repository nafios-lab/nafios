import { createBrowserDb, type Db } from "@nafios/database";

// The shell's browser data client (ADR-0026): shell data (onboarding included)
// reads and writes directly from the browser via a Supabase browser client,
// governed by TanStack Query, with RLS as the security boundary. Always through
// `@nafios/database` — never raw `@supabase/*`.

let db: Db | undefined;

/**
 * The app's single browser data client, built lazily on first use.
 *
 * Lazy (not module scope) because `createBrowserDb` reads the Vite-inlined anon
 * env at call time and — via `@supabase/ssr` — touches browser storage;
 * constructing it at import time would run before that is ready. Memoized → one
 * data client per app, reused across every query/mutation.
 *
 * This is a *separate* Supabase client from the auth client (`getAuthClient`),
 * but both read the same browser-persisted session, so `auth.uid()` resolves and
 * the owner-isolation RLS policies apply to reads, writes, and avatar storage.
 */
export function getDb(): Db {
  db ??= createBrowserDb();
  return db;
}
