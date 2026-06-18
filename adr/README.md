# Architecture Decision Records (ADRs)

This directory captures the architectural decisions made in NafiOS.
Each ADR is a short, numbered, **immutable** document recording one decision.

## Why ADRs?

Without them, someone (human or agent) will stare at the repo six months from now,
wonder why packages don't build to `dist/`, "fix" it, and silently break a deliberate
convention. ADRs kill that category of drift.

## How to use (agents & developers)

**Before deviating from an established pattern**, grep `adr/` to see if a decision
already covers it. If it does, respect it — or write a new ADR that supersedes it.

## Conventions

| Rule | Detail |
|------|--------|
| **Numbering** | Zero-padded, four-digit, sequential (`0001`, `0002`, …). Numbers are never reused. |
| **Status lifecycle** | `Proposed` &rarr; `Accepted` &rarr; `Superseded by ADR-XXXX` (or `Deprecated`). |
| **Immutability** | Once `Accepted`, an ADR's Decision section is never rewritten. If we change our mind, we write a **new** ADR that supersedes the old one and link both ways. |
| **Granularity** | One decision per ADR. Tightly-coupled sub-choices can be folded in as Consequences. |
| **When to write one** | Any structural or architectural choice — before or as you make it. |
| **Format** | Plain Markdown (no tooling dependency). See [`_template.md`](./_template.md). |
| **File naming** | `NNNN-short-kebab-title.md` (e.g. `0001-bun-monorepo.md`). |

## Index

| # | Decision | Status |
|------|----------|--------|
| [0001](0001-bun-monorepo.md) | Use a Bun monorepo (Bun workspaces) | Accepted |
| [0002](0002-tanstack-start-for-web-apps.md) | TanStack Start for web apps | Accepted |
| [0003](0003-rest-over-graphql.md) | REST over GraphQL for service APIs | Accepted |
| [0004](0004-vercel-ai-sdk-behind-ai-core.md) | Vercel AI SDK v6 behind `@nafios/ai-core` | Accepted |
| [0005](0005-biome-over-eslint-prettier.md) | Biome over ESLint + Prettier | Accepted |
| [0006](0006-no-build-internal-packages.md) | No-build internal packages (consume TS `src/`) | Accepted |
| [0007](0007-bun-native-filter-task-running.md) | Bun-native `--filter` task running (no Turborepo) | Accepted |
| [0008](0008-workspace-resolution-over-path-aliases.md) | Workspace resolution over `tsconfig` path aliases | Accepted |
| [0009](0009-claude-md-canonical-agent-context.md) | `CLAUDE.md` is canonical agent context | Accepted |
| [0010](0010-per-package-typecheck.md) | Per-package typecheck (`tsc --noEmit` via `--filter`) | Accepted |
| [0011](0011-co-locate-package-specs.md) | Co-locate package specs with their packages | Accepted |
| [0012](0012-supabase-postgresql-database-engine.md) | Supabase / PostgreSQL as the database engine | Accepted |
| [0013](0013-sql-first-migrations-supabase-cli.md) | SQL-first migrations owned by the Supabase CLI | Accepted |
| [0014](0014-no-orm-supabase-js-data-access.md) | No ORM — `supabase-js` is the data-access layer | Accepted |
| [0015](0015-conventions-as-templates-not-applied-tables.md) | Conventions delivered as templates, not applied tables | Accepted |
| [0016](0016-auth-schema-referenced-not-owned.md) | `auth` schema referenced, not owned | Accepted |
| [0017](0017-manual-deploy-via-github-actions-netlify-cli.md) | Manual deploy via GitHub Actions + Netlify CLI | Accepted |
| [0018](0018-single-shell-modules-as-packages.md) | Single TanStack Start shell with modules as packages | Accepted |
| [0019](0019-app-layer-authz-rls-deferred.md) | App-layer authorization; Postgres RLS deferred | Accepted |
| [0020](0020-test-coverage-scoping-and-gate.md) | Test-coverage scoping and the 90% gate | Accepted |
| [0021](0021-supabase-core-connection-foundation.md) | Supabase connection foundation split into `supabase-core` + feature packages | Accepted |
| [0022](0022-tanstack-query-for-client-server-state.md) | TanStack Query for client-side server-state; loaders for SSR | Accepted |
