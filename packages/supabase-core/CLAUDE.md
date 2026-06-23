# @nafios/supabase-core

The connection foundation for everything Supabase in NafiOS. This is the **only**
package allowed to depend on `@supabase/*`. Every other Supabase-backed feature
package (`@nafios/auth-core`, `@nafios/database`, and future storage/realtime/
edge-function packages) gets its client from here and layers its own
abstraction on top.

## What this package does

- **Client construction:** `createServerClient(cookies)` for SSR / server
  functions, `createBrowserClient()` for browser-side code, and
  `createServiceRoleClient()` for privileged session-less server work. All
  return the raw `SupabaseClient` — no wrapping, no schema typing.
- **Env/config:** reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` (anon clients) or
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (service-role); throws
  synchronously if a required var is missing.
- **Connection types:** `CookieAdapter`, `CookieOptions`.
- **Provider type re-exports:** `SupabaseClient`, `AuthError`, `User` — so
  consumers never import from `@supabase/*` directly.

## Public API surface

All public exports live in `src/index.ts` (the barrel):

- `createServerClient(cookies)` / `createBrowserClient()` — connection factories
- Type exports: `CookieAdapter`, `CookieOptions`
- Re-exported provider types: `SupabaseClient`, `AuthError`, `User`

## Invariants

1. `@supabase/ssr` and `@supabase/supabase-js` are dependencies of **this
   package only**. No other workspace may depend on them directly — they import
   the re-exported types from here instead.
2. Client construction throws synchronously if env vars are missing.
3. This package is connection-only: no auth logic, no schema types, no data
   access. Those live in feature packages built on top of it.
4. No build step — consumed as TypeScript source (ADR-0006).

## Non-obvious gotchas

- **Returns the raw, untyped client by design.** Schema typing
  (`SupabaseClient<Database>`) is applied by `@nafios/database`, not here —
  `@supabase/ssr@0.6.x` emits an older `SupabaseClient` generic shape than the
  installed `@supabase/supabase-js`, so passing `<Database>` to the ssr factory
  produces an incompatible type. Keep this package generic; type at the
  consumer boundary.
- **Browser env:** for Vite-based apps, `SUPABASE_URL` / `SUPABASE_ANON_KEY`
  need bundler-level exposure.

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts        # barrel — public exports only
  client.ts       # createServerClient, createBrowserClient (raw client)
  types.ts        # CookieAdapter, CookieOptions
tests/unit/       # bun:test unit tests
spec.md           # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
