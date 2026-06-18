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
construction (`createServerDb`, `createBrowserDb`), the `asDb` typing helper,
and data-access operations (typed wrappers over queries / RPCs).

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

### Data-access operations

```ts
interface FamilyMemberInput {
  name: string;
  relationship: "spouse" | "child" | "parent" | "sibling" | "other";
  avatarUrl?: string | null;
  nric?: string | null;
  mobileNo?: string | null;
  dateOfBirth?: string | null; // ISO YYYY-MM-DD
}

interface InsertUserProfileInput {
  avatarUrl?: string | null;
  familyMembers: FamilyMemberInput[];
}

/**
 * Completes the authenticated user's profile (avatar) and inserts their family
 * members as ONE atomic transaction. Backed by the `insert_user_profile`
 * Postgres function; `profile_id` is derived server-side from `auth.uid()`.
 * Requires an authenticated client. Throws on database error.
 *
 * Idempotent: the RPC replaces the profile's family members (delete-then-insert)
 * and stamps `profiles.onboarding_completed_at`, so a resumed or retried
 * onboarding submit is safe and never duplicates rows.
 */
function insertUserProfile(db: Db, input: InsertUserProfileInput): Promise<void>;
```

**Idempotency & completion:** onboarding can be retried (a prior attempt may
have created the auth user + session but failed here). The RPC therefore: (a)
deletes the caller's existing `family_members` before re-inserting, and (b) sets
`onboarding_completed_at = now()`. Route guards gate the dashboard on that
timestamp — a session whose profile has a NULL `onboarding_completed_at` is sent
back into the signup flow rather than into the app.

**Why an RPC, not two `.from()` calls:** the profile update and the family
inserts span two tables and must be all-or-nothing. supabase-js has no
client-side transaction, so two `.from()` calls would autocommit independently
(partial state on failure). A single `plpgsql` function body is one transaction.
Single-table, single-statement writes should still use `.from()` directly — the
RPC is reserved for genuine multi-write atomicity.

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

- **Shared query / RPC helpers:** the first is `insertUserProfile` (atomic
  profile + family-member write, backed by the `insert_user_profile` RPC). Per
  ADR-0014, further SQL/RPC layers are added per-domain only on real query
  friction — not speculatively.
- **RLS:** disabled for now; authorization is app-layer (ADR-0019). Revisit if
  RLS is adopted.
