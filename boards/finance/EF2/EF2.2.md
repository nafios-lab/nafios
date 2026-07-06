# EF2.2 — Supabase client factories & auth/session context

> - `M0`
> - `type:feature`
> - `module:finance`
> - `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF2 — Scaffold the `@nafios/finance` package

> **This ticket is self-contained.** Everything needed to build the two Supabase client factories and the auth/session context — the data-layer **connection spine** — is in this file. Stack: **Supabase JS SDK** (`@supabase/supabase-js`), typed from `@nafios/db`'s generated `database.types.ts`. **No ORM / no Drizzle. No schema changes. No repositories, no codecs, no CRUD.**
>
> **Assumes EF1 is done** (the `@nafios/db` package + the 10-table schema + generated types) and **EF2.1 is done** (the `@nafios/finance` package shell: `src/domain/` + `src/internal/` layers, deps, lint import-boundary, green `bun run check`). This ticket lands the shared substrate that every later finance repository will sit on — but **no repositories ship here**. It is the last EF2 ticket; with it the package skeleton is complete.

---

## 1. What you're building

Two things, both in `@nafios/finance`'s data layer (`src/internal/`) — the wiring that lets the data layer connect to Supabase at all, and nothing more:

1. **Client factories.** Thin, typed wrappers over `@nafios/db`'s base Supabase client:
   - **`createAuthedClient`** — a `SupabaseClient<Database>` that runs **as the user** (the request JWT is attached → `auth.uid()` resolves to that user → **RLS applies**). This is the only client the app/repositories use at runtime.
   - **`createServiceClient`** — a `SupabaseClient<Database>` using the **`service_role`** key, which **bypasses RLS**. **Seeds and tests only** (later tickets). Because it has no auth context, `auth.uid()` is NULL, so any insert that omits `user_id` fails the `NOT NULL` **on purpose** (EF1.1 §6 / DB-design §8.2) — service-role callers **must set `user_id` explicitly**.

2. **Auth/session context.** A tiny `AuthContext` type describing how a caller supplies the user's identity (a raw request JWT or a Supabase session), consumed by `createAuthedClient`. This is the seam the later service/PA layer (EF3+) hands the user's identity through.

**What this ticket is NOT.** No repositories, no `BaseRepository`, no row↔domain mappers, no Money/Month codecs, no `FinanceDataError` / SQLSTATE error mapping, no queries, no CRUD. Those land with the **first repository feature ticket**, not with the connection spine. This ticket only proves the package can construct a correctly-scoped client and reach the EF1 schema.

---

## 2. Public API / contract

Exact TS signatures. Names are the contract later repositories import; keep them stable. Barrel-exported from `src/index.ts`; implementations live in `src/internal/`.

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@nafios/db';

/** A finance data-layer client is always typed to the generated Database schema. */
export type FinanceClient = SupabaseClient<Database>;

/** How the caller supplies the user's identity. */
export type AuthContext =
  | { accessToken: string }                 // a raw JWT (request-scoped)
  | { session: { access_token: string } };  // a Supabase session

/**
 * Client that runs AS THE USER: the JWT is attached so auth.uid() resolves and
 * RLS applies. The ONLY client used at runtime. Repositories built on this
 * client (later) must NOT set user_id on inserts — the DB default auth.uid() fills it.
 */
export function createAuthedClient(auth: AuthContext): FinanceClient;

/**
 * Client using the service_role key: BYPASSES RLS. Seeds/tests ONLY.
 * Has no auth context, so auth.uid() is NULL — callers MUST set user_id
 * explicitly on every insert or the NOT NULL default rejects the row.
 */
export function createServiceClient(): FinanceClient;
```

**Env vars** (read by the factories; documented in the package `CLAUDE.md`):

| Var | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | both | Project URL. |
| `SUPABASE_ANON_KEY` | `createAuthedClient` | Anon/publishable key; the per-request JWT is layered on top (the key alone grants no access). |
| `SUPABASE_SERVICE_ROLE_KEY` | `createServiceClient` | **Secret.** Bypasses RLS. Never ship to a client bundle; seeds/tests/trusted jobs only. |

