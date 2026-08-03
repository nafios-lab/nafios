import { type AuthSession, createBrowserClient, getSession } from "@nafios/auth-core";
import { type QueryClient, queryOptions } from "@tanstack/react-query";

type BrowserAuthClient = ReturnType<typeof createBrowserClient>;

let client: BrowserAuthClient | null = null;

/**
 * The browser auth client, constructed lazily and shared process-wide. One
 * connection backs every auth op and the session query. Lazy because
 * `createBrowserClient()` reads the Vite-inlined anon env at call time and
 * throws if it is absent — deferring construction keeps this module's import
 * side-effect-free (tests and tree-shaking don't pay for a client they may
 * never touch).
 */
export function getAuthClient(): BrowserAuthClient {
  client ??= createBrowserClient();
  return client;
}

/**
 * Query key for the current Supabase session — the single source of truth every
 * route guard reads and every auth mutation invalidates.
 */
export const sessionQueryKey = ["session"] as const;

/**
 * TanStack Query options for the current session. `getSession` reads the
 * browser-persisted session (refreshing the access token when needed); we
 * normalize auth-core's result to `AuthSession | null`. Route guards await
 * `context.queryClient.ensureQueryData(sessionQueryOptions)`; sign-in / sign-up /
 * sign-out invalidate `sessionQueryKey` so the next read reflects the change.
 */
export const sessionQueryOptions = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: async (): Promise<AuthSession | null> => {
    const result = await getSession(getAuthClient());
    return result.error ? null : result.data.session;
  },
});

/**
 * Reset the cached session after an auth change so the next guard re-reads it
 * fresh from the client.
 *
 * This must **remove** the entry — not `invalidateQueries` it. Route guards read
 * the session with `ensureQueryData`, which returns cached data whenever it is
 * present, even after invalidation (invalidation only marks it stale and, at
 * most, background-revalidates with `revalidateIfStale`). So an invalidated
 * `null` would still be returned synchronously and bounce a just-signed-in user
 * straight back to `/auth/login`. Removing the entry forces `ensureQueryData` to
 * refetch `getSession` on the next navigation.
 */
export function invalidateSession(queryClient: QueryClient): Promise<void> {
  queryClient.removeQueries({ queryKey: sessionQueryKey });
  return Promise.resolve();
}
