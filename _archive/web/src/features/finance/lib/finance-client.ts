import { createBrowserClient, type FinanceClient } from "@nafios/finance";

// The finance browser client (ADR-0026): Finance reads/writes its own data
// directly from the browser via a Supabase browser client, governed by TanStack
// Query. Always through `@nafios/finance` — never raw `@supabase/*`.

let client: FinanceClient | undefined;

/**
 * The app's single finance browser client, built lazily on first use.
 *
 * Lazy (not module scope) because `createBrowserClient` reads env at call time
 * and — via `@supabase/ssr` — touches `document.cookie`; constructing it at
 * import time would run during SSR and break. Queries never execute during SSR,
 * so the first `queryFn` call is the earliest this runs. Memoized → one browser
 * client per app, reused across queries.
 */
export function getFinanceClient(): FinanceClient {
  client ??= createBrowserClient();
  return client;
}