> **Public surface stays minimal.** The barrel re-exports `createAuthedClient`, `createServiceClient`, `AuthContext`, and the `FinanceClient` alias only. The raw `SupabaseClient` type and the generated `@nafios/db` row types are **never** re-exported — `FinanceClient` is the alias callers see.

---

## 3. Package placement & dependencies

```
packages/finance/                     # @nafios/finance (shell from EF2.1)
├── CLAUDE.md                         # + env vars; RLS gotchas; service_role warning
├── README.md
├── spec.md
├── package.json                      # deps already declared in EF2.1: @nafios/db, @supabase/supabase-js
├── src/
│   ├── index.ts                      # barrel: re-exports the client/auth surface
│   ├── domain/                       # still empty (types/codecs are later feature tickets)
│   └── internal/                     # data layer
│       └── client.ts                 # createAuthedClient / createServiceClient / AuthContext
└── tests/
    └── integration/
        └── client.test.ts            # the §5 matrix as SDK-driven tests (two seeded users)
```

**Dependencies (already declared in EF2.1 — none added here):**

- **`@nafios/db`** (`workspace:*`) — the typed base Supabase client + generated `database.types.ts` (the `Database` type). The factories wrap this client; they do not re-create migrations or types.
- **`@supabase/supabase-js`** — the SDK (`SupabaseClient`). **No ORM / no Drizzle.**

**Conventions:** files kebab-case; only `src/index.ts` is a public barrel; everything else is `src/internal/`. `typecheck` + `test` keys (from EF2.1) keep this wired into the root `bun run check`.

---

## 4. Behavior & rules (RLS + boundary)

The connection spine carries **no domain rules** — it only constructs correctly-scoped clients.

1. **Authed client runs as the user.** `createAuthedClient` layers the per-request JWT onto the anon-key client (the documented Supabase per-request pattern); it does **not** persist a session. With the JWT attached, `auth.uid()` resolves and RLS's `owner_all` policy applies — an authed client cannot see or write another user's rows.
2. **Service client bypasses RLS — by design, and a footgun.** `createServiceClient` uses the `service_role` key, which has no auth context. `auth.uid()` is NULL, so the `user_id` default cannot fill itself: a service insert that omits `user_id` is **correctly** rejected by `NOT NULL` (EF1.1 §6). Service-role callers must set `user_id` explicitly. The package `CLAUDE.md` must warn: **never use the service client on a request path** — seeds and the test harness only.
3. **RLS is the DB's job, not the spine's.** The factories add no `WHERE user_id = …` and no ownership pre-checks; they rely entirely on the `owner_all` policy + `(select auth.uid())`.
4. **No domain rules, no codecs, no error mapping here.** No lifecycle/status/metric/guardrail/cursor logic; no Money/Month conversion; no SQLSTATE→typed-error mapping. Those belong to later feature tickets (codecs in `src/domain/`; the base repository, mappers, and `FinanceDataError` with the first repository).
5. **No schema changes.** EF2 consumes the EF1 schema unchanged; any gap is an EF1 concern (EF1.11), never an EF2 edit.

---

## 5. Verification (test matrix)

