# @nafios/database

All Postgres / data-access concerns for NafiOS: the generated schema types and
the schema-typed Supabase data client. Built on `@nafios/supabase-core` for the
connection. Per ADR-0014 (`supabase-js` is the data-access layer, no ORM), this
is where application data access lives.

## What this package does

- **Generated schema types:** `Database`, plus `Tables`, `TablesInsert`,
  `TablesUpdate`, `Enums`, `CompositeTypes`, `Json`, `Constants` — generated
  from the live local schema by `bun run db:types`.
- **Schema-typed clients:** `createServerDb(cookies)` / `createBrowserDb()`
  return a `SupabaseClient<Database>` (aliased `Db`) so `.from(...)` / `.rpc(...)`
  are checked against the real schema.
- **`asDb(client)`** — applies schema typing to a raw client from supabase-core.
- **Data-access operations:** typed wrappers over queries / RPCs.
  `insertUserProfile(db, input)` atomically completes the authenticated user's
  profile and inserts their family members via the `insert_user_profile` RPC.
  `saveOnboardingProfile(db, { avatarUrl })` is the per-step onboarding **Step 2
  (Profile)** write — sets `profiles.avatar_url` via the `save_onboarding_profile`
  RPC **without** stamping completion (that is the final step).

## Public API surface

All public exports live in `src/index.ts` (the barrel):

- `createServerDb(cookies)` / `createBrowserDb()` — schema-typed data clients
- `asDb(client)` — type a raw client; `Db` — the typed client alias
- `insertUserProfile(db, input)` — atomic profile + family-member write;
  types `InsertUserProfileInput`, `FamilyMemberInput`
- Types: `Database`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`,
  `CompositeTypes`, `Json`; value: `Constants`

## Regenerating types

```sh
bun run db:types   # from repo root — writes src/database.types.ts
```

Run after **every** migration. The file is generated output — never hand-edit
it. It is committed so consumers and CI type-check without a live database.

## Invariants

1. The barrel exports only the public API.
2. `src/database.types.ts` is generated — never edited by hand.
3. This package does **not** depend on `@supabase/*` directly; it gets the
   connection (and the `SupabaseClient` type) from `@nafios/supabase-core`.
4. No build step — consumed as TypeScript source (ADR-0006).

## Non-obvious gotchas

- **The schema generic is applied here, by `asDb`, via a cast.** supabase-core
  returns the untyped client because `@supabase/ssr@0.6.x` emits an older
  `SupabaseClient` generic shape than the installed `@supabase/supabase-js`;
  passing `<Database>` to the ssr factory produces an incompatible type. At
  runtime it is the same client — the typing is a compile-time overlay derived
  from the live schema, so it is only as accurate as the last `db:types` run.

## Scripts

```sh
bun test          # run unit tests
bun run typecheck # tsc --noEmit
```

## Structure

```
src/
  index.ts              # barrel — public exports only
  client.ts             # createServerDb, createBrowserDb, asDb, Db
  user-profiles.repo.ts # insertUserProfile + input types (RPC-backed)
  database.types.ts     # GENERATED — do not edit
tests/unit/           # bun:test unit tests
spec.md               # package specification
```

## Root context

See [root CLAUDE.md](../../CLAUDE.md) for monorepo-wide conventions.
