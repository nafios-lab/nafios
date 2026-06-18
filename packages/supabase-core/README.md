# @nafios/supabase-core

The Supabase connection foundation for the NafiOS monorepo. The single package
that depends on `@supabase/*`; every other Supabase-backed feature package gets
its client from here.

## Installation

This is an internal workspace package. No installation needed — just import it:

```ts
import { createServerClient, createBrowserClient } from "@nafios/supabase-core";
```

## Usage

```ts
import { createServerClient, type CookieAdapter } from "@nafios/supabase-core";

const adapter: CookieAdapter = {
  getAll: () => [],
  setAll: () => {},
};

const client = createServerClient(adapter); // raw SupabaseClient
```

Requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the environment; both
factories throw synchronously if either is missing.

## Scope

Connection only — no auth logic, no schema types, no data access. Build those
in feature packages (`@nafios/auth-core`, `@nafios/database`, …) on top of this
one. See [spec.md](./spec.md).