Run against a local Supabase (`supabase db reset`) with **two seeded users** (reuse EF1.1's `seed.sql` users) to prove RLS. Encode as SDK-driven tests in `tests/integration/client.test.ts` so `bun run check` enforces them. Tests use **raw SDK calls** against an EF1 table (e.g. `monthly_ledger`) — no repository, codec, or mapper exists yet.

| # | Area | Action | Expected |
|---|---|---|---|
| 1 | Authed RLS read | User A authed client `select`s a table that holds rows for A **and** B | A sees **only A's** rows; B's are invisible |
| 2 | Service read | `createServiceClient` selects the same table | sees **all** rows (RLS bypassed) |
| 3 | Authed insert | Insert via authed client **without** setting `user_id` | ✅ inserts; row's `user_id` = A (DB default `auth.uid()`) |
| 4 | Service insert omits owner | `createServiceClient` insert **without** `user_id` | ❌ rejected by `NOT NULL` (SQLSTATE `23502`) — raw `PostgrestError` (no typed mapping yet) |
| 5 | Service insert sets owner | `createServiceClient` insert **with** explicit `user_id` | ✅ inserts |
| 6 | Typed client | `createAuthedClient(...)` is a `SupabaseClient<Database>` | `.from('monthly_ledger')` and other EF1 tables typecheck against the generated `Database` |
| 7 | Env documented | `CLAUDE.md` lists `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` and the service-role warning | present |

> Clean up any rows inserted by tests (or run against a freshly reset DB) so the matrix is idempotent across runs.

---

## 6. Acceptance criteria

- [ ] **AC1** — `src/internal/client.ts` exists in `@nafios/finance`'s data layer; the package's existing deps (`@nafios/db` + `@supabase/supabase-js`, from EF2.1) cover it; wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `createAuthedClient(auth)` returns a `SupabaseClient<Database>` that runs as the user (RLS applies); `createServiceClient()` returns a `service_role` client that bypasses RLS. `AuthContext` accepts a raw `accessToken` or a Supabase `session`.
- [ ] **AC3** — Env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are read by the factories and documented in `CLAUDE.md`, with the service-role "never on a request path" warning.
- [ ] **AC4** — The authed path relies on `auth.uid()` for ownership (no `user_id` set, no ownership pre-check); the service path requires explicit `user_id` and surfaces `NOT NULL` (`23502`) when omitted.
- [ ] **AC5** — The barrel re-exports exactly `createAuthedClient`, `createServiceClient`, `AuthContext`, and `FinanceClient`; the raw `SupabaseClient` type and generated `@nafios/db` row types are **not** re-exported.
- [ ] **AC6** — No repositories, codecs, mappers, error mapping, queries, CRUD, domain rules, or schema changes shipped — connection spine only.
- [ ] **AC7** — Every row of the §5 verification matrix behaves as specified, against a local Supabase with two seeded users.

---

## 7. Notes / decisions

1. **`createAuthedClient` shape.** Accepts either a raw `accessToken` or a Supabase `session` (§2) — pick whichever the calling layer (EF3 services / PA layer) holds. The factory layers the JWT onto the anon-key client (the documented Supabase per-request pattern); it does **not** persist a session.
2. **Service client is a footgun by design.** It bypasses RLS and must self-scope `user_id`. `CLAUDE.md` must warn: never use it on a request path; seeds and the test harness only.
3. **Error mapping is deferred.** This ticket surfaces the **raw** `PostgrestError` (e.g. the `NOT NULL` rejection in §5 row 4). The typed `FinanceDataError` + SQLSTATE→code mapping lands with the first repository, not the connection spine — it is meaningless without queries to map.
4. **Codecs are deferred.** No Money/Month conversion happens here; the codecs live in `src/domain/` and arrive with the first feature that needs them. The spine moves no money values.
5. **No schema authority.** If a SQLSTATE/constraint suggests a missing column or rule, that is an **EF1** change (EF1.11), never an EF2 edit — EF2 consumes the schema unchanged (EF2 epic, Out of scope).

*Provenance: EF1.1 §6 (RLS + `service_role` `NOT NULL` behavior); DB-design §8 (auth/ownership/RLS recipe); EF2 epic (skeleton scope, single-package internal layering, boundary purity); EF2.1 (package shell, deps, lint boundary, `bun run check`).*

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 0.1 | 2026-06-27 | NafiOS Foundation | Initial ticket for the `@nafios/finance` data-layer **connection spine**: authed + service-role Supabase client factories and the `AuthContext` seam (env vars; `service_role` bypasses RLS and must set `user_id` — `NOT NULL` on the omit path). Verified by raw-SDK RLS tests against an EF1 table. Base repository, mappers, codecs, and `FinanceDataError` error mapping explicitly **deferred** to the first repository feature ticket. Replaces the former EF2.2 (domain entity & enum types), which is deferred to later feature tickets under the trimmed, skeleton-only EF2 (epic v0.3). |
