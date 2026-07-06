# EF2 — Scaffold the `@nafios/finance` package

> - `M0`
> - `type:epic`
> - `module:finance`
> - `area:infra` · `area:data`
> - **Depends on:** EF1 — Finance Data Foundation
> - Target Completion: M0 (with EF1)

## TL;DR

Stand up the **`@nafios/finance` package as an empty-but-valid skeleton** — the architecture, not the features. Ship the canonical package anatomy, the two **internal layers** (`src/domain/` pure, `src/internal/` data) with the import-boundary enforced by lint, the workspace dependency wiring to `@nafios/db` + `@supabase/supabase-js`, and the **Supabase client/auth connection spine** the data layer will sit on — all green under `bun run check`.

This is **structure only**. It ships **no domain types, no codecs, no repositories, no CRUD, no queries, no business logic, no derived metrics, no API, no UI**. Those land later as incremental feature tickets, driven by user stories and screen flows. Completes the package-foundation half of milestone **M0**.

## Goal

A new `@nafios/finance` package exists, builds, lints, and tests green while containing essentially no functional code — just the architecture: the lint-enforced domain/data layer split, the single public barrel (`src/index.ts`) as the only export surface, the dependency wiring, and a Supabase authenticated + service-role client with an auth/session context the data layer can build on. Adding the first entity type, codec, or repository should require only writing it in the correct layer — never re-architecting the package.

## Stack & approach

- Builds directly on EF1: the **`@nafios/db`** package (Supabase CLI migrations + generated `database.types.ts`) and the 10 staged tables. **EF2 consumes the schema and never alters it** — any schema change is an EF1 concern (see EF1.11).
- **Bun workspace monorepo**; one package scoped `@nafios/finance` under `packages/finance/`, scaffolded via the **package generator** (`/new-package`) — not by hand — so it inherits the canonical anatomy and `bun run check` wiring.
- One package, two **internal** layers, following the monorepo's `@nafios/<domain>` package-per-module convention. The pure-vs-I/O boundary is enforced **inside** the package by an eslint import-boundary rule rather than by the package graph:
  - `src/domain/` — **reserved for** pure types, enums, and the Money/Month codecs; depends on nothing app-specific. Must **not** import `@nafios/db`, `@supabase/supabase-js`, or `src/internal/`. **Empty (placeholder barrel only) at the end of EF2.**
  - `src/internal/` — the data layer; the **only** place `@supabase/supabase-js` and `@nafios/db` appear. At EF2 it holds the **client factories + auth/session context** (the connection spine) and nothing else. May import `src/domain/`.
- Runtime data access via the **Supabase JS SDK** (`@supabase/supabase-js`), typed from `database.types.ts`. **No ORM / no Drizzle.**
- **RLS-first:** the authenticated client runs as the request user (JWT → `auth.uid()`); a `service_role` client exists **only** for later seeds/tests and must always set `user_id` explicitly.
- Public exports are domain types/functions (later) + the client/auth surface; the raw `SupabaseClient` type and generated `@nafios/db` row types are **never** re-exported.

## Scope / Deliverables

Two tickets — the package shell, then the connection spine:

1. Package scaffold + internal `src/domain/`/`src/internal/` layers + eslint import-boundary rule + `bun run check` wiring + `CLAUDE.md`/`spec.md` (EF2.1).
2. Supabase client factories (authenticated + service-role) + auth/session context — the data-layer connection spine, **no repositories** (EF2.2).

**Sub-issues:**

- [ ] EF2.1 Scaffold the `@nafios/finance` package
- [ ] EF2.2 Supabase client factories & auth/session context

## Out of scope

Everything below is **deferred to later finance feature epics**, added incrementally as user stories and screen flows require them. EF2 only makes sure each has a clear, lint-enforced place to land.

- **Domain entity & enum types** and the recurring/adhoc discriminated union — no types ship in EF2; `src/domain/` stays empty.
- **Money & Month codecs** — deferred to the domain layer when the first feature needs them.
- **Base repository helpers, row↔domain mappers, and DB error mapping** (`FinanceDataError` / SQLSTATE → typed error) — land with the first repository, not with the connection spine.
- **All repositories** — ledger cluster, envelope, template & carry-over, reference & settings.
- **Default-data seed** and the **round-trip integration test suite** — EF2 ships green `bun run check` with only the connection-spine smoke tests; the full test harness arrives with the first repository.
- **Behavioral / domain-engine logic** — lifecycle & status transitions, settlement gate, guardrails, sync prompts; **derived-metric computation** (COL / Health Margin / ASM Contribution / Outstanding / Amendments); **creation-window / maxCapped / template generation & cursor** logic.
- **Any service/API endpoints; any web/UI.**
- **Schema or migration changes** — EF2 reads the EF1 schema; it never adds/alters tables, columns, constraints, or RLS.

