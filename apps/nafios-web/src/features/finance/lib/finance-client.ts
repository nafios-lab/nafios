import { createBrowserClient, type FinanceClient } from "@nafios/finance";

// The finance browser client (ADR-0026): Finance reads/writes its own data
// directly from the browser via a Supabase browser client, governed by TanStack
// Query. Always through `@nafios/finance` — never raw `@supabase/*`. This is a
// separate Supabase client from the shell's data client (`getDb`) and the auth
// client (`getAuthClient`), but all three read the same browser-persisted
// session, so `auth.uid()` resolves and the owner-isolation RLS policies apply.

let client: FinanceClient | undefined;

/**
 * The app's single finance browser client, built lazily on first use.
 *
 * Lazy (not module scope) because `createBrowserClient` reads the Vite-inlined
 * anon env at call time and — via `@supabase/ssr` — touches browser storage;
 * constructing it at import time would run before that is ready. Queries never
 * execute at import time, so the first `queryFn` call is the earliest this runs.
 * Memoized → one finance client per app, reused across queries.
 */
export function getFinanceClient(): FinanceClient {
  client ??= createBrowserClient();
  return client;
}
