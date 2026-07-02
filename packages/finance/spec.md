---
title: "@nafios/finance"
status: active
version: 0.1.0
updated: 2026-07-02
owner: Hanafi
related_adrs: [0005, 0006, 0014, 0019, 0020, 0021]
---

# @nafios/finance — Specification

## Purpose

The NafiOS finance module as a single `@nafios/<module>` package. At M0 this
package is a **skeleton**: it ships the architecture — the internal pure/data
layer split and the client/auth **connection spine** — but essentially no
functional code. Adding the first entity type, codec, or repository should
require only writing it in the correct layer, never re-architecting the package.

Scope and boundary are defined by the EF2 epic and its two sub-tickets:

- [EF2 — Finance package foundation](../../issues/EF2.md)
- [EF2.1 — Scaffold the `@nafios/finance` package](../../issues/EF2.1.md)
- [EF2.2 — Finance client factories & auth/session context](../../issues/EF2.2.md)

## Scope

**In (EF2):**

- The single public barrel (`src/index.ts`) as the only export surface.
- The internal `src/domain/` (pure) + `src/internal/` (data) layer split,
  enforced by a Biome import-boundary rule
  ([ADR-0005](../../adr/0005-biome-over-eslint-prettier.md)).
- The connection spine in `src/internal/`: `createBrowserClient` (the runtime
  client — browser session, auto-refresh, RLS applies) and `createServiceClient`
  (RLS bypassed; seeds/tests only) — thin wrappers over `@nafios/database`
  (`asDb`, `Db`) and `@nafios/supabase-core` (client construction), per
  [ADR-0021](../../adr/0021-supabase-core-connection-foundation.md).

**Out (deferred to later finance feature tickets):** domain entity/enum types,
the Money/Month codecs, base repository helpers, row↔domain mappers,
`FinanceDataError` / SQLSTATE mapping, all repositories, derived-metric and
domain-engine logic, the default-data seed, any service/API endpoints, any UI,
and any schema/migration change (EF2 consumes the EF1 schema unchanged).

## Architecture

One package, two internal layers with a one-way, lint-enforced dependency
direction:

```
src/internal/ (data) → src/domain/ (domain) → (nothing app-specific)
```

- **`src/domain/`** — pure types, enums, and codecs. Zero I/O. Must not import
  `src/internal/`, `@nafios/database`, `@nafios/supabase-core`, or
  `@supabase/*`. Empty (placeholder barrel) at EF2.
- **`src/internal/`** — the data layer; the only place `@nafios/database` and
  `@nafios/supabase-core` appear. May import `src/domain/`.

## Public API

```ts
/** A finance data-layer client — the schema-typed Db (SupabaseClient<Database>). */
export type FinanceClient = Db;

/** Runtime client — browser session, auto-refresh; auth.uid() resolves and RLS applies. */
export function createBrowserClient(): FinanceClient;

/** service_role key — BYPASSES RLS. Seeds/tests only; must set user_id explicitly. */
export function createServiceClient(): FinanceClient;
```

The raw `SupabaseClient` type and the generated `@nafios/database` row types are
**never** re-exported — `FinanceClient` (an alias of `Db`) is what callers see.

## Behavior & rules

1. **Browser client runs as the user.** Finance executes client-side; supabase-core's
   `createBrowserClient` reads the logged-in session from browser storage,
   auto-refreshes the access token as it expires, and attaches it to every
   request. `auth.uid()` resolves and the owner RLS policy applies for the life
   of the session. It takes no arguments — the browser owns the session, so no
   token is plumbed through finance.
2. **Service client bypasses RLS — by design, and a footgun.** No auth context,
   so `auth.uid()` is NULL; a service insert that omits `user_id` is correctly
   rejected by `NOT NULL` (`23502`). Callers must set `user_id` explicitly.
   Never on a request path.
3. **No domain rules here.** No lifecycle/status/metric/guardrail/cursor logic,
   no Money/Month conversion, no error mapping — those are later feature
   tickets. The spine only constructs correctly-scoped clients.
4. **`@supabase/*` stays in supabase-core.** Finance imports only
   `@nafios/database` + `@nafios/supabase-core`.

## Environment variables

| Var                         | Read by                | Notes                                                                  |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `SUPABASE_URL`              | both factories         | Project URL. Needs bundler-level exposure for the browser client.      |
| `SUPABASE_ANON_KEY`         | `createBrowserClient`  | Anon key; the browser session's JWT is layered on top.                 |
| `SUPABASE_SERVICE_ROLE_KEY` | `createServiceClient`  | Secret; bypasses RLS. Seeds/tests/trusted jobs only — never a bundle.  |

## Verification

- **Gated (in `bun run check`):** mocked-SDK unit tests for the finance
  factories, satisfying the per-file 90% coverage gate
  ([ADR-0020](../../adr/0020-test-coverage-scoping-and-gate.md)).
- **Non-gating (`bun run test:integration`):** a live-DB RLS matrix at
  repo-root `tests/integration/` against a local Supabase with two seeded
  users. It proves RLS isolation, the `auth.uid()` insert path, and the
  service-role `NOT NULL` behavior. Because finance's runtime client is
  browser-only, this headless suite builds its two per-user clients from
  supabase-core's raw-token `createAuthedClient` + `asDb` directly. It never
  runs inside `bun run check` (no live Supabase in CI).

## Invariants

1. The barrel (`src/index.ts`) is the only public export surface.
2. `src/domain/` is pure — the Biome override fails any data-layer import.
3. Exactly two workspace deps (`@nafios/database`, `@nafios/supabase-core`);
   no direct `@supabase/*` dependency.
4. No build step — consumed as TypeScript source
   ([ADR-0006](../../adr/0006-no-build-internal-packages.md)).

## Open questions

- **Browser bundle safety of the service-role path** — finance now runs
  client-side, so `createBrowserClient` and `createServiceClient` ship from the
  same barrel. `createServiceClient` reads `SUPABASE_SERVICE_ROLE_KEY` and
  bypasses RLS; it must be tree-shaken out of any browser bundle (it is only
  reachable from seeds/tests, so a bundler with dead-code elimination should
  drop it, but this is unverified). A future `@nafios/finance/data` vs
  server-only subpath split may be needed to guarantee the secret path can never
  reach a client bundle.
- **Codec home** — the Money/Month codecs will live in `src/domain/`; extract
  to a shared `@nafios/math` / `@nafios/temporal` package only when a second
  module needs them.