## Success Criteria

- `@nafios/finance` exists under `packages/`, scaffolded via the generator, with the canonical anatomy (`CLAUDE.md`, `README.md`, `spec.md`, `src/index.ts` barrel, `src/domain/`, `src/internal/`, `tests/`) and the `src/domain/` + `src/internal/` layering.
- **`bun run check`** (typecheck + lint + test) is green across the workspace including the new package.
- **Boundary purity:** the eslint import-boundary rule **fails** any `src/domain/` import of `src/internal/`, `@nafios/db`, or `@supabase/supabase-js`; `src/internal/` is the only place those appear and may import `src/domain/`.
- The package declares exactly two deps — `@nafios/db` (`workspace:*`) and `@supabase/supabase-js`; `bun install` links `@nafios/db` locally (no registry fetch).
- An **authenticated** Supabase client (RLS applies) and a **service-role** client (RLS bypassed) can be constructed from the data layer, and the auth/session context resolves `auth.uid()` — proven against a local Supabase with two seeded users.
- **No** types, codecs, repositories, queries, seeds, metrics, or schema changes shipped. The public surface is the single `src/index.ts` barrel; the raw `SupabaseClient` and generated `@nafios/db` row types are never re-exported.

## Notes

- **Package home:** the single `@nafios/finance` package under `packages/finance/`. The shared, suite-wide `@nafios/db` (created in EF1.1) keeps the migrations + generated types + the base Supabase client and stays domain-neutral; finance uses it internally via `src/internal/` and never re-owns it.
- **Why one package, not two:** finance is one module among many (calendar, notebook, math, temporal, …) and each module is a single package. The pure-vs-I/O split that would have motivated a `finance-core`/`finance-data` pair is kept as an **internal**, lint-enforced layer boundary — same guarantee, no package explosion.
- **Incremental feature delivery:** after EF2, finance features are written as their own tickets driven by user stories and screen flows. Each adds types to `src/domain/`, codecs to `src/domain/`, or repositories/queries to `src/internal/` — always inside the structure EF2 establishes, never re-architecting it.
- **Codec home (when it lands):** the Money/Month codecs will sit in `src/domain/` (they encode finance's `numeric(12,2)` + first-of-month conventions). Extract to a shared `@nafios/math` / `@nafios/temporal` package later, only when a second module needs them — out of scope for M0.
- **Future subpath (not M0):** a `@nafios/finance/data` subpath export may later separate the Supabase-dependent data layer from the pure domain surface for browser/AI bundle safety. Not needed at M0 — no browser consumer yet.
- **Consumes EF1.11:** the connection spine relies on the `auth.uid()` insert path for ownership; the composite-key hardening (EF1.11) is the DB backstop, not an EF2 responsibility.

## Revision History

| Version | Date       | Author            | Changes                                                                                                                                                                                                            |
| ------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | 2026-06-27 | NafiOS Foundation | Initial epic: two packages (`finance-core` types/codecs + `finance-data` repositories) turning EF1's schema into a typed, round-trippable data layer. Scope/IN/OUT, 10 sub-issues, success criteria. Completes M0. |
| 0.2     | 2026-06-27 | NafiOS Foundation | Consolidated the two EF2 packages (`finance-core` + `finance-data`) into a single `@nafios/finance` package with internal `src/domain/` (pure types + codecs) and `src/internal/` (Supabase data layer) layering; Supabase owned by `@nafios/db` and kept internal. No change to entity/codec/repository/query contracts. |
| 0.3     | 2026-06-27 | NafiOS Foundation | **Scope trimmed to a package skeleton.** EF2 now scaffolds the `@nafios/finance` package shell (anatomy, internal `src/domain/`/`src/internal/` layers, lint import-boundary, `bun run check`) plus the Supabase client/auth **connection spine** — and nothing else. Domain types, codecs, base repository/mappers/error-mapping, all repositories, the seed, and the round-trip test suite are **deferred** to later feature tickets driven by user stories & screen flows. Sub-issues collapsed from 10 to 2 (EF2.1 scaffold, EF2.2 client/auth spine); EF2.3–EF2.10 removed. |
