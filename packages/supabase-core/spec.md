---
title: "@nafios/supabase-core"
status: active
version: 1.0.0
updated: 2026-06-18
owner: Hanafi
related_adrs: [0006, 0008, 0012, 0014, 0021]
---

# @nafios/supabase-core — Specification

## Purpose

Own the Supabase connection layer for the entire monorepo. Provide a single,
sanctioned way to construct a Supabase client (server + browser) and confine the
`@supabase/*` dependency to one package. Every Supabase-backed feature
(`auth-core`, `database`, future storage/realtime/edge-functions) builds on this
foundation.

## Scope

**In:** server + browser client construction, env/config resolution, the cookie
adapter contract, and re-export of provider types consumers need.

**Out:** auth operations, schema types, data access, storage, realtime, edge
functions — those belong to feature packages layered on top.

## Key Constraint

`@supabase/ssr` and `@supabase/supabase-js` are dependencies of this package
**only**. No other workspace package or app may import them directly; they
import the re-exported types from `@nafios/supabase-core` instead.

## Public API

### Client Construction

```ts
import type { CookieAdapter } from "@nafios/supabase-core";

/**
 * Creates a raw server-side Supabase client. The CookieAdapter bridges the
 * framework's cookie API with session cookie management.
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env.
 */
function createServerClient(cookies: CookieAdapter): SupabaseClient;

/**
 * Creates a raw browser-side Supabase client. Cookie management is automatic.
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env.
 */
function createBrowserClient(): SupabaseClient;
```

Both return the **untyped** `SupabaseClient`. Schema typing is applied
downstream by `@nafios/database` (see Invariant 3).

### Types

```ts
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

### Re-exported provider types

`SupabaseClient`, `AuthError`, `User` are re-exported from
`@supabase/supabase-js` so consumers never import the SDK directly.

## Error Handling

Client construction throws synchronously if `SUPABASE_URL` or
`SUPABASE_ANON_KEY` is missing. This is a startup-time failure, not a runtime
error.

## Environment Variables

| Variable             | Required by        | Description                    |
|----------------------|--------------------|--------------------------------|
| `SUPABASE_URL`       | Both clients       | Supabase project API URL       |
| `SUPABASE_ANON_KEY`  | Both clients       | Supabase anon (public) API key |

## Invariants

1. The barrel (`src/index.ts`) exports only the public API.
2. `@supabase/*` is depended on by this package only.
3. Clients are returned **untyped**. Passing `<Database>` to the
   `@supabase/ssr` factory is incompatible with the installed
   `@supabase/supabase-js` generic shape, so schema typing is applied by
   `@nafios/database` at its own boundary, not here.
4. No build step — consumed as TypeScript source (ADR-0006).

## Open Questions

- **Browser-side env var access:** consumers using Vite must expose
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` via bundler config. This may motivate
  optional config params in a future revision.
- **Service-role client:** a privileged server client (service-role key) is not
  yet provided; add when a server-only workload needs it.
