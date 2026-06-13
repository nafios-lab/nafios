# @nafios/auth-core

Provider-agnostic auth abstraction for the NafiOS monorepo. Wraps Supabase Auth
so that every auth operation flows through a single package — if the provider
changes, only this package needs updating.

## Install

This is a workspace package consumed via Bun workspace resolution. Add it as a
dependency:

```json
{
  "dependencies": {
    "@nafios/auth-core": "workspace:*"
  }
}
```

## Quick Start

```ts
import {
  createServerClient,
  createBrowserClient,
  signUp,
  signInWithPassword,
  signOut,
  getSession,
  getUser,
} from "@nafios/auth-core";

// Server-side (in a server function / loader)
const client = createServerClient({
  getAll: () => parseCookies(request),
  setAll: (cookies) => setCookiesOnResponse(response, cookies),
});

const result = await signInWithPassword(client, {
  email: "user@example.com",
  password: "password123",
});

if (result.error) {
  console.error(result.error.message);
} else {
  console.log("Signed in:", result.data.user.email);
}
```

## Key Constraint

`@supabase/supabase-js` and `@supabase/ssr` are dependencies of **this package
only**. No other workspace package or app should import them directly.

## Docs

- [Specification](spec.md) — full public API contract
- [CLAUDE.md](CLAUDE.md) — agent context
