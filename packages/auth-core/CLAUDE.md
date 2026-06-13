# @nafios/auth-core

Wraps Supabase Auth behind a provider-agnostic API. Every auth operation in the
monorepo goes through this package — `apps/web` must never import `@supabase/*`
directly.

## What this package does

- **Client construction:** `createServerClient(cookies)` for SSR / server
  functions, `createBrowserClient()` for browser-side code.
- **Auth operations:** `signUp`, `signInWithPassword`, `signOut`, `getSession`,
  `getUser`, `resetPasswordForEmail`, `updatePassword`.
- **Type abstraction:** `AuthClient` is opaque. `AuthUser`, `AuthSession`,
  `AuthError`, `AuthResult` are provider-agnostic.

## Public API surface

All public exports live in `src/index.ts` (the barrel):

- `createServerClient(cookies)` / `createBrowserClient()` — client factories
- `signUp`, `signInWithPassword`, `signOut` — auth lifecycle
- `getSession`, `getUser` — session inspection
- `resetPasswordForEmail`, `updatePassword` — password recovery
- Type exports: `AuthClient`, `AuthUser`, `AuthSession`, `AuthError`,
  `AuthResult`, `CookieAdapter`, `CookieOptions`

## Invariants

1. `@supabase/supabase-js` and `@supabase/ssr` are dependencies of **this
   package only**. No other workspace may depend on them.
2. Nothing under `src/internal/` is re-exported from the barrel.
3. `AuthClient` is branded/opaque — consumers cannot call Supabase methods.
4. All auth operations return `AuthResult<T>` (`{ data, error }` union).
5. Domain types use camelCase, not the provider's snake_case.

## Non-obvious gotchas

- **Env vars required:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` must be set.
  Client construction throws synchronously if they're missing.
- **Browser env:** For Vite-based apps, these vars need bundler-level exposure
  (e.g., Vite's `define` config or `VITE_` prefix).
- **No build step.** Consumed as TypeScript source via workspace resolution
  (ADR-0006).

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts              # barrel — public exports only
  types.ts              # public types (AuthClient, AuthUser, etc.)
  client.ts             # createServerClient, createBrowserClient
  auth.ts               # auth operation wrappers
  internal/
    unwrap.ts           # AuthClient ↔ SupabaseClient conversion
    mappers.ts          # Supabase types → domain types
tests/unit/             # bun:test unit tests
spec.md                 # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
