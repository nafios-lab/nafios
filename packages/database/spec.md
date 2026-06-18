---
title: "@nafios/database"
status: active
version: 1.0.0
updated: 2026-06-18
owner: Hanafi
related_adrs: [0006, 0008, 0012, 0013, 0014, 0021]
---

# @nafios/database — Specification

## Purpose

Own all Postgres / data-access concerns for NafiOS: the TypeScript types
generated from the live schema, and a schema-typed Supabase client for data
access. Per ADR-0014, `supabase-js` is the data-access layer (no ORM); this
package is where that layer and its types live.

## Scope

**In:** generated schema types (`Database` and helpers), schema-typed client
construction (`createServerDb`, `createBrowserDb`), and the `asDb` typing
helper. Future shared query helpers / RPC wrappers also belong here.

**Out:** the raw connection and `@supabase/*` dependency (owned by
`@nafios/supabase-core`), auth operations (`@nafios/auth-core`), and per-domain
business logic (owned by domain packages).

## Public API

### Schema-typed clients

```ts
import type { CookieAdapter } from "@nafios/supabase-core";

/** A Supabase client typed against the NafiOS schema. */
type Db = SupabaseClient<Database>;

/** Type a raw supabase-core client against the schema (compile-time only). */
function asDb(client: SupabaseClient): Db;

/** Schema-typed server-side data client (SSR / server functions). */
function createServerDb(cookies: CookieAdapter): Db;

/** Schema-typed browser-side data client. */
function createBrowserDb(): Db;
```

### Generated types

Re-exported from `src/database.types.ts`:

- `Database` — the full schema shape
- `Tables<T>`, `TablesInsert<T>`, `TablesUpdate<T>` — row/insert/update types
- `Enums<T>`, `CompositeTypes<T>`, `Json` — supporting types
- `Constants` — generated enum constant values (a runtime value, not a type)

## Type generation

```sh
bun run db:types   # writes src/database.types.ts from the local schema
```

Run after every migration. The generated file is committed so consumers and CI
type-check without a live database.

## Invariants

1. The barrel (`src/index.ts`) exports only the public API.
2. `src/database.types.ts` is generated — never edited by hand.
3. No direct `@supabase/*` dependency; the connection and `SupabaseClient` type
   come from `@nafios/supabase-core`.
4. The schema generic is applied by `asDb` via a cast at the data-access
   boundary — not at the `@supabase/ssr` factory, which is generic-incompatible
   with the installed `@supabase/supabase-js` (see supabase-core spec, Invariant 3).
5. No build step — consumed as TypeScript source (ADR-0006).

## Open Questions

- **Shared query / RPC helpers:** none yet. Per ADR-0014, a thin SQL/RPC layer
  is added per-domain only on real query friction — not speculatively.
- **RLS:** disabled for now; authorization is app-layer (ADR-0019). Revisit if
  RLS is adopted.
