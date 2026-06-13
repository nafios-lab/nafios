---
title: "@nafios/auth-core"
status: active
version: 1.0.0
updated: 2026-06-13
owner: Hanafi
related_adrs: [0006, 0008, 0012, 0016, 0018, 0019]
---

# @nafios/auth-core — Specification

## Purpose

Wrap Supabase Auth behind a provider-agnostic abstraction so that every auth
operation in the NafiOS monorepo flows through a single package. If the auth
provider changes, only this package needs updating — consumers stay untouched.

## Scope

**In:** Client construction (server + browser), email/password auth operations
(sign up, sign in, sign out, session checks, password reset), and the types
that describe them.

**Out:** UI components, profile/data operations, social/OAuth providers, 2FA/MFA,
real-time subscriptions, and direct Supabase data-access calls.

## Key Constraint

`@supabase/supabase-js` and `@supabase/ssr` are dependencies of this package
**only**. No other workspace package or app may import them directly.

## Public API

### Client Construction

```ts
import type { CookieAdapter } from "@nafios/auth-core";

/**
 * Creates a server-side auth client. The CookieAdapter bridges the
 * framework's cookie API with session cookie management.
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env.
 */
function createServerClient(cookies: CookieAdapter): AuthClient;

/**
 * Creates a browser-side auth client. Cookie management is automatic.
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env.
 */
function createBrowserClient(): AuthClient;
```

### Auth Operations

All operations take an `AuthClient` as the first parameter and return
`Promise<AuthResult<T>>`.

```ts
function signUp(
  client: AuthClient,
  params: { email: string; password: string },
): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>>;

function signInWithPassword(
  client: AuthClient,
  params: { email: string; password: string },
): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>>;

function signOut(client: AuthClient): Promise<AuthResult<null>>;

function getSession(
  client: AuthClient,
): Promise<AuthResult<{ session: AuthSession | null }>>;

function getUser(
  client: AuthClient,
): Promise<AuthResult<{ user: AuthUser }>>;

function resetPasswordForEmail(
  client: AuthClient,
  email: string,
): Promise<AuthResult<null>>;

function updatePassword(
  client: AuthClient,
  newPassword: string,
): Promise<AuthResult<{ user: AuthUser }>>;
```

### Types

```ts
/** Opaque handle — obtain via createServerClient / createBrowserClient. */
type AuthClient = { readonly [brand]: "AuthClient" };

type AuthUser = {
  id: string;
  email: string | undefined;
  emailConfirmedAt: string | undefined;
  createdAt: string;
};

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | undefined;
  user: AuthUser;
};

type AuthError = {
  message: string;
  code?: string;
};

type AuthResult<T> =
  | { data: T; error: null }
  | { data: null; error: AuthError };

type CookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

type CookieAdapter = {
  getAll: () =>
    | { name: string; value: string }[]
    | null
    | Promise<{ name: string; value: string }[] | null>;
  setAll: (
    cookies: { name: string; value: string; options: CookieOptions }[],
  ) => void | Promise<void>;
};
```

## Error Handling

All operations return `AuthResult<T>` — a discriminated union where:
- On success: `{ data: T, error: null }`
- On failure: `{ data: null, error: AuthError }`

Client construction (`createServerClient`, `createBrowserClient`) throws
synchronously if required env vars are missing. This is a startup-time
failure, not a runtime auth error.

## Environment Variables

| Variable             | Required by        | Description                    |
|----------------------|--------------------|--------------------------------|
| `SUPABASE_URL`       | Both clients       | Supabase project API URL       |
| `SUPABASE_ANON_KEY`  | Both clients       | Supabase anon (public) API key |

## Invariants

1. The barrel (`src/index.ts`) exports only the public API. Nothing from
   `src/internal/` is re-exported.
2. `AuthClient` is opaque — consumers cannot call underlying SDK methods.
3. Domain types (`AuthUser`, `AuthSession`) use camelCase field names,
   insulating consumers from the provider's naming conventions.
4. No build step — consumed as TypeScript source (ADR-0006).

## Open Questions

- Should `verifyOtp` / `exchangeCodeForSession` be added? Deferred until
  the email confirmation flow (D1) reveals the exact need.
- Browser-side env var access: consumers using Vite must expose
  `SUPABASE_URL` and `SUPABASE_ANON_KEY` via their bundler config or
  pass them explicitly. This may motivate optional config params in a
  future revision.
